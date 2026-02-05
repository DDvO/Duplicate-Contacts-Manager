// -*- mode: js; indent-tabs-mode: t; js-indent-level: 8 -*-
// file: duplicateEntriesWindowPrefs.js
//
// Load/save preferences for the duplicate-entries window. Prefix: extensions.DuplicateContactsManager.
// Migrated to TB128: uses browser.storage.local instead of XPCOM preferences.
// loadPrefs(ctx) reads from storage into ctx; applyPrefsToDOM(ctx) writes ctx to form;
// readPrefsFromDOM(ctx) reads form into ctx; savePrefs(ctx) writes ctx to storage.
// ctx must have: ignoredFieldsDefault, addressBookFields, ignoredFields, consideredFields, isSet, matchablesList.
// Load after duplicateEntriesWindowFields.js, before duplicateEntriesWindow.js.

var DuplicateEntriesWindowPrefs = (function() {
	"use strict";

	var PREF_BRANCH_ID = "extensions.DuplicateContactsManager.";

	// Use messenger namespace (Thunderbird preferred) or fallback to browser
	const storageAPI = (typeof messenger !== 'undefined' && messenger.storage) ? messenger.storage : browser.storage;

	/**
	 * TB128: Returns a placeholder object (for compatibility). In TB128, we use browser.storage.local directly
	 */
	function getPrefsBranch() {
		return {
			_id: PREF_BRANCH_ID,
			// Placeholder methods for compatibility
			getBoolPref: function(name) { return false; },
			getCharPref: function(name) { return ""; },
			setBoolPref: function(name, value) {},
			setCharPref: function(name, value) {}
		};
	}

	/**
	 * Reads preference values from storage into ctx. Sets RegExps from prefix strings.
	 * TB128: Now async, uses browser.storage.local
	 */
	async function loadPrefs(ctx) {
		if (!storageAPI || !storageAPI.local) {
			console.warn("Storage API not available. Using defaults.");
			// Set defaults
			ctx.autoremoveDups = false;
			ctx.preserveFirst = false;
			ctx.deferInteractive = true;
			ctx.natTrunkPrefix = "";
			ctx.intCallPrefix = "";
			ctx.countryCallingCode = "";
			ctx.ignoredFields = ctx.ignoredFieldsDefault.slice();
			return;
		}

		try {
			const prefs = await storageAPI.local.get(PREF_BRANCH_ID + '*') || {};
			
			// Extract preferences (keys are prefixed with PREF_BRANCH_ID)
			ctx.autoremoveDups = prefs[PREF_BRANCH_ID + 'autoremoveDups'] !== undefined ? prefs[PREF_BRANCH_ID + 'autoremoveDups'] : false;
			ctx.preserveFirst = prefs[PREF_BRANCH_ID + 'preserveFirst'] !== undefined ? prefs[PREF_BRANCH_ID + 'preserveFirst'] : false;
			ctx.deferInteractive = prefs[PREF_BRANCH_ID + 'deferInteractive'] !== undefined ? prefs[PREF_BRANCH_ID + 'deferInteractive'] : true;
			ctx.natTrunkPrefix = prefs[PREF_BRANCH_ID + 'natTrunkPrefix'] || "";
			ctx.intCallPrefix = prefs[PREF_BRANCH_ID + 'intCallPrefix'] || "";
			ctx.countryCallingCode = prefs[PREF_BRANCH_ID + 'countryCallingCode'] || "";
			
			if (ctx.natTrunkPrefix) {
				ctx.natTrunkPrefixReqExp = new RegExp("^" + ctx.natTrunkPrefix + "([1-9])");
			}
			if (ctx.intCallPrefix) {
				ctx.intCallPrefixReqExp = new RegExp("^" + ctx.intCallPrefix + "([1-9])");
			}
			
			ctx.ignoredFields = ctx.ignoredFieldsDefault.slice();
			if (prefs[PREF_BRANCH_ID + 'ignoreFields']) {
				ctx.ignoredFields = prefs[PREF_BRANCH_ID + 'ignoreFields'].split(/\s*,\s*/);
			}
		} catch (error) {
			console.error("Error loading preferences:", error);
			// Set defaults on error
			ctx.autoremoveDups = false;
			ctx.preserveFirst = false;
			ctx.deferInteractive = true;
			ctx.natTrunkPrefix = "";
			ctx.intCallPrefix = "";
			ctx.countryCallingCode = "";
			ctx.ignoredFields = ctx.ignoredFieldsDefault.slice();
		}
	}

	/**
	 * Writes ctx preference values to the options form elements.
	 * TB128: Updated for HTML DOM (checkboxes use .checked, inputs use .value)
	 */
	function applyPrefsToDOM(ctx) {
		var autoremoveEl = document.getElementById('autoremove');
		var preservefirstEl = document.getElementById('preservefirst');
		var deferInteractiveEl = document.getElementById('deferInteractive');
		var natTrunkPrefixEl = document.getElementById('natTrunkPrefix');
		var intCallPrefixEl = document.getElementById('intCallPrefix');
		var countryCallingCodeEl = document.getElementById('countryCallingCode');
		var consideredFieldsEl = document.getElementById('consideredFields');
		var ignoredFieldsEl = document.getElementById('ignoredFields');

		if (autoremoveEl) autoremoveEl.checked = ctx.autoremoveDups;
		if (preservefirstEl) preservefirstEl.checked = ctx.preserveFirst;
		if (deferInteractiveEl) deferInteractiveEl.checked = ctx.deferInteractive;
		if (natTrunkPrefixEl) natTrunkPrefixEl.value = ctx.natTrunkPrefix || "";
		if (intCallPrefixEl) intCallPrefixEl.value = ctx.intCallPrefix || "";
		if (countryCallingCodeEl) countryCallingCodeEl.value = ctx.countryCallingCode || "";
		
		ctx.consideredFields = ctx.addressBookFields.filter(function(x) { return !ctx.ignoredFields.includes(x); });
		if (consideredFieldsEl) {
			consideredFieldsEl.textContent = ctx.consideredFields
				.filter(function(x) { return !ctx.isSet(x) && !ctx.matchablesList.includes(x); }).join(", ");
		}
		if (ignoredFieldsEl) {
			ignoredFieldsEl.value = ctx.ignoredFields.join(", ");
		}
	}

	/**
	 * Reads current values from the options form into ctx.
	 * TB128: Updated for HTML DOM
	 */
	function readPrefsFromDOM(ctx) {
		var autoremoveEl = document.getElementById('autoremove');
		var preservefirstEl = document.getElementById('preservefirst');
		var deferInteractiveEl = document.getElementById('deferInteractive');
		var natTrunkPrefixEl = document.getElementById('natTrunkPrefix');
		var intCallPrefixEl = document.getElementById('intCallPrefix');
		var countryCallingCodeEl = document.getElementById('countryCallingCode');
		var ignoredFieldsEl = document.getElementById('ignoredFields');

		ctx.autoremoveDups = autoremoveEl ? autoremoveEl.checked : false;
		ctx.preserveFirst = preservefirstEl ? preservefirstEl.checked : false;
		ctx.deferInteractive = deferInteractiveEl ? deferInteractiveEl.checked : true;
		ctx.natTrunkPrefix = natTrunkPrefixEl ? natTrunkPrefixEl.value : "";
		ctx.intCallPrefix = intCallPrefixEl ? intCallPrefixEl.value : "";
		ctx.countryCallingCode = countryCallingCodeEl ? countryCallingCodeEl.value : "";
		
		if (ignoredFieldsEl) {
			ctx.ignoredFields = ignoredFieldsEl.value.split(/\s*,\s*/).filter(function(f) { return f.trim().length > 0; });
		} else {
			ctx.ignoredFields = ctx.ignoredFieldsDefault.slice();
		}
		
		if (ctx.natTrunkPrefix) {
			ctx.natTrunkPrefixReqExp = new RegExp("^" + ctx.natTrunkPrefix + "([1-9])");
		}
		if (ctx.intCallPrefix) {
			ctx.intCallPrefixReqExp = new RegExp("^" + ctx.intCallPrefix + "([1-9])");
		}
		ctx.consideredFields = ctx.addressBookFields.filter(function(x) { return !ctx.ignoredFields.includes(x); });
	}

	/**
	 * Writes ctx preference values to storage.
	 * TB128: Now async, uses browser.storage.local
	 */
	async function savePrefs(ctx) {
		if (!storageAPI || !storageAPI.local) {
			console.warn("Storage API not available. Cannot save preferences.");
			return;
		}

		try {
			await storageAPI.local.set({
				[PREF_BRANCH_ID + 'autoremoveDups']: ctx.autoremoveDups,
				[PREF_BRANCH_ID + 'preserveFirst']: ctx.preserveFirst,
				[PREF_BRANCH_ID + 'deferInteractive']: ctx.deferInteractive,
				[PREF_BRANCH_ID + 'natTrunkPrefix']: ctx.natTrunkPrefix || "",
				[PREF_BRANCH_ID + 'intCallPrefix']: ctx.intCallPrefix || "",
				[PREF_BRANCH_ID + 'countryCallingCode']: ctx.countryCallingCode || "",
				[PREF_BRANCH_ID + 'ignoreFields']: ctx.ignoredFields.join(", ")
			});
		} catch (error) {
			console.error("Error saving preferences:", error);
		}
	}

	return {
		getPrefsBranch: getPrefsBranch,
		loadPrefs: loadPrefs,
		applyPrefsToDOM: applyPrefsToDOM,
		readPrefsFromDOM: readPrefsFromDOM,
		savePrefs: savePrefs
	};
})();
