# Duplicate Contacts Manager — Architecture and Change History

For user-facing features, usage, and matching rules, see [README.md](README.md).

This document describes the **internal architecture** of the duplicate-finder window and the **change history** of the add-on. Script load order below is required for correct behaviour; do not reorder scripts in `window.html` without checking module dependencies.

---

## Architecture

**Note:** As of version 2.2.0, this add-on has been migrated to Thunderbird 128+ (WebExtension/Manifest V3). The duplicate-finder window is now implemented as an HTML window (`window.html`) instead of XUL, and uses WebExtension APIs instead of XPCOM.

The add-on's duplicate-finder window is implemented as a single HTML window (`window.html`) and a main script (`duplicateEntriesWindow.js`) that orchestrates several JavaScript modules. The main script holds window state (cards, positions, preferences, DOM references) and delegates logic to the modules. Modules are loaded in a fixed order so that dependencies are available when each script runs.

### Script load order (in `window.html`)

1. **vCardUtils.js** (TB128: vCard parsing/generation utilities)
2. **duplicateEntriesWindowState.js**
3. **duplicateEntriesWindowContacts.js**
4. **duplicateEntriesWindowFields.js**
5. **duplicateEntriesWindowPrefs.js**
6. **duplicateEntriesWindowMatching.js**
7. **duplicateEntriesWindowCardValues.js**
8. **duplicateEntriesWindowComparison.js**
9. **duplicateEntriesWindowUI.js**
10. **duplicateEntriesWindowDisplay.js**
11. **duplicateEntriesWindowSearch.js**
12. **duplicateEntriesWindow.js** (main window object)
13. **window-init.js** (TB128: i18n and event listeners)

---

### Module overview

#### 0. vCardUtils.js (TB128)

**Role:** vCard parsing and generation utilities for converting between vCard strings (used by WebExtension API) and JavaScript objects (used by business logic).

**Exports:** `parseVCard(vCardString)`, `generateVCard(cardObject)`, `getProperty`, `setProperty`.

**Responsibilities:**
- Parse vCard strings from the `addressBooks` API into plain JavaScript objects.
- Generate vCard strings from plain JavaScript objects for saving contacts.
- Handle vCard property mapping and normalization.

**Dependencies:** None (load first).

---

#### 1. duplicateEntriesWindowState.js

**Role:** Default initial state for the duplicate-entries window (plain data, no logic).

**Exports:** `defaultState()` — returns a fresh object with initial property values (restart, vcards, BOOK_1/BOOK_2, positionSearch, preferences, phone prefixes, etc.). The main script builds `DuplicateEntriesWindow` by merging this with methods via `Object.assign(DuplicateEntriesWindowState.defaultState(), { ... })`.

**Responsibilities:** Keep the long list of initial property values out of `duplicateEntriesWindow.js` so the main file stays short and readable.

**Dependencies:** None (load first).

---

#### 2. duplicateEntriesWindowContacts.js

**Role:** Read/write access to Thunderbird address books and contact cards.

**Exports:** `getAddressBooks()`, `getAddressBook(id)`, `getAllAbCards(addressBookId, context)`, `getCardProperty`, `setCardProperty`, `saveCard(addressBookId, card)`, `deleteCard(addressBookId, card)`.

**Responsibilities:**
- Use the WebExtension `addressBooks` API (`messenger.addressBooks` or `browser.addressBooks`) to list and access address books by ID.
- Load all cards from one or two address books as plain JavaScript objects (parsed vCards); optionally enrich each card for comparison (virtual properties) via the context's `enrichCardForComparison`.
- Read/write individual card properties and persist cards (save/delete) using the addressBooks API.

**Dependencies:** None (load after State). The main window passes itself as `context` so that card enrichment can use Fields/CardValues logic. Requires `vCardUtils.js` for vCard parsing/generation. All functions are `async` (TB128).

---

#### 3. duplicateEntriesWindowFields.js

**Role:** Central definition of address-book field lists and property-type predicates.

**Exports:** `addressBookFields`, `matchablesList`, `metaProperties`, `ignoredFieldsDefault`, and predicates: `isText`, `isFirstLastDisplayName`, `isEmail`, `isPhoneNumber`, `isSet`, `isSelection`, `isNumerical`, `defaultValue`, `charWeight`.

**Responsibilities:**
- Define the full list of address book properties and which are used for matching (`__Names`, `__Emails`, `__PhoneNumbers`).
- Provide type checks (text, email, phone, set, selection, numerical) and default values per property.
- Provide `charWeight` for "information content" used when preferring one card over another.

**Dependencies:** None. Other modules and the main window read these constants and functions.

---

#### 4. duplicateEntriesWindowPrefs.js

**Role:** Load and save user preferences for the duplicate-finder window using WebExtension storage API.

**Exports:** `getPrefsBranch`, `loadPrefs(ctx)`, `applyPrefsToDOM(ctx)`, `readPrefsFromDOM(ctx)`, `savePrefs(ctx)`.

**Responsibilities:**
- Use the WebExtension `storage` API (`messenger.storage.local` or `browser.storage.local`) to read/write preferences.
- Read prefs into the window context (autoremove, preserve first book, defer interactive, phone prefixes, ignored fields).
- Sync context to/from the options form (apply to DOM on init, read from DOM on Start, write back to storage when saving).

**Dependencies:** Expects `ctx` to have Fields-derived data (`ignoredFieldsDefault`, `addressBookFields`, `consideredFields`, `isSet`, `matchablesList`). All functions are `async` (TB128).

---

#### 5. duplicateEntriesWindowMatching.js

**Role:** Normalization and matching logic for duplicate detection (names, emails, phones).

**Exports:** `simplifyText`, `pruneText`, `abstract`, `transformMiddlePrefixName`, `noMailsPhonesMatch`, `noNamesMatch`, `phonesMatch`, `mailsMatch`, `namesMatch`.

**Responsibilities:**
- Normalize text (prune, transform name order, abstract for comparison) using a config object that supplies type checks and phone-prefix settings.
- Decide whether two simplified cards match on names, emails, or phones; handle the "no names/emails/phones to match" case.

**Dependencies:** Uses a normalization config (from main window's `getNormalizationConfig()`); no other add-on modules.

---

#### 6. duplicateEntriesWindowCardValues.js

**Role:** Card value pipeline — get display or comparison values from a card, and build simplified cards for matching.

**Exports:** `getProperty`, `getPrunedProperty`, `getTransformedProperty`, `getAbstractedTransformedProperty`, `completeFirstLastDisplayName`, `getSimplifiedCard`, `propertySet`, `enrichCardForComparison`.

**Responsibilities:**
- Get raw, pruned, transformed, or abstracted values for a property (used by comparison and display).
- Build simplified card objects (abstracted names, emails, phones) for the matching module.
- Enrich cards with virtual properties (`__NonEmptyFields`, `__CharWeight`, `__MailListNames`, `__Emails`, `__PhoneNumbers`) when loading from Contacts.

**Dependencies:** Uses Matching for `pruneText`, `abstract`, `transformMiddlePrefixName`. Expects `ctx` to have Fields predicates and `getNormalizationConfig`, `vcards`, `vcardsSimplified`, `consideredFields`. Updated for plain JavaScript card objects instead of `nsIAbCard` (TB128).

---

#### 7. duplicateEntriesWindowComparison.js

**Role:** Compare two cards for "equivalent or less information" and compute preference for which to delete.

**Exports:** `propertyUnion`, `compareCards(c1, c2, context)`.

**Also defines:** `Set.prototype.isSuperset` and `Set.prototype.toString` (used by Display and by comparison internals).

**Responsibilities:**
- Union of property names from two cards; field-by-field comparison using context's value pipeline and Fields predicates.
- Push differing properties into `context.nonequivalentProperties`; return comparison result and preference (which card to prefer for deletion).

**Dependencies:** Uses Matching's `abstract` (via context's getters). Expects context to expose `consideredFields`, `metaProperties`, type predicates, `defaultValue`, `getAbstractedTransformedProperty`, etc. Updated for plain JavaScript card objects (TB128).

---

#### 8. duplicateEntriesWindowUI.js

**Role:** UI state transitions, progress/finished stats, low-level DOM helpers, and "which side to keep" selection.

**Exports:** `enable`, `disable`, `show`, `hide`, `show_hack`, `make_visible`, `make_invisible`, `createSelectionList`, `setContactLeftRight`, `showReadyState`, `showSearchingState`, `showDuplicatePairState`, `disableDuplicateActionButtons`, `showFinishedState`, `showComparisonTableHeader`, `hideComparisonTableHeader`, `updateDeletedInfo`, `updateProgress`, `showFinishedStats`.

**Responsibilities:**
- Show/hide/enable/disable HTML elements by id; create HTML `<select>` dropdowns (address book dropdowns, PreferMailFormat/boolean in comparison table).
- Switch between "ready", "searching", "duplicate pair", and "finished" states; update progress meter and card-count labels; fill the finished-state panel with result statistics.
- Implement "keep left/right" (radio labels, header and cell classes) via `setContactLeftRight(ctx, side)`.

**Dependencies:** None (only DOM and context data). Other code calls these with the main window as `ctx` where needed. Updated for HTML DOM (TB128).

---

#### 9. duplicateEntriesWindowDisplay.js

**Role:** Build and clear the comparison table (side-by-side fields, equivalence symbols, editable inputs).

**Exports:** `displayCardData`, `purgeAttributesTable`, `getCardFieldValues`.

**Responsibilities:**
- Fill the HTML comparison table for a pair of cards: labels, matchable rows (names/emails/phones), per-field rows with left/right values and equivalence (≡ ≅ ⋦ ⋧ etc.), including PhotoURI and selection dropdowns.
- Clear the table (purge rows, hide header via UI module).
- Read back edited values from the table for a given side ("left" or "right").

**Dependencies:** Uses UI's `showComparisonTableHeader`, `hideComparisonTableHeader`; expects `ctx` to have Fields predicates, `getProperty`, `getAbstractedTransformedProperty`, `createSelectionList`, `setContactLeftRight`, `attributesTableRows`, `displayedFields`, `editableFields`, etc. Updated for HTML DOM and plain JavaScript card objects (TB128).

---

#### 10. duplicateEntriesWindowSearch.js

**Role:** Position stepping over card pairs and the main duplicate-find loop.

**Exports:** `searchPositionsToNext`, `skipPositionsToNext`, `runIntervalAction`.

**Responsibilities:**
- Advance (position1, position2) over all pairs (same-book triangle or two-book rectangle), skipping deleted slots.
- When "defer interactive" is on, walk the pre-collected `duplicates` queue instead.
- In `runIntervalAction(ctx)`: loop over pairs; for each pair get simplified cards, run matching (names/mails/phones); if match, run comparison; auto-delete or enqueue or show comparison UI; yield every ~1 s for UI updates and re-schedule via `setTimeout`.

**Dependencies:** Uses Matching, Comparison, UI, Display; expects `ctx` to provide `vcards`, positions, `updateProgress`, `getSimplifiedCard`, `deleteAbCard`, `displayCardData`, `endSearch`, `getString`, and options (autoremoveDups, preserveFirst, etc.). Updated to use address book IDs instead of directories (TB128).

---

#### 11. duplicateEntriesWindow.js (main)

**Role:** Window object and orchestration.

**Responsibilities:**
- Hold all state (vcards, positions, preferences, DOM refs, options).
- `init()`: bind Fields, use WebExtension `addressBooks` API, load prefs (async), apply to DOM, use `browser.i18n`/`messenger.i18n` for localization, build address book dropdowns, show ready state.
- `startSearch()`: read prefs from DOM, validate, save prefs (async), read address books (async), reset search state, show searching state, call `searchNextDuplicate()` which schedules `DuplicateEntriesWindowSearch.runIntervalAction`.
- Handle user actions: skip, keep both, apply (keep one + delete other); delegate card updates/deletes to Contacts (async); delegate table display to Display; delegate progress/stats to UI.
- Thin delegates for all module APIs so that the window object remains the single "context" passed to modules.

**Dependencies:** All modules above; no module depends on the main file except as "ctx" or by name for `setTimeout` (e.g. `DuplicateEntriesWindowSearch.runIntervalAction(DuplicateEntriesWindow)`). Uses WebExtension APIs (`addressBooks`, `storage`, `i18n`) instead of XPCOM (TB128).

---

#### 12. window-init.js (TB128)

**Role:** Initialize the HTML window with i18n and event listeners (CSP compliance).

**Responsibilities:**
- Apply localized messages to elements with `data-i18n` attributes using `browser.i18n`/`messenger.i18n`.
- Set up event listeners for UI buttons and radio buttons.
- Ensure all modules are loaded before initializing the main window.

**Dependencies:** Requires all other modules to be loaded. Uses WebExtension `i18n` API.

---

## Change history

### Version 2.2.0 (TB128 Migration)
* **Major migration to Thunderbird 128+ (WebExtension/Manifest V3)**
* Migrated from XUL to HTML (`window.html` replaces `duplicateEntriesWindow.xul`)
* Replaced XPCOM APIs (`nsIAbManager`, `nsIAbCard`, `nsIPrefService`) with WebExtension APIs (`addressBooks`, `storage`, `i18n`)
* Converted all synchronous code to async/await patterns
* Updated card handling: cards are now plain JavaScript objects (parsed vCards) instead of `nsIAbCard` objects
* Address books accessed by ID instead of URIs/directories
* Migrated UI elements from XUL (`hbox`, `vbox`, `menulist`, `description`, `textbox`) to HTML (`div`, `select`, `span`, `input`, `tr`, `td`)
* Created `vCardUtils.js` for vCard parsing/generation
* Created `background.js` for WebExtension lifecycle and menu handling
* Created `window-init.js` for CSP compliance (externalized inline scripts)
* Regenerated `_locales/*/messages.json` from `locale/*` directory
* Updated all DOM manipulation for HTML (`.textContent`, `.value`, `.checked` instead of XUL attributes)
* Fixed property access: direct object properties instead of `card.getProperty()`
* All functions using contacts/preferences are now `async`

### Version 2.1.6
* Move `createSelectionList` into DuplicateEntriesWindowUI; main window delegates.
* Add ARCHITECTURE_AND_HISTORY.md (architecture and this change history).

### Version 2.1.5
* Cleanup: remove dead code from main file (pushIfNew, Array.prototype comment block, commented-out readFile).
* Move Set.prototype.isSuperset and Set.prototype.toString to duplicateEntriesWindowComparison.js.
* Move setContactLeftRight implementation to DuplicateEntriesWindowUI.
* Move enable, disable, show, hide, show_hack, make_visible, make_invisible to UI module; main file delegates.

### Version 2.1.4
* Refactor: extract enrichCardForComparison to DuplicateEntriesWindowCardValues.
* Extract search position stepping and runIntervalAction to duplicateEntriesWindowSearch.js.
* Move updateProgress, updateDeletedInfo, showFinishedStats to DuplicateEntriesWindowUI.
* Extract prefs load/save to duplicateEntriesWindowPrefs.js.
* Remove unresolved appmenu_taskPopup overlay from menuOverlay.xul (fix Overlays.jsm "Could not resolve" warning).

### Version 2.1.3
* Extract comparison table display to duplicateEntriesWindowDisplay.js (displayCardData, displayCardField, SetRelation, purgeAttributesTable, getCardFieldValues).

### Version 2.1.2
* Extract card value pipeline to duplicateEntriesWindowCardValues.js (getProperty, getPrunedProperty, getTransformedProperty, getAbstractedTransformedProperty, getSimplifiedCard, completeFirstLastDisplayName, propertySet).

### Version 1.1.1 (seen as 2.1.1 by Thunderbird 68+)
* Compatibility with Thunderbird 68+; slightly improve documentation.

### Version 1.1
* Improve progress calculation and display; clean up photo image handling.

### Version 1.0.9
* Fix bug introduced in version 1.0.8 regarding manual selection which side to keep.

### Version 1.0.8
* Make vertical size more flexible for small displays.
* Fix display layout for overlong list membership information etc.
* Add comparison of number of non-empty fields for determining card preferred for deletion.
* Improve calculation of character weight for determining card preferred for deletion.
* Correct comparison of selection fields determining which side has less information.
* Fix use of default value for ignoreFields; ignore by default also phone number types.
* Various implementation improvements for more efficiency and better readability.

### Version 1.0.7
* Add option for normalizing international call prefix.
* Fix horizontal layout issues, automatic width of contents.
* Improve name matching: allow substrings, stop removing singleton digits and letters.
* Mail user names like no-reply@... or no.service@... not anymore taken as first+last names.

### Version 1.0.6
* Various UI layout (width, vertical scrolling) and small documentation improvements.

### Version 1.0.5
* Correction of mistake in packaging version 1.0.4 that prevented it from running.

### Version 1.0.4
* Various small UI improvements: indication for card matching, layout, language, doc.

### Version 1.0.3
* Fixed syntax error in de-DE locale that led to obscure initialization error.
* Minor improvements of localization in the extension and of the entry in the TB add-ons list.

### Version 1.0.1 and 1.0.2
* Improved label of DCM menu entry for address book window.

### Version 1.0
* Major speedup in particular when searching for duplicates in large address books.
* Improved user guidance; new Tools menu entry with default address book selection.
* Various improvements of content matching and card comparison for equivalence.
* Cards may be excluded from being presented as matching by setting a different AIM name.
* Photos are compared for equality and are shown during manual inspection.
* Mailing list membership is taken into account for comparison and shown during inspection.
* During manual inspection, field-by-field (resp. set-by-set) comparison information is shown.
* Option to consider phone numbers with national prefix and with default country code equivalent.
* Option to customize list of ignored fields; output summary of different fields.
* Option to preserve entries of first address book when auto-deleting redundant entries.
* Options are saved in TB configuration/preferences at `extensions.DuplicateContactsManager.*`.

### Version 0.9.2
* Few critical bug fixes.
* Layout improvements.

### Version 0.9
* Can now edit contacts.
* Auto-removal of contacts which only contain some less fields.
* Can work across two address books.
* Option to collect all potential duplicates before interacting with the user.
* Progress bar and other usability improvements.

### Version 0.8
* Offer to delete exact duplicates without asking.
* Correctly search for exact duplicates.
* Upgrade to support Thunderbird 7.
