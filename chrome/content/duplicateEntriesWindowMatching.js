// -*- mode: js; indent-tabs-mode: t; js-indent-level: 8 -*-
// file: duplicateEntriesWindowMatching.js
//
// Normalization (prune, transform, abstract, simplify) and matching logic
// for duplicate contact detection. Used by duplicateEntriesWindow.js.
// Load this after duplicateEntriesWindowContacts.js and before duplicateEntriesWindow.js.

var DuplicateEntriesWindowMatching = (function() {
	"use strict";

	/**
	 * Strips accents, punctuation, etc. so different spellings can be compared.
	 * @param {string} text
	 * @returns {string}
	 */
	function simplifyText(text) {
		// [Obsolete approach] Removing singleton digits and letters is too aggressive:
		// - "von" becomes "v" then "", losing information
		// - Phone numbers like "123 4 567" would become "123 567"
		// Therefore, singletons are preserved.
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
	 * Prunes whitespace and non-digits (for phones). Does not change letter case.
	 * @param {string} text
	 * @param {string} property - Property name (used with config for type)
	 * @param {object} config - { isText(property), isPhoneNumber(property) }
	 * @returns {string}
	 */
	function pruneText(text, property, config) {
		if (config.isText(property)) {
			// this does not remove any real information and keeps letter case
			text = text
				// remove multiple white space
				.replace(/[\s]{2,}/g, ' ')
				// remove leading and trailing whitespace
				.replace(/^\s+/, "")
				.replace(/\s+$/, "");
		}
		if (config.isPhoneNumber(property)) {
			// strip non-digits
			text = text.replace(/[^+0-9]/g, '');
			// strip irrelevant '+'
			text = text.replace(/^\+/g, 'X').replace(/\+/g, '').replace(/^X/g, '+');
		}
		return text;
	}

	/**
	 * Normalizes and simplifies a value for comparison (lowercase, umlauts, phone prefixes, etc.).
	 * Steps: 1. Convert to lowercase (loses information for case-sensitive fields) 2. Transcribe umlauts and ligatures 3. Simplify text 4. Normalize phone numbers
	 * @param {string} text
	 * @param {string} property
	 * @param {object} config - { isText(property), isPhoneNumber(property), natTrunkPrefix, countryCallingCode, natTrunkPrefixReqExp, intCallPrefix, intCallPrefixReqExp }
	 * @returns {string}
	 */
	function abstract(text, property, config) {
		var p;
		if (property == 'PhotoURI')
			return text;
		if (property.match(/Email$/) && ((p = text.match(/(^[^@]*)(@aol\..*$)/i)))) {
			// for AOL, email part before '@' is case-sensitive!
			text = p[1] + p[2].toLowerCase();
		} else {
			text = text.toLowerCase();
		}
		if (config.isText(property)) {
			// transcribe umlauts and ligatures
			text = text
				.replace(/[ÄÆäæǼǽ]/g, 'ae')
				.replace(/[ÖöŒœ]/g, 'oe')
				.replace(/[Üü]/g, 'ue')
				.replace(/[ß]/g, 'ss')
				.replace(/[Ĳĳ]/g, 'ij');
			text = simplifyText(text);
		}
		if (config.isPhoneNumber(property)) {
			// Strip national trunk prefix (e.g., 0 in many countries)
			if (config.natTrunkPrefix != "" && config.countryCallingCode != "" && text.match(config.natTrunkPrefixReqExp))
				text = config.countryCallingCode + text.substr(config.natTrunkPrefix.length);
			// Strip international call prefix (e.g., 00 or 011) and country code
			if (config.intCallPrefix != "" && text.match(config.intCallPrefixReqExp))
				text = '+' + text.substr(config.intCallPrefix.length);
			// [Obsolete approach] Previous versions stripped specific country codes (+1, +7, +20, etc.)
			// based on Wikipedia list. Now uses configurable countryCallingCode preference instead.
		}
		return text;
	}

	/**
	 * Moves middle initials from last name to first, and name prefixes (von, van, etc.) to last name.
	 * @param {string} fn - First name
	 * @param {string} ln - Last name
	 * @returns {[string, string]} [firstName, lastName]
	 */
	function transformMiddlePrefixName(fn, ln) {
		var p;
		var middlenames = "";
		while ((p = ln.match(/^\s*([A-Za-z])\s+(.*)$/))) {
			middlenames += " " + p[1];
			ln = p[2];
		}
		var nameprefixes = "";
		while ((p = fn.match(/^(.+)\s(von|van|und|and|für|for|zum|zur|der|de|geb|ben)\s*$/))) {
			fn = p[1];
			nameprefixes = p[2] + " " + nameprefixes;
		}
		fn = fn.replace(/^\s+/, "").replace(/\s+$/, "") + middlenames;
		ln = nameprefixes + ln.replace(/^\s+/, "").replace(/\s+$/, "");
		return [fn, ln];
	}

	// --- Matching (on simplified vcard objects: FirstName, LastName, DisplayName, _AimScreenName, PrimaryEmail, SecondEmail, Phone1, Phone2, Phone3) ---

	function noMailsPhonesMatch(vcard) {
		// strings are already abstracted, e.g., normalized to lowercase
		// numbers are already abstracted, e.g., non-digits are stripped
		return vcard['PrimaryEmail'] == "" && vcard['SecondEmail'] == "" &&
			vcard['Phone1'] == "" && vcard['Phone2'] == "" && vcard['Phone3'] == "";
	}

	function noNamesMatch(vcard) {
		// strings are already abstracted, e.g., normalized to lowercase
		// numbers are already abstracted, e.g., non-digits are stripped
		return vcard['FirstName'] == "" && vcard['LastName'] == "" &&
			vcard['DisplayName'] == "" && vcard['_AimScreenName'] == "";
	}

	function phonesMatch(vcard1, vcard2) {
		// numbers are already abstracted, e.g., non-digits are stripped
		var a1 = vcard1['Phone1'], a2 = vcard1['Phone2'], a3 = vcard1['Phone3'];
		var b1 = vcard2['Phone1'], b2 = vcard2['Phone2'], b3 = vcard2['Phone3'];
		return (a1 != "" && (a1 == b1 || a1 == b2 || a1 == b3)) ||
			(a2 != "" && (a2 == b1 || a2 == b2 || a2 == b3)) ||
			(a3 != "" && (a3 == b1 || a3 == b2 || a3 == b3));
	}

	function mailsMatch(vcard1, vcard2) {
		// strings are already abstracted, e.g., normalized to lowercase
		var a1 = vcard1['PrimaryEmail'], a2 = vcard1['SecondEmail'];
		var b1 = vcard2['PrimaryEmail'], b2 = vcard2['SecondEmail'];
		return (a1 != "" && (a1 == b1 || a1 == b2)) ||
			(a2 != "" && (a2 == b1 || a2 == b2));
	}

	function namesMatch(vcard1, vcard2) {
		// vcards are already abstracted and with names completed
		// strings are already abstracted, e.g., normalized to lowercase
		function subEq1(name1, name2) {
			return name2 != "" && name2.length + 2 <= name1.length && (
				name1.startsWith(name2 + " ") ||
				name1.includes(" " + name2 + " ") ||
				name1.endsWith(" " + name2));
		}
		function subEq(name1, name2) {
			return (name1 == name2) || subEq1(name1, name2) || subEq1(name2, name1);
		}
		var f1 = vcard1['FirstName'], l1 = vcard1['LastName'];
		var f2 = vcard2['FirstName'], l2 = vcard2['LastName'];
		var d1 = vcard1['DisplayName'], a1 = vcard1['_AimScreenName'];
		var d2 = vcard2['DisplayName'], a2 = vcard2['_AimScreenName'];
		// this.debug("namesMatch: "+f1+"#"+l1+"#"+d1+ " vs. " +f2+"#"+l2+"#"+d2);
		// _AimScreenNames exist and match
		// both DisplayNames consist of one word or more than one word and match
		// FirstNames and LastNames exist and match
		// no DisplayNames, but FirstNames and LastNames match
		// only First/Last exists and matches other DisplayName (both conditions)
		return (a1 != "" && subEq(a1, a2)) ||
			(d1 != "" && (d1.match(/ /) == d2.match(/ /)) && subEq(d1, d2)) ||
			(f1 != "" && l1 != "" && subEq(f1, f2) && subEq(l1, l2)) ||
			(d1 == "" && d2 == "" && (f1 != "" || l1 != "") && subEq(f1, f2) && subEq(l1, l2)) ||
			(d1 == "" && d2 != "" && (f1 == "") != (l1 == "") && (subEq(f1, d2) || subEq(l1, d2))) ||
			(d2 == "" && d1 != "" && (f2 == "") != (l2 == "") && (subEq(f2, d1) || subEq(l2, d1)));
	}

	return {
		simplifyText: simplifyText,
		pruneText: pruneText,
		abstract: abstract,
		transformMiddlePrefixName: transformMiddlePrefixName,
		noMailsPhonesMatch: noMailsPhonesMatch,
		noNamesMatch: noNamesMatch,
		phonesMatch: phonesMatch,
		mailsMatch: mailsMatch,
		namesMatch: namesMatch
	};
})();
