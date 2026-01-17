"use strict";

/**
 * Duplicate Contacts Finder - Core logic ported from legacy add-on
 * Ported from Thunderbird 68 to Thunderbird 128+
 * Original code: https://github.com/DDvO/Duplicate-Contacts-Manager
 */

// Helper: Set.prototype.isSuperset
Set.prototype.isSuperset = function(other) {
  for (let elem of other) {
    if (!this.has(elem)) {
      return false;
    }
  }
  return true;
};

Set.prototype.toString = function() {
  return "{" + Array.from(this).join(", ") + "}";
};

function pushIfNew(elem, array) {
  if (!array.includes(elem)) {
    array.push(elem);
  }
  return array;
}

class DuplicateFinder {
  constructor() {
    // Constants for address book indices
    this.BOOK_1 = 0;
    this.BOOK_2 = 1;

    // Address book fields
    this.addressBookFields = [
      'PhotoURI', 'PhotoType', 'PhotoName',
      'NickName', '__Names', 'FirstName', 'PhoneticFirstName', 'LastName', 'PhoneticLastName',
      'SpouseName', 'FamilyName', 'DisplayName', '_PhoneticName', 'PreferDisplayName',
      '_AimScreenName', '_GoogleTalk', 'CardType', 'Category', 'AllowRemoteContent',
      'PreferMailFormat', '__MailListNames',
      '__Emails', 'DefaultEmail',
      'PrimaryEmail',
      'SecondEmail',
      '__PhoneNumbers', 'CellularNumber', 'CellularNumberType', 'HomePhone', 'HomePhoneType',
      'WorkPhone', 'WorkPhoneType', 'FaxNumber', 'FaxNumberType', 'PagerNumber', 'PagerNumberType',
      'DefaultAddress',
      'HomeAddress', 'HomeAddress2', 'HomeCity', 'HomeState', 'HomeZipCode', 'HomeCountry',
      'WorkAddress', 'WorkAddress2', 'WorkCity', 'WorkState', 'WorkZipCode', 'WorkCountry',
      'JobTitle', 'Department', 'Company',
      'BirthYear', 'BirthMonth', 'BirthDay',
      'WebPage1', 'WebPage2',
      'Custom1', 'Custom2', 'Custom3', 'Custom4', 'Notes',
      'PopularityIndex', 'LastModifiedDate',
      'UID', 'UUID', 'CardUID',
      'groupDavKey', 'groupDavVersion', 'groupDavVersionPrev',
      'RecordKey', 'DbRowID',
      'unprocessed:rev', 'unprocessed:x-ablabel'
    ];

    this.matchablesList = ['__Names', '__Emails', '__PhoneNumbers'];
    this.metaProperties = ['__NonEmptyFields', '__CharWeight'];

    this.ignoredFieldsDefault = [
      'PhotoType', 'PhotoName',
      'CellularNumberType', 'HomePhoneType', 'WorkPhoneType', 'FaxNumberType', 'PagerNumberType',
      'UID', 'UUID', 'CardUID',
      'groupDavKey', 'groupDavVersion', 'groupDavVersionPrev',
      'RecordKey', 'DbRowID',
      'unprocessed:rev', 'unprocessed:x-ablabel'
    ];

    this.ignoredFields = [...this.ignoredFieldsDefault];
    this.consideredFields = [];

    // Phone number normalization settings
    this.natTrunkPrefix = "";
    this.natTrunkPrefixReqExp = /^0([1-9])/;
    this.intCallPrefix = "";
    this.intCallPrefixReqExp = /^00([1-9])/;
    this.countryCallingCode = "";
  }

  isText(property) {
    return property.match(/(Name|GoogleTalk|Address|City|State|Country|Title|Department|Company|WebPage|Custom|Notes)$/) != null && !this.isSelection(property);
  }

  isFirstLastDisplayName(property) {
    return property.match(/^(FirstName|LastName|DisplayName)$/) != null;
  }

  isEmail(property) {
    return property.match(/^(PrimaryEmail|SecondEmail)$/) != null;
  }

  isPhoneNumber(property) {
    return property.match(/^(WorkPhone|HomePhone|FaxNumber|PagerNumber|CellularNumber)$/) != null;
  }

  isSet(property) {
    return property.match(/^(__MailListNames|__Emails|__PhoneNumbers)$/) != null;
  }

  isSelection(property) {
    return property.match(/^(PreferMailFormat|PreferDisplayName|AllowRemoteContent)$/) != null;
  }

  isNumerical(property) {
    return property.match(/^(PopularityIndex|LastModifiedDate|RecordKey|DbRowID)$/) != null;
  }

  defaultValue(property) {
    if (this.isSelection(property) || this.isNumerical(property)) {
      return "0";
    } else {
      return this.isSet(property) ? "{}" : "";
    }
  }

  charWeight(str, property) {
    const pat = this.isPhoneNumber(property) ? /[ 0-9]/g : /[ a-z]/g;
    return str.replace(pat, '').length;
  }

  /**
   * Get property value from a contact card (modern API)
   * Thunderbird contacts API stores properties in card.properties object
   */
  getProperty(card, property) {
    const defaultValue = this.defaultValue(property);
    let value = defaultValue;

    // Properties are stored in card.properties object
    if (card.properties && card.properties[property] !== undefined && card.properties[property] !== null) {
      value = card.properties[property];
    } else if (card[property] !== undefined && card[property] !== null) {
      // Fallback to direct property access (for top-level properties like id)
      value = card[property];
    }

    if (this.isSelection(property) && value == "") {
      return defaultValue;
    }
    if (this.isSet(property)) {
      return value.toString();
    }
    if (property == 'LastModifiedDate') {
      // Handle timestamp conversion
      if (typeof value === 'number') {
        return value == 0 ? "" : new Date(value * 1000).toLocaleString();
      }
      return value == "0" || !value ? "" : String(value);
    }
    if (property == 'PhotoURI' && value == 'chrome://messenger/skin/addressbook/icons/contact-generic.png') {
      return defaultValue;
    }
    return String(value || "");
  }

  /**
   * Prune text: remove whitespace, normalize phone numbers
   */
  pruneText(text, property) {
    if (this.isText(property)) {
      text = text
        .replace(/[\s]{2,}/g, ' ')
        .replace(/^\s+/, "")
        .replace(/\s+$/, "");
    }
    if (this.isPhoneNumber(property)) {
      text = text.replace(/[^+0-9]/g, '');
      text = text.replace(/^\+/g, 'X').replace(/\+/g, '').replace(/^X/g, '+');
    }
    return text;
  }

  /**
   * Get pruned property value
   */
  getPrunedProperty(card, property) {
    const defaultValue = this.defaultValue(property);
    if (this.ignoredFields.includes(property)) {
      return defaultValue;
    }
    let value = this.pruneText(this.getProperty(card, property), property);

    // Strip stray email address duplicates from names
    if (this.isFirstLastDisplayName(property)) {
      if (value == this.getPrunedProperty(card, 'PrimaryEmail') ||
          value == this.getPrunedProperty(card, 'SecondEmail')) {
        return defaultValue;
      }
    }
    if (this.isEmail(property)) {
      value = value.replace(/@googlemail.com$/i, "@gmail.com");
    }
    return value;
  }

  /**
   * Transform middle initials and name prefixes
   */
  transformMiddlePrefixName(fn, ln) {
    let middlenames = "";
    let p;
    while ((p = ln.match(/^\s*([A-Za-z])\s+(.*)$/))) {
      middlenames += " " + p[1];
      ln = p[2];
    }
    let nameprefixes = "";
    while ((p = fn.match(/^(.+)\s(von|van|und|and|für|for|zum|zur|der|de|geb|ben)\s*$/))) {
      fn = p[1];
      nameprefixes = p[2] + " " + nameprefixes;
    }
    fn = fn.replace(/^\s+/, "").replace(/\s+$/, "") + middlenames;
    ln = nameprefixes + ln.replace(/^\s+/, "").replace(/\s+$/, "");
    return [fn, ln];
  }

  /**
   * Get transformed property (name reordering, etc.)
   */
  getTransformedProperty(card, property) {
    let value = this.getPrunedProperty(card, property);

    if (this.isFirstLastDisplayName(property)) {
      let p;
      if (property == 'DisplayName') {
        if ((p = value.match(/^([^,]+),\s+(.+)$/))) {
          let [fn, ln] = this.transformMiddlePrefixName(p[2], p[1]);
          value = fn + " " + ln;
        }
        return value;
      }
      let fn = this.getPrunedProperty(card, 'FirstName');
      let ln = this.getPrunedProperty(card, 'LastName');
      if (/,\s*$/.test(fn)) {
        ln = fn.replace(/,\s*$/, "");
        fn = this.getProperty(card, 'LastName');
      } else {
        if ((p = fn.match(/^([^,]+),\s+(.+)$/))) {
          fn = p[2] + (ln != "" ? " " + ln : "");
          ln = p[1];
        }
      }
      [fn, ln] = this.transformMiddlePrefixName(fn, ln);
      return (property == 'FirstName' ? fn : ln);
    }
    return value;
  }

  /**
   * Abstract/normalize text for comparison
   */
  abstract(text, property) {
    if (property == 'PhotoURI') {
      return text;
    }

    let p;
    if (property.match(/Email$/) && ((p = text.match(/(^[^@]*)(@aol\..*$)/i)))) {
      text = p[1] + p[2].toLowerCase();
    } else {
      text = text.toLowerCase();
    }

    if (this.isText(property)) {
      text = text.replace(/[ÄÆäæǼǽ]/g, 'ae')
        .replace(/[ÖöŒœ]/g, 'oe')
        .replace(/[Üü]/g, 'ue')
        .replace(/[ß]/g, 'ss')
        .replace(/[Ĳĳ]/g, 'ij');
    }

    if (this.isText(property)) {
      text = this.simplifyText(text);
    }

    if (this.isPhoneNumber(property)) {
      if (this.natTrunkPrefix != "" && this.countryCallingCode != "" && text.match(this.natTrunkPrefixReqExp)) {
        text = this.countryCallingCode + text.substr(this.natTrunkPrefix.length);
      }
      if (this.intCallPrefix != "" && text.match(this.intCallPrefixReqExp)) {
        text = '+' + text.substr(this.intCallPrefix.length);
      }
    }

    return text;
  }

  /**
   * Simplify text by removing accents and punctuation
   */
  simplifyText(text) {
    return text
      .replace(/[\"\'\-_:,;\.\!\?\&\+]+/g, '')
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
      .replace(/^\s+/, "")
      .replace(/\s+$/, "");
  }

  /**
   * Get abstracted and transformed property
   */
  getAbstractedTransformedProperty(card, property) {
    return this.abstract(this.getTransformedProperty(card, property), property);
  }

  /**
   * Complete FirstName, LastName, DisplayName from each other or email
   */
  completeFirstLastDisplayName([fn, ln, dn], card) {
    if (dn == "" && fn != "" && ln != "") {
      dn = fn + " " + ln;
    } else if (fn == "" || ln == "" || dn == "") {
      function getFirstLastFromEmail(email) {
        let p = email.match(/^\s*([A-Za-z0-9\x80-\uFFFF]+)[\.\-_]+([A-Za-z0-9\x80-\uFFFF]+)@/);
        if (p && p[1] == "no") {
          p = undefined;
        }
        if (!p) {
          p = email.match(/^\s*([A-Z][a-z0-9_\x80-\uFFFF]*)([A-Z][a-z0-9_\x80-\uFFFF]*)@/);
        }
        return p;
      }
      let p = dn.match(/^\s*([A-Za-z0-9_\x80-\uFFFF]+)\s+([A-Za-z0-9_\x80-\uFFFF]+)\s*$/);
      if (!p) {
        p = getFirstLastFromEmail(this.getPrunedProperty(card, 'PrimaryEmail'));
      }
      if (!p) {
        p = getFirstLastFromEmail(this.getPrunedProperty(card, 'SecondEmail'));
      }
      if (p) {
        if (fn == "") {
          fn = this.abstract(p[1].replace(/[0-9]/g, ''), 'FirstName');
        }
        if (ln == "") {
          ln = this.abstract(p[2].replace(/[0-9]/g, ''), 'LastName');
        }
        if (dn == "") {
          dn = fn + " " + ln;
        }
      }
    }
    return [fn, ln, dn];
  }

  /**
   * Get simplified card representation for comparison
   */
  getSimplifiedCard(card) {
    let vcard = {};
    [vcard['FirstName'], vcard['LastName'], vcard['DisplayName']] =
      this.completeFirstLastDisplayName(
        [
          this.getAbstractedTransformedProperty(card, 'FirstName'),
          this.getAbstractedTransformedProperty(card, 'LastName'),
          this.getAbstractedTransformedProperty(card, 'DisplayName')
        ],
        card
      );
    vcard['_AimScreenName'] = this.getAbstractedTransformedProperty(card, '_AimScreenName');
    vcard['PrimaryEmail'] = this.getAbstractedTransformedProperty(card, 'PrimaryEmail');
    vcard['SecondEmail'] = this.getAbstractedTransformedProperty(card, 'SecondEmail');
    vcard['Phone1'] = this.getAbstractedTransformedProperty(card, 'CellularNumber');
    vcard['Phone2'] = this.getAbstractedTransformedProperty(card, 'PagerNumber');
    vcard['Phone3'] = this.getAbstractedTransformedProperty(card, 'WorkPhone');
    return vcard;
  }

  /**
   * Check if names match
   */
  namesMatch(vcard1, vcard2) {
    function subEq1(name1, name2) {
      return name2 != "" && name2.length + 2 <= name1.length && (
        name1.startsWith(name2 + " ") ||
        name1.includes(" " + name2 + " ") ||
        name1.endsWith(" " + name2));
    }
    function subEq(name1, name2) {
      return (name1 == name2) ||
        subEq1(name1, name2) || subEq1(name2, name1);
    }

    const f1 = vcard1['FirstName'], l1 = vcard1['LastName'];
    const f2 = vcard2['FirstName'], l2 = vcard2['LastName'];
    const d1 = vcard1['DisplayName'], a1 = vcard1['_AimScreenName'];
    const d2 = vcard2['DisplayName'], a2 = vcard2['_AimScreenName'];

    return (a1 != "" && subEq(a1, a2)) ||
      (d1 != "" && d1.match(/ /) == d2.match(/ /) && subEq(d1, d2)) ||
      (f1 != "" && l1 != "" && subEq(f1, f2) && subEq(l1, l2)) ||
      (d1 == "" && d2 == "" && (f1 != "" || l1 != "") && subEq(f1, f2) && subEq(l1, l2)) ||
      (d1 == "" && d2 != "" && (f1 == "") != (l1 == "") && (subEq(f1, d2) || subEq(l1, d2))) ||
      (d2 == "" && d1 != "" && (f2 == "") != (l2 == "") && (subEq(f2, d1) || subEq(l2, d1)));
  }

  /**
   * Check if emails match
   */
  mailsMatch(vcard1, vcard2) {
    const [a1, a2] = [vcard1['PrimaryEmail'], vcard1['SecondEmail']];
    const [b1, b2] = [vcard2['PrimaryEmail'], vcard2['SecondEmail']];
    return ((a1 != "" && (a1 == b1 || a1 == b2)) ||
      (a2 != "" && (a2 == b1 || a2 == b2)));
  }

  /**
   * Check if phone numbers match
   */
  phonesMatch(vcard1, vcard2) {
    const [a1, a2, a3] = [vcard1['Phone1'], vcard1['Phone2'], vcard1['Phone3']];
    const [b1, b2, b3] = [vcard2['Phone1'], vcard2['Phone2'], vcard2['Phone3']];
    return ((a1 != "" && (a1 == b1 || a1 == b2 || a1 == b3)) ||
      (a2 != "" && (a2 == b1 || a2 == b2 || a2 == b3)) ||
      (a3 != "" && (a3 == b1 || a3 == b2 || a3 == b3)));
  }

  /**
   * Check if no emails/phones match
   */
  noMailsPhonesMatch(vcard) {
    return vcard['PrimaryEmail'] == "" && vcard['SecondEmail'] == "" &&
      vcard['Phone1'] == "" && vcard['Phone2'] == "" && vcard['Phone3'] == "";
  }

  /**
   * Check if no names match
   */
  noNamesMatch(vcard) {
    return vcard['FirstName'] == "" && vcard['LastName'] == "" &&
      vcard['DisplayName'] == "" && vcard['_AimScreenName'] == "";
  }

  /**
   * Check if two cards match (are potential duplicates)
   */
  cardsMatch(card1, card2) {
    const vcard1 = this.getSimplifiedCard(card1);
    const vcard2 = this.getSimplifiedCard(card2);

    // Cards with different AIM screen names are never considered matching
    if (vcard1['_AimScreenName'] != vcard2['_AimScreenName']) {
      return false;
    }

    const namesmatch = this.namesMatch(vcard1, vcard2);
    const mailsmatch = this.mailsMatch(vcard1, vcard2);
    const phonesmatch = this.phonesMatch(vcard1, vcard2);
    const nomailsphonesmatch = this.noMailsPhonesMatch(vcard1) && this.noMailsPhonesMatch(vcard2);
    const nomatch = this.noNamesMatch(vcard1) && this.noNamesMatch(vcard2) && nomailsphonesmatch;

    return namesmatch || mailsmatch || phonesmatch || nomatch;
  }

  /**
   * Load preferences from storage
   */
  async loadPreferences() {
    try {
      const result = await browser.storage.local.get([
        'autoremoveDups', 'preserveFirst', 'deferInteractive',
        'natTrunkPrefix', 'intCallPrefix', 'countryCallingCode', 'ignoreFields'
      ]);

      this.autoremoveDups = result.autoremoveDups || false;
      this.preserveFirst = result.preserveFirst || false;
      this.deferInteractive = result.deferInteractive !== undefined ? result.deferInteractive : true;
      this.natTrunkPrefix = result.natTrunkPrefix || "";
      this.intCallPrefix = result.intCallPrefix || "";
      this.countryCallingCode = result.countryCallingCode || "";

      if (result.natTrunkPrefix) {
        this.natTrunkPrefixReqExp = new RegExp("^" + this.natTrunkPrefix + "([1-9])");
      }
      if (result.intCallPrefix) {
        this.intCallPrefixReqExp = new RegExp("^" + this.intCallPrefix + "([1-9])");
      }

      if (result.ignoreFields && result.ignoreFields.length > 0) {
        this.ignoredFields = result.ignoreFields;
      } else {
        this.ignoredFields = [...this.ignoredFieldsDefault];
      }

      this.consideredFields = this.addressBookFields.filter(x => !this.ignoredFields.includes(x));
    } catch (e) {
      console.error("Error loading preferences:", e);
    }
  }

  /**
   * Save preferences to storage
   */
  async savePreferences() {
    try {
      await browser.storage.local.set({
        autoremoveDups: this.autoremoveDups,
        preserveFirst: this.preserveFirst,
        deferInteractive: this.deferInteractive,
        natTrunkPrefix: this.natTrunkPrefix,
        intCallPrefix: this.intCallPrefix,
        countryCallingCode: this.countryCallingCode,
        ignoreFields: this.ignoredFields
      });
    } catch (e) {
      console.error("Error saving preferences:", e);
    }
  }
}

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
  module.exports = DuplicateFinder;
}

