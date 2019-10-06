// -*- mode: js; indent-tabs-mode: t; js-indent-level: 8 -*-
// file: duplicateEntriesWindow.js

// This file includes UTF-8 encoding. Please make sure your text editor can deal with this prior to saving any changes!

/* Change history:
## Version 1.1.1 (seen as 2.1.1 by Thunderbird 68+):
 * compatiblility with Thunderbird 68+; slightly improve documentation
## Version 1.1:
 * improve progress calculation and display; clean up photo image handling
## Version 1.0.9:
 * fix bug introduced in version 1.0.8 regarding manual selection which side to keep
## Version 1.0.8:
 * make vertical size more flexible for small displays
 * fix display layout for overlong list membership information etc.
 * add comparison of number of non-empty fields for determining card preferred for deletion
 * improve calculation of character weight for determining card preferred for deletion
 * correct comparison of selection fields determining which side has less information
 * fix use of default value for ignoreFields; ignore by default also phone number types
 * various implementation improvements for more efficiency and better readability
## Version 1.0.7:
 * add option for normalizing international call prefix
 * fix horizontal layout issues, automatic width of contents
 * improve name matching: allow substrings, stop removing singleton digits and letters
 * mail user names like no-reply@... or no.service@... not anymore taken as first+last names
## Version 1.0.6:
 * various UI layout (width, vertical scrolling) and small documentation improvements
## Version 1.0.5:
 * correction of mistake in packaging version 1.0.4 that prevented it from running
## Version 1.0.4:
 * various small UI improvements: indication for card matching, layout, language, doc
## Version 1.0.3:
 * fixed syntax error in de-DE locale that lead to obscure initialization error
 * minor improvements of localization in the extension and of the entry in the TB add-ons list
## Version 1.0.1 and 1.0.2:
 * improved label of DCM menu entry for address book window
## Version 1.0:
 * major speedup in particular when searching for duplicates in large address books
 * improved user guidance; new Tools menu entry with default address book selection
 * various improvements of content matching and card comparison for equivalence
 * cards may be excluded from being presented as matching by setting a different AIM name
 * photos are compared for equality and are shown during manual inspection
 * mailing list membership is taken into account for comparison and shown during inspection
 * during manual inspection, field-by-field (resp. set-by-set) comparison information is shown
 * option to consider phone numbers with national prefix and with default country code equivalent
 * option to customize list of ignored fields; output summary of different fields
 * option to preserve entries of first address book when auto-deleting redundant entries
 * options are saved in TB configuration/preferences at `extensions.DuplicateContactsManager.*`
## Version 0.9.2:
 * few critical bug fixes
 * layout improvements
## Version 0.9:
 * Can now edit contacts.
 * Auto-removal of contacts which only contain some less fields.
 * Can work across two address books.
 * Option to collect all potential duplicates before interacting with the user.
 * Progress bar and other usability improvements
## Version 0.8:
 * Offer to delete exact duplicates without asking
 * Correctly search for exact duplicates
 * upgrade to support Thunderbird 7
 */

// TODO: add option to prune and transform contents of individual or all cards
// TODO: add option to automatically and/or manually merge fields (e.g., buttons with arrow)
// TODO: generalize matching/comparison and manual treatment to more than two entries

/*
   References:
   https://developer.mozilla.org/en-US/docs/Mozilla/Tech/XPCOM/Reference/nsIAbCard_(Tb3)
   https://developer.mozilla.org/en-US/docs/Mozilla/Thunderbird/Address_Book_Examples
*/

Set.prototype.isSuperset = function(other) {
	for(let elem of other) {
		if (!this.has(elem)) {
			return false;
		}
	}
	return true;
}

Set.prototype.toString = function() {
	return "{" + Array.from(this).join(", ") + "}";
}

function pushIfNew(elem, array) { /* well, this 'function' has a side effect on array */
	if (!array.includes(elem))
		array.push(elem);
	return array;
}
/*
T.prototype.pushIfNew = function(elem) {
	if (!this.includes(elem))
		this.push(elem);
	return this;
where T = Array would be an elegant extension of the built-in JS type Array. Yet in TB this not allowed for security and compatibility reasons.
It also would have the weird effect of adding an extra enumerable value to each array, as described here:
https://stackoverflow.com/questions/948358/adding-custom-functions-into-array-prototype
The following does not really work better:
Object.defineProperty(Array.prototype, 'insert', {
	enumerable: false,
	value: function (elem) {
	if (!this.includes(elem))
		this.push(elem);
	return this; }
});
As a workaround, one would need to avoid using the enumerator "for(let variable in ...)"
*/

if (typeof(DuplicateContactsManager_Running) == "undefined") {
	var DuplicateEntriesWindow = {
		restart: false,
		abManager : Components.classes["@mozilla.org/abmanager;1"].getService(Components.interfaces.nsIAbManager),

		stringBundle: null,
		stringBundle_old: null,
		prefsBranch: null,

		statustext: '',
		progresstext: '',
		progressmeter: null,
		window: null,

		// Constants for first index of vcards arrays
		BOOK_1 : 0,
		BOOK_2 : 1,
		// Contacts. Two dimensions arrays. The first index is the adress book.
		vcards          : new Array(),
		vcardsSimplified: new Array(),

		positionSearch: 0,
		position1: 0,
		position2: 0,
		deferInteractive: true,
		nowHandling: false,
		positionDuplicates: 0,
		duplicates: null,

		table: null,
		displayedFields: null,
		editableFields: null,

		sideKept: null,
		keepLeftRadioButton: null,
		keepRightRadioButton: null,

		abURI1: null,
		abURI2: null,
		abDir1: null,
		abDir2: null,

		card1: null,
		card2: null,

		totalCardsBefore: 0,
		totalCardsChanged: 0,
		totalCardsSkipped: 0,
		totalCardsDeleted1: 0,
		totalCardsDeleted2: 0,
		totalCardsDeletedAuto: 0,
		autoremoveDups: false,
		preserveFirst: false,
		nonequivalentProperties : [],
		addressBookFields: new Array( /* all potentially available fields */
			'PhotoURI', 'PhotoType', 'PhotoName',
			'NickName', '__Names'/* matchable */, 'FirstName', 'PhoneticFirstName', 'LastName', 'PhoneticLastName',
			'SpouseName', 'FamilyName', 'DisplayName', '_PhoneticName', 'PreferDisplayName',
			'_AimScreenName', '_GoogleTalk', 'CardType', 'Category', 'AllowRemoteContent',
			'PreferMailFormat', '__MailListNames'/* virtual set */,
			'__Emails'/* matchable, virtual set */, 'DefaultEmail',
			'PrimaryEmail', /* 'LowercasePrimaryEmail', */
			'SecondEmail',  /* 'LowercaseSecondEmail', */
			'__PhoneNumbers'/* matchable, virtual set */, 'CellularNumber', 'CellularNumberType', 'HomePhone', 'HomePhoneType',
			'WorkPhone', 'WorkPhoneType', 'FaxNumber', 'FaxNumberType', 'PagerNumber', 'PagerNumberType',
			'DefaultAddress',
			'HomeAddress', 'HomeAddress2', 'HomeCity', 'HomeState',	'HomeZipCode', 'HomeCountry',
			'WorkAddress', 'WorkAddress2', 'WorkCity', 'WorkState', 'WorkZipCode', 'WorkCountry',
			'JobTitle', 'Department', 'Company',
			// 'AnniversaryYear', 'AnniversaryMonth', 'AnniversaryDay',
			'BirthYear', 'BirthMonth', 'BirthDay',
			'WebPage1', 'WebPage2',
			'Custom1', 'Custom2', 'Custom3', 'Custom4', 'Notes',
			'PopularityIndex', 'LastModifiedDate',
			'UID', 'UUID', 'CardUID',
			'groupDavKey', 'groupDavVersion', 'groupDavVersionPrev',
			'RecordKey', 'DbRowID',
			'unprocessed:rev', 'unprocessed:x-ablabel'),
		matchablesList : new Array('__Names', '__Emails', '__PhoneNumbers'),
		metaProperties : new Array('__NonEmptyFields', '__CharWeight'),
		ignoredFieldsDefault : new Array('PhotoType', 'PhotoName',
						 'CellularNumberType', 'HomePhoneType', 'WorkPhoneType', 'FaxNumberType', 'PagerNumberType',
						/* 'LowercasePrimaryEmail', 'LowercaseSecondEmail', */
						'UID', 'UUID', 'CardUID',
						'groupDavKey', 'groupDavVersion', 'groupDavVersionPrev',
						'RecordKey', 'DbRowID',
						'unprocessed:rev', 'unprocessed:x-ablabel'),
		ignoredFields : [], // will be derived from ignoredFieldsDefault
		consideredFields : [], // this.addressBookFields - this.ignoredFields
		natTrunkPrefix : "", // national phone number trunk prefix
		natTrunkPrefixReqExp : /^0([1-9])/, // typical RegExp for national trunk prefix
		intCallPrefix : "", // international call prefix
		intCallPrefixReqExp : /^00([1-9])/, // typical RegExp for international call prefix
		countryCallingCode : "", // international country calling code

		debug: function(str) {
			console.log(str);
		},

		isText: function(property) {
			return property.match(/(Name|GoogleTalk|Address|City|State|Country|Title|Department|Company|WebPage|Custom|Notes)$/) != null && !this.isSelection(property);
		},

		isFirstLastDisplayName: function(property) {
			return property.match(/^(FirstName|LastName|DisplayName)$/) != null;
		},

		isEmail: function(property) {
			return property.match(/^(PrimaryEmail|SecondEmail)$/) != null;
		},

		isPhoneNumber: function(property) {
			return property.match(/^(WorkPhone|HomePhone|FaxNumber|PagerNumber|CellularNumber)$/) != null;
		},

		isSet: function(property) {
			return property.match(/^(__MailListNames|__Emails|__PhoneNumbers)$/) != null;
		},

		isSelection: function(property) {
			return property.match(/^(PreferMailFormat|PreferDisplayName|AllowRemoteContent)$/) != null;
		},

		isNumerical: function(property) {
			return property.match(/^(PopularityIndex|LastModifiedDate|RecordKey|DbRowID)$/) != null;
		},

		defaultValue: function(property) { /* sets are treated as strings here */
			if (this.isSelection(property) || this.isNumerical(property))
				return (/* property == 'PreferDisplayName' ? "1" : */ "0");
			else
				return this.isSet(property) ? "{}" : "";
		},

		charWeight: function(str, property) {
			// gives preference to values with many non-digit/uppercase and special characters
			const pat = this.isPhoneNumber(property) ? /[ 0-9]/g : /[ a-z]/g; /* umlauts have higher weight than their transcription */
			const result = str.replace(pat, '').length;
			// this.debug("isPhoneNumber("+property+") = "+this.isPhoneNumber(property)+" charWeight("+str+") = "+result);
			return result;
		},

		/**
		 * Will be called by duplicateEntriesWindow.xul once the according window is loaded
		 */
		init: function() {
			do {
				var Prefs = Components.classes["@mozilla.org/preferences-service;1"]
					.getService(Components.interfaces.nsIPrefService);
				var prefBranchPrefixId = "extensions.DuplicateContactsManager.";
				this.prefsBranch = Prefs.getBranch(prefBranchPrefixId);
				if (!this.prefsBranch)
					break;
				try { this.autoremoveDups = this.prefsBranch.getBoolPref('autoremoveDups'); } catch(e) {}
				try { this.preserveFirst = this.prefsBranch.getBoolPref('preserveFirst'); } catch(e) {}
				try { this.deferInteractive = this.prefsBranch.getBoolPref('deferInteractive'); } catch(e) {}

				try { this.natTrunkPrefix  = this.prefsBranch.getCharPref('natTrunkPrefix');
				      this.natTrunkPrefixReqExp = new RegExp("^"+this.natTrunkPrefix+"([1-9])"); } catch(e) {}
				try { this.intCallPrefix  = this.prefsBranch.getCharPref('intCallPrefix');
				      this.intCallPrefixReqExp = new RegExp("^"+this.intCallPrefix+"([1-9])"); } catch(e) {}
				try { this.countryCallingCode = this.prefsBranch.getCharPref('countryCallingCode'); } catch(e) {}
				this.ignoredFields = this.ignoredFieldsDefault;
				try { var prefStringValue = this.prefsBranch.getCharPref('ignoreFields');
				      if (prefStringValue.length > 0)
					      this.ignoredFields = prefStringValue.split(/\s*,\s*/);
				    } catch(e) {}
			} while (0);
			document.getElementById('autoremove').checked = this.autoremoveDups;
			document.getElementById('preservefirst').checked = this.preserveFirst;
			document.getElementById('deferInteractive').checked = this.deferInteractive;
			document.getElementById('natTrunkPrefix').value = this.natTrunkPrefix;
			document.getElementById('intCallPrefix').value = this.intCallPrefix;
			document.getElementById('countryCallingCode').value = this.countryCallingCode;
			this.consideredFields = /* value before any interactive changes by user */
				this.addressBookFields.filter(x => !this.ignoredFields.includes(x));
			document.getElementById('consideredFields').textContent = this.consideredFields.
				filter(x => !this.isSet(x) && !this.matchablesList.includes(x)).join(", ");
			document.getElementById('ignoredFields').value = this.ignoredFields.join(", ");

			try { /* for Thunderbird 68+. */
				var {Services} = ChromeUtils.import("resource://gre/modules/Services.jsm");
				this.stringBundle = Services.strings.createBundle("chrome://duplicatecontactsmanager/locale/duplicateContactsManager.properties");
			} catch(e) {
				this.stringBundle = document.getElementById('bundle_duplicateContactsManager');
			}
			this.running = true;
			this.statustext = document.getElementById('statusText');
			this.progresstext = document.getElementById('progressText');
			this.progressmeter = document.getElementById('progressMeter');
			this.window = document.getElementById('handleDuplicates-window');
			this.attributesTableRows = document.getElementById('AttributesTableRows');
			this.keepLeftRadioButton = document.getElementById('keepLeft');
			this.keepRightRadioButton = document.getElementById('keepRight');
			this.hide('statusAddressBook1');
			this.hide('statusAddressBook2');
			this.hide('progressMeter');
			this.progresstext.value = "";
			this.hide('tablepane');
			this.hide('endinfo');

			if (!this.abManager || !this.abManager.directories || this.abManager.directories.length == 0) {
				this.disable('startbutton');
				this.statustext.className = 'error-message'; /* not 'with-progress' */
				this.statustext.textContent = this.getString("NoABookFound");
				return;
			}
			if (this.abURI1 == null || this.abURI2 == null) {
				var default_abook = this.abManager.directories.getNext().URI;
				if (typeof window.opener.GetSelectedDirectory != 'undefined') {
					const addressbookURIs = window.opener.GetSelectedDirectory().
				                                match(/(moz-ab(mdb|osx)directory:\/\/([^\/]+\.mab|\/)).*/);
					if (addressbookURIs && addressbookURIs.length > 0)
						default_abook = addressbookURIs[1];
				}
				this.abURI1 = this.abURI2 = default_abook;
			}

			// We will process the first/selected address book, plus optionally a second one
			// read all addressbooks, fill lists in preferences dialog
			var allAddressBooks = this.abManager.directories;
			var dirNames = new Array();
			var URIs = new Array();
			while (allAddressBooks.hasMoreElements()) {
				var addressBook = allAddressBooks.getNext();
				if (addressBook instanceof Components.interfaces.nsIAbDirectory)
				{
					dirNames.push(addressBook.dirName);
					URIs    .push(addressBook.URI);
				}
			}
			var ablists = document.getElementById('addressbooklists');
			var ablist1 = this.createSelectionList('addressbookname', dirNames, URIs, this.abURI1);
			var ablist2 = this.createSelectionList('addressbookname', dirNames, URIs, this.abURI2);
			ablists.appendChild(ablist1);
			ablists.appendChild(ablist2);

			this.statustext.className = ''; /* not 'with-progress' */
			this.statustext.textContent = this.getString('PleasePressStart');
			document.getElementById('startbutton').setAttribute('label', this.getString('Start'));
			this.make_visible('skipnextbutton');
			this.make_visible('keepnextbutton');
			this.make_visible('applynextbutton');
			this.disable('skipnextbutton');
			this.disable('keepnextbutton');
			this.disable('applynextbutton');
			this.hide('stopbutton');
			this.show('quitbutton');
			this.show('explanation');
			document.getElementById('startbutton').focus();
		},

		getString: function(name) {
			return this.stringBundle_old ? this.stringBundle_old.getString(name) : this.stringBundle.GetStringFromName(name);
		},

		/**
		 * Will be called by duplicateEntriesWindow.xul
		 * once the according window is closed
		 */
		OnUnloadWindow: function() {
			this.running = false;
			this.vcards[this.BOOK_1] = null;
			this.vcards[this.BOOK_2] = null;
		},

		startSearch: function() {
			if (this.restart) {
				this.restart = false;
				this.init();
				return;
			}
			const ablist = document.getElementById('addressbooklists');
			const ab1 = ablist.firstChild;
			const ab2 = ab1.nextSibling;
			if (ab1.selectedItem)
				this.abURI1 = ab1.selectedItem.value;
			if (ab2.selectedItem)
				this.abURI2 = ab2.selectedItem.value;
			this.abDir1 = this.abManager.getDirectory(this.abURI1);
			this.abDir2 = this.abManager.getDirectory(this.abURI2);
			if([this.abURI1, this.abURI2].includes("moz-abosxdirectory:///"))
				alert("Mac OS X Address Book is read-only.\nYou can use it only for comparison.");
			//It seems that Thunderbird 11 on Max OS 10.7 can actually be write fields, although an exception is thrown.
			this.readAddressBooks();

			this.autoremoveDups = document.getElementById('autoremove').getAttribute('checked');
			this.preserveFirst = document.getElementById('preservefirst').getAttribute('checked');
			this.deferInteractive = document.getElementById('deferInteractive').getAttribute('checked');
			this.natTrunkPrefix = document.getElementById('natTrunkPrefix').value;
			this.intCallPrefix = document.getElementById('intCallPrefix').value;
			this.countryCallingCode = document.getElementById('countryCallingCode').value;
			if (this.natTrunkPrefix != "" && !this.natTrunkPrefix.match(/^[0-9]{1,2}$/))
				alert("National phone number trunk prefix '"+this.natTrunkPrefix+"' should contain one or two digits");
			if (this.intCallPrefix != "" && !this.intCallPrefix.match(/^[0-9]{2,4}$/))
				alert("International call prefix '"+this.intCallPrefix+"' should contain two to four digits");
			if (this.countryCallingCode != "" && !this.countryCallingCode.match(/^(\+|[0-9])[0-9]{1,6}$/))
				alert("Default country calling code '"+this.countryCallingCode+"' should contain a leading '+' or digit followed by one to six digits");
			this.ignoredFields = document.getElementById('ignoredFields').value.split(/\s*,\s*/);
			this.consideredFields = this.addressBookFields./*
				concat(this.ignoredFieldsDefault).
				filter(x => !this.matchablesList.includes(x)). */
				filter(x => !this.ignoredFields.includes(x));

			this.prefsBranch.setBoolPref('autoremoveDups', this.autoremoveDups);
			this.prefsBranch.setBoolPref('preserveFirst', this.preserveFirst);
			this.prefsBranch.setBoolPref('deferInteractive', this.deferInteractive);
			this.prefsBranch.setCharPref('natTrunkPrefix', this.natTrunkPrefix);
			this.prefsBranch.setCharPref('intCallPrefix', this.intCallPrefix);
			this.prefsBranch.setCharPref('countryCallingCode', this.countryCallingCode);
			this.prefsBranch.setCharPref('ignoreFields', this.ignoredFields.join(", "));

			// hide intro info, show table, progress, etc.
			this.hide('explanation');
			this.purgeAttributesTable();
			this.hide('endinfo');
			this.show('progressMeter');
			this.statustext.className = 'with-progress';
			this.statustext.textContent = this.getString('SearchingForDuplicates');
			document.getElementById('statusAddressBook1_label').value = this.abDir1.dirName;
			document.getElementById('statusAddressBook2_label').value = this.abDir2.dirName;
			this.updateDeletedInfo('statusAddressBook1_size' , this.BOOK_1, 0);
			this.updateDeletedInfo('statusAddressBook2_size' , this.BOOK_2, 0);
			this.show('statusAddressBook1');
			this.show('statusAddressBook2');
			this.show('stopbutton');
			this.hide('quitbutton');
			this.show_hack('tablepane');

			// re-initialization needed in case of restart:
			while (ablist.firstChild)
				ablist.removeChild(ablist.firstChild);
			this.positionSearch = 0;
			this.position1 = 0;
			this.position2 = (this.abDir1 == this.abDir2 ? 0 : -1);
			this.nowHandling = false;
			this.positionDuplicates = 0;
			this.duplicates = new Array();
			this.totalCardsChanged = 0;
			this.totalCardsSkipped = 0;
			this.totalCardsDeleted1 = 0;
			this.totalCardsDeleted2 = 0;
			this.totalCardsDeletedAuto = 0;
			this.updateProgress();
			this.disable('startbutton');
			this.searchNextDuplicate();
		},

		skipAndSearchNextDuplicate: function() {
			this.totalCardsSkipped++;
			this.searchNextDuplicate();
		},

		/**
		 * Continues searching the whole vcard array for a duplicate until one is found.
		 */
		searchNextDuplicate: function() {
			this.purgeAttributesTable();
			if (!this.nowHandling) {
				this.disable('skipnextbutton');
				this.disable('keepnextbutton');
				this.disable('applynextbutton');
				this.window.setAttribute('wait-cursor', 'true');
				this.statustext.className = 'with-progress';
				this.statustext.textContent = this.getString('SearchingForDuplicates');
			}
			this.updateProgress();
			// starting the search via setTimeout allows redrawing the progress info
			setTimeout(function() { DuplicateEntriesWindow.searchDuplicateIntervalAction(); }, 13);
		},

		/**
		 * Saves modifications to one card and deletes the other one.
		 */
		applyAndSearchNextDuplicate: function() {
			// for the case that right one will be kept
			var [deleAbDir, deleBook, deleIndex] = [this.abDir1, this.BOOK_1, this.position1];
			var [keptAbDir, keptBook, keptIndex] = [this.abDir2, this.BOOK_2, this.position2];
			if (this.sideKept == 'left') { // left one will be kept
				[deleAbDir, deleBook, deleIndex, keptAbDir, keptBook, keptIndex] =
				[keptAbDir, keptBook, keptIndex, deleAbDir, deleBook, deleIndex];
			}
			this.updateAbCard(keptAbDir, keptBook, keptIndex, this.sideKept);
			this.deleteAbCard(deleAbDir, deleBook, deleIndex, false);
			this.searchNextDuplicate();
		},

		updateAbCard: function(abDir, book, index, side) {
			var card = this.vcards[book][index];

			// see what's been modified
			var updateFields = this.getCardFieldValues(side);
			var entryModified = false;
			for(let property in updateFields) {
				const defaultValue = this.defaultValue(property); /* cannot be a set here */
				if (card.getProperty(property, defaultValue) != updateFields[property]) {
				// not using this.getProperty here to give a chance to update wrongly empty field
					try {
						// this.debug("updating "+property+" from "+card.getProperty(property, defaultValue)+" to "+updateFields[property]);
						card.setProperty(property, updateFields[property]);
						entryModified = true;
					} catch (e) {
						alert("Internal error: cannot set field '"+property+"' of "+card.displayName+": "+e);
					}
				}
			}
			if (entryModified) {
				this.vcardsSimplified[book][index] = null; // request reconstruction by getSimplifiedCard
				try {
					abDir.modifyCard(card);	// updates also LastModifiedDate
					this.totalCardsChanged++;
				} catch (e) {
					alert("Internal error: cannot update card '"+card.displayName+"': "+e);
				}
			}
		},

		/**
		 * Saves modifications to both cards
		 */
		keepAndSearchNextDuplicate: function() {
			this.updateAbCard(this.abDir1, this.BOOK_1, this.position1, 'left' );
			this.updateAbCard(this.abDir2, this.BOOK_2, this.position2, 'right');
			this.searchNextDuplicate();
		},

		/**
		 * Deletes the card identified by 'index' from the given address book.
		 */
		deleteAbCard: function(abDir, book, index, auto) {

			var card = this.vcards[book][index];

			/** delete from directory
			 * 1) create nsISupportsArray containing the one card to be deleted
			 * 2) call deleteCards ( nsISupportsArray cards )
			 */
			var deleteCards = Components.classes["@mozilla.org/array;1"]
			                  .createInstance(Components.interfaces.nsIMutableArray);
			deleteCards.appendElement(card, false);
			try {
				abDir.deleteCards(deleteCards);
				if (abDir == this.abDir1)
					this.totalCardsDeleted1++;
				else
					this.totalCardsDeleted2++;
				if(auto)
					this.totalCardsDeletedAuto++;
			} catch (e) {
				alert("Internal error: cannot remove card '"+card.displayName+"': "+e);
			}
			this.vcards[book][index] = null; // set empty element, but leave element number as is
		},

		updateDeletedInfo: function (label, book, nDeleted) {
			const cards = this.getString('cards');
			document.getElementById(label).value = '('+cards+': '+ (this.vcards[book].length -
			                         (this.abDir1 == this.abDir2 ? this.totalCardsDeleted1 +
			                                                       this.totalCardsDeleted2 : nDeleted)) +')';
		},

		updateProgress: function() {
			// update status info - will not be visible immediately during search, see also http://forums.mozillazine.org/viewtopic.php?p=5300605
			var current, pos, max;
			if(!this.deferInteractive || !this.nowHandling) {
				current = 'pair';
				pos = this.positionSearch + 1;
				const num1 = this.vcards[this.BOOK_1].length;
				const num2 = this.vcards[this.BOOK_2].length;
				max = this.abDir1 == this.abDir2 ? (num1*(num1-1)/2) : (num1*num2);
				if (pos > max) /* happens at end */
					pos = max;
			} else {
				current = 'parity';
				pos = this.positionDuplicates;
				max = this.duplicates.length;
			}
			this.progressmeter.setAttribute('value', ((max == 0 ? 1 : pos/max) * 100) + '%');
			this.progresstext.value = this.getString(current)+" "+pos+
				" "+this.getString('of')+" "+max;
			this.updateDeletedInfo('statusAddressBook1_size' , this.BOOK_1, this.totalCardsDeleted1);
			this.updateDeletedInfo('statusAddressBook2_size' , this.BOOK_2, this.totalCardsDeleted2);
		},

		/**
		 * advances internal pointers to next available card pair.
		 * Returns true if and only if next pair is available
		 */
		skipPositionsToNext: function() {
			if(!this.deferInteractive || !this.nowHandling) {
				if (this.searchPositionsToNext())
					return true;
				if (!this.deferInteractive)
					return false;
				this.nowHandling = true;
			}
			do {
				if (this.positionDuplicates++ >= this.duplicates.length) {
				  return false;
				}
				[this.position1, this.position2] = this.duplicates[this.positionDuplicates-1];
			} while(!this.vcards[this.BOOK_1][this.position1] ||
			        !this.vcards[this.BOOK_2][this.position2]);
			this.updateProgress();
			return true;
		},

		/**
		 * increments internal pointers to next available card pair.
		 * Returns true if and only if next pair is available
		 */
		searchPositionsToNext: function() {
			// If the current position is deleted, force the search for a next one by
			// setting the position2 to the end.
			if(!this.vcards[this.BOOK_1][this.position1])
				this.position2 = this.vcards[this.BOOK_2].length;

			this.positionSearch++;
			// Search for the next position2
			do
			{
				++(this.position2);
				if(this.position2 >= this.vcards[this.BOOK_2].length)
				{
					// We have reached the end, search for the next position
					do
					{
						this.position1++;
						this.updateProgress();
						// if same book, make sure it's possible to have ...,position1, position2.
						if(this.position1 + (this.abDir1 == this.abDir2 ? 1 : 0) >= this.vcards[this.BOOK_1].length)
							return false;
					} while(!this.vcards[this.BOOK_1][this.position1]);

					// if same book, we start searching the pair with the position after.
					this.position2 = (this.abDir1 == this.abDir2 ? this.position1 + 1 : 0);
				}
			} while(!this.vcards[this.BOOK_2][this.position2]);

			return true;
		},

		/**
		 * performs the actual search action. Should not be called directly, but by searchNextDuplicate().
		 */
		searchDuplicateIntervalAction: function() {
			var lasttime = new Date;
			while (this.skipPositionsToNext()) {
				if ((new Date)-lasttime >= 1000) {
					// Force/enable Thunderbird every 1000 milliseconds to redraw the progress bar etc.
					// See also http://stackoverflow.com/questions/2592335/how-to-report-progress-of-a-javascript-function
					// As a nice side effect, this allows the stop button to take effect while this main loop is active!
					setTimeout(function() { DuplicateEntriesWindow.searchDuplicateIntervalAction(); }, 13);
					return;
				}

				var simplified_card1 = this.getSimplifiedCard(this.BOOK_1, this.position1);
				var simplified_card2 = this.getSimplifiedCard(this.BOOK_2, this.position2);
				if (simplified_card1['_AimScreenName'] != simplified_card2['_AimScreenName'])
					continue; // useful for manual differentiation to prevent repeated treatment
				var namesmatch = this.namesMatch(simplified_card1, simplified_card2);
				/* if (simplified_card1['DisplayName'] == simplified_card2['DisplayName'])
					this.debug("namesmatch = "+namesmatch+" for "+simplified_card1['DisplayName']+" vs. "+simplified_card2['DisplayName']); */
				var mailsmatch = this.mailsMatch(simplified_card1, simplified_card2);
				var phonesmatch = this.phonesMatch(simplified_card1, simplified_card2);
				var nomailsphonesmatch = this.noMailsPhonesMatch(simplified_card1) &&
				                         this.noMailsPhonesMatch(simplified_card2);
				var nomatch = this.noNamesMatch(simplified_card1) &&
				              this.noNamesMatch(simplified_card2) && nomailsphonesmatch;  // pathological case
				if (namesmatch || mailsmatch || phonesmatch || nomatch) {
					// OK, we found something that looks like a duplicate or cannot match anything.
					var card1 = this.vcards[this.BOOK_1][this.position1];
					var card2 = this.vcards[this.BOOK_2][this.position2];
					var [comparison, preference] = this.abCardsCompare(card1, card2);
					if (comparison != -2 && this.autoremoveDups &&
					    !(this.abDir1 != this.abDir2 && this.preserveFirst && preference < 0)) {
						if (preference < 0)
							this.deleteAbCard(this.abDir1, this.BOOK_1, this.position1, true);
						else // if preference >= 0, prefer to delete c2
							this.deleteAbCard(this.abDir2, this.BOOK_2, this.position2, true);
					} else {
						//window.clearInterval(this.searchInterval);

						if (this.deferInteractive && !this.nowHandling) { // append the positions to queue
							this.duplicates.push([this.position1, this.position2]);
						}
						else {
							this.enable('skipnextbutton');
							this.enable('keepnextbutton');
							this.enable('applynextbutton');
							this.window.removeAttribute('wait-cursor');
							this.statustext.className = 'with-progress';
							this.statustext.textContent = this.getString(
							                        nomatch ? 'noMatch' : 'matchFound');
							this.displayCardData(card1, card2, comparison, preference,
							                     namesmatch, mailsmatch, phonesmatch);
							return;
						}
					}
				}
			}
			this.endSearch();
		},

		endSearch: function() {
			// hide table etc.
			this.hide('tablepane');

			this.make_invisible('skipnextbutton');
			this.make_invisible('keepnextbutton');
			this.make_invisible('applynextbutton');
			this.window.removeAttribute('wait-cursor');
			this.statustext.className = 'with-progress';
			this.statustext.textContent = this.getString('finished');

			// show statistics
			var totalCardsDeleted = this.totalCardsDeleted1+this.totalCardsDeleted2;
			document.getElementById('resultNumBefore').value = this.totalCardsBefore;
			document.getElementById('resultNumAfter').value = this.totalCardsBefore - totalCardsDeleted;
			document.getElementById('resultNumRemovedMan').value = totalCardsDeleted - this.totalCardsDeletedAuto;
			document.getElementById('resultNumRemovedAuto').value = this.totalCardsDeletedAuto;
			document.getElementById('resultNumChanged').value = this.totalCardsChanged;
			document.getElementById('resultNumSkipped').value = this.totalCardsSkipped;
			document.getElementById('resultConsideredFields').textContent = this.consideredFields.
				filter(x => !this.isSet(x) && !this.matchablesList.includes(x)).join(", ");
			document.getElementById('resultIgnoredFields').textContent = this.ignoredFields.join(", ");
			document.getElementById('resultDiffProps').textContent = this.nonequivalentProperties.join(", ");
			this.hide('stopbutton');
			this.show('quitbutton');
			this.show('endinfo');

			document.getElementById('startbutton').setAttribute('label', this.getString('Restart'));
			this.enable('startbutton');
			this.restart = true;
		},

		getProperty: function(card, property) { /* sets are treated as strings here */
			const defaultValue = this.defaultValue(property);
			const value = card.getProperty(property, defaultValue);
			if (this.isSelection(property) && value == "")
				return defaultValue; // recover from wrongly empty field
			if (this.isSet(property)) /* used for '__MailListNames' */
				return value.toString();
			if (property == 'LastModifiedDate')
				 return value == "0" ? "" : new Date(value * 1000).toLocaleString();
			if (property == 'PhotoURI' && value == 'chrome://messenger/skin/addressbook/icons/contact-generic.png')
				return defaultValue;
				/* since actual image will be loaded asynchronouslyno need to do the loading here:
				var contents = this.readFile(value, false, false);
				return contents ? contents : defaultValue;
				*/
			return value+""; // force string even when isSelection or isNumerical
		},

		transformMiddlePrefixName: function(fn, ln) {
			var p;
			// move any wrongly attached middle initial(s) from last name to first name
			var middlenames = "";
			while ((p = ln.match(/^\s*([A-Za-z])\s+(.*)$/))) {
				middlenames += " "+p[1];
				ln = p[2];
			}
			// move any wrongly attached name prefix(es) from first name to last name
			var nameprefixes = "";
			while ((p = fn.match(/^(.+)\s(von|van|und|and|für|for|zum|zur|der|de|geb|ben)\s*$/))) {
				fn = p[1];
				nameprefixes = p[2]+" "+nameprefixes;
			}
			fn = fn.replace(/^\s+/, "").replace(/\s+$/, "") + middlenames;
			ln = nameprefixes + ln.replace(/^\s+/, "").replace(/\s+$/, "");
			return [fn, ln];
		},

		getTransformedProperty: function(card, property) {
			// first step: pruning
			var value = this.getPrunedProperty(card, property);

			// second step: transformation
			if (this.isFirstLastDisplayName(property)) {
				var p;
				if (property == 'DisplayName') {
					// correct order of first and last name
					if ((p = value.match(/^([^,]+),\s+(.+)$/))) {
						[fn, ln] = this.transformMiddlePrefixName(p[2], p[1]);
						value = fn + " " + ln;
					}
					return value;
				}
				var fn = this.getPrunedProperty(card, 'FirstName');
				var ln = this.getPrunedProperty(card,  'LastName');
				// correct order of first and last name
				if (/,\s*$/.test(fn)) {
					ln = fn.replace(/,\s*$/,"");
					fn = this.getProperty(card, 'LastName');
				}
				else {
					if ((p = fn.match(/^([^,]+),\s+(.+)$/))) {
						fn = p[2]+(ln != "" ? " "+ln : "");
						ln = p[1];
					}
				}
				[fn, ln] = this.transformMiddlePrefixName(fn, ln);
				return (property == 'FirstName' ? fn : ln);
			}
			return value;
		},

		getAbstractedTransformedProperty: function(card, property) {
			return this.abstract(this.getTransformedProperty(card, property), property);
		},

		/**
		 * This is a simplified representation of a card from the address book with
		 * only those fields which are required for comparison,
		 * some pre-processing already performed on the necessary fields.
		 */
		getSimplifiedCard: function(book, i) {
			if (!this.vcardsSimplified[book][i] && this.vcards[book][i]) {
				var card = this.vcards[book][i].QueryInterface(Components.interfaces.nsIAbCard);
				var vcard = new Object();
				[vcard['FirstName'], vcard['LastName'], vcard['DisplayName']] =
				       this.completeFirstLastDisplayName(
					[this.getAbstractedTransformedProperty(card,   'FirstName'),
					 this.getAbstractedTransformedProperty(card,    'LastName'),
					 this.getAbstractedTransformedProperty(card, 'DisplayName')],
					card);
				vcard['_AimScreenName'] = this.getAbstractedTransformedProperty(card,'_AimScreenName');
				vcard[  'PrimaryEmail'] = this.getAbstractedTransformedProperty(card,  'PrimaryEmail');
				vcard[   'SecondEmail'] = this.getAbstractedTransformedProperty(card,   'SecondEmail');
				// not using HomePhone for matching because often it is shared by several people
				vcard['Phone1'] = this.getAbstractedTransformedProperty(card, 'CellularNumber');
				vcard['Phone2'] = this.getAbstractedTransformedProperty(card, 'PagerNumber');
				vcard['Phone3'] = this.getAbstractedTransformedProperty(card, 'WorkPhone');
				// not using FaxNumber for matching because often it is shared by several people
				this.vcardsSimplified[book][i] = vcard;
			}
			return this.vcardsSimplified[book][i];
		},

		/**
		 * Creates table with address book fields for side-by-side comparison
		 * and editing. Editable fields will be listed in this.editableFields.
		 */
		displayCardData: function(card1, card2, comparison, preference,
			                  namesmatch, mailsmatch, phonesmatch) {
			// this.debug("popularityIndex: "+this.getProperty(card1, 'PopularityIndex')+ " lastModifiedDate: " +this.getProperty(card1, 'LastModifiedDate'));
			this.purgeAttributesTable();
			this.displayedFields = new Array();
			this.editableFields = new Array();
			this.make_visible('tableheader');
			const cardsEqu = document.getElementById('cardsEqu');
			cardsEqu.value = comparison == -2 ? '' :
			                 comparison == 0 ? '≅' : // &cong; yields syntax error; &#8773; verbatim
			                 comparison <  0 ? '⋦' : '⋧';

			// if two different mail primary addresses are available, show SecondEmail field such that it can be filled in
			const mail1 = this.getAbstractedTransformedProperty(card1, 'PrimaryEmail');
			const mail2 = this.getAbstractedTransformedProperty(card2, 'PrimaryEmail');
			const displaySecondMail = (mail1 != '' && mail2 != '' && mail1 != mail2);
			// if combination of first and last name is different from display name, show nickname field such that it can be filled in
			const dn1 = this.getAbstractedTransformedProperty(card1, 'DisplayName');
			const dn2 = this.getAbstractedTransformedProperty(card2, 'DisplayName');
			const displayNickName = (dn1 != '' && dn1 != this.getAbstractedTransformedProperty(card1,'FirstName')+" "+
				this.getAbstractedTransformedProperty(card1, 'LastName'))
				|| (dn2 != '' && dn2 != this.getAbstractedTransformedProperty(card2,'FirstName')+" "+
				this.getAbstractedTransformedProperty(card2, 'LastName'))
				|| (dn1 != dn2);

			var fields = this.consideredFields.slice(); // copy
			const diffProps = this.nonequivalentProperties;
			for(let i = 0; i < diffProps.length; i++) { // add non-set fields for which so far non-equivalent values have been found
				const property = diffProps[i];
				if (!property.match(/^\{/))
					pushIfNew(property, fields);
			}
			for(let i=0; i<fields.length; i++) {
				const property = fields[i];
				var row = document.createElement('row');
				var labelcell = document.createElement('label');
				var localName = property;
				try {
					localName = this.getString(property + '_label');
				}
				catch (e) {
					/*
					// alert("Internal error: cannot get localized field name for "+property+": "+e);
					// leftValue = rightValue = defaultValue; // hide internal values
					*/
				}
				labelcell.setAttribute('value', localName + ':');
				labelcell.setAttribute('class', 'field');
				row.appendChild(labelcell);
				if (this.matchablesList.includes(property)) {
					const cell1 = document.createElement('label');
					const cellEqu = document.createElement('hbox');
					const descEqu = document.createElement('description');
					cellEqu.className = 'equivalence';
					cellEqu.appendChild(descEqu);
					if (namesmatch && property == '__Names' ||
					    mailsmatch && property == '__Emails' ||
					    phonesmatch && property == '__PhoneNumbers')
						descEqu.setAttribute('value', '≃'); /* matchable property matches */
					row.appendChild(cell1);
					row.appendChild(cellEqu);
					this.attributesTableRows.appendChild(row);
				} else { /* also for '__MailListNames' */
					/* sets are treated as strings here */
					const defaultValue = this.defaultValue(property);
					const  leftValue = this.getProperty(card1, property);
					const rightValue = this.getProperty(card2, property);
					const displayOnlyIfDifferent = /^(PhotoType|CellularNumberType|HomePhoneType|WorkPhoneType|FaxNumberType|PagerNumberType|UID|UUID|CardUID)$/;
					const displayAlways = /^(FirstName|LastName|DisplayName|_AimScreenName|PrimaryEmail|SecondEmail|CellularNumber|HomePhone|WorkPhone|FaxNumber|Notes|PopularityIndex)$/;
					if ((!property.match(displayOnlyIfDifferent) || leftValue != rightValue) &&
					    (   ( leftValue &&  leftValue != defaultValue)
					     || (rightValue && rightValue != defaultValue)
					     || (property=='SecondEmail' && displaySecondMail)
					     || (property=='NickName'    && displayNickName)
					     || property.match(displayAlways)
					   ))
						this.displayCardField(card1, card2, defaultValue, leftValue, rightValue, property, row);
				}
			}
			this.setContactLeftRight(preference < 0 ? 'right' : 'left'); // if preference >= 0, prefer to delete c2
		},

		SetRelation: function(card1, card2, property) {
			const defaultValue_Set = new Set(); /* should not really be needed here */
			const value1 = card1.getProperty(property, defaultValue_Set);
			const value2 = card2.getProperty(property, defaultValue_Set);
			// value1 and value2 are essentially result of getAbstractedTransformedProperty()
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
			// this.debug("SetRelation("property+"): "+value1.toString()+" "+equ+" "+value2.toString());
			return [both_empty, equ];
		},

		/**
		 * Creates table row for one address book field (not used for matchable fields, e.g., '__Names')
		 * for side-by-side comparison and editing. Editable fields will be listed in this.editableFields.
		 * The defaultValue, leftValue, and rightValue are expected as non-abstracted/transformed strings (also for set values).
		 */
		displayCardField: function(card1, card2, defaultValue, leftValue, rightValue, property, row) {
			this.displayedFields.push(property);
			var editable = property != 'PhotoURI' && !this.isSet(property) && property != 'LastModifiedDate';
			if (editable) {
				// save field in list for later retrieval if edited values
				pushIfNew(property, this.editableFields);
			}

			const cell1 = document.createElement('hbox');
			const cell2 = document.createElement('hbox');
			const cellEqu = document.createElement('hbox');
			const descEqu = document.createElement('description');
			cellEqu.className = 'equivalence';
			cellEqu.appendChild(descEqu);

			// highlight values that differ; show equality or equivalence
			var identical = true;
			let equ = '≡'; // default value indicates identical values
			var both_empty = 0;
			if (this.isSet(property)) { /* used for '__MailListNames' */
				[both_empty, equ] = this.SetRelation(card1, card2, property);
				identical = equ == '≅';
			} else {
				identical = leftValue == rightValue;
				both_empty = leftValue == defaultValue && rightValue == defaultValue;
				if        (this.isEmail(property)) {
					[both_empty, equ] = this.SetRelation(card1, card2, '__Emails');
				} else if (this.isPhoneNumber(property)) {
					[both_empty, equ] = this.SetRelation(card1, card2, '__PhoneNumbers');
				} else if (!identical) {
					const value1 = this.getAbstractedTransformedProperty(card1, property);
					const value2 = this.getAbstractedTransformedProperty(card2, property);
					if      (value1 == value2)
						equ = '≅'; // equivalent; &cong; yields syntax error; &#8773; verbatim
					else if (value1 == defaultValue)
						equ = '⋦';
					else if (value2 == defaultValue)
						equ = '⋧';
					else if (this.isText(property)) {
						if      (value2.includes(value1))
							equ = '<';
						else if (value1.includes(value2)) // value2 is substring of value1
							equ = '>';
						else
							equ = ''; // incomparable
					}
					else if (this.isNumerical(property)) {
						const comparison = card1.getProperty(property, 0) - card2.getProperty(property, 0);
						if      (comparison < 0)
							equ = '<';
						else if (comparison > 0)
							equ = '>';
						else
							equ = '≡'; // this case (leftValue == rightValue) is already covered above
					}
					else
						equ = '';
				}
			}
			// only non-identical and not set-equal properties should be highlighted by color
			if (!identical) {
				cell1.setAttribute('class', this.sideKept == 'left' ? 'keep' : 'remove');
				cell2.setAttribute('class', this.sideKept == 'left' ? 'remove' : 'keep');
			}
			if (both_empty)
				equ = '';
			if (equ != '' &&
			    (property == 'SecondEmail' || /* all but first email address/phone number */
			     property != 'CellularNumber' && this.isPhoneNumber(property)))
				equ = '⋮'; // sets displayed over multiple lines lead to multiple lines with same symbol
			descEqu.setAttribute('value', equ);

			// create input/display fields, depending on field type
			let cell1valuebox;
			let cell2valuebox;

			if (property == 'PhotoURI') {
				descEqu.style.marginTop = '1em'; // move a bit lower
				cell1valuebox = document.createElement('image');
				cell2valuebox = document.createElement('image');
			} else if (this.isSelection(property)) {
				var labels;
				if (property == 'PreferMailFormat') {
					labels = [this.getString('unknown_label'),
						  this.getString('plaintext_label'),
						  this.getString('html_label')];
				}
				else {
					labels = [this.getString('false_label'),
						  this.getString('true_label')];
				}
				var values = [0, 1, 2];
				cell1valuebox = this.createSelectionList(null, labels, values,  leftValue);
				cell2valuebox = this.createSelectionList(null, labels, values, rightValue);
			}
			else {
				function make_valuebox(value) {
					const valuebox = editable ? document.createElement('textbox') :
					                 property == '__MailListNames' ? document.createElement('description')
					                                               : document.createElement('label');
					valuebox.className = 'textbox';
					if (property == '__MailListNames') {
						valuebox.textContent = value;
					}
					else
						valuebox.setAttribute('value',  value);
					if (property == 'Notes') {
						valuebox.setAttribute('multiline', 'true'); // multiline ignored by Thunderbird 68+; could use <textarea> instead
					}
					return valuebox;
				}
				cell1valuebox = make_valuebox( leftValue);
				cell2valuebox = make_valuebox(rightValue);
			}

			cell1valuebox.setAttribute('flex', '2');
			cell2valuebox.setAttribute('flex', '2');
			cell1valuebox.setAttribute('id',  'left_'+property);
			cell2valuebox.setAttribute('id', 'right_'+property);

			// add valueboxes to cells
			cell1.appendChild(cell1valuebox);
			cell1.setAttribute('id', 'cell_left_' +property);
			cell2.appendChild(cell2valuebox);
			cell2.setAttribute('id', 'cell_right_'+property);

			// add remaining cells to row
			row.appendChild(cell1);
			row.appendChild(cellEqu);
			row.appendChild(cell2);

			// add row to table
			this.attributesTableRows.appendChild(row);
			if (property == 'PhotoURI') {
				cell1valuebox.height = 100;
				cell2valuebox.height = 100;
				// preserve aspect ratio:
				cell1valuebox.setAttribute('flex', "");
				cell2valuebox.setAttribute('flex', "");
				// would be ignored if done before appendChild(row):
				cell1valuebox.src=card1.getProperty('PhotoURI', "");
				cell2valuebox.src=card2.getProperty('PhotoURI', "");
				/* actual image will be loaded asynchronously */
			}
		},

		/**
		 * Check if all email addresses and matchable phone numbers in a card are empty
		 */
		noMailsPhonesMatch: function(vcard) {
			// strings are already abstracted, e.g., normalized to lowercase
			// numbers are already abstracted, e.g., non-digits are stripped
			return vcard['PrimaryEmail'] == "" && vcard['SecondEmail'] == "" &&
			       vcard['Phone1'] == "" && vcard['Phone2'] == "" && vcard['Phone3'] == "";
		},

		/**
		 * Check if all matchable fields in a card are empty
		 */
		noNamesMatch: function(vcard) {
			// strings are already abstracted, e.g., normalized to lowercase
			// numbers are already abstracted, e.g., non-digits are stripped
			return vcard[  'FirstName'] == "" && vcard['LastName'] == "" &&
			       vcard['DisplayName'] == "" && vcard['_AimScreenName'] == "";
		},

		/**
		 * Check for non-empty intersection of matchable phone numbers in two cards
		 */
		phonesMatch: function(vcard1, vcard2) {
			// numbers are already abstracted, e.g., non-digits are stripped
			var [a1, a2, a3] = [vcard1['Phone1'], vcard1['Phone2'], vcard1['Phone3']];
			var [b1, b2, b3] = [vcard2['Phone1'], vcard2['Phone2'], vcard2['Phone3']];
			return ((a1 != "" && (a1 == b1 || a1 == b2 || a1 == b3)) ||
			        (a2 != "" && (a2 == b1 || a2 == b2 || a2 == b3)) ||
			        (a3 != "" && (a3 == b1 || a3 == b2 || a3 == b3)) );
		},

		/**
		 * Check for non-empty intersection of the sets of email addresses in the cards
		 */
		mailsMatch: function(vcard1, vcard2) {
			// strings are already abstracted, e.g., normalized to lowercase
			var [a1, a2] = [vcard1['PrimaryEmail'], vcard1['SecondEmail']];
			var [b1, b2] = [vcard2['PrimaryEmail'], vcard2['SecondEmail']];
			return ((a1 != "" && (a1 == b1 || a1 == b2)) ||
			        (a2 != "" && (a2 == b1 || a2 == b2)) );
		},

		/**
		 * Complete FirstName, LastName, and DisplayName if needed (and easily possible)
		 * from each other, else from PrimaryEmail or SecondEmail of card
		 */
		completeFirstLastDisplayName: function([fn, ln, dn], card) {
			if (dn == "" && fn != "" && ln != "")
				dn = fn+" "+ln;
			else if (fn == "" || ln == "" || dn == "") {
				function getFirstLastFromEmail(email) {
					var p = email.match(/^\s*([A-Za-z0-9\x80-\uFFFF]+)[\.\-_]+([A-Za-z0-9\x80-\uFFFF]+)@/);
					if (p && p[1] == "no" /* && p[2] == "reply"*/)
						p = undefined;
					if (!p) // second attempt works because email has not been converted to lower-case:
						p = email.match(/^\s*([A-Z][a-z0-9_\x80-\uFFFF]*)([A-Z][a-z0-9_\x80-\uFFFF]*)@/);
					return p;
				}
				var p = dn.match(/^\s*([A-Za-z0-9_\x80-\uFFFF]+)\s+([A-Za-z0-9_\x80-\uFFFF]+)\s*$/);
				if(!p)
					p = getFirstLastFromEmail(this.getPrunedProperty(card,'PrimaryEmail'));
				if(!p)
					p = getFirstLastFromEmail(this.getPrunedProperty(card, 'SecondEmail'));
				if (p) {
					if (fn == "")
						fn = this.abstract(p[1].replace(/[0-9]/g, ''),'FirstName'); // strip digits, then abstract
					if (ln == "")
						ln = this.abstract(p[2].replace(/[0-9]/g, ''), 'LastName'); // strip digits, then abstract
					if (dn == "")
						dn = fn+" "+ln;
				}
			}
			return [fn, ln, dn];
		},

		/**
		 * Compares the names in two cards and returns true if they seem to match.
		 */
		namesMatch: function(vcard1, vcard2) {
			// vcards  are already abstracted and with names completed
			// strings are already abstracted, e.g., normalized to lowercase
			function subEq(name1, name2) { /* Check if one name is equal to or non-empty substring (with ' ' border) of other name  */
				function subEq1(name1, name2) { /* Check if name2 is non-empty substring (with ' ' border) of name1 */
					return name2 != "" && name2.length + 2 <= name1.length && (
					       name1.startsWith(name2+" ") ||
					       name1.includes(" "+name2+" ") ||
					       name1.endsWith(" "+name2));
				}
				return (name1 == name2) /* includes both empty */ ||
				       subEq1(name1, name2) || subEq1(name2, name1);
			}
			const f1 = vcard1[  'FirstName'], l1 = vcard1[      'LastName'];
			const f2 = vcard2[  'FirstName'], l2 = vcard2[      'LastName'];
			const d1 = vcard1['DisplayName'], a1 = vcard1['_AimScreenName'];
			const d2 = vcard2['DisplayName'], a2=  vcard2['_AimScreenName'];
			// this.debug("namesMatch: "+f1+"#"+l1+"#"+d1+ " vs. " +f2+"#"+l2+"#"+d2);
			return ( a1 != "" &&               subEq(a1,a2)                 ) || // _AimScreenNames exist and match
			       ( d1 != "" &&d1.match(/ /)==d2.match(/ /)&& subEq(d1,d2) ) || // both DisplayNames consist of one word or more than one word and match
			       ( f1 != "" && l1 != ""  &&  subEq(f1,f2) && subEq(l1,l2) ) || // FirstNames and LastNames exist and match
			       ( d1 == "" && d2 == "" &&
			        (f1 != "" || l1 != "") &&  subEq(f1,f2) && subEq(l1,l2) ) || // no DisplayNames, but FirstNames and LastNames match
			       ( d1 == "" && d2 != "" &&
			        (f1 == "")!=(l1 == "") && (subEq(f1,d2) || subEq(l1,d2))) || // only First/Last exists and matches other DisplayName
			       ( d2 == "" && d1 != "" &&
			        (f2 == "")!=(l2 == "") && (subEq(f2,d1) || subEq(l2,d1)));   // only First/Last exists and matches other DisplayName
		},

		readAddressBooks: function() {
			if (!this.abDir1.isMailList) {
				this.vcards[this.BOOK_1] = this.getAllAbCards(this.abDir1);
				this.vcardsSimplified[this.BOOK_1] = new Array();
				this.totalCardsBefore = this.vcards[this.BOOK_1].length;
			}
			if (this.abDir2 != this.abDir1 && !this.abDir2.isMailList) {
				// we compare two (different) address books
				this.vcards[this.BOOK_2] = this.getAllAbCards(this.abDir2);
				this.vcardsSimplified[this.BOOK_2] = new Array();
				this.totalCardsBefore += this.vcards[this.BOOK_2].length;
			}
			else {
				// we operate on a single address book
				this.vcards[this.BOOK_2] =  this.vcards[this.BOOK_1];
				this.vcardsSimplified[this.BOOK_2] = this.vcardsSimplified[this.BOOK_1];
			}

		},

		/**
		 * Marks the side specified by the parameter 'left' or 'right' as to be kept.
		 * If no parameter is given (or the side parameter is null) the selection is toggled.
		 */
		setContactLeftRight: function(side) {
			if (!side)
				side = keepLeftRadioButton.getAttribute('selected') == 'true' ? 'right' : 'left';
			if (side != this.sideKept) {
				this.sideKept = side;
				const other = side == 'right' ? 'left' : 'right';
				const to_be_kept    = this.getString('to_be_kept');
				const to_be_removed = this.getString('to_be_removed');
				this.keepLeftRadioButton .label = side == 'right' ? to_be_removed : to_be_kept;
				this.keepRightRadioButton.label = side == 'right' ? to_be_kept : to_be_removed;
				this.keepLeftRadioButton .setAttribute('selected', side == 'right' ? 'false' : 'true');
				this.keepRightRadioButton.setAttribute('selected', side == 'right' ? 'true' : 'false');
				document.getElementById('headerLeft' ).className = side == 'right' ? 'remove' : 'keep';
				document.getElementById('headerRight').className = side == 'right' ? 'keep': 'remove';
				for(let index = 0; index < this.displayedFields.length; index++) {
					var cell1 = document.getElementById('cell_' + side  + '_' + this.displayedFields[index]);
					var cell2 = document.getElementById('cell_' + other + '_' + this.displayedFields[index]);
					if (cell1.className == 'remove')
						  cell1.className = 'keep';
					if (cell2.className == 'keep')
						  cell2.className = 'remove';
				}
			}
		},

		/**
		 * Removes all rows (excluding header) from the attribute comparison & edit table.
		 */
		purgeAttributesTable: function() {
			this.make_invisible('tableheader');
			while(this.attributesTableRows.firstChild.nextSibling) {
				this.attributesTableRows.removeChild(this.attributesTableRows.firstChild.nextSibling);
			}
			this.displayedFields = null;
			this.editableFields = null;
		},

		/**
		 * Returns a table with all editable fields.
		 * The parameter ('left' or 'right') specifies the column
		 * of the table to be used.
		 */
		getCardFieldValues: function(side) {
			var result = new Object();
			for(let index = 0; index < this.editableFields.length; index++) {
				// valuebox id is like this: 'left_FieldName'
				const id = side + '_' + this.editableFields[index];
				const valuebox = document.getElementById(id);
				const value = valuebox.selectedItem ? valuebox.selectedItem.value : valuebox.value;
				result[this.editableFields[index]] = value;
			}
			return result;
		},

		propertySet: function(card, properties) {
			var result = new Set();
			for(let property of properties) { /* property is assumed not itself a set */
				const defaultValue = this.defaultValue(property);
				const value = this.getAbstractedTransformedProperty(card, property);
				if (value != defaultValue)
					result.add(value);
			}
			return result;
		},

		/**
		 * Returns all cards from a directory in an array.
		 */
		getAllAbCards: function(directory) {
			// Returns arrays with all vCards and mailing lists within given address book directory
			var abCards = new Array;
			let mailLists = new Array;
			const abCardsEnumerator = directory.QueryInterface(Components.interfaces.nsIAbDirectory).childCards;
			if (abCardsEnumerator) {
				try {
					while (abCardsEnumerator.hasMoreElements()) {
						const abCard = abCardsEnumerator.getNext();
						if (abCard != null && abCard instanceof Components.interfaces.nsIAbCard) {
							if (abCard.isMailList) {
								const addressList = this.abManager.getDirectory(abCard.mailListURI).addressLists;
								var primaryEmails = new Array;
								for(let i = 0; i < addressList.length; i++)
									primaryEmails.push(addressList.queryElementAt(i,
									                    Components.interfaces.nsIAbCard).primaryEmail);
								mailLists.push([abCard.displayName, primaryEmails]);
							}
							else
								abCards.push(abCard);
						}
					}
				}
				catch (ex) {
					// Return empty array
				}
			}
			for(let i = 0; i < abCards.length; i++) {
				const abCard = abCards[i];

				// calculate nonemptyFields and charWeight
				var nonemptyFields = 0;
				var charWeight = 0;
				for(let index = 0; index < this.consideredFields.length; index++) {
					const property = this.consideredFields[index];
					if (this.isNumerical(property))
						continue; /* ignore PopularityIndex, LastModifiedDate and other integers */
					const defaultValue = this.defaultValue(property);
					const value = abCard.getProperty(property, defaultValue);
					if (value != defaultValue)
						nonemptyFields += 1;
					if (this.isText(property) || this.isEmail(property) || this.isPhoneNumber(property)) {
						/* const tranformed_value = this.getTransformedProperty(c1, property); */
						charWeight += this.charWeight(value, property);
					}
				}
				abCard.setProperty('__NonEmptyFields', nonemptyFields);
				abCard.setProperty('__CharWeight'    , charWeight);

				// record all mailing lists that the card belongs to
				var mailListNames = new Set();
				const email = abCard.primaryEmail; // only this email address is relevant
				if (email)
					mailLists.forEach(function ([displayName, primaryEmails]) {
						if (primaryEmails.includes(email))
							mailListNames.add(displayName);
					})
				abCard.setProperty('__MailListNames', mailListNames);

				// set further virtual properties
				// treat email addresses as a set
				abCard.setProperty('__Emails', this.propertySet(abCard, ['PrimaryEmail', 'SecondEmail']));
				// treat phone numbers as a set
				abCard.setProperty('__PhoneNumbers', this.propertySet(abCard, ['HomePhone', 'WorkPhone',
				                              'FaxNumber', 'PagerNumber', 'CellularNumber']));
			}
			return abCards;
		},

		propertyUnion: function(c1, c2) {
			var union = new Array();
			for(let i = 0; i < 2; i++) {
				var it = i == 0 ? c1.properties : c2.properties;
				while (it.hasMoreElements()) {
					const property = it.getNext().QueryInterface(Components.interfaces.nsIProperty).name;
					pushIfNew(property, union);
				}
			}
			return union;
		},

/*
		readFile: function(url, async, binary) {
			if (url) {
				const req = new XMLHttpRequest();
				req.op en('GET', url, async);  // async == `false` makes the request synchronous
				if (binary)
					req.overrideMimeType('text/plain; charset=x-user-defined')
				try {
					req.send(null);
				} catch(e) {
					return null;
				}
				var responseText = req.status == 200 ? req.responseText : null;
				if (binary && responseText) {
					const responseTextLen = responseText.length;
					let data = '';
					for(let i = 0; i < responseTextLen; i+=1)
						data += String.fromCharCode(responseText.charCodeAt(i) & 0xff)
					responseText = data;
				}
				return responseText;
			}
			return null;
		},
*/

		/**
		 * @param	Array		Address book card 1
		 * @param	Array		Address book card 2
		 * @return [comparison, preference] where
		 *          comparison = 1 if second card has less information
		 *          comparison = 0 if cards are equivalent
		 *          comparison =-1 if first card has less information
		 *          comparison =-2 if cards are incomparable
		 *          preference > 0 if first card has more information
		 *                            or else has more non-empty fields
		 *                            or else has higher char weight
		 *                            or else has higher PopularityIndex
		 *                            or else has higher LastModifiedDate (if present in both)
		 *                            than second one
		 *          preference < 0 if second card ... than first one
		 *          preference = 0 otherwise (that is, cards are equivalent or incomparable
		 *                                    with same number of non-empty fields, char weight,
		 *                                    PopularityIndex, and LastModifiedDate)
		 */
		abCardsCompare: function(c1, c2) {
			var nDiffs = 0; // unused
			var c1_less_complete = true;
			var c2_less_complete = true;
			var props = this.propertyUnion(c1, c2);
			for(let i = 0; i < props.length; i++) {
				var property = props[i];
				if (!this.consideredFields.includes(property) || /* do not compare ignored fields */
				    this.isNumerical(property) || /* ignore PopularityIndex, LastModifiedDate and other integers */
				    this.metaProperties.includes(property) || /* ignore meta properties */
				    this.isEmail(property) || this.isPhoneNumber(property)) // virtual set property is compared instead
					continue;
				const defaultValue = this.isSet(property) ? new Set() : this.defaultValue(property);
				let value1, value2;
				if (this.isSet(property)) {
					value1 = c1.getProperty(property, defaultValue);
					value2 = c2.getProperty(property, defaultValue);
				} else {
					value1 = this.getAbstractedTransformedProperty(c1, property);
					value2 = this.getAbstractedTransformedProperty(c2, property);
				}
				if (value1 != value2) { // values not equivalent
					var diffProp = property == '__MailListNames' ? "(MailingListMembership)" :
					               property == '__Emails' ? "{PrimaryEmail,SecondEmail}" :
					               property == '__PhoneNumbers' ? "{CellularNumber,HomePhone,WorkPhone,FaxNumber,PagerNumber}" :
					               property;
					pushIfNew(diffProp, this.nonequivalentProperties);
					nDiffs++; // unused

					// this.debug("abCardsCompare: "+property+" = "+value1+" vs. "+value2);
					if (!c1_less_complete && !c2_less_complete)
						continue; // already clear that cards are incomparable

					// TODO combine these comparisons with those in displayCardField
					if (this.isText(property)) {
						if (!value2.includes(value1)) // value1 is substring of value2
							c1_less_complete = false;
						if (!value1.includes(value2)) // value2 is substring of value1
							c2_less_complete = false;
					} else if (this.isSet(property)) { /* used for __MailListNames */
						// this.debug("abCardsCompare: "+property+": "+value1.toString()+" vs. "+value2.toString()+": "+value1.isSuperset(value2)+" "+value2.isSuperset(value1));
						if (!value2.isSuperset(value1))
							c1_less_complete = false;
						if (!value1.isSuperset(value2))
							c2_less_complete = false;
					} else {
						if (value1 != defaultValue)
							c1_less_complete = false;
						if (value2 != defaultValue)
							c2_less_complete = false;
					}
				}
			}
			/*
			const debug_msg = "abCardsCompare: "+
			      "less_complete = " +c1_less_complete                     +" vs. "+c2_less_complete+
                            ", nonemptyFields = "+c1.getProperty('__NonEmptyFields', 0)+" vs. "+c2.getProperty('__NonEmptyFields', 0)+
			    ", charWeight = "    +c1.getProperty('__CharWeight', 0)    +" vs. "+c2.getProperty('__CharWeight', 0);
			this.debug(debug_msg);
			*/
			if (c1_less_complete != c2_less_complete) {
				comparison = preference = c1_less_complete ? -1 : 1;
			} else {
				comparison = c1_less_complete ? 0/* equivalent */ : -2/* incomparable */;
				/*
				 * in case of equivalence and also if incomparable
				 * determine some preference for deletion for one card of matching pairs,
				 * using those non-ignored properties satisfying this.isNumerical()
				 */
				var preference = c1.getProperty('__NonEmptyFields', 0) -
				                 c2.getProperty('__NonEmptyFields', 0);
				if (preference == 0)
					preference = c1.getProperty('__CharWeight', 0) -
					             c2.getProperty('__CharWeight', 0);
				if (preference == 0)
					preference = c1.getProperty('PopularityIndex' , 0) -
					             c2.getProperty('PopularityIndex' , 0);
				if (preference == 0) {
					const date1 = c1.getProperty('LastModifiedDate', 0);
					const date2 = c2.getProperty('LastModifiedDate', 0);
					if (date1 != 0 && date2 != 0)
						preference = date1 - date2;
				}
			}
			// this.debug("abCardsCompare: comparison = "+comparison+" preference = "+preference+" for "+this.getProperty(c1, 'DisplayName')+" vs. "+this.getProperty(c2, 'DisplayName'));
			return [comparison, preference];
		},

		enable: function(id) {
			const elem = document.getElementById(id);
			elem.setAttribute('disabled', 'false');
			elem.className = '';
		},
		disable: function(id) {
			const elem = document.getElementById(id);
			elem.setAttribute('disabled', 'true');
			elem.className = 'disabled';
		},

		show: function(id) {
			document.getElementById(id).style.display=''; /* remove display property, restoring default */
		},
		show_hack: function(id) {
			document.getElementById(id).style.display='-moz-inline-stack'; /* enables scroll bar and stretches horizonally */
		},
		hide: function(id) {
			document.getElementById(id).style.display='none';
		},

		make_visible: function(id) {
			document.getElementById(id).style.visibility='visible';
		},
		make_invisible: function(id) {
			document.getElementById(id).style.visibility='hidden';
		},

		pruneText: function(text, property) { // this does not remove any real information and keeps letter case
			if (this.isText(property)) {
				text = text
				// remove multiple white space
					.replace(/[\s]{2,}/g, ' ')
				// remove leading and trailing whitespace
					.replace(/^\s+/, "")
					.replace(/\s+$/, "");
			}
			if (this.isPhoneNumber(property)) {
				text = text.replace(/[^+0-9]/g, ''); // strip non-digits
				text = text.replace(/^\+/g, 'X').replace(/\+/g, '').replace(/^X/g, '+'); // strip irrelevant '+'
			}
			return text;
		},

		getPrunedProperty: function(card, property) { /* sets are treated as strings here */
			// filter out ignored fields
			const defaultValue = this.defaultValue(property);
			if (this.ignoredFields.includes(property))
				return defaultValue; // do not use these for comparison
			var value = this.pruneText(this.getProperty(card, property), property);

			// Strip any stray email address duplicates from names, which get inserted by some email clients as default names:
			if (this.isFirstLastDisplayName(property))
				if (value == this.getPrunedProperty(card, 'PrimaryEmail') ||
				    value == this.getPrunedProperty(card,  'SecondEmail'))
					return defaultValue;
			if (this.isEmail(property))
				value = value.replace(/@googlemail.com$/i, "@gmail.com");
			// if (value.match(/^UID=[A-Fa-f0-9\-]{36}$/)) { return defaultValue; }
			return value;
		},

		abstract: function(text, property) { // this converts from uppercase and loses some information
			// third step: normalization
			var p;
			if (property == 'PhotoURI')
				return text;
			if (property.match(/Email$/) && ((p = text.match(/(^[^@]*)(@aol\..*$)/i)))) {
				text = p[1]+p[2].toLowerCase(); // for AOL, email part before '@' is case-sensitive!
			} else
				text = text.toLowerCase();
			if (this.isText(property))
			  // transcribe umlauts and ligatures
				text = text.replace(/[ÄÆäæǼǽ]/g, 'ae')
					   .replace(/[ÖöŒœ]/g, 'oe')
					   .replace(/[Üü]/g, 'ue')
					   .replace(/[ß]/g, 'ss')
					   .replace(/[Ĳĳ]/g, 'ij');

			// fourth step: simplification
			if (this.isText(property))
				text = this.simplifyText(text);
			if (this.isPhoneNumber(property)) {
				if (this.natTrunkPrefix != "" && this.countryCallingCode != "" && text.match(this.natTrunkPrefixReqExp))
					text = this.countryCallingCode+text.substr(this.natTrunkPrefix.length);
				if (this.intCallPrefix != "" && text.match(this.intCallPrefixReqExp))
					text = '+'+text.substr(this.intCallPrefix.length);
				/* if (text.match(/^0([1-9])/)) text = text.substr(1); // strip national prefix
				strip country codes according to https://en.wikipedia.org/wiki/List_of_country_calling_codes
				text = text.replace(/^\+1/, '');
				text = text.replace(/^\+2../, '');
				text = text.replace(/^\+3[0-469]/, '').replace(/^\+3../, '');
				text = text.replace(/^\+4[0135-9]/, '').replace(/^\+4../, '');
				text = text.replace(/^\+5[1-8]/, '').replace(/^\+5../, '');
				text = text.replace(/^\+6[0-6]/, '').replace(/^\+6../, '');
				text = text.replace(/^\+7[346-9]/, '').replace(/^\+7/, '');
				text = text.replace(/^\+8[1-469]/, '').replace(/^\+8../, '');
				text = text.replace(/^\+9[0-58]/, '').replace(/^\+9../, ''); */
			}
			return text;
		},

		/**
		 * simplifyText
		 *
		 * Strips some characters from a text so that different spellings (e.g. with and
		 * without accents, can be compared. Works case insensitive.
		 *
		 * @param	text		the string to be abstracted
		 * @return	String		simplified version of the string
		 */
		simplifyText : function(text) {

			return text
			// remove punctuation
			  .replace(/[\"\'\-_:,;\.\!\?\&\+]+/g, '')

			// replace funny letters
			  .replace(/[ÂÁÀÃÅâáàãåĀāĂăĄąǺǻ]/g, 'a')
			  .replace(/[ÊÉÈËèéêëĒēĔĕĖėĘęĚě]/g, 'e')
			  .replace(/[ÌÍÎÏìíîïĨĩĪīĬĭĮįİı]/g, 'i')
			  .replace(/[ÕØÒÓÔòóôõøŌōŎŏŐőǾǿ]/g, 'o')
			  .replace(/[ÙÚÛùúûŨũŪūŬŭŮůŰűŲųơƯư]/g, 'u')
			  .replace(/[ÝýÿŶŷŸ]/g, 'y')

			  .replace(/[ÇçĆćĈĉĊċČč]/g, 'c')
			  .replace(/[ÐðĎĐđ]/g, 'd')
			  .replace(/[ĜĝĞğĠġĢģ]/g, 'g')
			  .replace(/[ĤĥĦħ]/g, 'h')
			  .replace(/[Ĵĵ]/g, 'j')
			  .replace(/[Ķķĸ]/g, 'k')
			  .replace(/[ĹĺĻļĿŀŁł]/g, 'l')
			  .replace(/[ÑñŃńŅņŇňŉŊŋ]/g, 'n')
			  .replace(/[ŔŕŖŗŘř]/g, 'r')
			  .replace(/[ŚśŜŝŞşŠš]/g, 's')
			  .replace(/[ŢţŤťŦŧ]/g, 't')
			  .replace(/[Ŵŵ]/g, 'w')
			  .replace(/[ŹźŻżŽž]/g, 'z')

			/* would be too aggressive: // remove singleton digits and letters (like initials)
			  .replace(/ [A-Za-z0-9] /g, ' ') // does not work recursively, just non-overlapping
			  .replace(/ [A-Za-z0-9] /g, ' ') // needed if there are two consecutive initials!
			  .replace(/^[A-Za-z0-9] /g, '')
			  .replace(/ [A-Za-z0-9]$/g, '') */

			// remove any (newly produced) leading or trailing whitespace
			  .replace(/^\s+/, "")
			  .replace(/\s+$/, "");
		},

		createSelectionList: function(cls, labels, values, selected) {
			var menulist = document.createElement('menulist');
			if (cls != null)
				menulist.setAttribute('class', cls);
			var menupopup = document.createElement('menupopup');
			if (cls != null)
				menupopup.setAttribute('class', cls);
			for(let index = 0; index < labels.length; index++) {
				var menuitem = document.createElement('menuitem');
				menuitem.setAttribute('crop', 'end');
				if (cls != null)
					menuitem.setAttribute('class', cls);
				menuitem.setAttribute('label', labels[index]);
				menuitem.setAttribute('value', values[index]);
				if (values[index] == selected) {
					menuitem.setAttribute('selected' ,'true');
					menupopup.selectedItem = menuitem;
				}
				menupopup.appendChild(menuitem);
			}
			menulist.appendChild(menupopup);
			return menulist;
		},
	}
}
