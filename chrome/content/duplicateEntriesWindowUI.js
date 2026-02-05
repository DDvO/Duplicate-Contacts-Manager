// -*- mode: js; indent-tabs-mode: t; js-indent-level: 8 -*-
// file: duplicateEntriesWindowUI.js
//
// Grouped UI state transitions, progress display, finished stats, low-level DOM helpers, and setContactLeftRight.
// This module provides enable, disable, show, hide, make_visible, make_invisible, show_hack (by id); the main window delegates to them.
// ctx must have: getString, and optionally window. For updateProgress/updateDeletedInfo/showFinishedStats: progressmeter, progresstext,
// vcards, BOOK_1, BOOK_2, abDir1, abDir2, deferInteractive, nowHandling, positionSearch, positionDuplicates, duplicates,
// totalCardsDeleted1, totalCardsDeleted2, totalCardsDeletedAuto, totalCardsBefore, totalCardsChanged, totalCardsSkipped,
// consideredFields, isSet, matchablesList, ignoredFields, nonequivalentProperties.
// Load after duplicateEntriesWindowComparison.js, before duplicateEntriesWindow.js.

var DuplicateEntriesWindowUI = (function() {
	"use strict";

	function enable(id) {
		var elem = document.getElementById(id);
		if (!elem) return;
		// TB128: HTML uses disabled boolean property
		elem.disabled = false;
		elem.className = '';
	}
	function disable(id) {
		var elem = document.getElementById(id);
		if (!elem) return;
		// TB128: HTML uses disabled boolean property
		elem.disabled = true;
		elem.className = 'disabled';
	}
	function show(id) {
		var elem = document.getElementById(id);
		if (!elem) return;
		// TB128: For tablepane, use flex to override CSS display:contents
		if (id === 'tablepane') {
			elem.style.display = 'flex';
		} else {
			elem.style.display = '';
		}
	}
	/** Enables scroll bar and stretches horizontally (vs plain show). */
	/** TB128: For HTML, use flex display instead of XUL-specific -moz-inline-stack */
	function show_hack(id) {
		var elem = document.getElementById(id);
		if (!elem) return;
		// TB128: Use flex for HTML elements (tablepane is a flex container)
		// Override CSS display:contents with flex to ensure visibility
		elem.style.display = 'flex';
	}
	function hide(id) {
		var elem = document.getElementById(id);
		if (!elem) return;
		elem.style.display = 'none';
	}
	function make_visible(id) {
		var elem = document.getElementById(id);
		if (!elem) return;
		elem.style.visibility = 'visible';
	}
	function make_invisible(id) {
		var elem = document.getElementById(id);
		if (!elem) return;
		elem.style.visibility = 'hidden';
	}

	/**
	 * Creates an HTML select (dropdown) with the given labels and values; optional class and selected value.
	 * TB128: Migrated from XUL menulist to HTML select.
	 * Used for address book selection in init() and for PreferMailFormat/boolean fields in the comparison table.
	 * @param {string|null} cls - CSS class name (optional)
	 * @param {string[]} labels - Array of label strings
	 * @param {*[]} values - Array of values corresponding to labels
	 * @param {*} selected - Value to select initially
	 * @returns {HTMLSelectElement} The created select element
	 */
	function createSelectionList(cls, labels, values, selected) {
		// TB128: Use HTML select instead of XUL menulist
		var select = document.createElement('select');
		if (cls != null)
			select.setAttribute('class', cls);
		for (var i = 0; i < labels.length; i++) {
			var option = document.createElement('option');
			option.textContent = labels[i];
			option.value = values[i];
			if (values[i] == selected) {
				option.selected = true;
			}
			select.appendChild(option);
		}
		return select;
	}

	/**
	 * Marks the side specified by 'left' or 'right' as to be kept. If side is null/undefined, toggles from current radio state.
	 * TB128: Uses HTML radio button .checked property instead of XUL 'selected' attribute.
	 * ctx must have: keepLeftRadioButton, keepRightRadioButton, getString, sideKept, displayedFields.
	 * @param {object} ctx - Context (window object)
	 * @param {string|null} side - 'left', 'right', or null/undefined to toggle
	 */
	function setContactLeftRight(ctx, side) {
		if (!side)
			// TB128: HTML radio buttons use .checked, not 'selected' attribute
			side = ctx.keepLeftRadioButton.checked ? 'right' : 'left';
		if (side != ctx.sideKept) {
			ctx.sideKept = side;
			var other = side == 'right' ? 'left' : 'right';
			var to_be_kept = ctx.getString('to_be_kept');
			var to_be_removed = ctx.getString('to_be_removed');
			// TB128: Update label text using textContent or by finding label element
			var leftLabel = ctx.keepLeftRadioButton.nextElementSibling || ctx.keepLeftRadioButton.parentElement.querySelector('label');
			var rightLabel = ctx.keepRightRadioButton.nextElementSibling || ctx.keepRightRadioButton.parentElement.querySelector('label');
			if (leftLabel) leftLabel.textContent = side == 'right' ? to_be_removed : to_be_kept;
			if (rightLabel) rightLabel.textContent = side == 'right' ? to_be_kept : to_be_removed;
			// TB128: HTML radio buttons use .checked property
			ctx.keepLeftRadioButton.checked = (side != 'right');
			ctx.keepRightRadioButton.checked = (side == 'right');
			var headerLeft = document.getElementById('headerLeft');
			var headerRight = document.getElementById('headerRight');
			if (headerLeft) headerLeft.className = side == 'right' ? 'remove' : 'keep';
			if (headerRight) headerRight.className = side == 'right' ? 'keep' : 'remove';
			if (ctx.displayedFields) {
				for (var i = 0; i < ctx.displayedFields.length; i++) {
					var cell1 = document.getElementById('cell_' + side + '_' + ctx.displayedFields[i]);
					var cell2 = document.getElementById('cell_' + other + '_' + ctx.displayedFields[i]);
					if (cell1 && cell1.className == 'remove')
						cell1.className = 'keep';
					if (cell2 && cell2.className == 'keep')
						cell2.className = 'remove';
				}
			}
		}
	}

	/**
	 * Ready state: intro visible, address book choice, Quit; action buttons visible but disabled; no progress/table/Stop.
	 */
	function showReadyState(ctx) {
		hide('statusAddressBook1');
		hide('statusAddressBook2');
		hide('progressMeter');
		hide('tablepane');
		hide('endinfo');
		make_visible('skipnextbutton');
		make_visible('keepnextbutton');
		make_visible('applynextbutton');
		disable('skipnextbutton');
		disable('keepnextbutton');
		disable('applynextbutton');
		hide('stopbutton');
		show('quitbutton');
		show('explanation');
		ctx.hide('statusAddressBook2');
		ctx.hide('progressMeter');
		ctx.hide('tablepane');
		ctx.hide('endinfo');
		ctx.make_visible('skipnextbutton');
		ctx.make_visible('keepnextbutton');
		ctx.make_visible('applynextbutton');
		ctx.disable('skipnextbutton');
		ctx.disable('keepnextbutton');
		ctx.disable('applynextbutton');
		ctx.hide('stopbutton');
		ctx.show('quitbutton');
		ctx.show('explanation');
	}

	/**
	 * Searching state: progress and address book counts visible, Stop; no intro/Quit, no comparison table until a pair is shown.
	 */
	function showSearchingState(ctx) {
		hide('explanation');
		hide('endinfo');
		show('progressMeter');
		show('statusAddressBook1');
		show('statusAddressBook2');
		show('stopbutton');
		hide('quitbutton');
		hide('tablepane'); /* comparison table only shown when a duplicate pair is displayed */
		disable('startbutton');
	}

	/**
	 * Duplicate pair state: enable Skip / Keep / Apply and remove wait cursor (user can act on the pair).
	 * TB128: Also ensure tablepane is visible to show the comparison table.
	 */
	function showDuplicatePairState(ctx) {
		enable('skipnextbutton');
		enable('keepnextbutton');
		enable('applynextbutton');
		// Ensure tablepane is visible when showing duplicate pair
		show('tablepane');
		if (ctx.window)
			ctx.window.removeAttribute('wait-cursor');
	}

	/**
	 * Disable Skip / Keep / Apply (e.g. while searching for next pair).
	 */
	function disableDuplicateActionButtons(ctx) {
		disable('skipnextbutton');
		disable('keepnextbutton');
		disable('applynextbutton');
	}

	/**
	 * Finished state: hide table and Stop, show Quit and end summary; enable Start (as Restart).
	 */
	function showFinishedState(ctx) {
		hide('tablepane');
		make_invisible('skipnextbutton');
		make_invisible('keepnextbutton');
		make_invisible('applynextbutton');
		if (ctx.window)
			ctx.window.removeAttribute('wait-cursor');
		hide('stopbutton');
		show('quitbutton');
		show('endinfo');
		enable('startbutton');
	}

	/**
	 * Show the comparison table header row.
	 */
	function showComparisonTableHeader(ctx) {
		make_visible('tableheader');
	}

	/**
	 * Hide the comparison table header row.
	 */
	function hideComparisonTableHeader(ctx) {
		make_invisible('tableheader');
	}

	/**
	 * Updates the card-count label for one address book in the status bar.
	 */
	function updateDeletedInfo(ctx, label, book, nDeleted) {
		if (!ctx.vcards || !ctx.vcards[book]) return;
		var cards = ctx.getString('cards');
		// TB128: Use abId1/abId2 instead of abDir1/abDir2
		var n = ctx.vcards[book].length -
			(ctx.abId1 == ctx.abId2 ? ctx.totalCardsDeleted1 + ctx.totalCardsDeleted2 : nDeleted);
		var elem = document.getElementById(label);
		if (elem) {
			// TB128: HTML elements use .textContent or .value depending on element type
			if (elem.tagName === 'INPUT') {
				elem.value = '(' + cards + ': ' + n + ')';
			} else {
				elem.textContent = '(' + cards + ': ' + n + ')';
			}
		}
	}

	/**
	 * Updates progress meter and progress text; refreshes deleted-info labels.
	 * Status will not be visible immediately during search; see also
	 * http://forums.mozillazine.org/viewtopic.php?p=5300605
	 */
	function updateProgress(ctx) {
		if (!ctx.vcards || !ctx.vcards[ctx.BOOK_1] || !ctx.vcards[ctx.BOOK_2]) {
			return; // vcards not initialized yet
		}
		var current, pos, max;
		if (!ctx.deferInteractive || !ctx.nowHandling) {
			current = 'pair';
			pos = ctx.positionSearch + 1;
			var num1 = ctx.vcards[ctx.BOOK_1].length;
			var num2 = ctx.vcards[ctx.BOOK_2].length;
			// TB128: Use abId1/abId2 instead of abDir1/abDir2
			max = ctx.abId1 == ctx.abId2 ? (num1 * (num1 - 1) / 2) : (num1 * num2);
			if (pos > max)  /* happens at end */
				pos = max;
		} else {
			current = 'parity';
			pos = ctx.positionDuplicates;
			max = ctx.duplicates.length;
		}
		// TB128: HTML progress element uses .value (0-100) or .setAttribute('value', percentage)
		if (ctx.progressmeter) {
			ctx.progressmeter.value = max == 0 ? 100 : (pos / max) * 100;
		}
		if (ctx.progresstext) {
			// TB128: Use .textContent or .value depending on element type
			try {
				if (ctx.progresstext.tagName === 'INPUT') {
					ctx.progresstext.value = ctx.getString(current) + " " + pos + " " + ctx.getString('of') + " " + max;
				} else {
					ctx.progresstext.textContent = ctx.getString(current) + " " + pos + " " + ctx.getString('of') + " " + max;
				}
			} catch (e) {
				// Element might not be ready yet
			}
		}
		updateDeletedInfo(ctx, 'statusAddressBook1_size', ctx.BOOK_1, ctx.totalCardsDeleted1);
		updateDeletedInfo(ctx, 'statusAddressBook2_size', ctx.BOOK_2, ctx.totalCardsDeleted2);
	}

	/**
	 * Fills the finished-state panel with result statistics. Call after showFinishedState.
	 */
	function showFinishedStats(ctx) {
		var totalCardsDeleted = ctx.totalCardsDeleted1 + ctx.totalCardsDeleted2;
		// TB128: Update HTML elements using .value or .textContent as appropriate
		var elem;
		elem = document.getElementById('resultNumBefore');
		if (elem) elem.textContent = ctx.totalCardsBefore;
		elem = document.getElementById('resultNumAfter');
		if (elem) elem.textContent = ctx.totalCardsBefore - totalCardsDeleted;
		elem = document.getElementById('resultNumRemovedMan');
		if (elem) elem.textContent = totalCardsDeleted - ctx.totalCardsDeletedAuto;
		elem = document.getElementById('resultNumRemovedAuto');
		if (elem) elem.textContent = ctx.totalCardsDeletedAuto;
		elem = document.getElementById('resultNumChanged');
		if (elem) elem.textContent = ctx.totalCardsChanged;
		elem = document.getElementById('resultNumSkipped');
		if (elem) elem.textContent = ctx.totalCardsSkipped;
		elem = document.getElementById('resultConsideredFields');
		if (elem) elem.textContent = ctx.consideredFields
			.filter(function(x) { return !ctx.isSet(x) && !ctx.matchablesList.includes(x); }).join(", ");
		elem = document.getElementById('resultIgnoredFields');
		if (elem) elem.textContent = ctx.ignoredFields.join(", ");
		elem = document.getElementById('resultDiffProps');
		if (elem) elem.textContent = ctx.nonequivalentProperties.join(", ");
		elem = document.getElementById('startbutton');
		if (elem) elem.textContent = ctx.getString('Restart');
	}

	return {
		enable: enable,
		disable: disable,
		show: show,
		hide: hide,
		show_hack: show_hack,
		make_visible: make_visible,
		make_invisible: make_invisible,
		createSelectionList: createSelectionList,
		setContactLeftRight: setContactLeftRight,
		showReadyState: showReadyState,
		showSearchingState: showSearchingState,
		showDuplicatePairState: showDuplicatePairState,
		disableDuplicateActionButtons: disableDuplicateActionButtons,
		showFinishedState: showFinishedState,
		showComparisonTableHeader: showComparisonTableHeader,
		hideComparisonTableHeader: hideComparisonTableHeader,
		updateDeletedInfo: updateDeletedInfo,
		updateProgress: updateProgress,
		showFinishedStats: showFinishedStats
	};
})();
