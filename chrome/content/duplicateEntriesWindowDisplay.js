// -*- mode: js; indent-tabs-mode: t; js-indent-level: 8 -*-
// file: duplicateEntriesWindowDisplay.js
//
// Comparison table display: displayCardData, displayCardField, SetRelation,
// purgeAttributesTable, getCardFieldValues.
// ctx must have: attributesTableRows, displayedFields, editableFields, consideredFields,
// nonequivalentProperties, matchablesList, getString, getProperty, getAbstractedTransformedProperty,
// defaultValue, isSet, isEmail, isPhoneNumber, isText, isNumerical, isSelection,
// createSelectionList, sideKept, setContactLeftRight.
// Load after duplicateEntriesWindowUI.js, before duplicateEntriesWindow.js.

var DuplicateEntriesWindowDisplay = (function() {
	"use strict";

	function pushIfNew(elem, array) {
		if (!array.includes(elem))
			array.push(elem);
		return array;
	}

	/**
	 * Returns [both_empty, equ] for set comparison display (⊇ ⊆ ≅).
	 * TB128: Cards are plain JavaScript objects, access properties directly.
	 * @param {Object} card1 - Card 1 (plain object)
	 * @param {Object} card2 - Card 2 (plain object)
	 * @param {string} property - Property name (should be a Set property)
	 * @returns {[boolean, string]} [both_empty, equ] where equ is '≅', '⊇', '⊆', or ''
	 */
	function setRelation(card1, card2, property) {
		const defaultValue_Set = new Set();  /* should not really be needed here */
		// TB128: Cards are plain objects, access properties directly
		const value1 = card1.hasOwnProperty(property) ? card1[property] : defaultValue_Set;
		const value2 = card2.hasOwnProperty(property) ? card2[property] : defaultValue_Set;
		if (value1 === null || value1 === undefined) value1 = defaultValue_Set;
		if (value2 === null || value2 === undefined) value2 = defaultValue_Set;
		const both_empty = value1.size == 0 && value2.size == 0;
		let equ;
		if (value1.isSuperset(value2)) {
			if (value2.isSuperset(value1))
				equ = '≅';
			else
				equ = '⊇';
		} else {
			if (value2.isSuperset(value1))
				equ = '⊆';
			else
				equ = '';
		}
		return [both_empty, equ];
	}

	/**
	 * Creates HTML table row for one address book field for side-by-side comparison and editing.
	 * TB128: Uses HTML elements (td, span, input, textarea) instead of XUL elements.
	 * Editable fields will be listed in ctx.editableFields.
	 * @param {object} ctx - Context (window object)
	 * @param {Object} card1 - Card 1 (plain JavaScript object)
	 * @param {Object} card2 - Card 2 (plain JavaScript object)
	 * @param {*} defaultValue - Default value for this property
	 * @param {*} leftValue - Display value for left card
	 * @param {*} rightValue - Display value for right card
	 * @param {string} property - Property name
	 * @param {HTMLElement} row - Table row element to populate
	 */
	function displayCardField(ctx, card1, card2, defaultValue, leftValue, rightValue, property, row) {
		ctx.displayedFields.push(property);
		var editable = property != 'PhotoURI' && !ctx.isSet(property) && property != 'LastModifiedDate';
		if (editable)
			pushIfNew(property, ctx.editableFields);

		// TB128: Use HTML elements instead of XUL
		const cell1 = document.createElement('td');
		const cell2 = document.createElement('td');
		const cellEqu = document.createElement('td');
		const descEqu = document.createElement('span');
		cellEqu.className = 'equivalence';
		cellEqu.appendChild(descEqu);

		var identical = true;
		let equ = '≡';
		var both_empty = 0;
		if (ctx.isSet(property)) {
			[both_empty, equ] = setRelation(card1, card2, property);
			identical = equ == '≅';
		} else {
			identical = leftValue == rightValue;
			both_empty = leftValue == defaultValue && rightValue == defaultValue;
			if        (ctx.isEmail(property)) {
				[both_empty, equ] = setRelation(card1, card2, '__Emails');
			} else if (ctx.isPhoneNumber(property)) {
				[both_empty, equ] = setRelation(card1, card2, '__PhoneNumbers');
			} else if (!identical) {
				const value1 = ctx.getAbstractedTransformedProperty(card1, property);
				const value2 = ctx.getAbstractedTransformedProperty(card2, property);
				if      (value1 == value2)
					equ = '≅';
				else if (value1 == defaultValue)
					equ = '⋦';
				else if (value2 == defaultValue)
					equ = '⋧';
				else if (ctx.isText(property)) {
					if      (value2.includes(value1))
						equ = '<';
					else if (value1.includes(value2))
						equ = '>';
					else
						equ = '';
				}
				else if (ctx.isNumerical(property)) {
					// TB128: Access properties directly
					const val1 = card1.hasOwnProperty(property) ? card1[property] : 0;
					const val2 = card2.hasOwnProperty(property) ? card2[property] : 0;
					const comparison = val1 - val2;
					if      (comparison < 0)
						equ = '<';
					else if (comparison > 0)
						equ = '>';
					else
						equ = '≡';
				}
				else
					equ = '';
			}
		}
		if (!identical) {
			cell1.setAttribute('class', ctx.sideKept == 'left' ? 'keep' : 'remove');
			cell2.setAttribute('class', ctx.sideKept == 'left' ? 'remove' : 'keep');
		}
		if (both_empty)
			equ = '';
		if (equ != '' &&
		    (property == 'SecondEmail' ||
		     property != 'CellularNumber' && ctx.isPhoneNumber(property)))
			equ = '⋮';
		descEqu.textContent = equ;

		let cell1valuebox;
		let cell2valuebox;

		if (property == 'PhotoURI') {
			descEqu.style.marginTop = '1em';
			// TB128: Use HTML img instead of XUL image
			cell1valuebox = document.createElement('img');
			cell2valuebox = document.createElement('img');
		} else if (ctx.isSelection(property)) {
			var labels;
			if (property == 'PreferMailFormat') {
				labels = [ctx.getString('unknown_label'),
					  ctx.getString('plaintext_label'),
					  ctx.getString('html_label')];
			} else {
				labels = [ctx.getString('false_label'),
					  ctx.getString('true_label')];
			}
			var values = [0, 1, 2];
			cell1valuebox = ctx.createSelectionList(null, labels, values,  leftValue);
			cell2valuebox = ctx.createSelectionList(null, labels, values, rightValue);
		} else {
			function make_valuebox(value) {
				// TB128: Use HTML elements instead of XUL
				let valuebox;
				if (editable) {
					if (property == 'Notes') {
						valuebox = document.createElement('textarea');
						valuebox.rows = 3;
					} else {
						valuebox = document.createElement('input');
						valuebox.type = 'text';
					}
				} else if (property == '__MailListNames') {
					valuebox = document.createElement('span');
				} else {
					valuebox = document.createElement('span');
				}
				valuebox.className = 'textbox';
				if (property == '__MailListNames') {
					valuebox.textContent = value;
				} else if (editable && valuebox.tagName === 'INPUT') {
					valuebox.value = value;
				} else if (editable && valuebox.tagName === 'TEXTAREA') {
					valuebox.value = value;
				} else {
					valuebox.textContent = value;
				}
				return valuebox;
			}
			cell1valuebox = make_valuebox( leftValue);
			cell2valuebox = make_valuebox(rightValue);
		}

		// TB128: No flex attribute in HTML, use CSS classes instead
		cell1valuebox.style.flex = '2';
		cell2valuebox.style.flex = '2';
		/* valuebox id is like 'left_FieldName' / 'right_FieldName' for getCardFieldValues */
		cell1valuebox.setAttribute('id',  'left_'+property);
		cell2valuebox.setAttribute('id', 'right_'+property);

		cell1.appendChild(cell1valuebox);
		cell1.setAttribute('id', 'cell_left_' +property);
		cell2.appendChild(cell2valuebox);
		cell2.setAttribute('id', 'cell_right_'+property);

		row.appendChild(cell1);
		row.appendChild(cellEqu);
		row.appendChild(cell2);

		if (ctx.attributesTableRows) {
			ctx.attributesTableRows.appendChild(row);
		} else {
			console.error("displayCardField: attributesTableRows not available");
		}
		if (property == 'PhotoURI') {
			cell1valuebox.height = 100;
			cell2valuebox.height = 100;
			cell1valuebox.style.flex = "";
			cell2valuebox.style.flex = "";
			/* preserve aspect ratio */
			// TB128: Access properties directly
			cell1valuebox.src = card1.hasOwnProperty('PhotoURI') ? card1['PhotoURI'] : "";
			cell2valuebox.src = card2.hasOwnProperty('PhotoURI') ? card2['PhotoURI'] : "";
			/* actual image will be loaded asynchronously */
		}
	}

	/**
	 * Creates HTML table with address book fields for side-by-side comparison and editing.
	 * TB128: Uses HTML table elements and plain JavaScript card objects.
	 * @param {object} ctx - Context (window object)
	 * @param {Object} card1 - Card 1 (plain JavaScript object)
	 * @param {Object} card2 - Card 2 (plain JavaScript object)
	 * @param {number} comparison - Comparison result (-2, -1, 0, or 1)
	 * @param {number} preference - Preference for deletion (<0, 0, or >0)
	 * @param {boolean} namesmatch - Whether names match
	 * @param {boolean} mailsmatch - Whether emails match
	 * @param {boolean} phonesmatch - Whether phone numbers match
	 */
	function displayCardData(ctx, card1, card2, comparison, preference,
			namesmatch, mailsmatch, phonesmatch) {
		DuplicateEntriesWindowDisplay.purgeAttributesTable(ctx);
		ctx.displayedFields = [];
		ctx.editableFields = [];
		// Ensure tablepane is visible and attributesTableRows exists
		if (!ctx.attributesTableRows) {
			ctx.attributesTableRows = document.getElementById('AttributesTableRows');
		}
		if (!ctx.attributesTableRows) {
			console.error("displayCardData: AttributesTableRows element not found");
			return;
		}
		// Ensure tablepane is visible
		DuplicateEntriesWindowUI.show('tablepane');
		DuplicateEntriesWindowUI.showComparisonTableHeader(ctx);
		const cardsEqu = document.getElementById('cardsEqu');
		if (cardsEqu) {
			// TB128: cardsEqu is a <td> element, use textContent instead of value
			cardsEqu.textContent = comparison == -2 ? '' :
			                       comparison == 0 ? '≅' :
			                       comparison <  0 ? '⋦' : '⋧';
		}

		const mail1 = ctx.getAbstractedTransformedProperty(card1, 'PrimaryEmail');
		const mail2 = ctx.getAbstractedTransformedProperty(card2, 'PrimaryEmail');
		const displaySecondMail = (mail1 != '' && mail2 != '' && mail1 != mail2);
		const dn1 = ctx.getAbstractedTransformedProperty(card1, 'DisplayName');
		const dn2 = ctx.getAbstractedTransformedProperty(card2, 'DisplayName');
		const displayNickName = (dn1 != '' && dn1 != ctx.getAbstractedTransformedProperty(card1,'FirstName')+" "+
			ctx.getAbstractedTransformedProperty(card1, 'LastName'))
			|| (dn2 != '' && dn2 != ctx.getAbstractedTransformedProperty(card2,'FirstName')+" "+
			ctx.getAbstractedTransformedProperty(card2, 'LastName'))
			|| (dn1 != dn2);

		var fields = ctx.consideredFields.slice();
		const diffProps = ctx.nonequivalentProperties;
		for (var i = 0; i < diffProps.length; i++) {
			const property = diffProps[i];
			if (!property.match(/^\{/))
				pushIfNew(property, fields);
		}
		for (var j = 0; j < fields.length; j++) {
			const property = fields[j];
			// TB128: Use HTML tr/td instead of XUL row/label
			var row = document.createElement('tr');
			var labelcell = document.createElement('td');
			var labelspan = document.createElement('span');
			var localName = property;
			try {
				localName = ctx.getString(property + '_label');
			} catch (e) {}
			labelspan.textContent = localName + ':';
			labelspan.setAttribute('class', 'field');
			labelcell.appendChild(labelspan);
			row.appendChild(labelcell);
			if (ctx.matchablesList.includes(property)) {
				const cell1 = document.createElement('td');
				const cellEqu = document.createElement('td');
				const descEqu = document.createElement('span');
				cellEqu.className = 'equivalence';
				cellEqu.appendChild(descEqu);
				if (namesmatch && property == '__Names' ||
				    mailsmatch && property == '__Emails' ||
				    phonesmatch && property == '__PhoneNumbers')
					descEqu.textContent = '≃';
				row.appendChild(cell1);
				row.appendChild(cellEqu);
				if (ctx.attributesTableRows) {
					ctx.attributesTableRows.appendChild(row);
				}
			} else {
				const defaultValue = ctx.defaultValue(property);
				const leftValue = ctx.getProperty(card1, property);
				const rightValue = ctx.getProperty(card2, property);
				const displayOnlyIfDifferent = /^(PhotoType|CellularNumberType|HomePhoneType|WorkPhoneType|FaxNumberType|PagerNumberType|UID|UUID|CardUID)$/;
				const displayAlways = /^(FirstName|LastName|DisplayName|_AimScreenName|PrimaryEmail|SecondEmail|CellularNumber|HomePhone|WorkPhone|FaxNumber|Notes|PopularityIndex)$/;
				if ((!property.match(displayOnlyIfDifferent) || leftValue != rightValue) &&
				    (   ( leftValue &&  leftValue != defaultValue)
				     || (rightValue && rightValue != defaultValue)
				     || (property=='SecondEmail' && displaySecondMail)
				     || (property=='NickName'    && displayNickName)
				     || property.match(displayAlways)
				   ))
					displayCardField(ctx, card1, card2, defaultValue, leftValue, rightValue, property, row);
			}
		}
		// Debug: Check if any rows were added
		if (ctx.attributesTableRows && ctx.attributesTableRows.children.length <= 1) {
			console.warn("displayCardData: No field rows were added to the table. Total rows:", ctx.attributesTableRows.children.length);
		}
		ctx.setContactLeftRight(preference < 0 ? 'right' : 'left');
	}

	/**
	 * Removes all rows (excluding header) from the HTML attribute comparison & edit table.
	 * @param {object} ctx - Context (window object)
	 */
	function purgeAttributesTable(ctx) {
		if (!ctx.attributesTableRows) {
			ctx.attributesTableRows = document.getElementById('AttributesTableRows');
		}
		if (ctx.attributesTableRows) {
			// Remove all rows except the first one (tableheader with id="tableheader")
			// Use a copy of childNodes array since we're modifying the DOM
			var rows = Array.from(ctx.attributesTableRows.children);
			for (var i = 0; i < rows.length; i++) {
				var row = rows[i];
				// Keep the tableheader row (first row with id="tableheader")
				if (row.id !== 'tableheader') {
					ctx.attributesTableRows.removeChild(row);
				}
			}
		}
		DuplicateEntriesWindowUI.hideComparisonTableHeader(ctx);
		ctx.displayedFields = null;
		ctx.editableFields = null;
	}

	/**
	 * Returns an object with all editable field values for the given side ('left' or 'right').
	 * TB128: Handles HTML select/input/textarea elements.
	 * Used when reading edited values from the table (save field in list for later retrieval).
	 * @param {object} ctx - Context (window object)
	 * @param {string} side - 'left' or 'right'
	 * @returns {Object} Object with property names as keys and values as values
	 */
	function getCardFieldValues(ctx, side) {
		var result = {};
		for (var i = 0; i < ctx.editableFields.length; i++) {
			const id = side + '_' + ctx.editableFields[i];
			const valuebox = document.getElementById(id);
			if (!valuebox) continue;
			// TB128: Handle HTML select/input/textarea elements
			let value;
			if (valuebox.tagName === 'SELECT') {
				value = valuebox.options[valuebox.selectedIndex] ? valuebox.options[valuebox.selectedIndex].value : '';
			} else if (valuebox.tagName === 'INPUT' || valuebox.tagName === 'TEXTAREA') {
				value = valuebox.value;
			} else {
				value = valuebox.textContent || '';
			}
			result[ctx.editableFields[i]] = value;
		}
		return result;
	}

	return {
		displayCardData: displayCardData,
		purgeAttributesTable: purgeAttributesTable,
		getCardFieldValues: getCardFieldValues
	};
})();
