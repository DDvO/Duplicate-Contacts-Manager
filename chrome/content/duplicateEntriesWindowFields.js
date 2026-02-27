// -*- mode: js; indent-tabs-mode: t; js-indent-level: 8 -*-
// file: duplicateEntriesWindowFields.js
//
// Address book field lists and property-type predicates for duplicate contact logic.
// Used by duplicateEntriesWindow.js and related modules. Load before duplicateEntriesWindow.js.

var DuplicateEntriesWindowFields = (function() {
	"use strict";

	var addressBookFields = [
		'PhotoURI', 'PhotoType', 'PhotoName',
		'NickName', '__Names', /* matchable */ 'FirstName', 'PhoneticFirstName', 'LastName', 'PhoneticLastName',
		'SpouseName', 'FamilyName', 'DisplayName', '_PhoneticName', 'PreferDisplayName',
		'_AimScreenName', '_GoogleTalk', 'CardType', 'Category', 'AllowRemoteContent',
		'PreferMailFormat', '__MailListNames', /* virtual set */ '__Emails', /* matchable, virtual set */ 'DefaultEmail',
		'PrimaryEmail', 'SecondEmail',
		'__PhoneNumbers', /* matchable, virtual set */ 'CellularNumber', 'CellularNumberType', 'HomePhone', 'HomePhoneType',
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

	var matchablesList = ['__Names', '__Emails', '__PhoneNumbers'];

	var metaProperties = ['__NonEmptyFields', '__CharWeight'];

	var ignoredFieldsDefault = [
		'PhotoType', 'PhotoName',
		'CellularNumberType', 'HomePhoneType', 'WorkPhoneType', 'FaxNumberType', 'PagerNumberType',
		'UID', 'UUID', 'CardUID',
		'groupDavKey', 'groupDavVersion', 'groupDavVersionPrev',
		'RecordKey', 'DbRowID',
		'unprocessed:rev', 'unprocessed:x-ablabel'
	];

	function isText(property) {
		return property.match(/(Name|GoogleTalk|Address|City|State|Country|Title|Department|Company|WebPage|Custom|Notes)$/) != null && !isSelection(property);
	}

	function isFirstLastDisplayName(property) {
		return property.match(/^(FirstName|LastName|DisplayName)$/) != null;
	}

	function isEmail(property) {
		return property.match(/^(PrimaryEmail|SecondEmail)$/) != null;
	}

	function isPhoneNumber(property) {
		return property.match(/^(WorkPhone|HomePhone|FaxNumber|PagerNumber|CellularNumber)$/) != null;
	}

	function isSet(property) {
		return property.match(/^(__MailListNames|__Emails|__PhoneNumbers)$/) != null;
	}

	function isSelection(property) {
		return property.match(/^(PreferMailFormat|PreferDisplayName|AllowRemoteContent)$/) != null;
	}

	function isNumerical(property) {
		return property.match(/^(PopularityIndex|LastModifiedDate|RecordKey|DbRowID)$/) != null;
	}

	function defaultValue(property) {
		if (isSelection(property) || isNumerical(property))
			return "0";
		return isSet(property) ? "{}" : "";
	}

	/**
	 * Gives preference to values with many non-digit/uppercase and special characters.
	 * Umlauts have higher weight than their transcription (counted as more than one character).
	 */
	function charWeight(str, property) {
		var pat = isPhoneNumber(property) ? /[ 0-9]/g : /[ a-z]/g;
		var result = str.replace(pat, '').length;
		// this.debug("isPhoneNumber("+property+") = "+isPhoneNumber(property)+" charWeight("+str+") = "+result);
		return result;
	}

	return {
		addressBookFields: addressBookFields,
		matchablesList: matchablesList,
		metaProperties: metaProperties,
		ignoredFieldsDefault: ignoredFieldsDefault,
		isText: isText,
		isFirstLastDisplayName: isFirstLastDisplayName,
		isEmail: isEmail,
		isPhoneNumber: isPhoneNumber,
		isSet: isSet,
		isSelection: isSelection,
		isNumerical: isNumerical,
		defaultValue: defaultValue,
		charWeight: charWeight
	};
})();
