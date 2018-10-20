// -*- mode: js; indent-tabs-mode: t; js-indent-level: 8 -*-
// file: duplicateEntriesWindow.js

// This file includes UTF-8 encoding. Please make sure your text editor can deal with this prior to saving any changes!

/* Change history:
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

function pushIfNew(elem, array) { /* well, this 'function' has a side effect on array */
	if (!array.includes(elem))
		array.push(elem);
	return array;
}
/*
Array.prototype.pushIfNew = function(elem) {
	if (!this.includes(elem))
		this.push(elem);
	return this;
would be an elegant extension of a built-in JS type. Yet in TB this not allowed for security and compatibility reasons.
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

		currentSearchPosition1: 0,
		currentSearchPosition2: 0,
		deferInteractive: true,
		nowHandling: false,
		duplicates: null,

		table: null,
		displayedFields: null,
		editableFields: null,

		sideUsed: 'left',
		columnUseLeftRadioButton: null,
		columnUseRightRadioButton: null,

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
		addressBookFields: new Array(
			"PhotoURI", "PhotoType", "PhotoName",
			"NickName", "Names"/* label */, "FirstName", "PhoneticFirstName", "LastName", "PhoneticLastName",
			"SpouseName", "FamilyName", "DisplayName", "_PhoneticName", "PreferDisplayName",
			"_AimScreenName", "_GoogleTalk", "CardType", "Category", "AllowRemoteContent",
			"PreferMailFormat", "MailListNames"/* virtual */,
			"Emails"/* label */, "PrimaryEmail", /* "LowercasePrimaryEmail", */
			"SecondEmail", /* "LowercaseSecondEmail", */"DefaultEmail",
			"PhoneNumbers"/* label */, "CellularNumber", "CellularNumberType", "HomePhone", "HomePhoneType",
			"WorkPhone", "WorkPhoneType", "FaxNumber", "FaxNumberType", "PagerNumber", "PagerNumberType",
			"DefaultAddress",
			"HomeAddress", "HomeAddress2", "HomeCity", "HomeState",	"HomeZipCode", "HomeCountry",
			"WorkAddress", "WorkAddress2", "WorkCity", "WorkState", "WorkZipCode", "WorkCountry",
			"JobTitle", "Department", "Company",
			// "AnniversaryYear", "AnniversaryMonth", "AnniversaryDay",
			"BirthYear", "BirthMonth", "BirthDay",
			"WebPage1", "WebPage2",
			"Custom1", "Custom2", "Custom3", "Custom4", "Notes",
			"PopularityIndex", "LastModifiedDate",
			"UID", "UUID", "CardUID",
			"groupDavKey", "groupDavVersion", "groupDavVersionPrev",
			"RecordKey", "DbRowID",
			"unprocessed:rev", "unprocessed:x-ablabel"),
		labelsList : new Array("Names", "Emails", "PhoneNumbers"),
		ignoreFieldsDefault : new Array("PhotoType", "PhotoName",
						/* "LowercasePrimaryEmail", "LowercaseSecondEmail", */
						"UID", "UUID", "CardUID",
						"groupDavKey", "groupDavVersion", "groupDavVersionPrev",
						"RecordKey", "DbRowID", 
						"unprocessed:rev", "unprocessed:x-ablabel"),
		ignoreList : [], // will be derived from ignoreFieldsDefault
		natTrunkPrefix : "", // national phone number prefix
		natTrunkPrefixReqExp : /^0([1-9])/, // typical RegExp for national phone number prefix
		countryCallingCode : "", // international phone number prefix

		consideredFields: function() {
			return this.addressBookFields.concat(this.ignoreFieldsDefault).
				filter(x => !this.labelsList.includes(x)).
				filter(x => !this.ignoreList.includes(x)).join(", ");
		},

		debug: function(str) {
			console.log(str);
		},

		isText: function(property) {
			return property.match(/(Name|GoogleTalk|Address[2]?|City|State|Country|Title|Department|Company|Custom[1-4]Notes)$/);
		},

		isFirstLastDisplayName: function(property) {
			return property.match(/^(FirstName|LastName|DisplayName)$/);
		},

		isMailAddress: function(property) {
			return property.match(/^(PrimaryEmail|SecondEmail|MailListNames)$/);
		},

		isPhoneNumber: function(property) {
			return property.match(/^(WorkPhone|HomePhone|FaxNumber|PagerNumber|CellularNumber)$/);
		},

		isSelection: function(property) {
			return property.match(/^(PreferMailFormat|PreferDisplayName|AllowRemoteContent)$/);
		},

		isInteger: function(property) {
			return property.match(/^(PopularityIndex|LastModifiedDate|RecordKey|DbRowID)$/);
		},

		defaultValue: function(property) {
			if (this.isSelection(property) || this.isInteger(property))
				return (/* property == 'PreferDisplayName' ? "1" : */ "0");
			else
				return "";
		},

		/**
		 * Will be called by duplicateEntriesWindow.xul once
		 * the according window is loaded
		 */
		init: function() {
			do {
				var Prefs = Components.classes["@mozilla.org/preferences-service;1"]
					.getService(Components.interfaces.nsIPrefService);
				var prefBranchPrefixId = "extensions.DuplicateContactsManager.";
				this.prefsBranch = Prefs.getBranch(prefBranchPrefixId);
				if (!this.prefsBranch)
					break;
				try { this.autoremoveDups = this.prefsBranch.getBoolPref("autoremoveDups"); } catch(e) {}
				try { this.preserveFirst = this.prefsBranch.getBoolPref("preserveFirst"); } catch(e) {}
				try { this.deferInteractive = this.prefsBranch.getBoolPref("deferInteractive"); } catch(e) {}

				try { this.natTrunkPrefix  = this.prefsBranch.getCharPref("natTrunkPrefix");
				      this.natTrunkPrefixReqExp = new RegExp("^"+this.natTrunkPrefix+"([1-9])"); } catch(e) {}
				try { this.countryCallingCode = this.prefsBranch.getCharPref("countryCallingCode"); } catch(e) {}
				try { var prefStringValue = this.prefsBranch.getCharPref("ignoreFields");
				      this.ignoreList = prefStringValue != "" ?
				                        prefStringValue.split(/\s*,\s*/) : ignoreFieldsDefault;
					} catch(e) {}
			} while (0);
			document.getElementById("autoremove").checked = this.autoremoveDups;
			document.getElementById("preservefirst").checked = this.preserveFirst;
			document.getElementById("deferInteractive").checked = this.deferInteractive;
			document.getElementById("natTrunkPrefix").value = this.natTrunkPrefix;
			document.getElementById("countryCallingCode").value = this.countryCallingCode;
			document.getElementById("considerFields").textContent = this.consideredFields();
			document.getElementById("ignoreFields").value = this.ignoreList.join(", ");

			this.stringBundle = document.getElementById("bundle_duplicateContactsManager");
			this.running = true;
			this.statustext = document.getElementById('statusText_label');
			this.progresstext = document.getElementById('progressText');
			this.progressmeter = document.getElementById('progressMeter');
			this.window = document.getElementById('handleDuplicates-window');
			this.attributesTableRows = document.getElementById('AttributesTableRows');
			this.columnUseLeftRadioButton = document.getElementById('columnUseLeft');
			this.columnUseRightRadioButton = document.getElementById('columnUseRight');
			this.hide('statusAddressBook1');
			this.hide('statusAddressBook2');

			if (!this.abManager || !this.abManager.directories || this.abManager.directories.length == 0) {
				this.disable('startbutton');
				this.statustext.value = this.stringBundle.getString('NoABookFound');
				this.statustext.className = "error-message";
				return;
			}
			var abook = this.abManager.directories.getNext();
			if (typeof window.opener.GetSelectedDirectory != 'undefined') {
				let addressbookURIs = window.opener.GetSelectedDirectory()
			                              .match(/(moz-ab(mdb|osx)directory:\/\/([^\/]+\.mab|\/)).*/);
				if (addressbookURIs && addressbookURIs.length > 0)
					abook = this.abManager.getDirectory(addressbookURIs[1]);
			}

			// We will process the first/selected address book, plus optionally a second one
			this.abDir1 = this.abDir2 = abook;
			var abookURI = abook.URI;
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
			var ablists = document.getElementById("addressbooklists");
			var ablist1 = this.createMenuList("addressbookname", dirNames, URIs, abookURI);
			var ablist2 = this.createMenuList("addressbookname", dirNames, URIs, abookURI);
			ablists.appendChild(ablist1);
			ablists.appendChild(ablist2);

			this.statustext.value = this.stringBundle.getString('PleasePressStart');
			document.getElementById('startbutton').setAttribute('label', this.stringBundle.getString('Start'));
			this.enable('startbutton');
			document.getElementById('startbutton').focus();
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
				this.hide('tablepane');
				this.hide('endinfo');
				this.hide('progressMeter');
				this.show('explanation');
				this.init();
				return;
			}
			const ablist = document.getElementById("addressbooklists");
			const ab1 = ablist.firstChild;
			const ab2 = ab1.nextSibling;
			if (ab1.selectedItem) this.abDir1 = this.abManager.getDirectory(ab1.selectedItem.value);
			if (ab2.selectedItem) this.abDir2 = this.abManager.getDirectory(ab2.selectedItem.value);
			if([ab1.selectedItem.value, ab2.selectedItem.value].includes("moz-abosxdirectory:///"))
				alert("Mac OS X Address Book is read-only.\nYou can use it only for comparison.");
			//It seems that Thunderbird 11 on Max OS 10.7 can actually be write fields, although an exception is thrown.
			this.readAddressBooks();

			this.autoremoveDups = document.getElementById("autoremove").getAttribute("checked");
			this.preserveFirst = document.getElementById("preservefirst").getAttribute("checked");
			this.deferInteractive = document.getElementById("deferInteractive").getAttribute("checked");
			this.natTrunkPrefix = document.getElementById("natTrunkPrefix").value;
			this.countryCallingCode = document.getElementById("countryCallingCode").value;
			if (this.natTrunkPrefix != ""){
				if (!this.natTrunkPrefix.match(/^[0-9]{1,2}$/))
					alert("National phone number prefix '"+this.natTrunkPrefix+"' should contain one or two digits");
				if (!this.countryCallingCode.match(/^(\+|[0-9])[0-9]{1,6}$/))
					alert("Default country calling code '"+this.countryCallingCode+"' should contain a leading '+' or digit followed by one to six digits");
			}
			this.ignoreList = document.getElementById("ignoreFields").value.split(/\s*,\s*/);

			this.prefsBranch.setBoolPref("autoremoveDups", this.autoremoveDups);
			this.prefsBranch.setBoolPref("preserveFirst", this.preserveFirst);
			this.prefsBranch.setBoolPref("deferInteractive", this.deferInteractive);
			this.prefsBranch.setCharPref("natTrunkPrefix", this.natTrunkPrefix);
			this.prefsBranch.setCharPref("countryCallingCode", this.countryCallingCode);
			this.prefsBranch.setCharPref("ignoreFields", this.ignoreList.join(", "));

			// hide intro info, show table, progress, etc.
			this.hide('explanation');
			this.purgeAttributesTable();
			this.show('tablepane');
			this.hide('endinfo');
			this.show('progressMeter');
			this.statustext.value = this.stringBundle.getString('SearchingForDuplicates');
			document.getElementById('statusAddressBook1_label').value = this.abDir1.dirName;
			document.getElementById('statusAddressBook2_label').value = this.abDir2.dirName;
			this.updateDeletedProgress('statusAddressBook1_size' , this.BOOK_1, 0);
			this.updateDeletedProgress('statusAddressBook2_size' , this.BOOK_2, 0);
			this.show('statusAddressBook1');
			this.show('statusAddressBook2');
			this.show('stopbutton');
			this.hide('quitbutton');

			// re-initialization needed in case of restart:
			while (ablist.firstChild)
				ablist.removeChild(ablist.firstChild);
			this.currentSearchPosition1 = 0;
			this.currentSearchPosition2 = (this.abDir1 == this.abDir2 ? 0 : -1);
			this.nowHandling = false;
			this.duplicates = new Array();
			this.totalCardsChanged = 0;
			this.totalCardsSkipped = 0;
			this.totalCardsDeleted1 = 0;
			this.totalCardsDeleted2 = 0;
			this.totalCardsDeletedAuto = 0;
			this.updateProgress();
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
			this.disable('startbutton');
			this.purgeAttributesTable();

			this.disable('skipnextbutton');
			this.disable('keepnextbutton');
			this.disable('applynextbutton');
			this.window.setAttribute('wait-cursor', 'true');
			this.statustext.value = this.stringBundle.getString('SearchingForDuplicates');
			this.updateProgress();
			// starting the search via setTimeout allows redrawing the progress info
			setTimeout(function() { DuplicateEntriesWindow.searchDuplicateIntervalAction(); }, 13);
		},

		/**
		 * Saves modifications to one card and deletes the other one.
		 */
		applyAndSearchNextDuplicate: function() {
			// for the case that right one will be kept
			var [deleAbDir, deleBook, deleIndex] = [this.abDir1, this.BOOK_1, this.currentSearchPosition1];
			var [keptAbDir, keptBook, keptIndex] = [this.abDir2, this.BOOK_2, this.currentSearchPosition2];
			if (this.sideUsed == 'left') { // left one will be kept
				[deleAbDir, deleBook, deleIndex, keptAbDir, keptBook, keptIndex] =
				[keptAbDir, keptBook, keptIndex, deleAbDir, deleBook, deleIndex];
			}
			this.updateAbCard(keptAbDir, keptBook, keptIndex, this.sideUsed);
			this.deleteAbCard(deleAbDir, deleBook, deleIndex, false);
			this.searchNextDuplicate();
		},

		updateAbCard: function(abDir, book, index, side) {
			var card = this.vcards[book][index];

			// see what's been modified
			var updateFields = this.getCardFieldValues(side);
			var entryModified = false;
			for(let property in updateFields) {
				var defaultValue = this.defaultValue(property);
				if (card.getProperty(property, defaultValue) != updateFields[property]) {
			// not using this.getProperty here to give a chance to update wrongly empty field
					try {
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
			this.updateAbCard(this.abDir1, this.BOOK_1, this.currentSearchPosition1, 'left' );
			this.updateAbCard(this.abDir2, this.BOOK_2, this.currentSearchPosition2, 'right');
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

		updateDeletedProgress: function (label, book, nDeleted) {
			const cards = this.stringBundle.getString('cards');
			document.getElementById(label).value = '('+cards+': '+ (this.vcards[book].length -
			                         (this.abDir1 == this.abDir2 ? this.totalCardsDeleted1 +
			                                                       this.totalCardsDeleted2 : nDeleted)) +')';
		},

		updateProgress: function() {
			// update status info - will not be visible immediately, see also http://forums.mozillazine.org/viewtopic.php?p=5300605
			var pos = this.currentSearchPosition1 + 1;
			var len = this.vcards[this.BOOK_1].length;
			const current = this.stringBundle.getString('current');
			this.progressmeter.setAttribute('value', ((pos / len) * 100) + '%');
			this.progresstext.value = current+": "+pos;
			this.updateDeletedProgress('statusAddressBook1_size' , this.BOOK_1, this.totalCardsDeleted1);
			this.updateDeletedProgress('statusAddressBook2_size' , this.BOOK_2, this.totalCardsDeleted2);
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
				if (this.duplicates.length == 0) {
				  return false;
				}
				[this.currentSearchPosition1, this.currentSearchPosition2] = this.duplicates.shift();
			} while(!this.vcards[this.BOOK_1][this.currentSearchPosition1] ||
						  !this.vcards[this.BOOK_2][this.currentSearchPosition2]);
			this.updateProgress();
			return true;
		},

		/**
		 * increments internal pointers to next available card pair.
		 * Returns true if and only if next pair is available
		 */
		searchPositionsToNext: function() {
			// If the current searchPosition is deleted, force the search for a next one by
			// setting the searchPosition2 to the end.
			if(!this.vcards[this.BOOK_1][this.currentSearchPosition1])
				this.currentSearchPosition2 = this.vcards[this.BOOK_2].length;

			// Search for the next searchPosition2
			do
			{
				++(this.currentSearchPosition2);
				if(this.currentSearchPosition2 >= this.vcards[this.BOOK_2].length)
				{
					// We have reached the end, search for the next searchPosition
					do
					{
						this.currentSearchPosition1++;
						this.updateProgress();
						// if same book, make sure it's possible to have ...,Position1, Position2.
						if(this.currentSearchPosition1 + (this.abDir1 == this.abDir2 ? 1 : 0) >= this.vcards[this.BOOK_1].length)
							return false;
					} while(!this.vcards[this.BOOK_1][this.currentSearchPosition1]);

					// if same book, we start searching the pair with the position after.
					this.currentSearchPosition2 = (this.abDir1 == this.abDir2 ? this.currentSearchPosition1 + 1 : 0);
				}
			} while(!this.vcards[this.BOOK_2][this.currentSearchPosition2]);

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

				var simplified_card1 = this.getSimplifiedCard(this.BOOK_1, this.currentSearchPosition1);
				var simplified_card2 = this.getSimplifiedCard(this.BOOK_2, this.currentSearchPosition2);
				if (simplified_card1['_AimScreenName'] != simplified_card2['_AimScreenName'])
					continue; // useful for manual differentiation to prevent repeated treatment
				var namesmatch = this.namesMatch(simplified_card1, simplified_card2);
				/* if (simplified_card1['DisplayName'] == simplified_card2['DisplayName'])
					this.debug(simplified_card1['DisplayName']+" vs. "+simplified_card2['DisplayName']+": "+namesmatch); */
				var mailsmatch = this.mailsMatch(simplified_card1, simplified_card2);
				var phonesmatch = this.phonesMatch(simplified_card1, simplified_card2);
				var nomailsphonesmatch = this.noMailsPhonesMatch(simplified_card1) &&
				                         this.noMailsPhonesMatch(simplified_card2);
				var nomatch = this.noNamesMatch(simplified_card1) &&
				              this.noNamesMatch(simplified_card2) && nomailsphonesmatch;  // pathological case
				if (namesmatch || mailsmatch || phonesmatch || nomatch) {
					// OK, we found something that looks like a duplicate or cannot match anything.
					var card1 = this.vcards[this.BOOK_1][this.currentSearchPosition1];
					var card2 = this.vcards[this.BOOK_2][this.currentSearchPosition2];
					var [comparable, comparison] = this.abCardsCompare(card1, card2);
					if (comparable && this.autoremoveDups &&
					    !(this.abDir1 != this.abDir2 && this.preserveFirst && comparison < 0)) {
						if (comparison < 0)
							this.deleteAbCard(this.abDir1, this.BOOK_1, this.currentSearchPosition1, true);
						else // if comparison == 0, prefer to delete c2
							this.deleteAbCard(this.abDir2, this.BOOK_2, this.currentSearchPosition2, true);
					} else {
						//window.clearInterval(this.searchInterval);

						if (this.deferInteractive && !this.nowHandling) { // append the positions to queue
							this.duplicates.push([this.currentSearchPosition1, this.currentSearchPosition2]);
						}
						else {
							// enable buttons again
							this.enable('skipnextbutton');
							this.enable('keepnextbutton');
							this.enable('applynextbutton');
							this.window.removeAttribute('wait-cursor');
							this.statustext.value = this.stringBundle.getString(
								nomatch? 'noMatch' : 'matchFound');
							this.displayCardData(card1, card2, comparable, comparison, namesmatch, mailsmatch, phonesmatch);
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
			this.hide('progressMeter');

			this.disable('skipnextbutton');
			this.disable('keepnextbutton');
			this.disable('applynextbutton');
			this.window.removeAttribute('wait-cursor');
			this.progresstext.value = "";
			this.statustext.value = this.stringBundle.getString('finished');

			// show statistics
			var totalCardsDeleted = this.totalCardsDeleted1+this.totalCardsDeleted2;
			document.getElementById('resultNumBefore').value = this.totalCardsBefore;
			document.getElementById('resultNumAfter').value = this.totalCardsBefore - totalCardsDeleted;
			document.getElementById('resultNumRemovedMan').value = totalCardsDeleted - this.totalCardsDeletedAuto;
			document.getElementById('resultNumRemovedAuto').value = this.totalCardsDeletedAuto;
			document.getElementById('resultNumChanged').value = this.totalCardsChanged;
			document.getElementById('resultNumSkipped').value = this.totalCardsSkipped;
			document.getElementById('resultConsideredFields').textContent = this.consideredFields();
			document.getElementById('resultIgnoredFields').textContent = this.ignoreList.join(", ");
			document.getElementById('resultDiffProps').textContent = this.nonequivalentProperties.join(", ");
			this.show('endinfo');
			this.hide('stopbutton');
			this.show('quitbutton');

			document.getElementById('startbutton').setAttribute('label', this.stringBundle.getString('Restart'));
			this.enable('startbutton');
			this.restart = true;
		},

		getProperty: function(card, property) {
			const defaultValue = this.defaultValue(property);
			const value = card.getProperty(property, defaultValue);
			if (this.isSelection(property) && value == "")
				return defaultValue; // recover from wrongly empty field
			if (property == 'LastModifiedDate')
				 return value == "0" ? "" : new Date(value * 1000).toLocaleString();
			if (property == 'PhotoURI') {
				if (value == 'chrome://messenger/skin/addressbook/icons/contact-generic.png')
					return defaultValue;
				var contents = this.readFile(value, false);
				return contents ? contents : defaultValue;
			}
			return value+""; // force string even when isSelection or isInteger
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
			while ((p = fn.match(/^(.+)\s(von|van|und|and|für|for|zur|der|de|geb|ben)\s*$/))) {
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

			// second step: tranformation
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
				// not using HomePhone for matching because often it is shared by a group of people
				vcard['Phone1'] = this.getAbstractedTransformedProperty(card, 'CellularNumber');
				vcard['Phone2'] = this.getAbstractedTransformedProperty(card, 'PagerNumber');
				vcard['Phone3'] = this.getAbstractedTransformedProperty(card, 'WorkPhone');
				// not using FaxNumber for matching because often it is shared by a group of people
				this.vcardsSimplified[book][i] = vcard;
			}
			return this.vcardsSimplified[book][i];
		},

		/**
		 * Creates table with address book fields for side-by-side comparison
		 * and editing. Editable fields will be listed in this.editableFields.
		 */
		displayCardData: function(card1, card2, comparable, comparison, namesmatch, mailsmatch, phonesmatch) {
			this.purgeAttributesTable();
			this.displayedFields = new Array();
			this.editableFields = new Array();
			this.make_visible('tableheader');
			const cardsEqu = document.getElementById('cardsEqu');
			cardsEqu.value = !comparable ? '' :
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

			var fields = this.addressBookFields.filter(x => !this.ignoreList.includes(x)); // copy
			const diffProps = this.nonequivalentProperties;
			for(let i = 0; i < diffProps.length; i++) { // add non-set fields for with so far had non-equivalent values have been found
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
					localName = this.stringBundle.getString(property + '_label');
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
				if (this.labelsList.includes(property)) {
					const cell1 = document.createElement('label');
					const cellEqu = document.createElement('hbox');
					const descEqu = document.createElement('description');
					cellEqu.className = 'equivalence';
					cellEqu.appendChild(descEqu);
					if ( namesmatch && property == "Names" ||
					     mailsmatch && property == "Emails" ||
					    phonesmatch && property == "PhoneNumbers")
						descEqu.setAttribute('value', '≃');
					row.appendChild(cell1);
					row.appendChild(cellEqu);
					this.attributesTableRows.appendChild(row);
				} else {
					const defaultValue = this.defaultValue(property);
					const  leftValue = this.getProperty(card1, property);
					const rightValue = this.getProperty(card2, property);
					const displayOnlyIfDifferent = /^(PhotoType|UID|UUID|CardUID)$/;
					const displayAlways = /^(FirstName|LastName|DisplayName|_AimScreenName|PrimaryEmail|SecondEmail|CellularNumber|HomePhone|WorkPhone|FaxNumber|Notes)$/;
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
			this.toggleContactLeftRight(comparison < 0 ? 'right' : 'left'); // if comparison == 0, prefer to delete c2
		},

		/**
		 * Creates a table row for one address book field for side-by-side
		 * comparison and editing. Editable fields will be listed in this.editableFields.
		 */
		displayCardField: function(card1, card2, defaultValue, leftValue, rightValue, property, row) {
			this.displayedFields.push(property);
			var editable = property != 'PhotoURI' && property != 'MailListNames' && property != 'LastModifiedDate';
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
			let equ = '≡'; // should indicate: identical
			var both_empty = 0;
			if (this.isMailAddress(property) || this.isPhoneNumber(property)) {
				const defaultValue_Set = new Set();
				const prop = this.isMailAddress(property) ? '__MailAddresses' : '__PhoneNumbers';
				const value1 = card1.getProperty(prop, defaultValue_Set);
				const value2 = card2.getProperty(prop, defaultValue_Set);
				both_empty = value1.size == 0 && value2.size == 0;
				// value1 and value2 are essentially result of getAbstractedTransformedProperty()
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
			} else {
				both_empty = leftValue == defaultValue && rightValue == defaultValue;
				if (leftValue != rightValue) {
					const value1 = this.getAbstractedTransformedProperty(card1, property);
					const value2 = this.getAbstractedTransformedProperty(card2, property);
					if (value1 == value2)
						equ = '≅'; // equivalent; &cong; yields syntax error; &#8773; verbatim
					else if (this.isText(property)) {
						if      (value2.indexOf(value1) >= 0) // value1 is substring of value2
							equ = '<';
						else if (value1.indexOf(value2) >= 0) // value2 is substring of value1
							equ = '>';
						else
							equ = ''; // incomparable
					}
					else if (this.isInteger(property)) {
						const comparison = card1.getProperty(property, 0) - card2.getProperty(property, 0);
						if (comparison < 0)
							equ = '<';
						else if (comparison > 0)
							equ = '>';
						else
							equ = '≡'; // this case (leftValue == rightValue) is already covered above
					}
					else if (value1 == defaultValue)
						equ = '⋦';
					else if (value2 == defaultValue)
						equ = '⋧';
					else
						equ = '';
				}
			}
			// only non-identical and not set-equal properties should be hightlighted by color
			if (equ != (this.isMailAddress(property) || this.isPhoneNumber(property) ? '≅' : '≡')) {
				cell1.setAttribute('class', this.sideUsed == 'left' ? 'used' : 'unused');
				cell2.setAttribute('class', this.sideUsed == 'left' ? 'unused' : 'used');
			}
			if (both_empty)
				equ = '';
			else if (property == 'SecondEmail' || (this.isPhoneNumber(property) && property != 'CellularNumber')) {
				equ = '⋮'; // sets displayed over multiple lines lead to multiple lines with same symbol
			}
			if (property == 'PhotoURI')
				descEqu.setAttribute('style', 'margin-top: 1em;'); // move a bit lower
			descEqu.setAttribute('value', equ);

			// create input/display fields, depending on field type
			let cell1valuebox;
			let cell2valuebox;

			if (property == 'PhotoURI') {
				cell1valuebox = this.previewImage("preliminary src  leftValue");
				cell2valuebox = this.previewImage("preliminary src rightValue");
			} else if (this.isSelection(property)) {
				if (property == 'PreferMailFormat') {
					labels = [this.stringBundle.getString('unknown_label'),
						  this.stringBundle.getString('plaintext_label'),
						  this.stringBundle.getString('html_label')];
				}
				else {
					var labels = [this.stringBundle.getString('false_label'),
						      this.stringBundle.getString('true_label')];
				}
				var values = [0, 1, 2];
				cell1valuebox = this.createMenuList(null, labels, values,  leftValue, true);
				cell2valuebox = this.createMenuList(null, labels, values, rightValue, true);
			}
			else {
				function make_valuebox(value) {
					const valuebox = editable ? document.createElement('textbox') :
					      document.createElement('label');
					valuebox.className = 'textbox';
					valuebox.setAttribute('value',  value);
					if (property == 'MailListNames' || property == 'Notes') {
						valuebox.setAttribute('multiline', "true");
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
				// preserve aspect ratio:
				cell1valuebox.setAttribute('flex', "");
				cell2valuebox.setAttribute('flex', "");
				// would be ignored if done before appendChild(row):
				cell1valuebox.src=card1.getProperty('PhotoURI', "");
				cell2valuebox.src=card2.getProperty('PhotoURI', "");
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
			const f1 = vcard1[  'FirstName'], l1 = vcard1[      'LastName'];
			const f2 = vcard2[  'FirstName'], l2 = vcard2[      'LastName'];
			const d1 = vcard1['DisplayName'], a1 = vcard1['_AimScreenName'];
			const d2 = vcard2['DisplayName'], a2=  vcard2['_AimScreenName'];
			return ( a1 != "" &&               a1 == a2             ) || // _AimScreenNames exist and match
			       ( d1 != "" &&               d1 == d2             ) || // DisplayNames exist and match
			       ( f1 != "" && l1 != ""  &&  f1 == f2 && l1 == l2 ) || // FirstNames and LastNames exist and match
       (d1 == "" && d2 == "" && (f1 != "" || l1 != "") &&  f1 == f2 && l1 == l2 ) || // no DisplayNames, but FirstNames and LastNames match
       (d1 == "" && d2 != "" && (f1 == "")!=(l1 == "") && (f1 == d2 || l1 == d2)) || // only First/Last exists and matches other DisplayName
       (d2 == "" && d1 != "" && (f2 == "")!=(l2 == "") && (f2 == d1 || l2 == d1));   // only First/Last exists and matches other DisplayName
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
		 * Changes the selection of contacts to be used. If used without parameter, the
		 * current selection is switched. If used with "left" or "right" as parameter,
		 * the selection is changed so that the specified side will be applied.
		 */
		toggleContactLeftRight: function(side) {
			if (!side || (side != this.sideUsed)) {
				var infoLeft  = document.getElementById('columnKeptInfoLeft');
				var infoRight = document.getElementById('columnKeptInfoRight');
				var sideUnused;
				if ((!side && (columnUseLeftRadioButton.getAttribute('selected') == 'true')) || side == 'right') {
					side = 'right';
					sideUnused = 'left';
					this.columnUseLeftRadioButton.setAttribute('selected', 'false');
					this.columnUseRightRadioButton.setAttribute('selected', 'true');
					document.getElementById('columnHeaderLeft').setAttribute('class', 'unused');
					document.getElementById('columnHeaderRight').setAttribute('class', 'used');
					var temp = infoLeft.getAttribute('value');
					infoLeft.value = infoRight.getAttribute('value');
					infoRight.value = temp;
				}
				else if ((!side && (columnUseRightRadioButton.getAttribute('selected') == 'true')) || side == 'left') {
					side = 'left';
					sideUnused = 'right';
					this.columnUseLeftRadioButton.setAttribute('selected', 'true');
					this.columnUseRightRadioButton.setAttribute('selected', 'false');
					document.getElementById('columnHeaderLeft').setAttribute('class', 'used');
					document.getElementById('columnHeaderRight').setAttribute('class', 'unused');
					var temp = infoLeft.getAttribute('value');
					infoLeft.value = infoRight.getAttribute('value');
					infoRight.value = temp;
				}
				this.sideUsed = side;
				for(let index = 0; index < this.displayedFields.length; index++) {
					var cell1 = document.getElementById('cell_' + side       + '_' + this.displayedFields[index]);
					var cell2 = document.getElementById('cell_' + sideUnused + '_' + this.displayedFields[index]);
					if (cell1.getAttribute('class') == 'unused') {
						  cell1.setAttribute('class', 'used');
					}
					if (cell2.getAttribute('class') == 'used') {
						  cell2.setAttribute('class', 'unused');
					}
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

		/**
		 * Returns all cards from a directory in an array.
		 */
		getAllAbCards: function(directory)	{
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
								for (let i = 0; i < addressList.length; i++)
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
			abCards.forEach(function(abCard) {
				// record all mailing lists that the card belongs to
				var mailListNames = new Array();
				const email = abCard.primaryEmail; // only this email address is relevant
				if (email)
					mailLists.forEach(function ([displayName, primaryEmails]) {
						if (primaryEmails.includes(email))
							mailListNames.push(displayName);
					})
				abCard.setProperty('MailListNames', mailListNames);
			})
			return abCards;
		},

		propertyUnion: function(c1, c2) {
			var union = new Array();
			for(let i = 0; i < 2; i++) {
				var it = i == 0 ? c1.properties : c2.properties;
				while (it.hasMoreElements()) {
					var property = it.getNext().QueryInterface(Components.interfaces.nsIProperty).name;
					if (property != '__MailAddresses' && property != '__PhoneNumbers')
						pushIfNew(property, union);
				}
			}
			return union;
		},

		readFile: function(url, binary) {
			if (url) {
				const req = new XMLHttpRequest();
				req.open('GET', url, false);  // `false` makes the request synchronous
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

		previewImage: function(url) {
			var img = url ? document.createElement('image') : document.createElement('label');
			if (url) {
				// this.debug("URL = "+url+" type = "+this.getProperty(card, "PhotoType")+" data = "+this.getProperty(card,"PhotoData"));
				// url = "kate.png";
				/* var base64 = btoa(this.readFile(url, true));
				img.src = "data:image/png;base64," + base64; */
				/* var reader = new FileReader();
				reader.onload = function() {
					img.src= reader.result;
				}
				reader.readAsDataURL(this.readFile(url, true)); */
				img.height = 100;
				//img.style.border='2px solid #E8272C';
				//img.alt = this.getProperty(card, "PhotoName");
				/*img.onload = function() {
					this.debug("Image OK URL="+url);
				}
				img.onerror = function() {
					this.debug("Image Error"); this.onerror=null;this.src='https://placeimg.com/200/300/animals';
				}*/
			}
			return img;
		},

		/**
		 * @param	Array		Address book card 1
		 * @param	Array		Address book card 2
		 * @return [comparable, comparison] where if comparable = 1 then
		 *          comparison > 0 if first card is more complete or else has higher char weight
                                              or else higher PopularityIndex or else higher LastModifiedDate than second one
		 *          comparison < 0 if first card is less complete or else has  lower char weight
                                              or else  lower PopularityIndex or else  lower LastModifiedDate than second one
		 *          comparison = 0 otherwise (that is, cards are equivalent with same char weight,
                                                      PopularityIndex, and LastModifiedDate)
		 */
		abCardsCompare: function(c1, c2) {
			var outer_this = this;
			var nDiffs = 0; // unused
			var incomparable = false;
			var c1_less_complete = true;
			var c2_less_complete = true;
			var c1_charweight = 0;
			var c2_charweight = 0;
			var props = pushIfNew('PrimaryEmail', pushIfNew('HomePhone', this.propertyUnion(c1, c2)));
			for(let i = 0; i < props.length; i++) {
				var property = props[i];
				if (this.ignoreList.includes(property))
					continue;
				var str1 = this.getTransformedProperty(c1, property);
				var str2 = this.getTransformedProperty(c2, property);
				if (property != 'PhotoURI') {
					// give preference to values with many non-digit/uppercase and special characters
					var pat = this.isPhoneNumber(property) ? /[0-9]/g : /[a-z]/g;
					c1_charweight += str1.replace(pat, '').length;
					c2_charweight += str2.replace(pat, '').length;
					// this.debug(property+": '"+str1+"' charweight = "+c1_charweight+" vs. '"+str2+"' charweight = "+c2_charweight);
				}
				if (property == 'SecondEmail')
					continue; // will be treated along with PrimaryEmail
				if (this.isPhoneNumber(property) && property != 'HomePhone')
					continue; // will be treated along with HomePhone

				const defaultValue = this.defaultValue(property);
				let value1, value2;
				if (property == 'MailListNames' ) {
					value1 = new Set(c1.getProperty(property, defaultValue));
					value2 = new Set(c2.getProperty(property, defaultValue));
				} else {
					value1 = this.abstract(str1, property);
					value2 = this.abstract(str2, property);
				}
				function make_set(card, properties, val) {
					var set = new Set(properties.map(function(p) { return outer_this.getAbstractedTransformedProperty(card, p); } ));
					set.add(val);
					return set;
				}
				var diffProp = property;
				if (property == 'PrimaryEmail') { // treat email addresses as a set
					value1 = make_set(c1, ['SecondEmail'], value1);
					value2 = make_set(c2, ['SecondEmail'], value2);
					diffProp = "{PrimaryEmail,SecondEmail}";
					c1.setProperty('__MailAddresses', value1);
					c2.setProperty('__MailAddresses', value2);

				} else if (property == 'HomePhone') { // treat phone numbers as a set
					value1 = make_set(c1, ['WorkPhone', 'FaxNumber', 'PagerNumber', 'CellularNumber'], value1);
					value2 = make_set(c2, ['WorkPhone', 'FaxNumber', 'PagerNumber', 'CellularNumber'], value2);
					diffProp = "{CellularNumber,HomePhone,WorkPhone,FaxNumber,PagerNumber}";
					c1.setProperty('__PhoneNumbers', value1);
					c2.setProperty('__PhoneNumbers', value2);
				}
				if (value1 != value2) { // values not equivalent
					pushIfNew(diffProp, this.nonequivalentProperties);
					nDiffs++;
					// this.debug("abCardsCompare: "+property+" = "+value1+" vs. "+value2);
					if (this.isText(property)) {
						if      (value2.indexOf(value1) < 0) // text in c1 is not substring of text in c2
							c1_less_complete = false;
						else if (value1.indexOf(value2) < 0) // text in c2 is not substring of text in c1
							c2_less_complete = false;
						else
							c1_less_complete = c2_less_complete = false; // incomparable
					} else if (property == 'MailListNames' || property == 'PrimaryEmail' || property == 'HomePhone') {
						value1.delete(defaultValue); // defaultValue means value does not exist
						value2.delete(defaultValue); // defaultValue means value does not exist
						// this.debug(value1+" vs. "+value2+": "+value1.isSuperset(value2)+" "+value2.isSuperset(value1));
						if (!value2.isSuperset(value1))
							c1_less_complete = false;
						if (!value1.isSuperset(value2))
							c2_less_complete = false;
					} else if (value2 == defaultValue)
						c1_less_complete = false;
					else if (value1 == defaultValue)
						c2_less_complete = false;
					else if (!this.isInteger(property))
						c1_less_complete = c2_less_complete = false; // incomparable
				}
			}
			const debug_msg = "abCardsCompare: less_complete = "+c1_less_complete+" vs. "+c2_less_complete+
			                                ", charweight = "   +c1_charweight   +" vs. "+c2_charweight;
			// this.debug(debug_msg);
			var comparable = true;
			/*
			 * even for the case that 'comparable' will be set to 'false'
			 * determine some preference for deletion for one card of matching pairs,
			 * using those properties satisfying this.isInteger()
			 */
			var comparison = c1_charweight - c2_charweight;
			if (comparison == 0)
				comparison = c1.getProperty('PopularityIndex' , 0) -
				             c2.getProperty('PopularityIndex' , 0);
			if (comparison == 0)
				comparison = c1.getProperty('LastModifiedDate', 0) -
				             c2.getProperty('LastModifiedDate', 0);
			if (c1_less_complete && c2_less_complete) // cards equivalent (equal modulo abstraction)
				; // use 'comparison' as computed above
			else if (c2_less_complete) comparison =  1;
			else if (c1_less_complete) comparison = -1;
			else comparable = false; // use 'comparison' as computed above
			// this.debug("abCardsCompare: "+[comparable, comparison]+" for "+this.getProperty(card1, 'DisplayName')+" vs. "+this.getProperty(card2, 'DisplayName'));
			return [comparable, comparison];
		},

		enable: function(id) {
			document.getElementById(id).setAttribute('disabled', 'false');
		},
		disable: function(id) {
			document.getElementById(id).setAttribute('disabled', 'true');
		},

		show: function(id) {
			document.getElementById(id).setAttribute('style', 'display: block');
		},
		hide: function(id) {
			document.getElementById(id).setAttribute('style', 'display: none');
		},

		make_visible: function(id) {
			document.getElementById(id).setAttribute('style', 'visibility: visible');
		},
		make_invisible: function(id) {
			document.getElementById(id).setAttribute('style', 'visibility: hidden');
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
				text = text.replace(/^\+/g, '00').replace(/\+/g, '').replace(/^00/g, '+'); // strip irrelevant '+'
			}
			return text;
		},

		getPrunedProperty: function(card, property) {
			// filter out ignored fields
			const defaultValue = this.defaultValue(property);
			if (this.ignoreList.includes(property))
				return defaultValue; // do not use these for comparison
			var value = this.pruneText(this.getProperty(card, property), property);

			// Strip any stray email address duplicates from names, which get inserted by some email clients as default names:
			if (this.isFirstLastDisplayName(property))
				if (value == this.getPrunedProperty(card, 'PrimaryEmail') ||
				    value == this.getPrunedProperty(card,  'SecondEmail'))
					return defaultValue;
			if (property.match(/Email$/))
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
			if (this.isPhoneNumber(property) && this.natTrunkPrefix != "" && this.countryCallingCode != "") {
				if (text.match(this.natTrunkPrefixReqExp))
					text = this.countryCallingCode+text.substr(this.natTrunkPrefix.length);
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

			// remove singleton digits and letters (like initials)
			  .replace(/ [A-Za-z0-9] /g, ' ') // does not work recursively, just non-overlapping
			  .replace(/ [A-Za-z0-9] /g, ' ') // needed if there are two consecutive initials!
			  .replace(/^[A-Za-z0-9] /g, '')
			  .replace(/ [A-Za-z0-9]$/g, '')

			// remove any (newly produced) leading or trailing whitespace
			  .replace(/^\s+/, "")
			  .replace(/\s+$/, "");
		},

		createMenuList: function(cls, labels, values, selected, showsel) {
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
					menupopup.selectedItem = (showsel ? menuitem : null);
				}
				menupopup.appendChild(menuitem);
			}
			menulist.appendChild(menupopup);
			return menulist;
		},
	}
}
