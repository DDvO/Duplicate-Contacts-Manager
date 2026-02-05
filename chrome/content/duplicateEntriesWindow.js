// -*- mode: js; indent-tabs-mode: t; js-indent-level: 8 -*-
// file: duplicateEntriesWindow.js

// This file includes UTF-8 encoding. Please make sure your text editor can deal with this prior to saving any changes!
// Change history and architecture: see ARCHITECTURE_AND_HISTORY.md in the project root.

// TODO: add option to prune and transform contents of individual or all cards
// TODO: add option to automatically and/or manually merge fields (e.g., buttons with arrow)
// TODO: generalize matching/comparison and manual treatment to more than two entries

/*
   References:
   // TB128: Migrated from XPCOM nsIAbCard to plain JavaScript objects (vCard properties)
   https://developer.mozilla.org/en-US/docs/Mozilla/Thunderbird/Address_Book_Examples
*/

if (typeof(DuplicateContactsManager_Running) == "undefined") {
	/** Single window object; passed as context (ctx) to all duplicate-finder modules. Holds state and delegates to Contacts, Fields, Prefs, Matching, CardValues, Comparison, UI, Display, Search. */
	var DuplicateEntriesWindow = Object.assign(DuplicateEntriesWindowState.defaultState(), {
		debug: function(str) {
			console.log(str);
		},

		/** Returns config object for DuplicateEntriesWindowMatching (normalization). */
		getNormalizationConfig: function() {
			return {
				isText: this.isText.bind(this),
				isPhoneNumber: this.isPhoneNumber.bind(this),
				natTrunkPrefix: this.natTrunkPrefix,
				countryCallingCode: this.countryCallingCode,
				natTrunkPrefixReqExp: this.natTrunkPrefixReqExp,
				intCallPrefix: this.intCallPrefix,
				intCallPrefixReqExp: this.intCallPrefixReqExp
			};
		},

		/**
		 * Initializes the duplicate-finder window.
		 * TB128: Uses WebExtension APIs (addressBooks, storage, i18n) instead of XPCOM.
		 * Loads preferences, populates address book dropdowns, and shows ready state.
		 * Will be called by window.html once the window is loaded.
		 * @async
		 */
		init: async function() {
			var F = DuplicateEntriesWindowFields;
			this.addressBookFields = F.addressBookFields;
			this.matchablesList = F.matchablesList;
			this.metaProperties = F.metaProperties;
			this.ignoredFieldsDefault = F.ignoredFieldsDefault;
			this.isText = F.isText;
			this.isFirstLastDisplayName = F.isFirstLastDisplayName;
			this.isEmail = F.isEmail;
			this.isPhoneNumber = F.isPhoneNumber;
			this.isSet = F.isSet;
			this.isSelection = F.isSelection;
			this.isNumerical = F.isNumerical;
			this.defaultValue = F.defaultValue;
			this.charWeight = F.charWeight;

			// Add vCard utilities to context
			this.parseVCard = VCardUtils.parseVCard;
			this.generateVCard = VCardUtils.generateVCard;

			this.prefsBranch = DuplicateEntriesWindowPrefs.getPrefsBranch();
			await DuplicateEntriesWindowPrefs.loadPrefs(this);
			DuplicateEntriesWindowPrefs.applyPrefsToDOM(this);

			// TB128: Use browser.i18n instead of string bundles
			// No need for stringBundle in TB128

			this.running = true;
			this.statustext = document.getElementById('statusText');
			this.progresstext = document.getElementById('progressText');
			this.progressmeter = document.getElementById('progressMeter');
			this.window = document.getElementById('handleDuplicates-window');
			this.attributesTableRows = document.getElementById('AttributesTableRows');
			this.keepLeftRadioButton = document.getElementById('keepLeft');
			this.keepRightRadioButton = document.getElementById('keepRight');
			if (this.progresstext) this.progresstext.textContent = "";
			DuplicateEntriesWindowUI.showReadyState(this);

			// TB128: Get address books using WebExtension API
			var Contacts = DuplicateEntriesWindowContacts;
			var addressBooks = await Contacts.getAddressBooks();
			
			if (!addressBooks || addressBooks.length === 0) {
				this.disable('startbutton');
				if (this.statustext) {
					this.statustext.className = 'error-message';
					this.statustext.textContent = this.getString("NoABookFound");
				}
				return;
			}

			// Set default address books if not set
			if (!this.abId1 || !this.abId2) {
				this.abId1 = this.abId2 = addressBooks[0].id;
			}

			// Fill address book selection lists
			var dirNames = addressBooks.map(ab => ab.name);
			var ids = addressBooks.map(ab => ab.id);
			var ablists = document.getElementById('addressbooklists');
			if (ablists) {
				var ablist1 = this.createSelectionList('addressbookname', dirNames, ids, this.abId1);
				var ablist2 = this.createSelectionList('addressbookname', dirNames, ids, this.abId2);
				ablists.appendChild(ablist1);
				ablists.appendChild(ablist2);
			}

			if (this.statustext) {
				this.statustext.className = '';
				this.statustext.textContent = this.getString('PleasePressStart');
			}
			var startButton = document.getElementById('startbutton');
			if (startButton) {
				startButton.textContent = this.getString('Start');
				startButton.focus();
			}
		},

		/**
		 * Gets a localized string by key.
		 * TB128: Uses WebExtension i18n API instead of string bundles.
		 * @param {string} name - Message key
		 * @returns {string} Localized message or key if not found
		 */
		getString: function(name) {
			// TB128: Use browser.i18n API
			if (typeof browser !== 'undefined' && browser.i18n) {
				return browser.i18n.getMessage(name) || name;
			}
			if (typeof messenger !== 'undefined' && messenger.i18n) {
				return messenger.i18n.getMessage(name) || name;
			}
			return name;
		},

		/**
		 * Will be called by window.html (TB128)
		 * once the according window is closed
		 */
		OnUnloadWindow: function() {
			this.running = false;
			this.vcards[this.BOOK_1] = null;
			this.vcards[this.BOOK_2] = null;
		},

		startSearch: async function() {
			if (this.restart) {
				this.restart = false;
				await this.init();
				return;
			}
			const ablist = document.getElementById('addressbooklists');
			const ab1 = ablist ? ablist.firstChild : null;
			const ab2 = ab1 ? ab1.nextSibling : null;
			
			// TB128: Get address book IDs from selection lists
			if (ab1 && ab1.selectedIndex >= 0) {
				this.abId1 = ab1.options[ab1.selectedIndex].value;
			}
			if (ab2 && ab2.selectedIndex >= 0) {
				this.abId2 = ab2.options[ab2.selectedIndex].value;
			}
			
			// Get address book names for display
			var Contacts = DuplicateEntriesWindowContacts;
			var ab1_obj = await Contacts.getAddressBook(this.abId1);
			var ab2_obj = await Contacts.getAddressBook(this.abId2);
			this.abDir1Name = ab1_obj ? ab1_obj.name : '';
			this.abDir2Name = ab2_obj ? ab2_obj.name : '';

			await this.readAddressBooks();

			DuplicateEntriesWindowPrefs.readPrefsFromDOM(this);
			if (this.natTrunkPrefix != "" && !this.natTrunkPrefix.match(/^[0-9]{1,2}$/))
				alert("National phone number trunk prefix '"+this.natTrunkPrefix+"' should contain one or two digits");
			if (this.intCallPrefix != "" && !this.intCallPrefix.match(/^[0-9]{2,4}$/))
				alert("International call prefix '"+this.intCallPrefix+"' should contain two to four digits");
			if (this.countryCallingCode != "" && !this.countryCallingCode.match(/^(\+|[0-9])[0-9]{1,6}$/))
				alert("Default country calling code '"+this.countryCallingCode+"' should contain a leading '+' or digit followed by one to six digits");
			await DuplicateEntriesWindowPrefs.savePrefs(this);

			this.purgeAttributesTable();
			DuplicateEntriesWindowUI.showSearchingState(this);
			if (this.statustext) {
				this.statustext.className = 'with-progress';
				this.statustext.textContent = this.getString('SearchingForDuplicates');
			}
			var ab1Label = document.getElementById('statusAddressBook1_label');
			var ab2Label = document.getElementById('statusAddressBook2_label');
			if (ab1Label) ab1Label.textContent = this.abDir1Name;
			if (ab2Label) ab2Label.textContent = this.abDir2Name;
			this.updateDeletedInfo('statusAddressBook1_size' , this.BOOK_1, 0);
			this.updateDeletedInfo('statusAddressBook2_size' , this.BOOK_2, 0);

			// re-initialization needed in case of restart:
			if (ablist) {
				while (ablist.firstChild)
					ablist.removeChild(ablist.firstChild);
			}
			this.positionSearch = 0;
			this.position1 = 0;
			// TB128: Initialize position2 correctly
			// If same book, start at -1 so first increment makes it 0, then we'll advance to 1 to compare card 0 with card 1
			// If different books, start at -1 so first increment makes it 0
			this.position2 = -1;
			this.nowHandling = false;
			this.positionDuplicates = 0;
			this.duplicates = new Array();
			this.totalCardsChanged = 0;
			this.totalCardsSkipped = 0;
			this.totalCardsDeleted1 = 0;
			this.totalCardsDeleted2 = 0;
			this.totalCardsDeletedAuto = 0;
			this.updateProgress();
			DuplicateEntriesWindowUI.disableDuplicateActionButtons(this);
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
				DuplicateEntriesWindowUI.disableDuplicateActionButtons(this);
				if (this.window && this.window.setAttribute) {
					this.window.setAttribute('wait-cursor', 'true');
				}
				if (this.statustext) {
					this.statustext.className = 'with-progress';
					this.statustext.textContent = this.getString('SearchingForDuplicates');
				}
			}
			this.updateProgress();
			// starting the search via setTimeout allows redrawing the progress info
			var self = this;
			setTimeout(function() { 
				if (typeof DuplicateEntriesWindowSearch !== 'undefined') {
					DuplicateEntriesWindowSearch.runIntervalAction(self);
				} else {
					console.error("DuplicateEntriesWindowSearch is not defined!");
				}
			}, 13);
		},

		/**
		 * Saves modifications to one card and deletes the other one.
		 * TB128: Now async
		 */
		applyAndSearchNextDuplicate: async function() {
			// for the case that right one will be kept
			var [deleAbId, deleBook, deleIndex] = [this.abId1, this.BOOK_1, this.position1];
			var [keptAbId, keptBook, keptIndex] = [this.abId2, this.BOOK_2, this.position2];
			if (this.sideKept == 'left') { // left one will be kept
				[deleAbId, deleBook, deleIndex, keptAbId, keptBook, keptIndex] =
				[keptAbId, keptBook, keptIndex, deleAbId, deleBook, deleIndex];
			}
			await this.updateAbCard(keptAbId, keptBook, keptIndex, this.sideKept);
			await this.deleteAbCard(deleAbId, deleBook, deleIndex, false);
			this.searchNextDuplicate();
		},

		updateAbCard: async function(abId, book, index, side) {
			var card = this.vcards[book][index];
			if (!card) {
				console.error("updateAbCard: Card not found at book", book, "index", index);
				return;
			}

			// see what's been modified
			var updateFields = this.getCardFieldValues(side);
			var entryModified = false;
			for(let property in updateFields) {
				const defaultValue = this.defaultValue(property); /* cannot be a set here */
				// TB128: Cards are plain objects, access properties directly
				var currentValue = card.hasOwnProperty(property) ? card[property] : defaultValue;
				if (currentValue != updateFields[property]) {
					// not using this.getProperty here to give a chance to update wrongly empty field
					try {
						card[property] = updateFields[property];
						entryModified = true;
					} catch (e) {
						alert("Internal error: cannot set field '"+property+"' of "+(card.DisplayName || card._id)+": "+e);
					}
				}
			}
			if (entryModified) {
				this.vcardsSimplified[book][index] = null; // request reconstruction by getSimplifiedCard
				try {
					await DuplicateEntriesWindowContacts.saveCard(abId, card);
					this.totalCardsChanged++;
				} catch (e) {
					alert("Internal error: cannot update card '"+(card.DisplayName || card._id)+"': "+e);
				}
			}
		},

		/**
		 * Saves modifications to both cards
		 * TB128: Now async
		 */
		keepAndSearchNextDuplicate: async function() {
			await this.updateAbCard(this.abId1, this.BOOK_1, this.position1, 'left' );
			await this.updateAbCard(this.abId2, this.BOOK_2, this.position2, 'right');
			this.searchNextDuplicate();
		},

		/**
		 * Deletes the card identified by 'index' from the given address book.
		 * TB128: Now async
		 */
		deleteAbCard: async function(abId, book, index, auto) {
			var card = this.vcards[book][index];
			if (!card) {
				console.warn("deleteAbCard: Card not found at book", book, "index", index);
				return;
			}
			try {
				await DuplicateEntriesWindowContacts.deleteCard(abId, card);
				if (abId == this.abId1)
					this.totalCardsDeleted1++;
				else
					this.totalCardsDeleted2++;
				if (auto)
					this.totalCardsDeletedAuto++;
			} catch (e) {
				alert("Internal error: cannot remove card '"+(card.DisplayName || card._id)+"': "+e);
			}
			this.vcards[book][index] = null; // set empty element, but leave element number as is
		},

		updateDeletedInfo: function(label, book, nDeleted) {
			DuplicateEntriesWindowUI.updateDeletedInfo(this, label, book, nDeleted);
		},

		updateProgress: function() {
			DuplicateEntriesWindowUI.updateProgress(this);
		},

		skipPositionsToNext: function() {
			return DuplicateEntriesWindowSearch.skipPositionsToNext(this);
		},

		searchPositionsToNext: function() {
			return DuplicateEntriesWindowSearch.searchPositionsToNext(this);
		},

		endSearch: function() {
			DuplicateEntriesWindowUI.showFinishedState(this);
			this.statustext.className = 'with-progress';
			this.statustext.textContent = this.getString('finished');
			DuplicateEntriesWindowUI.showFinishedStats(this);
			this.restart = true;
		},

		/**
		 * Gets a property value from a card.
		 * TB128: Delegates to CardValues module which handles plain JavaScript objects.
		 * @param {Object} card - Card object (plain JavaScript object)
		 * @param {string} property - Property name
		 * @returns {*} Property value
		 */
		getProperty: function(card, property) {
			return DuplicateEntriesWindowCardValues.getProperty(this, card, property);
		},
		getTransformedProperty: function(card, property) {
			return DuplicateEntriesWindowCardValues.getTransformedProperty(this, card, property);
		},
		getAbstractedTransformedProperty: function(card, property) {
			return DuplicateEntriesWindowCardValues.getAbstractedTransformedProperty(this, card, property);
		},
		getSimplifiedCard: function(book, i) {
			return DuplicateEntriesWindowCardValues.getSimplifiedCard(this, book, i);
		},

		/**
		 * Creates table with address book fields for side-by-side comparison
		 * and editing. Editable fields will be listed in this.editableFields.
		 */
		displayCardData: function(card1, card2, comparison, preference,
			                  namesmatch, mailsmatch, phonesmatch) {
			DuplicateEntriesWindowDisplay.displayCardData(this, card1, card2, comparison, preference,
				namesmatch, mailsmatch, phonesmatch);
		},

		completeFirstLastDisplayName: function(nameArray, card) {
			return DuplicateEntriesWindowCardValues.completeFirstLastDisplayName(this, nameArray, card);
		},

		/**
		 * Enriches a card with virtual properties used for comparison. Delegates to DuplicateEntriesWindowCardValues.
		 */
		enrichCardForComparison: function(card, mailLists) {
			DuplicateEntriesWindowCardValues.enrichCardForComparison(this, card, mailLists);
		},

		readAddressBooks: async function() {
			var Contacts = DuplicateEntriesWindowContacts;
			// TB128: getAllAbCards is async and takes address book ID
			try {
				if (this.abId1) {
					console.log("Loading contacts from address book 1:", this.abId1);
					var result1 = await Contacts.getAllAbCards(this.abId1, this);
					this.vcards[this.BOOK_1] = result1.cards;
					this.vcardsSimplified[this.BOOK_1] = new Array();
					this.totalCardsBefore = result1.totalBefore;
					console.log("Loaded", result1.cards.length, "contacts from address book 1");
				}
				if (this.abId2 && this.abId2 != this.abId1) {
					console.log("Loading contacts from address book 2:", this.abId2);
					var result2 = await Contacts.getAllAbCards(this.abId2, this);
					this.vcards[this.BOOK_2] = result2.cards;
					this.vcardsSimplified[this.BOOK_2] = new Array();
					this.totalCardsBefore += result2.totalBefore;
					console.log("Loaded", result2.cards.length, "contacts from address book 2");
				} else {
					this.vcards[this.BOOK_2] = this.vcards[this.BOOK_1];
					this.vcardsSimplified[this.BOOK_2] = this.vcardsSimplified[this.BOOK_1];
					console.log("Using same address book for both, total contacts:", this.vcards[this.BOOK_1] ? this.vcards[this.BOOK_1].length : 0);
				}
			} catch (error) {
				console.error("Error reading address books:", error);
				alert("Error loading address books: " + error.message);
			}
		},

		/**
		 * Marks the side specified by 'left' or 'right' as to be kept. Delegates to DuplicateEntriesWindowUI.
		 */
		setContactLeftRight: function(side) {
			DuplicateEntriesWindowUI.setContactLeftRight(this, side);
		},

		/**
		 * Removes all rows (excluding header) from the attribute comparison & edit table.
		 */
		purgeAttributesTable: function() {
			DuplicateEntriesWindowDisplay.purgeAttributesTable(this);
		},

		/**
		 * Returns a table with all editable fields.
		 * The parameter ('left' or 'right') specifies the column of the table to be used.
		 */
		getCardFieldValues: function(side) {
			return DuplicateEntriesWindowDisplay.getCardFieldValues(this, side);
		},

		propertySet: function(card, properties) {
			return DuplicateEntriesWindowCardValues.propertySet(this, card, properties);
		},

		/** Delegates to DuplicateEntriesWindowComparison.compareCards; context is this (window). */
		abCardsCompare: function(c1, c2) {
			return DuplicateEntriesWindowComparison.compareCards(c1, c2, this);
		},

		enable: function(id) {
			DuplicateEntriesWindowUI.enable(id);
		},
		disable: function(id) {
			DuplicateEntriesWindowUI.disable(id);
		},
		show: function(id) {
			DuplicateEntriesWindowUI.show(id);
		},
		hide: function(id) {
			DuplicateEntriesWindowUI.hide(id);
		},
		show_hack: function(id) {
			DuplicateEntriesWindowUI.show_hack(id);
		},
		make_visible: function(id) {
			DuplicateEntriesWindowUI.make_visible(id);
		},
		make_invisible: function(id) {
			DuplicateEntriesWindowUI.make_invisible(id);
		},

		getPrunedProperty: function(card, property) {
			return DuplicateEntriesWindowCardValues.getPrunedProperty(this, card, property);
		},

		createSelectionList: function(cls, labels, values, selected) {
			return DuplicateEntriesWindowUI.createSelectionList(cls, labels, values, selected);
		}
	});
}
