# Porting Guide: Complete Function Mapping

This document maps all functions from the original code to their ported equivalents.

## Core Functions (Preserved with Minimal Changes)

All matching and comparison logic is preserved exactly:

### Matching Functions
- `namesMatch()` - Preserved exactly
- `mailsMatch()` - Preserved exactly
- `phonesMatch()` - Preserved exactly
- `noMailsPhonesMatch()` - Preserved exactly
- `noNamesMatch()` - Preserved exactly

### Abstraction Functions
- `pruneText()` - Preserved exactly
- `getPrunedProperty()` - Preserved exactly
- `abstract()` - Preserved exactly
- `simplifyText()` - Preserved exactly
- `getTransformedProperty()` - Preserved exactly
- `getAbstractedTransformedProperty()` - Preserved exactly
- `transformMiddlePrefixName()` - Preserved exactly
- `completeFirstLastDisplayName()` - Preserved exactly

### Comparison Functions
- `abCardsCompare()` - Preserved exactly (core comparison logic)
- `SetRelation()` - Preserved exactly
- `propertySet()` - Preserved exactly
- `propertyUnion()` - PORT: Adapted for WebExtension contact objects

### Card Processing
- `getSimplifiedCard()` - PORT: Adapted to use contact objects instead of nsIAbCard
- `getAllAbCards()` - PORT: Replaced with `browser.contacts.list()`
- `getProperty()` - PORT: Direct property access instead of `card.getProperty()`

## API Replacements

### Address Book Access
**Original:**
```javascript
abManager = Components.classes["@mozilla.org/abmanager;1"].getService(Components.interfaces.nsIAbManager);
abDir = abManager.getDirectory(uri);
cards = directory.childCards;
```

**Port:**
```javascript
addressBooks = await browser.addressBooks.list();
contacts = await browser.contacts.list(addressBookId);
```

### Contact Properties
**Original:**
```javascript
card.getProperty('PrimaryEmail', '');
card.setProperty('PrimaryEmail', 'test@example.com');
```

**Port:**
```javascript
contact.PrimaryEmail || '';
// Update via browser.contacts.update()
await browser.contacts.update(contactId, {PrimaryEmail: 'test@example.com'});
```

### Preferences
**Original:**
```javascript
prefsBranch = Prefs.getBranch("extensions.DuplicateContactsManager.");
value = prefsBranch.getBoolPref('autoremoveDups');
prefsBranch.setBoolPref('autoremoveDups', true);
```

**Port:**
```javascript
prefs = await browser.storage.local.get("extensions.DuplicateContactsManager.autoremoveDups");
await browser.storage.local.set({"extensions.DuplicateContactsManager.autoremoveDups": true});
```

### Window Management
**Original:**
```javascript
window.open('chrome://duplicatecontactsmanager/content/duplicateEntriesWindow.xul', ...);
```

**Port:**
```javascript
browser.windows.create({url: browser.runtime.getURL("window/window.html"), ...});
```

## UI Element Replacements

| Original (XUL) | Port (HTML) |
|----------------|-------------|
| `<window>` | `<html>` or `<div>` |
| `<hbox>` | `<div style="display: flex; flex-direction: row">` |
| `<vbox>` | `<div style="display: flex; flex-direction: column">` |
| `<textbox>` | `<input type="text">` |
| `<menulist>` | `<select>` |
| `<menupopup>` | `<select>` (options) |
| `<menuitem>` | `<option>` |
| `<button>` | `<button>` (same) |
| `<label>` | `<label>` or `<span>` |
| `<description>` | `<div>` or `<p>` |
| `<checkbox>` | `<input type="checkbox">` |
| `<radio>` | `<input type="radio">` |
| `<progressmeter>` | `<progress>` |

## File Structure

```
Original Structure:              Port Structure:
chrome/content/                  window/
  duplicateEntriesWindow.js  →     window.js
  duplicateEntriesWindow.xul  →     window.html
chrome/content/                  popup/
  duplicateContactsManager.js →     popup.js
chrome.manifest +                manifest.json
install.rdf
```

## Notes on Async/Await

The original code is synchronous. The port uses async/await for:
- Address book enumeration
- Contact loading
- Contact updates/deletions
- Preference loading/saving

All async operations are wrapped in try/catch blocks for error handling.

## Testing Checklist

- [ ] Address book enumeration works
- [ ] Contact loading works
- [ ] Duplicate detection (name matching) works
- [ ] Duplicate detection (email matching) works
- [ ] Duplicate detection (phone matching) works
- [ ] Auto-removal works
- [ ] Manual review interface works
- [ ] Contact editing works
- [ ] Contact deletion works
- [ ] Preferences are saved/loaded correctly
- [ ] Progress bar updates correctly
- [ ] Statistics are accurate
