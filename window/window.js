// PORT: Main window logic - ported from duplicateEntriesWindow.js
// ORIGINAL: chrome/content/duplicateEntriesWindow.js
// This file contains the core duplicate detection and UI logic, minimally adapted for WebExtension API

// PORT: Helper functions preserved from original
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

function pushIfNew(elem, array) {
  if (!array.includes(elem))
    array.push(elem);
  return array;
}

// PORT: Main window object - ported from DuplicateEntriesWindow
// ORIGINAL: DuplicateEntriesWindow object in duplicateEntriesWindow.js
var DuplicateEntriesWindow = {
  restart: false,

  // PORT: Replaced nsIAbManager with WebExtension API (accessed via browser API)
  // ORIGINAL: abManager : Components.classes["@mozilla.org/abmanager;1"].getService(Components.interfaces.nsIAbManager),

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

  // PORT: Address book fields - preserved from original
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

  // PORT: All helper functions preserved from original
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
    return result;
  },

  /**
   * PORT: Initialize window - adapted for WebExtension
   * ORIGINAL: init() function in duplicateEntriesWindow.js
   * Changes:
   * - Replaced nsIPrefService with browser.storage.local
   * - Replaced XUL document.getElementById with standard DOM
   * - Replaced address book enumeration with browser.addressBooks.list()
   */
  init: async function() {
    // PORT: Load preferences from browser.storage instead of nsIPrefService
    // ORIGINAL: Components.classes["@mozilla.org/preferences-service;1"].getService(Components.interfaces.nsIPrefService)
    try {
      const prefs = await browser.storage.local.get(null);
      const prefPrefix = "extensions.DuplicateContactsManager.";

      this.autoremoveDups = prefs[prefPrefix + "autoremoveDups"] || false;
      this.preserveFirst = prefs[prefPrefix + "preserveFirst"] || false;
      this.deferInteractive = prefs[prefPrefix + "deferInteractive"] !== false; // default true

      this.natTrunkPrefix = prefs[prefPrefix + "natTrunkPrefix"] || "";
      if (this.natTrunkPrefix) {
        this.natTrunkPrefixReqExp = new RegExp("^"+this.natTrunkPrefix+"([1-9])");
      }

      this.intCallPrefix = prefs[prefPrefix + "intCallPrefix"] || "";
      if (this.intCallPrefix) {
        this.intCallPrefixReqExp = new RegExp("^"+this.intCallPrefix+"([1-9])");
      }

      this.countryCallingCode = prefs[prefPrefix + "countryCallingCode"] || "";

      const ignoreFieldsPref = prefs[prefPrefix + "ignoreFields"];
      if (ignoreFieldsPref && ignoreFieldsPref.length > 0) {
        this.ignoredFields = ignoreFieldsPref.split(/\s*,\s*/);
      } else {
        this.ignoredFields = [...this.ignoredFieldsDefault];
      }
    } catch(e) {
      console.error("Error loading preferences:", e);
      this.ignoredFields = [...this.ignoredFieldsDefault];
    }

    // PORT: Get DOM elements (HTML instead of XUL)
    // ORIGINAL: document.getElementById() for XUL elements
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

    // PORT: Load address books using WebExtension API
    // ORIGINAL: this.abManager.directories enumeration
    try {
      const addressBooks = await browser.addressBooks.list();
      if (!addressBooks || addressBooks.length == 0) {
        this.disable('startbutton');
        this.statustext.className = 'error-message';
        this.statustext.textContent = "No address book found!";
        return;
      }

      // PORT: Populate address book dropdowns
      // ORIGINAL: createSelectionList() with XUL menulist
      const default_abook = addressBooks[0].id;
      if (this.abURI1 == null || this.abURI2 == null) {
        this.abURI1 = this.abURI2 = default_abook;
      }

      const ablists = document.getElementById('addressbooklists');
      const ablist1 = this.createSelectionList('addressbookname',
        addressBooks.map(ab => ab.name),
        addressBooks.map(ab => ab.id),
        this.abURI1);
      const ablist2 = this.createSelectionList('addressbookname',
        addressBooks.map(ab => ab.name),
        addressBooks.map(ab => ab.id),
        this.abURI2);
      ablists.appendChild(ablist1);
      ablists.appendChild(ablist2);

    } catch(e) {
      console.error("Error loading address books:", e);
      this.disable('startbutton');
      this.statustext.className = 'error-message';
      this.statustext.textContent = "Error loading address books: " + e.message;
      return;
    }

    this.statustext.className = '';
    this.statustext.textContent = 'Please press Start.';
    document.getElementById('startbutton').textContent = 'Start';
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

  // PORT: Continue with remaining functions from original...
  // (This is a large file, continuing with key functions)

  OnUnloadWindow: function() {
    this.running = false;
    this.vcards[this.BOOK_1] = null;
    this.vcards[this.BOOK_2] = null;
  },

  // PORT: Helper functions for UI manipulation (HTML instead of XUL)
  enable: function(id) {
    const elem = document.getElementById(id);
    elem.disabled = false;
    elem.classList.remove('disabled');
  },

  disable: function(id) {
    const elem = document.getElementById(id);
    elem.disabled = true;
    elem.classList.add('disabled');
  },

  show: function(id) {
    document.getElementById(id).style.display = '';
  },

  hide: function(id) {
    document.getElementById(id).style.display = 'none';
  },

  make_visible: function(id) {
    document.getElementById(id).style.visibility = 'visible';
  },

  make_invisible: function(id) {
    document.getElementById(id).style.visibility = 'hidden';
  },

  // PORT: Create selection list (HTML select instead of XUL menulist)
  // ORIGINAL: createSelectionList() creates XUL menulist
  createSelectionList: function(cls, labels, values, selected) {
    const select = document.createElement('select');
    if (cls != null) {
      select.className = cls;
    }
    for(let index = 0; index < labels.length; index++) {
      const option = document.createElement('option');
      option.textContent = labels[index];
      option.value = values[index];
      if (values[index] == selected) {
        option.selected = true;
      }
      select.appendChild(option);
    }
    return select;
  },

  // PORT: String bundle access - simplified for WebExtension
  // ORIGINAL: Uses Services.strings or XUL stringbundle
  // For now, using a simple mapping - can be enhanced with proper i18n later
  getString: function(name) {
    // PORT: Simple string mapping - replace with proper i18n if needed
    // ORIGINAL: this.stringBundle.GetStringFromName(name)
    const strings = {
      'cards': 'cards',
      'to_be_kept': 'to be kept',
      'to_be_removed': 'to be removed',
      'pair': 'pair',
      'parity': 'match',
      'of': 'of',
      'noMatch': 'No names, email addresses, and phone numbers to compare',
      'matchFound': 'Match found',
      'SearchingForDuplicates': 'Searching for duplicates...',
      'PleasePressStart': 'Please press Start.',
      'NoABookFound': 'No address book found!',
      'Start': 'Start',
      'Restart': 'Restart',
      'finished': 'Finished',
      'unknown_label': 'unknown',
      'plaintext_label': 'plain text',
      'html_label': 'HTML',
      'false_label': 'no',
      'true_label': 'yes',
      // Property labels
      'PrimaryEmail_label': 'Primary Email',
      'SecondEmail_label': 'Second Email',
      'FirstName_label': 'First Name',
      'LastName_label': 'Last Name',
      'DisplayName_label': 'Display Name',
      'NickName_label': 'Nickname',
      'PhoneticFirstName_label': 'Phonetic First Name',
      'PhoneticLastName_label': 'Phonetic Last Name',
      'SpouseName_label': 'Spouse Name',
      'FamilyName_label': 'Family Name',
      '_AimScreenName_label': 'AIM Screen Name',
      '_GoogleTalk_label': 'Google Talk',
      'CellularNumber_label': 'Mobile Phone',
      'HomePhone_label': 'Home Phone',
      'WorkPhone_label': 'Work Phone',
      'FaxNumber_label': 'Fax Number',
      'PagerNumber_label': 'Pager Number',
      'CellularNumberType_label': 'Mobile Phone Type',
      'HomePhoneType_label': 'Home Phone Type',
      'WorkPhoneType_label': 'Work Phone Type',
      'FaxNumberType_label': 'Fax Number Type',
      'PagerNumberType_label': 'Pager Number Type',
      'HomeAddress_label': 'Home Address',
      'HomeAddress2_label': 'Home Address 2',
      'HomeCity_label': 'Home City',
      'HomeState_label': 'Home State',
      'HomeZipCode_label': 'Home Zip Code',
      'HomeCountry_label': 'Home Country',
      'WorkAddress_label': 'Work Address',
      'WorkAddress2_label': 'Work Address 2',
      'WorkCity_label': 'Work City',
      'WorkState_label': 'Work State',
      'WorkZipCode_label': 'Work Zip Code',
      'WorkCountry_label': 'Work Country',
      'DefaultAddress_label': 'Default Address',
      'JobTitle_label': 'Job Title',
      'Department_label': 'Department',
      'Company_label': 'Company',
      'BirthYear_label': 'Birth Year',
      'BirthMonth_label': 'Birth Month',
      'BirthDay_label': 'Birth Day',
      'WebPage1_label': 'Web Page 1',
      'WebPage2_label': 'Web Page 2',
      'Custom1_label': 'Custom 1',
      'Custom2_label': 'Custom 2',
      'Custom3_label': 'Custom 3',
      'Custom4_label': 'Custom 4',
      'Notes_label': 'Notes',
      'Category_label': 'Category',
      'PhotoURI_label': 'Photo',
      'PhotoType_label': 'Photo Type',
      'PhotoName_label': 'Photo Name',
      'PreferMailFormat_label': 'Preferred Mail Format',
      'AllowRemoteContent_label': 'Allow Remote Content',
      'PreferDisplayName_label': 'Prefer Display Name',
      'CardType_label': 'Card Type',
      'PopularityIndex_label': 'Popularity Index',
      'LastModifiedDate_label': 'Last Modified Date',
      '__Names_label': 'Names',
      '__Emails_label': 'Emails',
      '__PhoneNumbers_label': 'Phone Numbers',
      '__MailListNames_label': 'Mailing Lists'
    };
    // If not found, try to create a readable label from the property name
    if (!strings[name]) {
      // Remove leading underscore and convert to readable format
      let readable = name.replace(/_label$/, '').replace(/^__/, '');
      readable = readable.replace(/([A-Z])/g, ' $1').replace(/^ /, '');
      readable = readable.charAt(0).toUpperCase() + readable.slice(1);
      return readable;
    }
    return strings[name];
  },

  /**
   * PORT: Start search - adapted for async address book loading
   * ORIGINAL: startSearch() in duplicateEntriesWindow.js
   */
  startSearch: async function() {
    if (this.restart) {
      this.restart = false;
      await this.init();
      return;
    }
    const ablist = document.getElementById('addressbooklists');
    const ab1 = ablist.firstChild;
    const ab2 = ab1.nextSibling;
    if (ab1 && ab1.selectedIndex >= 0)
      this.abURI1 = ab1.options[ab1.selectedIndex].value;
    if (ab2 && ab2.selectedIndex >= 0)
      this.abURI2 = ab2.options[ab2.selectedIndex].value;

    // PORT: Get address book info using WebExtension API
    // ORIGINAL: this.abManager.getDirectory(this.abURI1)
    try {
      const addressBooks = await browser.addressBooks.list();
      this.abDir1 = addressBooks.find(ab => ab.id === this.abURI1);
      this.abDir2 = addressBooks.find(ab => ab.id === this.abURI2);

      if (!this.abDir1 || !this.abDir2) {
        alert("Error: Could not find selected address books");
        return;
      }
    } catch(e) {
      alert("Error loading address books: " + e.message);
      return;
    }

    this.autoremoveDups = document.getElementById('autoremove').checked;
    this.preserveFirst = document.getElementById('preservefirst').checked;
    this.deferInteractive = document.getElementById('deferInteractive').checked;
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
    this.consideredFields = this.addressBookFields.filter(x => !this.ignoredFields.includes(x));

    // PORT: Save preferences using browser.storage
    // ORIGINAL: this.prefsBranch.setBoolPref() etc.
    try {
      const prefPrefix = "extensions.DuplicateContactsManager.";
      await browser.storage.local.set({
        [prefPrefix + "autoremoveDups"]: this.autoremoveDups,
        [prefPrefix + "preserveFirst"]: this.preserveFirst,
        [prefPrefix + "deferInteractive"]: this.deferInteractive,
        [prefPrefix + "natTrunkPrefix"]: this.natTrunkPrefix,
        [prefPrefix + "intCallPrefix"]: this.intCallPrefix,
        [prefPrefix + "countryCallingCode"]: this.countryCallingCode,
        [prefPrefix + "ignoreFields"]: this.ignoredFields.join(", ")
      });
    } catch(e) {
      console.error("Error saving preferences:", e);
    }

    // hide intro info, show table, progress, etc.
    this.hide('explanation');
    this.purgeAttributesTable();
    this.hide('endinfo');
    this.show('progressMeter');
    this.statustext.className = 'with-progress';
    this.statustext.textContent = this.getString('SearchingForDuplicates');
    document.getElementById('statusAddressBook1_label').textContent = this.abDir1.name;
    document.getElementById('statusAddressBook2_label').textContent = this.abDir2.name;
    this.updateDeletedInfo('statusAddressBook1_size' , this.BOOK_1, 0);
    this.updateDeletedInfo('statusAddressBook2_size' , this.BOOK_2, 0);
    this.show('statusAddressBook1');
    this.show('statusAddressBook2');
    this.show('stopbutton');
    this.hide('quitbutton');
    this.show('tablepane');

    // re-initialization needed in case of restart:
    while (ablist.firstChild)
      ablist.removeChild(ablist.firstChild);
    this.positionSearch = 0;
    this.position1 = 0;
    this.position2 = (this.abURI1 == this.abURI2 ? 0 : -1);
    this.nowHandling = false;
    this.positionDuplicates = 0;
    this.duplicates = new Array();
    this.totalCardsChanged = 0;
    this.totalCardsSkipped = 0;
    this.totalCardsDeleted1 = 0;
    this.totalCardsDeleted2 = 0;
    this.totalCardsDeletedAuto = 0;

    // PORT: Initialize vcards arrays before calling updateDeletedInfo
    // ORIGINAL: Arrays initialized in readAddressBooks() which was synchronous
    this.vcards[this.BOOK_1] = [];
    this.vcards[this.BOOK_2] = [];
    this.vcardsSimplified[this.BOOK_1] = [];
    this.vcardsSimplified[this.BOOK_2] = [];

    this.updateProgress();
    this.disable('startbutton');
    await this.readAddressBooks();

    // PORT: Update deleted info after contacts are loaded
    // ORIGINAL: updateDeletedInfo called before readAddressBooks (which was sync)
    this.updateDeletedInfo('statusAddressBook1_size' , this.BOOK_1, 0);
    this.updateDeletedInfo('statusAddressBook2_size' , this.BOOK_2, 0);
    this.searchNextDuplicate();
  },

  skipAndSearchNextDuplicate: function() {
    this.totalCardsSkipped++;
    this.searchNextDuplicate();
  },

  /**
   * PORT: Continues searching - preserved from original
   * ORIGINAL: searchNextDuplicate() in duplicateEntriesWindow.js
   */
  searchNextDuplicate: function() {
    this.purgeAttributesTable();
    if (!this.nowHandling) {
      this.disable('skipnextbutton');
      this.disable('keepnextbutton');
      this.disable('applynextbutton');
      // PORT: HTML doesn't have wait-cursor attribute, use CSS class instead
      // ORIGINAL: this.window.setAttribute('wait-cursor', 'true');
      this.window.classList.add('wait-cursor');
      this.statustext.className = 'with-progress';
      this.statustext.textContent = this.getString('SearchingForDuplicates');
    }
    this.updateProgress();
    // starting the search via setTimeout allows redrawing the progress info
    setTimeout(() => { this.searchDuplicateIntervalAction(); }, 13);
  },

  /**
   * PORT: Apply changes and delete - adapted for async WebExtension API
   * ORIGINAL: applyAndSearchNextDuplicate() in duplicateEntriesWindow.js
   */
  applyAndSearchNextDuplicate: async function() {
    // for the case that right one will be kept
    var [deleAbDir, deleBook, deleIndex] = [this.abDir1, this.BOOK_1, this.position1];
    var [keptAbDir, keptBook, keptIndex] = [this.abDir2, this.BOOK_2, this.position2];
    if (this.sideKept == 'left') { // left one will be kept
      [deleAbDir, deleBook, deleIndex, keptAbDir, keptBook, keptIndex] =
      [keptAbDir, keptBook, keptIndex, deleAbDir, deleBook, deleIndex];
    }
    await this.updateAbCard(keptAbDir, keptBook, keptIndex, this.sideKept);
    await this.deleteAbCard(deleAbDir, deleBook, deleIndex, false);
    this.searchNextDuplicate();
  },

  /**
   * PORT: Update contact card - adapted for WebExtension API
   * ORIGINAL: updateAbCard() uses card.setProperty() and abDir.modifyCard()
   */
  updateAbCard: async function(abDir, book, index, side) {
    var card = this.vcards[book][index];


    // see what's been modified
    var updateFields = this.getCardFieldValues(side);
    var entryModified = false;
    var updateProperties = {};

    for(let property in updateFields) {
      const defaultValue = this.defaultValue(property);
      // PORT: Get property value from contact object directly
      // ORIGINAL: card.getProperty(property, defaultValue)
      const currentValue = this.getProperty(card, property);
      const newValue = updateFields[property];
      
      // PORT: Check the actual property value in card.properties
      // Thunderbird stores name fields (FirstName, LastName, etc.) as arrays where
      // each element represents a separate "name component set"
      let actualPropertyValue = null;
      let isArrayProperty = false;
      if (card.properties && card.properties.hasOwnProperty(property)) {
        actualPropertyValue = card.properties[property];
        isArrayProperty = Array.isArray(actualPropertyValue);
      }
      
      // PORT: Always update if values differ, ensuring we replace existing properties
      // ORIGINAL: card.setProperty() would replace the property value
      if (currentValue != newValue) {
        try {
          // PORT: Build properties object for browser.contacts.update()
          // ORIGINAL: card.setProperty(property, updateFields[property])
          // PORT: Temporarily set as string to see what Thunderbird expects
          // We'll fix this based on the logging output
          if (newValue === "" || newValue === null || newValue === undefined) {
            // PORT: For empty values, set to empty string
            updateProperties[property] = "";
          } else {
            // PORT: For non-empty values, set as string
            updateProperties[property] = String(newValue);
          }
          entryModified = true;
        } catch (e) {
          // PORT: Use getProperty for DisplayName access
          const displayName = this.getProperty(card, 'DisplayName') || 'contact';
          alert("Internal error: cannot set field '"+property+"' of "+displayName+": "+e);
        }
      }
    }
    if (entryModified) {
      this.vcardsSimplified[book][index] = null; // request reconstruction by getSimplifiedCard
      try {
        // PORT: Update contact using WebExtension API
        // ORIGINAL: abDir.modifyCard(card)
        await browser.contacts.update(card.id, updateProperties);
        
        // PORT: Reload the updated contact to get fresh data and prevent duplicate properties
        // ORIGINAL: Card object was updated in-place via setProperty
        // PORT: Reload just this contact to ensure we have the correct state after update
        const addressBookId = book === this.BOOK_1 ? this.abURI1 : this.abURI2;
        const contacts = await browser.contacts.list(addressBookId);
        const updatedContact = contacts.find(c => c.id === card.id);
        
        if (updatedContact) {
          // PORT: Process the updated contact to add virtual properties (same as in readAddressBooks)
          const processedContacts = await this.processContacts([updatedContact], addressBookId);
          if (processedContacts.length > 0) {
            // Replace the card in our local array with the freshly loaded one
            this.vcards[book][index] = processedContacts[0];
          }
        }
        
        this.totalCardsChanged++;
      } catch (e) {
        // PORT: Use getProperty for DisplayName access
        const displayName = this.getProperty(card, 'DisplayName') || 'contact';
        alert("Internal error: cannot update card '"+displayName+"': "+e);
      }
    }
  },

  /**
   * PORT: Keep both cards - adapted for async
   * ORIGINAL: keepAndSearchNextDuplicate() in duplicateEntriesWindow.js
   */
  keepAndSearchNextDuplicate: async function() {
    await this.updateAbCard(this.abDir1, this.BOOK_1, this.position1, 'left' );
    await this.updateAbCard(this.abDir2, this.BOOK_2, this.position2, 'right');
    this.searchNextDuplicate();
  },

  /**
   * PORT: Delete contact card - adapted for WebExtension API
   * ORIGINAL: deleteAbCard() uses abDir.deleteCards()
   */
  deleteAbCard: async function(abDir, book, index, auto) {
    var card = this.vcards[book][index];

    try {
      // PORT: Delete contact using WebExtension API
      // ORIGINAL: abDir.deleteCards(deleteCards)
      await browser.contacts.delete(card.id);
      if (abDir.id == this.abDir1.id)
        this.totalCardsDeleted1++;
      else
        this.totalCardsDeleted2++;
      if(auto)
        this.totalCardsDeletedAuto++;
    } catch (e) {
      // PORT: Use getProperty for DisplayName access
      const displayName = this.getProperty(card, 'DisplayName') || 'contact';
      alert("Internal error: cannot remove card '"+displayName+"': "+e);
    }
    this.vcards[book][index] = null; // set empty element, but leave element number as is
  },

  updateDeletedInfo: function (label, book, nDeleted) {
    const cards = this.getString('cards');
    // PORT: Use textContent for HTML elements
    // ORIGINAL: .value for XUL label elements
    const elem = document.getElementById(label);
    if (elem) {
      // PORT: Handle case where vcards[book] is not yet initialized
      // ORIGINAL: readAddressBooks() was synchronous, so arrays always existed
      const vcardsLength = this.vcards[book] ? this.vcards[book].length : 0;
      elem.textContent = '('+cards+': '+ (vcardsLength -
                         (this.abURI1 == this.abURI2 ? this.totalCardsDeleted1 +
                                                       this.totalCardsDeleted2 : nDeleted)) +')';
    }
  },

  updateProgress: function() {
    // update status info - will not be visible immediately during search
    var current, pos, max;
    if(!this.deferInteractive || !this.nowHandling) {
      current = 'pair';
      pos = this.positionSearch + 1;
      const num1 = this.vcards[this.BOOK_1].length;
      const num2 = this.vcards[this.BOOK_2].length;
      max = this.abURI1 == this.abURI2 ? (num1*(num1-1)/2) : (num1*num2);
      if (pos > max) /* happens at end */
        pos = max;
    } else {
      current = 'parity';
      pos = this.positionDuplicates;
      max = this.duplicates.length;
    }
    // PORT: Use .value for progress element (HTML)
    // ORIGINAL: setAttribute('value', ...) for XUL progressmeter
    if (this.progressmeter) {
      this.progressmeter.value = (max == 0 ? 1 : pos/max) * 100;
    }
    if (this.progresstext) {
      this.progresstext.textContent = this.getString(current)+" "+pos+
        " "+this.getString('of')+" "+max;
    }
    this.updateDeletedInfo('statusAddressBook1_size' , this.BOOK_1, this.totalCardsDeleted1);
    this.updateDeletedInfo('statusAddressBook2_size' , this.BOOK_2, this.totalCardsDeleted2);
  },

  /**
   * PORT: Advances internal pointers - preserved exactly from original
   * ORIGINAL: skipPositionsToNext() in duplicateEntriesWindow.js
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
   * PORT: Increments internal pointers - preserved exactly from original
   * ORIGINAL: searchPositionsToNext() in duplicateEntriesWindow.js
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
          if(this.position1 + (this.abURI1 == this.abURI2 ? 1 : 0) >= this.vcards[this.BOOK_1].length)
            return false;
        } while(!this.vcards[this.BOOK_1][this.position1]);

        // if same book, we start searching the pair with the position after.
        this.position2 = (this.abURI1 == this.abURI2 ? this.position1 + 1 : 0);
      }
    } while(!this.vcards[this.BOOK_2][this.position2]);

    return true;
  },

  /**
   * PORT: Performs actual search - preserved exactly from original
   * ORIGINAL: searchDuplicateIntervalAction() in duplicateEntriesWindow.js
   */
  searchDuplicateIntervalAction: function() {
    var lasttime = new Date;
    while (this.skipPositionsToNext()) {
      if ((new Date)-lasttime >= 1000) {
        // Force/enable Thunderbird every 1000 milliseconds to redraw the progress bar etc.
        setTimeout(() => { this.searchDuplicateIntervalAction(); }, 13);
        return;
      }

      var simplified_card1 = this.getSimplifiedCard(this.BOOK_1, this.position1);
      var simplified_card2 = this.getSimplifiedCard(this.BOOK_2, this.position2);
      if (simplified_card1['_AimScreenName'] != simplified_card2['_AimScreenName'])
        continue; // useful for manual differentiation to prevent repeated treatment
      var namesmatch = this.namesMatch(simplified_card1, simplified_card2);
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
            !(this.abURI1 != this.abURI2 && this.preserveFirst && preference < 0)) {
          if (preference < 0)
            this.deleteAbCard(this.abDir1, this.BOOK_1, this.position1, true);
          else // if preference >= 0, prefer to delete c2
            this.deleteAbCard(this.abDir2, this.BOOK_2, this.position2, true);
        } else {
          if (this.deferInteractive && !this.nowHandling) { // append the positions to queue
            this.duplicates.push([this.position1, this.position2]);
          }
          else {
            this.enable('skipnextbutton');
            this.enable('keepnextbutton');
            this.enable('applynextbutton');
            // PORT: Remove wait-cursor class
            // ORIGINAL: this.window.removeAttribute('wait-cursor');
            this.window.classList.remove('wait-cursor');
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
    // PORT: Remove wait-cursor class
    // ORIGINAL: this.window.removeAttribute('wait-cursor');
    this.window.classList.remove('wait-cursor');
    this.statustext.className = 'with-progress';
    this.statustext.textContent = this.getString('finished');

    // show statistics
    var totalCardsDeleted = this.totalCardsDeleted1+this.totalCardsDeleted2;
    // PORT: Use textContent for HTML elements
    // ORIGINAL: .value for XUL elements
    const setValue = (id, val) => {
      const elem = document.getElementById(id);
      if (elem) elem.textContent = val;
    };
    setValue('resultNumBefore', this.totalCardsBefore);
    setValue('resultNumAfter', this.totalCardsBefore - totalCardsDeleted);
    setValue('resultNumRemovedMan', totalCardsDeleted - this.totalCardsDeletedAuto);
    setValue('resultNumRemovedAuto', this.totalCardsDeletedAuto);
    setValue('resultNumChanged', this.totalCardsChanged);
    setValue('resultNumSkipped', this.totalCardsSkipped);
    const setText = (id, val) => {
      const elem = document.getElementById(id);
      if (elem) elem.textContent = val;
    };
    setText('resultConsideredFields', this.consideredFields.
      filter(x => !this.isSet(x) && !this.matchablesList.includes(x)).join(", "));
    setText('resultIgnoredFields', this.ignoredFields.join(", "));
    setText('resultDiffProps', this.nonequivalentProperties.join(", "));
    this.hide('stopbutton');
    this.show('quitbutton');
    this.show('endinfo');

    document.getElementById('startbutton').textContent = this.getString('Restart');
    this.enable('startbutton');
    this.restart = true;
  },

  /**
   * PORT: Get property from contact - adapted for WebExtension contact objects
   * ORIGINAL: getProperty() uses card.getProperty()
   */
  getProperty: function(card, property) { /* sets are treated as strings here */
    const defaultValue = this.defaultValue(property);
    // PORT: WebExtension contacts store properties in card.properties object
    // ORIGINAL: card.getProperty(property, defaultValue)
    let value = defaultValue;
    // Check properties object first (WebExtension API format)
    if (card.properties && card.properties[property] !== undefined && card.properties[property] !== null) {
      value = card.properties[property];
    } else if (card[property] !== undefined && card[property] !== null) {
      // Fallback to direct property access (for top-level properties like id)
      value = card[property];
    }
    if (this.isSelection(property) && value == "")
      return defaultValue; // recover from wrongly empty field
    if (this.isSet(property)) /* used for '__MailListNames' */
      return value.toString();
    if (property == 'LastModifiedDate') {
      // PORT: LastModifiedDate handling - may need adjustment for WebExtension format
      // ORIGINAL: value == "0" ? "" : new Date(value * 1000).toLocaleString()
      if (value == "0" || value == 0 || !value)
        return "";
      // Try to handle both timestamp (seconds) and Date objects
      const dateValue = typeof value === 'number' ? value * 1000 : value;
      return new Date(dateValue).toLocaleString();
    }
    if (property == 'PhotoURI' && value == 'chrome://messenger/skin/addressbook/icons/contact-generic.png')
      return defaultValue;
    return String(value); // force string even when isSelection or isNumerical
  },

  /**
   * PORT: Transform middle/prefix names - preserved exactly from original
   * ORIGINAL: transformMiddlePrefixName() in duplicateEntriesWindow.js
   */
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
    while ((p = fn.match(/^(.+)\s(von|van|und|and|fÃ¼r|for|zum|zur|der|de|geb|ben)\s*$/))) {
      fn = p[1];
      nameprefixes = p[2]+" "+nameprefixes;
    }
    fn = fn.replace(/^\s+/, "").replace(/\s+$/, "") + middlenames;
    ln = nameprefixes + ln.replace(/^\s+/, "").replace(/\s+$/, "");
    return [fn, ln];
  },

  /**
   * PORT: Get transformed property - preserved exactly from original
   * ORIGINAL: getTransformedProperty() in duplicateEntriesWindow.js
   */
  getTransformedProperty: function(card, property) {
    // first step: pruning
    var value = this.getPrunedProperty(card, property);

    // second step: transformation
    if (this.isFirstLastDisplayName(property)) {
      var p;
      if (property == 'DisplayName') {
        // correct order of first and last name
        if ((p = value.match(/^([^,]+),\s+(.+)$/))) {
          var [fn, ln] = this.transformMiddlePrefixName(p[2], p[1]);
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
   * PORT: Get simplified card - adapted for WebExtension contact objects
   * ORIGINAL: getSimplifiedCard() uses card.QueryInterface()
   */
  getSimplifiedCard: function(book, i) {
    if (!this.vcardsSimplified[book][i] && this.vcards[book][i]) {
      // PORT: Contact object used directly (no QueryInterface needed)
      // ORIGINAL: var card = this.vcards[book][i].QueryInterface(Components.interfaces.nsIAbCard);
      var card = this.vcards[book][i];
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
   * PORT: Display card data - adapted for HTML elements
   * ORIGINAL: displayCardData() uses XUL elements
   */
  displayCardData: function(card1, card2, comparison, preference,
                  namesmatch, mailsmatch, phonesmatch) {
    this.purgeAttributesTable();
    this.displayedFields = new Array();
    this.editableFields = new Array();
    this.make_visible('tableheader');
    const cardsEqu = document.getElementById('cardsEqu');
    // PORT: Use textContent for HTML
    // ORIGINAL: .value for XUL description
    if (cardsEqu) {
      // PORT: Use proper Unicode symbols for comparison indicators (using createTextNode for reliable rendering)
      // ORIGINAL: Uses Unicode symbols in XUL
      // Clear existing content
      cardsEqu.textContent = '';
      if (comparison != -2) {
        const symbol = comparison == 0 ? String.fromCharCode(0x2248) :  // ≈ approximately equal (U+2248)
                       comparison <  0 ? String.fromCharCode(0x2282) : String.fromCharCode(0x2283);  // ⊂ subset (U+2282) / ⊃ superset (U+2283)
        cardsEqu.appendChild(document.createTextNode(symbol));
      }
    }

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
      // PORT: Create HTML table row instead of XUL row
      // ORIGINAL: var row = document.createElement('row');
      var row = document.createElement('tr');
      // PORT: Create HTML label/span instead of XUL label
      // ORIGINAL: var labelcell = document.createElement('label');
      var labelcell = document.createElement('td');
      var localName = property;
      try {
        localName = this.getString(property + '_label');
      }
      catch (e) {
        // ignore
      }
      // PORT: Use textContent for HTML
      // ORIGINAL: labelcell.setAttribute('value', localName + ':');
      labelcell.textContent = localName + ':';
      labelcell.setAttribute('class', 'field');
      row.appendChild(labelcell);
      if (this.matchablesList.includes(property)) {
        const cell1 = document.createElement('td');
        const cellEqu = document.createElement('td');
        const descEqu = document.createElement('span');
        cellEqu.className = 'equivalence';
        cellEqu.appendChild(descEqu);
        if (namesmatch && property == '__Names' ||
            mailsmatch && property == '__Emails' ||
            phonesmatch && property == '__PhoneNumbers')
          // PORT: Use proper Unicode symbol for matchable property matches (using String.fromCharCode for reliable rendering)
          descEqu.textContent = String.fromCharCode(0x2261); /* ≡ matchable property matches (identical, U+2261) */
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

  /**
   * PORT: Set relation for sets - preserved exactly from original
   * ORIGINAL: SetRelation() in duplicateEntriesWindow.js
   */
  SetRelation: function(card1, card2, property) {
    const defaultValue_Set = new Set(); /* should not really be needed here */
    // PORT: Get property value - may need adjustment for WebExtension contact objects
    // ORIGINAL: card1.getProperty(property, defaultValue_Set)
    const value1 = card1[property] || defaultValue_Set;
    const value2 = card2[property] || defaultValue_Set;
    // Ensure we have Set objects
    const set1 = value1 instanceof Set ? value1 : new Set(value1 ? [value1] : []);
    const set2 = value2 instanceof Set ? value2 : new Set(value2 ? [value2] : []);
    const both_empty = set1.size == 0 && set2.size == 0;
    let equ;
    if (set1.isSuperset(set2)) {
      if (set2.isSuperset(set1))
        equ = String.fromCharCode(0x2245); // ≅ approximately equal to (U+2245)
      else
        equ = String.fromCharCode(0x2287); // ⊇ superset of or equal to (U+2287)
    } else {
      if (set2.isSuperset(set1))
        equ = String.fromCharCode(0x2286); // ⊆ subset of or equal to (U+2286)
      else
        equ = '';
    }
    return [both_empty, equ];
  },

  /**
   * PORT: Display card field - adapted for HTML elements
   * ORIGINAL: displayCardField() uses XUL elements (hbox, textbox, menulist, etc.)
   */
  displayCardField: function(card1, card2, defaultValue, leftValue, rightValue, property, row) {
    this.displayedFields.push(property);
    var editable = property != 'PhotoURI' && !this.isSet(property) && property != 'LastModifiedDate';
    if (editable) {
      // save field in list for later retrieval if edited values
      pushIfNew(property, this.editableFields);
    }

    // PORT: Create HTML div instead of XUL hbox
    // ORIGINAL: const cell1 = document.createElement('hbox');
    const cell1 = document.createElement('td');
    const cell2 = document.createElement('td');
    const cellEqu = document.createElement('td');
    const descEqu = document.createElement('span');
    cellEqu.className = 'equivalence';
    cellEqu.appendChild(descEqu);

    // highlight values that differ; show equality or equivalence
    var identical = true;
    let equ = String.fromCharCode(0x2261); // ≡ default value indicates identical values (U+2261)
    var both_empty = 0;
    if (this.isSet(property)) { /* used for '__MailListNames' */
      [both_empty, equ] = this.SetRelation(card1, card2, property);
      identical = equ == String.fromCharCode(0x2245); // ≅ approximately equal to (U+2245)
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
        // PORT: Use proper Unicode symbols for equivalence indicators (using String.fromCharCode for reliable rendering)
        if      (value1 == value2)
          equ = String.fromCharCode(0x2248); // ≈ equivalent (approximately equal, U+2248)
        else if (value1 == defaultValue)
          equ = String.fromCharCode(0x2282); // ⊂ subset (U+2282)
        else if (value2 == defaultValue)
          equ = String.fromCharCode(0x2283); // ⊃ superset (U+2283)
        else if (this.isText(property)) {
          if      (value2.includes(value1))
            equ = '<';
          else if (value1.includes(value2)) // value2 is substring of value1
            equ = '>';
          else
            equ = ''; // incomparable
        }
        else if (this.isNumerical(property)) {
          // PORT: Get property value directly
          // ORIGINAL: card1.getProperty(property, 0)
          const val1 = Number(card1[property] || 0);
          const val2 = Number(card2[property] || 0);
          const comparison = val1 - val2;
          if      (comparison < 0)
            equ = '<';
          else if (comparison > 0)
            equ = '>';
          else
            equ = String.fromCharCode(0x2261); // ≡ identical to (U+2261)
        }
        else
          equ = '';
      }
    }
    // only non-identical and not set-equal properties should be highlighted by color
    if (!identical) {
      cell1.className = this.sideKept == 'left' ? 'keep' : 'remove';
      cell2.className = this.sideKept == 'left' ? 'remove' : 'keep';
    }
    if (both_empty)
      equ = '';
    if (equ != '' &&
        (property == 'SecondEmail' || /* all but first email address/phone number */
         property != 'CellularNumber' && this.isPhoneNumber(property)))
      equ = String.fromCharCode(0x22EE); // ⋮ vertical ellipsis (U+22EE) - sets displayed over multiple lines lead to multiple lines with same symbol
    descEqu.textContent = equ;

    // create input/display fields, depending on field type
    let cell1valuebox;
    let cell2valuebox;

    if (property == 'PhotoURI') {
      descEqu.style.marginTop = '1em'; // move a bit lower
      // PORT: Create HTML img instead of XUL image
      // ORIGINAL: cell1valuebox = document.createElement('image');
      cell1valuebox = document.createElement('img');
      cell2valuebox = document.createElement('img');
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
        // PORT: Create HTML input/textarea/span instead of XUL textbox/label/description
        // ORIGINAL: document.createElement('textbox') or 'label' or 'description'
        const valuebox = editable ? (property == 'Notes' ? document.createElement('textarea') : document.createElement('input')) :
                       property == '__MailListNames' ? document.createElement('span')
                                                     : document.createElement('span');
        if (editable && property != 'Notes') {
          valuebox.type = 'text';
        }
        valuebox.className = 'textbox';
        if (property == '__MailListNames') {
          valuebox.textContent = value;
        }
        else {
          valuebox.value = value;
        }
        return valuebox;
      }
      cell1valuebox = make_valuebox( leftValue);
      cell2valuebox = make_valuebox(rightValue);
    }

    // PORT: HTML elements don't use flex attribute - width is controlled by CSS
    // ORIGINAL: cell1valuebox.setAttribute('flex', '2');
    // No need to set flex on table cell children - width is controlled by CSS
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
      // PORT: Remove flex for images
      // ORIGINAL: cell1valuebox.setAttribute('flex', "");
      cell1valuebox.style.flex = '';
      cell2valuebox.style.flex = '';
      // PORT: Use src for HTML img
      // ORIGINAL: cell1valuebox.src=card1.getProperty('PhotoURI', "");
      cell1valuebox.src = this.getProperty(card1, 'PhotoURI') || '';
      cell2valuebox.src = this.getProperty(card2, 'PhotoURI') || '';
      /* actual image will be loaded asynchronously */
    }
  },

  /**
   * PORT: Check if no mails/phones match - preserved exactly from original
   * ORIGINAL: noMailsPhonesMatch() in duplicateEntriesWindow.js
   */
  noMailsPhonesMatch: function(vcard) {
    // strings are already abstracted, e.g., normalized to lowercase
    // numbers are already abstracted, e.g., non-digits are stripped
    return vcard['PrimaryEmail'] == "" && vcard['SecondEmail'] == "" &&
           vcard['Phone1'] == "" && vcard['Phone2'] == "" && vcard['Phone3'] == "";
  },

  /**
   * PORT: Check if no names match - preserved exactly from original
   * ORIGINAL: noNamesMatch() in duplicateEntriesWindow.js
   */
  noNamesMatch: function(vcard) {
    // strings are already abstracted, e.g., normalized to lowercase
    // numbers are already abstracted, e.g., non-digits are stripped
    return vcard[  'FirstName'] == "" && vcard['LastName'] == "" &&
           vcard['DisplayName'] == "" && vcard['_AimScreenName'] == "";
  },

  /**
   * PORT: Check if phones match - preserved exactly from original
   * ORIGINAL: phonesMatch() in duplicateEntriesWindow.js
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
   * PORT: Check if emails match - preserved exactly from original
   * ORIGINAL: mailsMatch() in duplicateEntriesWindow.js
   */
  mailsMatch: function(vcard1, vcard2) {
    // strings are already abstracted, e.g., normalized to lowercase
    var [a1, a2] = [vcard1['PrimaryEmail'], vcard1['SecondEmail']];
    var [b1, b2] = [vcard2['PrimaryEmail'], vcard2['SecondEmail']];
    return ((a1 != "" && (a1 == b1 || a1 == b2)) ||
            (a2 != "" && (a2 == b1 || a2 == b2)) );
  },

  /**
   * PORT: Complete first/last/display name - preserved exactly from original
   * ORIGINAL: completeFirstLastDisplayName() in duplicateEntriesWindow.js
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
   * PORT: Compare names - preserved exactly from original
   * ORIGINAL: namesMatch() in duplicateEntriesWindow.js
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

  /**
   * PORT: Read address books - adapted for async WebExtension API
   * ORIGINAL: readAddressBooks() uses getAllAbCards() with synchronous directory access
   */
  readAddressBooks: async function() {
    // PORT: Check if address book is a mailing list (may need adjustment)
    // ORIGINAL: this.abDir1.isMailList
    // Note: WebExtension API may not expose isMailList directly
    try {
      // PORT: Load contacts using WebExtension API
      // ORIGINAL: this.getAllAbCards(this.abDir1) with synchronous directory.childCards
      const contacts1 = await browser.contacts.list(this.abURI1);
      this.vcards[this.BOOK_1] = await this.processContacts(contacts1, this.abURI1);
      this.vcardsSimplified[this.BOOK_1] = new Array();
      this.totalCardsBefore = this.vcards[this.BOOK_1].length;
    } catch(e) {
      console.error("Error loading contacts from address book 1:", e);
      this.vcards[this.BOOK_1] = [];
      this.vcardsSimplified[this.BOOK_1] = [];
      this.totalCardsBefore = 0;
    }

    if (this.abURI2 != this.abURI1) {
      // we compare two (different) address books
      try {
        const contacts2 = await browser.contacts.list(this.abURI2);
        this.vcards[this.BOOK_2] = await this.processContacts(contacts2, this.abURI2);
        this.vcardsSimplified[this.BOOK_2] = new Array();
        this.totalCardsBefore += this.vcards[this.BOOK_2].length;
      } catch(e) {
        console.error("Error loading contacts from address book 2:", e);
        this.vcards[this.BOOK_2] = [];
        this.vcardsSimplified[this.BOOK_2] = [];
      }
    }
    else {
      // we operate on a single address book
      this.vcards[this.BOOK_2] =  this.vcards[this.BOOK_1];
      this.vcardsSimplified[this.BOOK_2] = this.vcardsSimplified[this.BOOK_1];
    }
  },

  /**
   * PORT: Process contacts - replaces getAllAbCards() for WebExtension API
   * ORIGINAL: getAllAbCards() uses directory.childCards enumerator
   * This function processes contacts and adds virtual properties (__NonEmptyFields, __CharWeight, etc.)
   */
  processContacts: async function(contacts, addressBookId) {
    // PORT: Process contacts from WebExtension API
    // ORIGINAL: Processes nsIAbCard objects from directory.childCards
    var abCards = [];
    // Note: Mailing lists may not be directly accessible via WebExtension API
    // This is a limitation - mailing list membership tracking may not work
    let mailLists = [];

    for(let i = 0; i < contacts.length; i++) {
      const abCard = contacts[i];

      // calculate nonemptyFields and charWeight
      var nonemptyFields = 0;
      var charWeight = 0;
      for(let index = 0; index < this.consideredFields.length; index++) {
        const property = this.consideredFields[index];
        if (this.isNumerical(property))
          continue; /* ignore PopularityIndex, LastModifiedDate and other integers */
        // PORT: Use getProperty helper to access properties correctly
        // ORIGINAL: abCard.getProperty(property, defaultValue)
        const value = this.getProperty(abCard, property);
        const defaultValue = this.defaultValue(property);
        if (value != defaultValue)
          nonemptyFields += 1;
        if (this.isText(property) || this.isEmail(property) || this.isPhoneNumber(property)) {
          charWeight += this.charWeight(String(value), property);
        }
      }
      // PORT: Store virtual properties directly on contact object
      // ORIGINAL: abCard.setProperty('__NonEmptyFields', nonemptyFields)
      abCard.__NonEmptyFields = nonemptyFields;
      abCard.__CharWeight = charWeight;

      // record all mailing lists that the card belongs to
      // PORT: Mailing list membership - may not be available in WebExtension API
      // ORIGINAL: Checks mailLists array populated from directory
      var mailListNames = new Set();
      // PORT: Use getProperty to access PrimaryEmail correctly
      // ORIGINAL: abCard.primaryEmail
      const email = this.getProperty(abCard, 'PrimaryEmail'); // only this email address is relevant
      if (email)
        mailLists.forEach(function ([displayName, primaryEmails]) {
          if (primaryEmails.includes(email))
            mailListNames.add(displayName);
        })
      abCard.__MailListNames = mailListNames;

      // set further virtual properties
      // treat email addresses as a set
      abCard.__Emails = this.propertySet(abCard, ['PrimaryEmail', 'SecondEmail']);
      // treat phone numbers as a set
      abCard.__PhoneNumbers = this.propertySet(abCard, ['HomePhone', 'WorkPhone',
                                    'FaxNumber', 'PagerNumber', 'CellularNumber']);

      abCards.push(abCard);
    }
    return abCards;
  },

  /**
   * PORT: Set contact left/right - adapted for HTML elements
   * ORIGINAL: setContactLeftRight() uses XUL radio button attributes
   */
  setContactLeftRight: function(side) {
    if (!side)
      // PORT: Check radio button checked state (HTML)
      // ORIGINAL: keepLeftRadioButton.getAttribute('selected') == 'true'
      side = this.keepLeftRadioButton.checked ? 'right' : 'left';
    if (side != this.sideKept) {
      this.sideKept = side;
      const other = side == 'right' ? 'left' : 'right';
      const to_be_kept    = this.getString('to_be_kept');
      const to_be_removed = this.getString('to_be_removed');
      // PORT: Update label text (HTML)
      // ORIGINAL: this.keepLeftRadioButton.label = ...
      const leftLabel = this.keepLeftRadioButton.nextElementSibling || this.keepLeftRadioButton.parentElement.querySelector('label');
      const rightLabel = this.keepRightRadioButton.nextElementSibling || this.keepRightRadioButton.parentElement.querySelector('label');
      if (leftLabel) leftLabel.textContent = side == 'right' ? to_be_removed : to_be_kept;
      if (rightLabel) rightLabel.textContent = side == 'right' ? to_be_kept : to_be_removed;
      // PORT: Set checked state (HTML)
      // ORIGINAL: setAttribute('selected', ...)
      this.keepLeftRadioButton.checked = side != 'right';
      this.keepRightRadioButton.checked = side == 'right';
      document.getElementById('headerLeft' ).className = side == 'right' ? 'remove' : 'keep';
      document.getElementById('headerRight').className = side == 'right' ? 'keep': 'remove';
      for(let index = 0; index < this.displayedFields.length; index++) {
        var cell1 = document.getElementById('cell_' + side  + '_' + this.displayedFields[index]);
        var cell2 = document.getElementById('cell_' + other + '_' + this.displayedFields[index]);
        if (cell1 && cell1.className == 'remove')
          cell1.className = 'keep';
        if (cell2 && cell2.className == 'keep')
          cell2.className = 'remove';
      }
    }
  },

  /**
   * PORT: Purge attributes table - adapted for HTML table
   * ORIGINAL: purgeAttributesTable() removes XUL row elements
   */
  purgeAttributesTable: function() {
    this.make_invisible('tableheader');
    // PORT: Remove HTML table rows
    // ORIGINAL: Removes XUL row elements via firstChild.nextSibling
    while(this.attributesTableRows.children.length > 1) {
      this.attributesTableRows.removeChild(this.attributesTableRows.lastChild);
    }
    this.displayedFields = null;
    this.editableFields = null;
  },

  /**
   * PORT: Get card field values - adapted for HTML inputs
   * ORIGINAL: getCardFieldValues() reads from XUL textbox/menulist
   */
  getCardFieldValues: function(side) {
    var result = new Object();
    for(let index = 0; index < this.editableFields.length; index++) {
      // valuebox id is like this: 'left_FieldName'
      const id = side + '_' + this.editableFields[index];
      const valuebox = document.getElementById(id);
      if (!valuebox) continue;
      // PORT: Get value from HTML input/select/textarea
      // ORIGINAL: valuebox.selectedItem ? valuebox.selectedItem.value : valuebox.value
      const value = valuebox.tagName === 'SELECT' ? valuebox.options[valuebox.selectedIndex]?.value : valuebox.value;
      result[this.editableFields[index]] = value;
    }
    return result;
  },

  /**
   * PORT: Property set - preserved exactly from original
   * ORIGINAL: propertySet() in duplicateEntriesWindow.js
   */
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
   * PORT: Property union - adapted for WebExtension contact objects
   * ORIGINAL: propertyUnion() uses card.properties enumerator
   */
  propertyUnion: function(c1, c2) {
    var union = new Array();
    // PORT: Get all properties from contact objects (keys)
    // ORIGINAL: c1.properties enumerator
    const props1 = Object.keys(c1);
    const props2 = Object.keys(c2);
    for(let prop of props1) {
      pushIfNew(prop, union);
    }
    for(let prop of props2) {
      pushIfNew(prop, union);
    }
    return union;
  },

  /**
   * PORT: Compare cards - adapted for WebExtension contact objects
   * ORIGINAL: abCardsCompare() uses card.getProperty()
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
        // PORT: Get Set property directly
        // ORIGINAL: c1.getProperty(property, defaultValue)
        value1 = c1[property] || defaultValue;
        value2 = c2[property] || defaultValue;
        // Ensure Set objects
        if (!(value1 instanceof Set)) value1 = new Set(value1 ? [value1] : []);
        if (!(value2 instanceof Set)) value2 = new Set(value2 ? [value2] : []);
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

        if (!c1_less_complete && !c2_less_complete)
          continue; // already clear that cards are incomparable

        // TODO combine these comparisons with those in displayCardField
        if (this.isText(property)) {
          if (!value2.includes(value1)) // value1 is substring of value2
            c1_less_complete = false;
          if (!value1.includes(value2)) // value2 is substring of value1
            c2_less_complete = false;
        } else if (this.isSet(property)) { /* used for __MailListNames */
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
    if (c1_less_complete != c2_less_complete) {
      var comparison = c1_less_complete ? -1 : 1;
      var preference = comparison;
    } else {
      var comparison = c1_less_complete ? 0/* equivalent */ : -2/* incomparable */;
      /*
       * in case of equivalence and also if incomparable
       * determine some preference for deletion for one card of matching pairs,
       * using those non-ignored properties satisfying this.isNumerical()
       */
      // PORT: Get virtual properties directly
      // ORIGINAL: c1.getProperty('__NonEmptyFields', 0)
      var preference = (c1.__NonEmptyFields || 0) - (c2.__NonEmptyFields || 0);
      if (preference == 0)
        preference = (c1.__CharWeight || 0) - (c2.__CharWeight || 0);
      if (preference == 0) {
        // PORT: Use getProperty to access PopularityIndex correctly
        const pop1 = Number(this.getProperty(c1, 'PopularityIndex')) || 0;
        const pop2 = Number(this.getProperty(c2, 'PopularityIndex')) || 0;
        preference = pop1 - pop2;
      }
      if (preference == 0) {
        // PORT: LastModifiedDate handling
        // ORIGINAL: c1.getProperty('LastModifiedDate', 0)
        // PORT: Use getProperty to access LastModifiedDate correctly
        const lastMod1 = this.getProperty(c1, 'LastModifiedDate');
        const lastMod2 = this.getProperty(c2, 'LastModifiedDate');
        const date1 = lastMod1 ? (typeof lastMod1 === 'number' ? lastMod1 : new Date(lastMod1).getTime() / 1000) : 0;
        const date2 = lastMod2 ? (typeof lastMod2 === 'number' ? lastMod2 : new Date(lastMod2).getTime() / 1000) : 0;
        if (date1 != 0 && date2 != 0)
          preference = date1 - date2;
      }
    }
    return [comparison, preference];
  },

  /**
   * PORT: Show/hide hack - preserved from original
   * ORIGINAL: show_hack() in duplicateEntriesWindow.js
   */
  show_hack: function(id) {
    // PORT: Use inline-block for HTML (similar to -moz-inline-stack)
    // ORIGINAL: document.getElementById(id).style.display='-moz-inline-stack';
    document.getElementById(id).style.display='inline-block';
  },

  /**
   * PORT: Prune text - preserved exactly from original
   * ORIGINAL: pruneText() in duplicateEntriesWindow.js
   */
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

  /**
   * PORT: Get pruned property - preserved exactly from original
   * ORIGINAL: getPrunedProperty() in duplicateEntriesWindow.js
   */
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
    return value;
  },

  /**
   * PORT: Abstract text - preserved exactly from original
   * ORIGINAL: abstract() in duplicateEntriesWindow.js
   */
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
      text = text.replace(/[Ã„Ã†Ã¤Ã¦Ç¼Ç½]/g, 'ae')
             .replace(/[Ã–Ã¶Å’Å“]/g, 'oe')
             .replace(/[ÃœÃ¼]/g, 'ue')
             .replace(/[ÃŸ]/g, 'ss')
             .replace(/[Ä²Ä³]/g, 'ij');

    // fourth step: simplification
    if (this.isText(property))
      text = this.simplifyText(text);
    if (this.isPhoneNumber(property)) {
      if (this.natTrunkPrefix != "" && this.countryCallingCode != "" && text.match(this.natTrunkPrefixReqExp))
        text = this.countryCallingCode+text.substr(this.natTrunkPrefix.length);
      if (this.intCallPrefix != "" && text.match(this.intCallPrefixReqExp))
        text = '+'+text.substr(this.intCallPrefix.length);
    }
    return text;
  },

  /**
   * PORT: Simplify text - preserved exactly from original
   * ORIGINAL: simplifyText() in duplicateEntriesWindow.js
   */
  simplifyText : function(text) {
    return text
    // remove punctuation
      .replace(/[\"\'\-_:,;\.\!\?\&\+]+/g, '')

    // replace funny letters
      .replace(/[Ã‚ÃÃ€ÃƒÃ…Ã¢Ã¡Ã Ã£Ã¥Ä€ÄÄ‚ÄƒÄ„Ä…ÇºÇ»]/g, 'a')
      .replace(/[ÃŠÃ‰ÃˆÃ‹Ã¨Ã©ÃªÃ«Ä’Ä“Ä”Ä•Ä–Ä—Ä˜Ä™ÄšÄ›]/g, 'e')
      .replace(/[ÃŒÃÃŽÃÃ¬Ã­Ã®Ã¯Ä¨Ä©ÄªÄ«Ä¬Ä­Ä®Ä¯Ä°Ä±]/g, 'i')
      .replace(/[Ã•Ã˜Ã’Ã“Ã”Ã²Ã³Ã´ÃµÃ¸ÅŒÅÅŽÅÅÅ‘Ç¾Ç¿]/g, 'o')
      .replace(/[Ã™ÃšÃ›Ã¹ÃºÃ»Å¨Å©ÅªÅ«Å¬Å­Å®Å¯Å°Å±Å²Å³Æ¡Æ¯Æ°]/g, 'u')
      .replace(/[ÃÃ½Ã¿Å¶Å·Å¸]/g, 'y')

      .replace(/[Ã‡Ã§Ä†Ä‡ÄˆÄ‰ÄŠÄ‹ÄŒÄ]/g, 'c')
      .replace(/[ÃÃ°ÄŽÄÄ‘]/g, 'd')
      .replace(/[ÄœÄÄžÄŸÄ Ä¡Ä¢Ä£]/g, 'g')
      .replace(/[Ä¤Ä¥Ä¦Ä§]/g, 'h')
      .replace(/[Ä´Äµ]/g, 'j')
      .replace(/[Ä¶Ä·Ä¸]/g, 'k')
      .replace(/[Ä¹ÄºÄ»Ä¼Ä¿Å€ÅÅ‚]/g, 'l')
      .replace(/[Ã‘Ã±ÅƒÅ„Å…Å†Å‡ÅˆÅ‰ÅŠÅ‹]/g, 'n')
      .replace(/[Å”Å•Å–Å—Å˜Å™]/g, 'r')
      .replace(/[ÅšÅ›ÅœÅÅžÅŸÅ Å¡]/g, 's')
      .replace(/[Å¢Å£Å¤Å¥Å¦Å§]/g, 't')
      .replace(/[Å´Åµ]/g, 'w')
      .replace(/[Å¹ÅºÅ»Å¼Å½Å¾]/g, 'z')

    // remove any (newly produced) leading or trailing whitespace
      .replace(/^\s+/, "")
      .replace(/\s+$/, "");
  }
};
// PORT: Initialize when window loads
// ORIGINAL: onload="DuplicateEntriesWindow.init()" in XUL
window.addEventListener('DOMContentLoaded', () => {
  DuplicateEntriesWindow.init();

  // PORT: Attach event listeners to buttons (CSP-compliant, no inline handlers)
  // ORIGINAL: onclick="..." attributes in XUL
  document.getElementById('startbutton').addEventListener('click', () => {
    DuplicateEntriesWindow.startSearch();
  });

  document.getElementById('skipnextbutton').addEventListener('click', () => {
    DuplicateEntriesWindow.skipAndSearchNextDuplicate();
  });

  document.getElementById('keepnextbutton').addEventListener('click', () => {
    DuplicateEntriesWindow.keepAndSearchNextDuplicate();
  });

  document.getElementById('applynextbutton').addEventListener('click', () => {
    DuplicateEntriesWindow.applyAndSearchNextDuplicate();
  });

  document.getElementById('stopbutton').addEventListener('click', () => {
    DuplicateEntriesWindow.endSearch();
  });

  document.getElementById('quitbutton').addEventListener('click', () => {
    window.close();
  });

  // PORT: Attach event listeners to header cells for contact selection
  const headerLeft = document.getElementById('headerLeft');
  const headerRight = document.getElementById('headerRight');
  if (headerLeft) {
    headerLeft.addEventListener('click', () => {
      DuplicateEntriesWindow.setContactLeftRight('left');
    });
  }
  if (headerRight) {
    headerRight.addEventListener('click', () => {
      DuplicateEntriesWindow.setContactLeftRight('right');
    });
  }

  // PORT: Attach event listeners to radio buttons
  const keepLeft = document.getElementById('keepLeft');
  const keepRight = document.getElementById('keepRight');
  if (keepLeft) {
    keepLeft.addEventListener('change', () => {
      if (keepLeft.checked) {
        DuplicateEntriesWindow.setContactLeftRight('left');
      }
    });
  }
  if (keepRight) {
    keepRight.addEventListener('change', () => {
      if (keepRight.checked) {
        DuplicateEntriesWindow.setContactLeftRight('right');
      }
    });
  }
});

window.addEventListener('beforeunload', () => {
  DuplicateEntriesWindow.OnUnloadWindow();
});
