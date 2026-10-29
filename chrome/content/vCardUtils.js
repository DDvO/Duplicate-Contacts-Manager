// vCardUtils.js - vCard parsing and generation utilities for TB128
// Converts between vCard strings (used by WebExtension API) and JavaScript objects (used by business logic)
// X-AIM vCard lines map to _AimScreenName (used by “Make different” and duplicate search skip when AIM differs).
// Phase 2: REV/date and EMAIL ordering helpers keep parse/generate inverse-consistent; display formatting
// for LastModifiedDate is shared with duplicateEntriesWindowCardValues via parseLastModifiedDateForDisplay.
//
// Saving an existing contact goes through mergeVCard, not generateVCard: the original vCard is kept
// line by line and only lines whose mapped fields changed are rewritten. Anything this add-on does not
// model (third EMAIL, second TEL of a type, CATEGORIES, IMPP, X-*, N prefix/suffix, ADR PO box, ...)
// therefore survives Apply / Keep both / Make different.

var VCardUtils = (function() {
	"use strict";

	/**
	 * Splits a vCard string into logical content lines.
	 * RFC 6350 3.2 / RFC 2425 5.8.1: a line break followed by ONE space or tab is removed; any further
	 * whitespace belongs to the value (trimming it used to glue words of long NOTE lines together).
	 * @param {string} vCardString
	 * @returns {string[]} Unfolded lines (not trimmed)
	 */
	function unfoldVCardLines(vCardString) {
		var physical = String(vCardString || '').split(/\r?\n/);
		var lines = [];
		for (var i = 0; i < physical.length; i++) {
			var line = physical[i];
			if (line.length > 0 && (line[0] === ' ' || line[0] === '\t') && lines.length > 0) {
				lines[lines.length - 1] += line.substring(1);
			} else {
				lines.push(line);
			}
		}
		return lines;
	}

	/**
	 * Splits one content line into name, parameters and raw (still escaped) value.
	 * The first ':' outside double quotes ends the parameters. A group prefix (ITEM1.EMAIL) is dropped from name.
	 * @param {string} line - Unfolded content line
	 * @returns {{ head: string, name: string, params: string, value: string }|null}
	 *   head: original text before the value colon (kept when a changed line is rewritten);
	 *   name / params: upper-cased; null for empty or malformed lines
	 */
	function parseContentLine(line) {
		var text = String(line).trim();
		if (!text) {
			return null;
		}
		var inQuotes = false;
		var colonIndex = -1;
		for (var i = 0; i < text.length; i++) {
			var ch = text[i];
			if (ch === '"') {
				inQuotes = !inQuotes;
			} else if (ch === ':' && !inQuotes) {
				colonIndex = i;
				break;
			}
		}
		if (colonIndex === -1) {
			return null;
		}
		var head = text.substring(0, colonIndex);
		var semicolonIndex = head.indexOf(';');
		// vCard 3.0/4.0 property names are case-insensitive
		var name = (semicolonIndex === -1 ? head : head.substring(0, semicolonIndex)).toUpperCase();
		var dot = name.lastIndexOf('.');
		return {
			head: head,
			name: dot === -1 ? name : name.substring(dot + 1),
			params: semicolonIndex === -1 ? '' : head.substring(semicolonIndex + 1).toUpperCase(),
			value: text.substring(colonIndex + 1)
		};
	}

	/**
	 * Returns the TYPE values of a parameter string: TYPE=WORK,VOICE, TYPE="work", repeated TYPE params,
	 * and vCard 2.1 bare types (TEL;WORK;FAX).
	 * @param {string} params - Upper-cased parameters (without the property name)
	 * @returns {string[]}
	 */
	function getTypeTokens(params) {
		var tokens = [];
		String(params || '').split(';').forEach(function(param) {
			var eq = param.indexOf('=');
			if (eq !== -1 && param.substring(0, eq).trim() !== 'TYPE') {
				return;
			}
			param.substring(eq + 1).split(',').forEach(function(t) {
				t = t.replace(/"/g, '').trim();
				if (t) {
					tokens.push(t);
				}
			});
		});
		return tokens;
	}

	/**
	 * Unescapes a vCard text value in one pass (\\ \; \, \n \N), so "\\n" stays backslash + n.
	 * @param {string} value - Raw value
	 * @returns {string}
	 */
	function unescapeVCardValue(value) {
		return String(value == null ? '' : value).replace(/\\([\\;,nN])/g, function(m, c) {
			return (c === 'n' || c === 'N') ? '\n' : c;
		});
	}

	/**
	 * Splits a structured value (N, ADR, ORG) on unescaped ';'. Components stay escaped, so they can be
	 * written back verbatim; pass each through unescapeVCardValue to read it.
	 * @param {string} raw - Raw value
	 * @returns {string[]}
	 */
	function splitStructuredValue(raw) {
		var parts = [];
		var current = '';
		var s = String(raw == null ? '' : raw);
		for (var i = 0; i < s.length; i++) {
			var ch = s[i];
			if (ch === '\\' && i + 1 < s.length) {
				current += ch + s[i + 1];
				i++;
			} else if (ch === ';') {
				parts.push(current);
				current = '';
			} else {
				current += ch;
			}
		}
		parts.push(current);
		return parts;
	}

	function structuredComponents(raw) {
		return splitStructuredValue(raw).map(function(p) { return unescapeVCardValue(p).trim(); });
	}

	/**
	 * Parses a vCard string into a JavaScript object with properties.
	 * @param {string} vCardString - The vCard string to parse
	 * @returns {Object} - Object with contact properties (e.g., FirstName, PrimaryEmail, etc.)
	 */
	function parseVCard(vCardString) {
		if (!vCardString || typeof vCardString !== 'string') {
			return {};
		}
		var props = {};
		var lines = unfoldVCardLines(vCardString);
		for (var i = 0; i < lines.length; i++) {
			var parsed = parseContentLine(lines[i]);
			// Skip malformed lines, BEGIN/END and properties without a value
			if (!parsed || parsed.name === 'BEGIN' || parsed.name === 'END' || parsed.value === '') {
				continue;
			}
			applyParsedProperty(props, mapVCardPropertyToTB(parsed.name, parsed.params), parsed.value, parsed.params);
		}
		return props;
	}

	/**
	 * Processes a PHOTO field value, converting base64 data to data URI if needed.
	 * @param {string} value - The photo value (may be base64, data URI, or regular URI)
	 * @param {string} propertyParams - The property parameters (e.g., "ENCODING=BASE64;TYPE=JPEG")
	 * @returns {string} - Processed photo value suitable for img src
	 */
	function processPhotoValue(value, propertyParams) {
		// If already a data URI or other URI scheme, return as-is
		if (value.indexOf(':') !== -1 && (value.startsWith('data:') || value.startsWith('http:') || value.startsWith('https:') || value.startsWith('file:'))) {
			return value;
		}

		// Check if it's base64 encoded
		var upperParams = String(propertyParams || '').toUpperCase();
		if (upperParams.indexOf('ENCODING=BASE64') !== -1 || upperParams.indexOf('ENCODING=B') !== -1) {
			// Extract image type (TYPE=JPEG, TYPE=PNG, etc.)
			var imageType = 'image/jpeg'; // default
			var typeMatch = upperParams.match(/TYPE=([A-Z]+)/);
			if (typeMatch) {
				var type = typeMatch[1].toLowerCase();
				// Normalize jpeg variants
				if (type === 'jpg') type = 'jpeg';
				imageType = 'image/' + type;
			}
			// Convert to data URI (some exporters fold base64 with extra indentation)
			return 'data:' + imageType + ';base64,' + value.replace(/\s+/g, '');
		}

		// Return as-is (might be a URI without scheme)
		return value;
	}

	/**
	 * Maps vCard property names to Thunderbird property names.
	 * @param {string} vCardProp - vCard property name without group (e.g., "FN", "EMAIL")
	 * @param {string} params - Upper-cased parameters of the line
	 * @returns {string} - Thunderbird property name
	 */
	function mapVCardPropertyToTB(vCardProp, params) {
		var types = getTypeTokens(params);
		function has(t) {
			return types.indexOf(t) !== -1;
		}

		switch (vCardProp) {
			case 'FN':
				return 'DisplayName';
			case 'N':
				// N format: Family;Given;Additional;Prefix;Suffix — parsed in applyParsedProperty
				return 'N';
			case 'EMAIL':
				return 'PrimaryEmail'; // SecondEmail handled in applyParsedProperty
			case 'TEL':
				// Most specific type first: a "work,fax" line is a fax number
				if (has('FAX')) return 'FaxNumber';
				if (has('PAGER')) return 'PagerNumber';
				if (has('CELL') || has('MOBILE')) return 'CellularNumber';
				if (has('WORK')) return 'WorkPhone';
				if (has('HOME')) return 'HomePhone';
				// Default to CellularNumber if no type specified
				return 'CellularNumber';
			case 'ADR':
				if (has('HOME')) return 'HomeAddress';
				if (has('WORK')) return 'WorkAddress';
				return 'HomeAddress';
			case 'URL':
				// Thunderbird writes WebPage1 as URL;TYPE=work and WebPage2 as URL;TYPE=home
				return has('HOME') ? 'WebPage2' : 'WebPage1';
			case 'ORG':
				return 'Company'; // ORG:Company;Department — parsed in applyParsedProperty
			case 'TITLE':
				return 'JobTitle';
			case 'NOTE':
				return 'Notes';
			case 'BDAY':
				return 'BirthDay';
			case 'NICKNAME':
				return 'NickName';
			case 'PHOTO':
				return 'PhotoURI';
			case 'UID':
				return 'UID';
			case 'REV':
				return 'LastModifiedDate';
			case 'X-AIM':
				// Legacy AIM; Thunderbird property _AimScreenName (see generateVCard).
				return '_AimScreenName';
		}
		return vCardProp;
	}

	/**
	 * Parses ADR structured value into Thunderbird-style address fields.
	 *
	 * vCard ADR (RFC 2426 / 6350) is seven components separated by ';':
	 *   PO Box; Extended address; Street; Locality (city); Region (state); Postal code; Country
	 *
	 * Thunderbird / addressBooks typically emit:
	 *   ;;Street;City;State;Zip;Country
	 * so street is parts[2], city parts[3], … Extra trailing ';' (8+ parts) is ignored.
	 *
	 * Empty street is valid: ;;;City;Region;Zip;Country (city stays at index 3). Treating
	 * "three leading empties" as a shifted layout used to put city in Home Address, region
	 * in Address 2, ZIP in City, country in State — which matches real Italian contacts
	 * (e.g. Orta San Giulio / NO / 28016 / Italy).
	 *
	 * @param {string} value - Raw (still escaped) ADR property value
	 * @returns {{ street: string, line2: string, city: string, state: string, zip: string, country: string }}
	 */
	function parseAdrComponents(value) {
		var parts = structuredComponents(value);
		while (parts.length < 7) {
			parts.push('');
		}
		return {
			line2: parts[1] || '',
			street: parts[2] || '',
			city: parts[3] || '',
			state: parts[4] || '',
			zip: parts[5] || '',
			country: parts[6] || ''
		};
	}

	/**
	 * Builds the ADR property value (seven semicolon-separated components; no "ADR;TYPE=...:" prefix).
	 * Order: PO Box; extended (HomeAddress2/WorkAddress2); street; city; region; postal code; country.
	 *
	 * Each component is escaped with escapeVCardValue, then joined with unescaped ';' delimiters.
	 * Do not pass the whole composite through escapeVCardValue — that used to turn every field
	 * delimiter into an escaped semicolon and broke RFC 2426 structured ADR (addresses missing in Thunderbird's editor).
	 *
	 * @param {string} line2 - Extended address / Address2
	 * @param {string} street - Street / Address line 1
	 * @param {string} city - Locality
	 * @param {string} state - Region
	 * @param {string} zip - Postal code
	 * @param {string} country - Country
	 * @param {string} [poBox] - Raw (escaped) PO box from the original line, not modelled as a field
	 * @returns {string}
	 */
	function formatAdrValue(line2, street, city, state, zip, country, poBox) {
		var parts = [(line2 || ''), (street || ''), (city || ''), (state || ''), (zip || ''), (country || '')];
		return [poBox || ''].concat(parts.map(function(p) { return escapeVCardValue(p); })).join(';');
	}

	/** Fields generateVCard / mergeVCard write; first line wins when a vCard repeats one of them. */
	var GENERATED_FIELDS = [
		'DisplayName', 'LastName', 'FirstName', 'MiddleName', 'PrimaryEmail', 'SecondEmail',
		'CellularNumber', 'WorkPhone', 'HomePhone', 'FaxNumber', 'PagerNumber',
		'HomeAddress', 'HomeAddress2', 'HomeCity', 'HomeState', 'HomeZipCode', 'HomeCountry',
		'WorkAddress', 'WorkAddress2', 'WorkCity', 'WorkState', 'WorkZipCode', 'WorkCountry',
		'Company', 'Department', 'JobTitle', 'Notes', 'WebPage1', 'WebPage2',
		'BirthYear', 'BirthMonth', 'BirthDay', 'NickName', '_AimScreenName', 'PhotoURI', 'UID', 'LastModifiedDate'
	];

	/**
	 * Applies a single parsed vCard property to props (internal use in parseVCard and mergeVCard).
	 * Handles N -> FirstName/LastName; multiple EMAIL; REV -> LastModifiedDate; TEL; ADR; ORG;
	 * BirthDay (BDAY line); etc. For modelled fields the first line wins; later ones are left to mergeVCard,
	 * which keeps them verbatim.
	 * @param {Object} props - Properties object
	 * @param {string} property - Thunderbird property name (e.g. 'N', 'PrimaryEmail', 'LastModifiedDate')
	 * @param {string} rawValue - Raw (still escaped) property value
	 * @param {string} params - Upper-cased parameters of the line
	 * @returns {string[]} Modelled fields this line set (empty: line not represented by generated output)
	 */
	function applyParsedProperty(props, property, rawValue, params) {
		if (property === 'N') {
			if (props.hasOwnProperty('LastName')) {
				return [];
			}
			// Structured name: Family;Given;Additional;Prefix;Suffix (prefix/suffix kept by mergeVCard)
			var parts = structuredComponents(rawValue);
			props['LastName'] = parts[0] || '';
			props['FirstName'] = parts[1] || '';
			if (parts[2]) {
				props['MiddleName'] = parts[2];
			}
			return ['LastName', 'FirstName', 'MiddleName'];
		} else if (property === 'PrimaryEmail') {
			// Multiple EMAIL properties in one vCard: first line -> PrimaryEmail, second -> SecondEmail
			// (must match the EMAIL1 / EMAIL2 unit order in VCARD_UNITS)
			var email = unescapeVCardValue(rawValue);
			if (!props['PrimaryEmail']) {
				props['PrimaryEmail'] = email;
				return ['PrimaryEmail'];
			} else if (!props['SecondEmail']) {
				props['SecondEmail'] = email;
				return ['SecondEmail'];
			}
			// Third and further EMAIL lines are not modelled (mergeVCard keeps them)
			return [];
		} else if (property === 'HomeAddress' || property === 'WorkAddress') {
			// mapVCardPropertyToTB maps TYPE=HOME/WORK ADR lines to HomeAddress / WorkAddress
			var baseProp = property.replace('Address', '');
			if (props.hasOwnProperty(baseProp + 'Address')) {
				return [];
			}
			var adr = parseAdrComponents(rawValue);
			props[baseProp + 'Address'] = adr.street;
			props[baseProp + 'Address2'] = adr.line2;
			props[baseProp + 'City'] = adr.city;
			props[baseProp + 'State'] = adr.state;
			props[baseProp + 'ZipCode'] = adr.zip;
			props[baseProp + 'Country'] = adr.country;
			return adrFields(baseProp);
		} else if (property === 'Company') {
			if (props.hasOwnProperty('Company')) {
				return [];
			}
			var org = structuredComponents(rawValue);
			props['Company'] = org[0] || '';
			if (org[1]) {
				props['Department'] = org[1];
			}
			return ['Company', 'Department'];
		} else if (property === 'BirthDay') {
			// BDAY vCard line is mapped to property name BirthDay (see mapVCardPropertyToTB)
			// Parse birthday: YYYY-MM-DD or YYYYMMDD into BirthYear / BirthMonth / day-of-month.
			// Year-less (--MMDD) or text birthdays are not modelled and stay in the vCard as they are.
			if (props.hasOwnProperty('BirthYear')) {
				return [];
			}
			var dateMatch = unescapeVCardValue(rawValue).match(/^(\d{4})-?(\d{2})-?(\d{2})/);
			if (!dateMatch) {
				return [];
			}
			props['BirthYear'] = dateMatch[1];
			props['BirthMonth'] = dateMatch[2];
			props['BirthDay'] = dateMatch[3];
			return ['BirthYear', 'BirthMonth', 'BirthDay'];
		} else if (property === 'LastModifiedDate') {
			if (props.hasOwnProperty('LastModifiedDate')) {
				return [];
			}
			props['LastModifiedDate'] = parseRevToStoredRevValue(unescapeVCardValue(rawValue));
			return ['LastModifiedDate'];
		} else if (GENERATED_FIELDS.indexOf(property) !== -1) {
			if (props.hasOwnProperty(property)) {
				return [];
			}
			// URL and PHOTO are URI values: no text escaping (RFC 6350 4)
			if (property === 'PhotoURI') {
				props[property] = processPhotoValue(rawValue, params);
			} else if (property === 'WebPage1' || property === 'WebPage2') {
				props[property] = rawValue;
			} else {
				props[property] = unescapeVCardValue(rawValue);
			}
			return [property];
		}
		// Includes VERSION, CATEGORIES, IMPP, X-* etc.: readable, but never rewritten
		props[property] = unescapeVCardValue(rawValue);
		return [];
	}

	function adrFields(base) {
		return [base + 'Address', base + 'Address2', base + 'City', base + 'State', base + 'ZipCode', base + 'Country'];
	}

	/**
	 * Builds a PHOTO line. Data URIs become ENCODING=b in vCard 3.0; vCard 4.0 and URLs use a URI value.
	 * @param {string} uri - PhotoURI value
	 * @param {boolean} version4 - True when writing into a vCard 4.0
	 * @returns {string}
	 */
	function formatPhotoLine(uri, version4) {
		var m = /^data:image\/([a-z0-9.+-]+);base64,(.*)$/i.exec(uri);
		if (version4) {
			return 'PHOTO:' + uri;
		}
		if (m) {
			return 'PHOTO;ENCODING=b;TYPE=' + m[1].toUpperCase() + ':' + m[2];
		}
		return 'PHOTO;VALUE=uri:' + uri;
	}

	/**
	 * A unit is one vCard line that represents a fixed set of fields. emit(props, orig, opts) returns the
	 * line for the current props, or null to omit it. orig is the parsed original line being rewritten
	 * (null for a new line): its head (group, TYPE/PREF params) and unmodelled structured components are reused.
	 */
	function textUnit(key, field, fallbackHead) {
		return {
			key: key,
			fields: [field],
			emit: function(props, orig) {
				if (!props[field]) {
					return null;
				}
				return (orig ? orig.head : fallbackHead) + ':' + escapeVCardValue(props[field]);
			}
		};
	}

	function uriUnit(key, field, fallbackHead) {
		return {
			key: key,
			fields: [field],
			emit: function(props, orig) {
				if (!props[field]) {
					return null;
				}
				return (orig ? orig.head : fallbackHead) + ':' + String(props[field]).replace(/[\r\n]+/g, '');
			}
		};
	}

	function adrUnit(base) {
		var fields = adrFields(base);
		return {
			key: 'ADR_' + base,
			fields: fields,
			emit: function(props, orig) {
				// Include Address2 in the "emit?" check so line-only contacts round-trip.
				if (!(props[base + 'Address'] || props[base + 'Address2'] || props[base + 'City'])) {
					return null;
				}
				var poBox = orig ? splitStructuredValue(orig.value)[0] : '';
				return (orig ? orig.head : 'ADR;TYPE=' + base.toUpperCase()) + ':' + formatAdrValue(
					props[base + 'Address2'], props[base + 'Address'], props[base + 'City'],
					props[base + 'State'], props[base + 'ZipCode'], props[base + 'Country'], poBox);
			}
		};
	}

	var VCARD_UNITS = [
		textUnit('FN', 'DisplayName', 'FN'),
		{
			key: 'N',
			fields: ['LastName', 'FirstName', 'MiddleName'],
			emit: function(props, orig) {
				// Prefix and suffix are not modelled: keep them from the original line
				var old = orig ? splitStructuredValue(orig.value) : [];
				return (orig ? orig.head : 'N') + ':' + [
					escapeVCardValue(props['LastName'] || ''),
					escapeVCardValue(props['FirstName'] || ''),
					escapeVCardValue(props['MiddleName'] || ''),
					old[3] || '',
					old[4] || ''
				].join(';');
			}
		},
		// Emails: order must match applyParsedProperty (first EMAIL is PrimaryEmail)
		textUnit('EMAIL1', 'PrimaryEmail', 'EMAIL;TYPE=INTERNET'),
		textUnit('EMAIL2', 'SecondEmail', 'EMAIL;TYPE=INTERNET'),
		textUnit('TEL_CELL', 'CellularNumber', 'TEL;TYPE=CELL'),
		textUnit('TEL_WORK', 'WorkPhone', 'TEL;TYPE=WORK'),
		textUnit('TEL_HOME', 'HomePhone', 'TEL;TYPE=HOME'),
		textUnit('TEL_FAX', 'FaxNumber', 'TEL;TYPE=FAX'),
		textUnit('TEL_PAGER', 'PagerNumber', 'TEL;TYPE=PAGER'),
		adrUnit('Home'),
		adrUnit('Work'),
		{
			key: 'ORG',
			fields: ['Company', 'Department'],
			emit: function(props, orig) {
				var old = orig ? splitStructuredValue(orig.value) : [];
				var tail = old.slice(2); // further organizational units are not modelled
				if (!props['Company'] && !props['Department'] && tail.length === 0) {
					return null;
				}
				var parts = [escapeVCardValue(props['Company'] || '')];
				if (props['Department'] || tail.length) {
					parts.push(escapeVCardValue(props['Department'] || ''));
				}
				return (orig ? orig.head : 'ORG') + ':' + parts.concat(tail).join(';');
			}
		},
		textUnit('TITLE', 'JobTitle', 'TITLE'),
		textUnit('NOTE', 'Notes', 'NOTE'),
		uriUnit('URL1', 'WebPage1', 'URL'),
		uriUnit('URL2', 'WebPage2', 'URL;TYPE=HOME'),
		{
			key: 'BDAY',
			fields: ['BirthYear', 'BirthMonth', 'BirthDay'],
			emit: function(props) {
				if (!(props['BirthYear'] && props['BirthMonth'] && props['BirthDay'])) {
					return null;
				}
				return 'BDAY:' + props['BirthYear'] + '-' + props['BirthMonth'] + '-' + props['BirthDay'];
			}
		},
		textUnit('NICKNAME', 'NickName', 'NICKNAME'),
		// Persist AIM screen name for contacts.update (pairs with different AIM skip duplicate loop).
		textUnit('X-AIM', '_AimScreenName', 'X-AIM'),
		{
			key: 'PHOTO',
			fields: ['PhotoURI'],
			emit: function(props, orig, opts) {
				return props['PhotoURI'] ? formatPhotoLine(String(props['PhotoURI']), opts && opts.version4) : null;
			}
		},
		textUnit('UID', 'UID', 'UID'),
		{
			key: 'REV',
			fields: ['LastModifiedDate'],
			emit: function(props) {
				// REV: uses formatRevForVCard so epoch / compact / ISO-like values round-trip with parseRevToStoredRevValue
				var revVal = props['LastModifiedDate'] ? formatRevForVCard(props['LastModifiedDate']) : '';
				return revVal !== '' ? 'REV:' + revVal : null;
			}
		}
	];

	function unitForField(field) {
		for (var i = 0; i < VCARD_UNITS.length; i++) {
			if (VCARD_UNITS[i].fields.indexOf(field) !== -1) {
				return VCARD_UNITS[i];
			}
		}
		return null;
	}

	/**
	 * Generates a vCard string from a JavaScript object with properties.
	 * Only modelled fields are written: use mergeVCard when updating an existing contact.
	 * @param {Object} props - Object with contact properties
	 * @returns {string} - vCard string
	 */
	function generateVCard(props) {
		if (!props || typeof props !== 'object') {
			return 'BEGIN:VCARD\r\nVERSION:3.0\r\nEND:VCARD';
		}
		var lines = ['BEGIN:VCARD', 'VERSION:3.0'];
		for (var i = 0; i < VCARD_UNITS.length; i++) {
			var line = VCARD_UNITS[i].emit(props, null, { version4: false });
			if (line !== null) {
				lines.push(line);
			}
		}
		lines.push('END:VCARD');
		return lines.join('\r\n');
	}

	/**
	 * Writes props back into an existing vCard with as few changes as possible.
	 *
	 * The original is replayed line by line through applyParsedProperty:
	 * - lines that set no modelled field (CATEGORIES, IMPP, X-*, third EMAIL, second TEL;TYPE=WORK, ...)
	 *   are kept verbatim;
	 * - lines whose fields still hold the parsed value are kept verbatim (params, group, folding-free text);
	 * - lines whose fields changed are rewritten in place (same head; cleared fields drop the line);
	 * - fields that had no line get a new one, before any kept line of the same property (so a new
	 *   SecondEmail is not shadowed by a kept third EMAIL) or else before END:VCARD.
	 * A modelled single-value property (BDAY, N, UID, REV) that is newly written replaces any unparsed
	 * original line of that property, e.g. a year-less BDAY.
	 *
	 * @param {string} originalVCard - vCard the contact was loaded from (card._vCard)
	 * @param {Object} props - Current contact fields
	 * @returns {string} vCard string
	 */
	function mergeVCard(originalVCard, props) {
		var origLines = unfoldVCardLines(originalVCard);
		var beginIndex = -1;
		var endIndex = -1;
		for (var b = 0; b < origLines.length; b++) {
			var t = origLines[b].trim().toUpperCase();
			if (beginIndex === -1 && t === 'BEGIN:VCARD') beginIndex = b;
			if (t === 'END:VCARD') endIndex = b;
		}
		if (!props || typeof props !== 'object' || beginIndex === -1 || endIndex < beginIndex) {
			return generateVCard(props);
		}

		var replay = {};
		var out = [];             // strings (kept lines) or { unit, orig } (lines to rewrite)
		var placedUnits = {};
		var firstUnmodelledByName = {}; // vCard name -> index in out of the first kept, unmodelled line
		var unmodelledSingles = [];     // { index, name } of unparsed BDAY/N/UID/REV lines
		var singleNames = { BDAY: 'BDAY', N: 'N', UID: 'UID', REV: 'REV' };
		var version4 = false;
		var endOut = -1;

		for (var i = beginIndex; i <= endIndex; i++) {
			var raw = origLines[i];
			var parsed = parseContentLine(raw);
			if (!parsed) {
				continue; // blank or malformed lines
			}
			if (i === endIndex) {
				endOut = out.length;
				out.push(raw);
				continue;
			}
			if (parsed.name === 'VERSION' && parsed.value.trim() === '4.0') {
				version4 = true;
			}
			var fields = (parsed.name === 'BEGIN' || parsed.value === '') ? [] :
				applyParsedProperty(replay, mapVCardPropertyToTB(parsed.name, parsed.params), parsed.value, parsed.params);
			if (fields.length === 0) {
				if (!firstUnmodelledByName.hasOwnProperty(parsed.name)) {
					firstUnmodelledByName[parsed.name] = out.length;
				}
				if (singleNames.hasOwnProperty(parsed.name)) {
					unmodelledSingles.push({ index: out.length, name: parsed.name });
				}
				out.push(raw);
				continue;
			}
			var unit = unitForField(fields[0]);
			placedUnits[unit.key] = true;
			var unchanged = fields.every(function(f) { return sameFieldValue(props[f], replay[f]); });
			out.push(unchanged ? raw : { unit: unit, orig: parsed });
		}

		// Units that had no line in the original
		var insertBefore = {}; // out index -> lines
		var opts = { version4: version4 };
		var rewrittenNames = {};
		for (var u = 0; u < VCARD_UNITS.length; u++) {
			var unitU = VCARD_UNITS[u];
			if (placedUnits[unitU.key]) {
				continue;
			}
			var line = unitU.emit(props, null, opts);
			if (line === null || (unitU.key === 'N' && !props['LastName'] && !props['FirstName'] && !props['MiddleName'])) {
				continue;
			}
			var name = parseContentLine(line).name;
			rewrittenNames[name] = true;
			var at = firstUnmodelledByName.hasOwnProperty(name) ? firstUnmodelledByName[name] : endOut;
			(insertBefore[at] = insertBefore[at] || []).push(line);
		}
		for (var k = 0; k < out.length; k++) {
			if (typeof out[k] !== 'string') {
				rewrittenNames[out[k].orig.name] = true;
			}
		}
		var dropped = {};
		unmodelledSingles.forEach(function(s) {
			if (rewrittenNames[s.name]) dropped[s.index] = true;
		});

		var result = [];
		for (var j = 0; j < out.length; j++) {
			if (insertBefore[j]) {
				result = result.concat(insertBefore[j]);
			}
			if (dropped[j]) {
				continue;
			}
			if (typeof out[j] === 'string') {
				result.push(out[j]);
			} else {
				var rewritten = out[j].unit.emit(props, out[j].orig, opts);
				if (rewritten !== null) {
					result.push(rewritten);
				}
			}
		}
		return result.join('\r\n');
	}

	function sameFieldValue(a, b) {
		return (a == null ? '' : String(a)) === (b == null ? '' : String(b));
	}

	/**
	 * Escapes special characters in vCard values.
	 * @param {string} value - Value to escape
	 * @returns {string} - Escaped value
	 */
	function escapeVCardValue(value) {
		if (value == null || value === undefined) {
			return '';
		}
		return String(value)
			.replace(/\\/g, '\\\\')
			.replace(/;/g, '\\;')
			.replace(/,/g, '\\,')
			.replace(/\r\n|\r|\n/g, '\\n');
	}

	/**
	 * Normalizes a raw REV line value from a vCard into the string stored as LastModifiedDate.
	 * Trimming only; preserves exporter-specific forms where possible so parse is lossless for display logic.
	 * @param {string} raw - Unescaped REV value from the vCard line
	 * @returns {string}
	 */
	function parseRevToStoredRevValue(raw) {
		if (raw == null || raw === undefined) {
			return '';
		}
		return String(raw).trim();
	}

	/**
	 * Interprets LastModifiedDate / REV storage for UI (same rules as the former inline logic in
	 * DuplicateEntriesWindowCardValues.getProperty). Returns null if empty or unparseable.
	 * @param {*} value - Raw property value (epoch string, REV compact, ISO fragment, etc.)
	 * @returns {Date|null}
	 */
	function parseLastModifiedDateForDisplay(value) {
		if (value == "0" || value === "" || value == null || value === undefined) {
			return null;
		}
		var num = parseInt(value, 10);
		if (!isNaN(num) && String(num) === String(value).trim()) {
			return new Date(num < 1e12 ? num * 1000 : num);
		}
		var s = String(value).trim();
		// vCard REV compact format "20230215T120000Z" — insert hyphens for Date parsing
		if (/^\d{8}T\d{6}Z?$/i.test(s)) {
			s = s.substr(0, 4) + '-' + s.substr(4, 2) + '-' + s.substr(6, 2) + 'T' + s.substr(9, 2) + ':' + s.substr(11, 2) + ':' + s.substr(13, 2) + (s.charAt(15) === 'Z' ? 'Z' : '');
		} else if (/^\d{8}$/.test(s)) {
			s = s.substr(0, 4) + '-' + s.substr(4, 2) + '-' + s.substr(6, 2);
		}
		var d = new Date(s);
		return isNaN(d.getTime()) ? null : d;
	}

	/**
	 * Builds the value for a REV: property line from LastModifiedDate storage.
	 * When the stored value parses as a date (epoch, compact REV, ISO-like), emits vCard-friendly
	 * compact UTC (YYYYMMDDTHHMMSSZ) so round-trip with parseRevToStoredRevValue stays stable.
	 * Otherwise uses escapeVCardValue for opaque strings.
	 * @param {*} lastModifiedDate - Value from props['LastModifiedDate']
	 * @returns {string} Content after "REV:" (empty means omit REV line in generateVCard)
	 */
	function formatRevForVCard(lastModifiedDate) {
		if (lastModifiedDate == null || lastModifiedDate === undefined || lastModifiedDate === '') {
			return '';
		}
		var s = String(lastModifiedDate).trim();
		if (s === '' || s === '0') {
			return '';
		}
		var d = parseLastModifiedDateForDisplay(s);
		if (d) {
			var iso = d.toISOString();
			return iso.replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z');
		}
		return escapeVCardValue(s);
	}

	/**
	 * Gets a property value from a plain contact object (parsed vCard fields on the object).
	 * Matches legacy nsIAbCard-style behavior: missing, null, or undefined yields defaultValue.
	 * @param {Object} vCardProps - Properties object (from parseVCard)
	 * @param {string} property - Property name
	 * @param {*} defaultValue - Default value if property doesn't exist
	 * @returns {*} - Property value or default
	 */
	function getProperty(vCardProps, property, defaultValue) {
		if (!vCardProps || typeof vCardProps !== 'object') {
			return defaultValue;
		}
		if (!vCardProps.hasOwnProperty(property)) {
			return defaultValue;
		}
		var value = vCardProps[property];
		if (value === null || value === undefined) {
			return defaultValue;
		}
		return value;
	}

	/**
	 * Sets a property value in a vCard properties object.
	 * @param {Object} vCardProps - Properties object
	 * @param {string} property - Property name
	 * @param {*} value - Value to set
	 */
	function setProperty(vCardProps, property, value) {
		if (!vCardProps || typeof vCardProps !== 'object') {
			return;
		}
		vCardProps[property] = value;
	}

	/**
	 * Builds a plain contact object from an MV3 addressBooks.contacts list entry (vCard only).
	 * @param {{ id: string, vCard?: string }} contact - API contact node
	 * @param {string} addressBookId - Parent address book id
	 * @returns {Object} TB-shaped fields plus _id, _addressBookId, _vCard
	 */
	function createContactCardFromApiContact(contact, addressBookId) {
		var cardProps = parseVCard(contact && contact.vCard ? contact.vCard : '');
		cardProps._id = contact.id;
		cardProps._addressBookId = addressBookId;
		// Original vCard: saveCard merges edits into it (mergeVCard) so unmodelled data is preserved
		cardProps._vCard = (contact && contact.vCard) ? contact.vCard : '';
		// nsIAbCard-style API: single delegation point to getProperty/setProperty above
		cardProps.getProperty = function(property, defaultValue) {
			return getProperty(this, property, defaultValue);
		};
		cardProps.setProperty = function(property, value) {
			setProperty(this, property, value);
		};
		return cardProps;
	}

	/**
	 * Primary email from contact vCard (MV3); no legacy properties API.
	 * @param {{ vCard?: string }} contact
	 * @returns {string}
	 */
	function extractPrimaryEmailFromContact(contact) {
		if (!contact || !contact.vCard) {
			return '';
		}
		var props = parseVCard(contact.vCard);
		var email = props.PrimaryEmail;
		if (email == null || email === undefined) {
			return '';
		}
		email = String(email).trim();
		return email;
	}

	/**
	 * Display label from FN / N via parsed vCard, or contact id.
	 * @param {{ id: string, vCard?: string }} contact
	 * @returns {string}
	 */
	function extractDisplayNameFromContact(contact) {
		if (!contact) {
			return '';
		}
		var p = parseVCard(contact.vCard || '');
		if (p.DisplayName) {
			return p.DisplayName;
		}
		var fl = ((p.FirstName || '') + ' ' + (p.LastName || '')).trim();
		if (fl) {
			return fl;
		}
		return contact.id || '';
	}

	return {
		parseVCard: parseVCard,
		generateVCard: generateVCard,
		mergeVCard: mergeVCard,
		getProperty: getProperty,
		setProperty: setProperty,
		escapeVCardValue: escapeVCardValue,
		parseLastModifiedDateForDisplay: parseLastModifiedDateForDisplay,
		createContactCardFromApiContact: createContactCardFromApiContact,
		extractPrimaryEmailFromContact: extractPrimaryEmailFromContact,
		extractDisplayNameFromContact: extractDisplayNameFromContact
	};
})();
