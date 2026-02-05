// -*- mode: js; indent-tabs-mode: t; js-indent-level: 8 -*-
// file: duplicateEntriesWindowState.js
//
// Default initial state for the duplicate-entries window (DuplicateEntriesWindow).
// Used by duplicateEntriesWindow.js to keep the main object definition short.
// Load before duplicateEntriesWindow.js. No other module dependencies.

var DuplicateEntriesWindowState = (function() {
	"use strict";

	/**
	 * Returns a fresh default state object for DuplicateEntriesWindow.
	 * Called once when the window object is built; arrays are new instances so the window has its own state.
	 */
	function defaultState() {
		return {
			restart: false,
			abManager: null,
			stringBundle: null,
			stringBundle_old: null,
			prefsBranch: null,

			statustext: '',
			progresstext: '',
			progressmeter: null,
			window: null,

			BOOK_1: 0,
			BOOK_2: 1,
			vcards: [],
			vcardsSimplified: [],

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

			abURI1: null, // Legacy, kept for compatibility
			abURI2: null, // Legacy, kept for compatibility
			abDir1: null, // Legacy, kept for compatibility
			abDir2: null, // Legacy, kept for compatibility
			abId1: null, // TB128: Address book ID
			abId2: null, // TB128: Address book ID
			abDir1Name: '', // TB128: Address book display name
			abDir2Name: '', // TB128: Address book display name

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
			nonequivalentProperties: [],
			ignoredFields: [],
			consideredFields: [],

			natTrunkPrefix: "",
			natTrunkPrefixReqExp: /^0([1-9])/,
			intCallPrefix: "",
			intCallPrefixReqExp: /^00([1-9])/,
			countryCallingCode: ""
		};
	}

	return {
		defaultState: defaultState
	};
})();
