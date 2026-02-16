// vCardUtils.js - vCard parsing and generation utilities for TB128
// Converts between vCard strings (used by WebExtension API) and JavaScript objects (used by business logic)

var VCardUtils = (function() {
	"use strict";

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
		var lines = vCardString.split(/\r?\n/);
		var currentProperty = null;
		var currentValue = [];
		var currentPropertyParams = null; // Track parameters for special handling

	for (var i = 0; i < lines.length; i++) {
		var line = lines[i];
		
		// Handle line continuation (starts with space or tab) - DON'T trim before this check!
		if (line.length > 0 && (line[0] === ' ' || line[0] === '\t')) {
			if (currentProperty) {
				// Remove the leading space/tab and add to current value
				currentValue.push(line.substring(1).trim());
			}
			continue;
		}
		
		// Now we can trim for non-continuation lines
		line = line.trim();

		// Process accumulated value
		if (currentProperty && currentValue.length > 0) {
			var value = currentValue.join('').replace(/\\n/g, '\n').replace(/\\,/g, ',').replace(/\\;/g, ';').replace(/\\\\/g, '\\');
			
			// Special handling for PHOTO with base64 encoding
			if (currentProperty === 'PhotoURI' && currentPropertyParams) {
				value = processPhotoValue(value, currentPropertyParams);
			}
			
			applyParsedProperty(props, currentProperty, value);
			currentValue = [];
			currentPropertyParams = null;
		}

			// Skip empty lines and BEGIN/END
			if (!line || line === 'BEGIN:VCARD' || line === 'END:VCARD') {
				continue;
			}

		// Parse property line (format: PROPERTY[;PARAM=VALUE]*:VALUE)
		var colonIndex = line.indexOf(':');
		if (colonIndex === -1) {
			continue;
		}

		var propertyPart = line.substring(0, colonIndex);
		var valuePart = line.substring(colonIndex + 1);

		// Extract property name (before first semicolon). vCard 3.0/4.0 are case-insensitive.
		var semicolonIndex = propertyPart.indexOf(';');
		var propertyName = (semicolonIndex === -1 ? propertyPart : propertyPart.substring(0, semicolonIndex)).toUpperCase();

		// Map vCard properties to Thunderbird property names
		currentProperty = mapVCardPropertyToTB(propertyName, propertyPart.toUpperCase());
		
		// Store property parameters for special processing (e.g., PHOTO encoding)
		if (propertyName === 'PHOTO') {
			currentPropertyParams = propertyPart.toUpperCase();
		}
		
		if (valuePart) {
			currentValue.push(valuePart);
		}
		}

	// Process last property
	if (currentProperty && currentValue.length > 0) {
		var value = currentValue.join('').replace(/\\n/g, '\n').replace(/\\,/g, ',').replace(/\\;/g, ';').replace(/\\\\/g, '\\');
		
		// Special handling for PHOTO with base64 encoding
		if (currentProperty === 'PhotoURI' && currentPropertyParams) {
			value = processPhotoValue(value, currentPropertyParams);
		}
		
		applyParsedProperty(props, currentProperty, value);
	}

	return props;
}

/**
 * Processes a PHOTO field value, converting base64 data to data URI if needed.
 * @param {string} value - The photo value (may be base64, data URI, or regular URI)
 * @param {string} propertyParams - The property parameters (e.g., "PHOTO;ENCODING=BASE64;TYPE=JPEG")
 * @returns {string} - Processed photo value suitable for img src
 */
function processPhotoValue(value, propertyParams) {
	// If already a data URI or other URI scheme, return as-is
	if (value.indexOf(':') !== -1 && (value.startsWith('data:') || value.startsWith('http:') || value.startsWith('https:') || value.startsWith('file:'))) {
		return value;
	}
	
	// Check if it's base64 encoded
	var upperParams = propertyParams.toUpperCase();
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
		// Convert to data URI
		return 'data:' + imageType + ';base64,' + value;
	}
	
	// Return as-is (might be a URI without scheme)
	return value;
}

	/**
	 * Maps vCard property names to Thunderbird property names.
	 * @param {string} vCardProp - vCard property name (e.g., "FN", "EMAIL")
	 * @param {string} fullProperty - Full property line including parameters
	 * @returns {string} - Thunderbird property name
	 */
	function mapVCardPropertyToTB(vCardProp, fullProperty) {
		// Handle grouped ITEMn.FN (DisplayName)
		if (/^ITEM\d+\.FN$/i.test(vCardProp)) {
			return 'DisplayName';
		}

		var propMap = {
			'FN': 'DisplayName',
			'N': 'N', // Structured name - will be parsed separately
			'EMAIL': 'PrimaryEmail', // First email becomes PrimaryEmail
			'TEL': 'TEL', // Will be mapped by TYPE parameter
			'ADR': 'ADR', // Will be mapped by TYPE parameter
			'ORG': 'Company',
			'TITLE': 'JobTitle',
			'NOTE': 'Notes',
			'URL': 'WebPage1',
			'BDAY': 'BirthDay',
			'NICKNAME': 'NickName',
			'PHOTO': 'PhotoURI',
			'UID': 'UID',
			'REV': 'LastModifiedDate'
		};

		// Handle structured name (N property) and grouped ITEMn.N
		if (vCardProp === 'N' || /^ITEM\d+\.N$/i.test(vCardProp)) {
			// N format: Family;Given;Additional;Prefix;Suffix — parsed in applyParsedProperty
			return 'N';
		}

		// Handle TEL with TYPE parameter (and grouped ITEMn.TEL)
		if ((vCardProp === 'TEL' || /^ITEM\d+\.TEL$/i.test(vCardProp)) && fullProperty) {
			if (fullProperty.indexOf('TYPE=CELL') !== -1 || fullProperty.indexOf('TYPE=MOBILE') !== -1) {
				return 'CellularNumber';
			} else if (fullProperty.indexOf('TYPE=WORK') !== -1) {
				return 'WorkPhone';
			} else if (fullProperty.indexOf('TYPE=HOME') !== -1) {
				return 'HomePhone';
			} else if (fullProperty.indexOf('TYPE=FAX') !== -1) {
				return 'FaxNumber';
			} else if (fullProperty.indexOf('TYPE=PAGER') !== -1) {
				return 'PagerNumber';
			}
			// Default to CellularNumber if no type specified
			return 'CellularNumber';
		}

		// Handle ADR with TYPE parameter (and grouped ITEMn.ADR)
		if ((vCardProp === 'ADR' || /^ITEM\d+\.ADR$/i.test(vCardProp)) && fullProperty) {
			if (fullProperty.indexOf('TYPE=HOME') !== -1) {
				return 'HomeAddress';
			} else if (fullProperty.indexOf('TYPE=WORK') !== -1) {
				return 'WorkAddress';
			}
			return 'HomeAddress';
		}

		// Handle EMAIL and grouped ITEMn.EMAIL (e.g. ITEM1.EMAIL, ITEM2.EMAIL from some exporters)
		if (vCardProp === 'EMAIL' || /^ITEM\d+\.EMAIL$/i.test(vCardProp)) {
			return 'PrimaryEmail'; // SecondEmail handled in applyParsedProperty
		}

		return propMap[vCardProp] || vCardProp;
	}

	/**
	 * Applies a single parsed vCard property to props (internal use in parseVCard).
	 * Handles N -> FirstName/LastName, multiple emails, TEL, ADR, BDAY, etc.
	 * @param {Object} props - Properties object
	 * @param {string} property - Property name (e.g. 'N', 'PrimaryEmail')
	 * @param {string} value - Property value
	 */
	function applyParsedProperty(props, property, value) {
		if (property === 'N') {
			// Parse structured name: Family;Given;Additional;Prefix;Suffix (vCard 3.0/4.0 use semicolon)
			var parts = value.split(';').map(function(p) { return (p || '').trim(); });
			if (parts.length >= 1) {
				props['LastName'] = parts[0] || '';
			}
			if (parts.length >= 2) {
				props['FirstName'] = parts[1] || '';
			}
			if (parts.length >= 3 && parts[2]) {
				props['MiddleName'] = parts[2];
			}
		} else if (property === 'PrimaryEmail') {
			// Handle multiple emails
			if (!props['PrimaryEmail']) {
				props['PrimaryEmail'] = value;
			} else if (!props['SecondEmail']) {
				props['SecondEmail'] = value;
			}
		} else if (property === 'TEL') {
			// TEL without type - default to CellularNumber
			if (!props['CellularNumber']) {
				props['CellularNumber'] = value;
			}
		} else if (property === 'ADR' || property === 'HomeAddress' || property === 'WorkAddress') {
			// Parse address: ;;;Street;City;State;Zip;Country
			var parts = value.split(';');
			if (parts.length >= 4) {
				var baseProp = (property === 'ADR') ? 'Home' : property.replace('Address', '');
				props[baseProp + 'Address'] = parts[3] || '';
				props[baseProp + 'Address2'] = parts[4] || '';
				props[baseProp + 'City'] = parts[5] || '';
				props[baseProp + 'State'] = parts[6] || '';
				props[baseProp + 'ZipCode'] = parts[7] || '';
				props[baseProp + 'Country'] = parts[8] || '';
			}
		} else if (property === 'BDAY') {
			// Parse birthday: YYYY-MM-DD or YYYYMMDD
			var dateMatch = value.match(/^(\d{4})-?(\d{2})-?(\d{2})/);
			if (dateMatch) {
				props['BirthYear'] = dateMatch[1];
				props['BirthMonth'] = dateMatch[2];
				props['BirthDay'] = dateMatch[3];
			}
		} else {
			props[property] = value;
		}
	}

	/**
	 * Generates a vCard string from a JavaScript object with properties.
	 * @param {Object} props - Object with contact properties
	 * @returns {string} - vCard string
	 */
	function generateVCard(props) {
		if (!props || typeof props !== 'object') {
			return 'BEGIN:VCARD\r\nVERSION:3.0\r\nEND:VCARD';
		}

		var lines = ['BEGIN:VCARD', 'VERSION:3.0'];

		// Map Thunderbird properties to vCard properties
		if (props['DisplayName']) {
			lines.push('FN:' + escapeVCardValue(props['DisplayName']));
		}

		// Structured name (N)
		var familyName = props['LastName'] || '';
		var givenName = props['FirstName'] || '';
		var middleName = props['MiddleName'] || '';
		lines.push('N:' + escapeVCardValue(familyName) + ';' + escapeVCardValue(givenName) + ';' + escapeVCardValue(middleName) + ';;');

		// Emails
		if (props['PrimaryEmail']) {
			lines.push('EMAIL;TYPE=INTERNET:' + escapeVCardValue(props['PrimaryEmail']));
		}
		if (props['SecondEmail']) {
			lines.push('EMAIL;TYPE=INTERNET:' + escapeVCardValue(props['SecondEmail']));
		}

		// Phone numbers
		if (props['CellularNumber']) {
			lines.push('TEL;TYPE=CELL:' + escapeVCardValue(props['CellularNumber']));
		}
		if (props['WorkPhone']) {
			lines.push('TEL;TYPE=WORK:' + escapeVCardValue(props['WorkPhone']));
		}
		if (props['HomePhone']) {
			lines.push('TEL;TYPE=HOME:' + escapeVCardValue(props['HomePhone']));
		}
		if (props['FaxNumber']) {
			lines.push('TEL;TYPE=FAX:' + escapeVCardValue(props['FaxNumber']));
		}
		if (props['PagerNumber']) {
			lines.push('TEL;TYPE=PAGER:' + escapeVCardValue(props['PagerNumber']));
		}

		// Addresses
		if (props['HomeAddress'] || props['HomeCity']) {
			var homeAddr = ';;;' + (props['HomeAddress'] || '') + ';' + (props['HomeCity'] || '') + ';' + 
			               (props['HomeState'] || '') + ';' + (props['HomeZipCode'] || '') + ';' + (props['HomeCountry'] || '');
			lines.push('ADR;TYPE=HOME:' + escapeVCardValue(homeAddr));
		}
		if (props['WorkAddress'] || props['WorkCity']) {
			var workAddr = ';;;' + (props['WorkAddress'] || '') + ';' + (props['WorkCity'] || '') + ';' + 
			               (props['WorkState'] || '') + ';' + (props['WorkZipCode'] || '') + ';' + (props['WorkCountry'] || '');
			lines.push('ADR;TYPE=WORK:' + escapeVCardValue(workAddr));
		}

		// Other properties
		if (props['Company']) {
			lines.push('ORG:' + escapeVCardValue(props['Company']));
		}
		if (props['JobTitle']) {
			lines.push('TITLE:' + escapeVCardValue(props['JobTitle']));
		}
		if (props['Notes']) {
			lines.push('NOTE:' + escapeVCardValue(props['Notes']));
		}
		if (props['WebPage1']) {
			lines.push('URL:' + escapeVCardValue(props['WebPage1']));
		}
		if (props['BirthYear'] && props['BirthMonth'] && props['BirthDay']) {
			lines.push('BDAY:' + props['BirthYear'] + '-' + props['BirthMonth'] + '-' + props['BirthDay']);
		}
		if (props['NickName']) {
			lines.push('NICKNAME:' + escapeVCardValue(props['NickName']));
		}
		if (props['PhotoURI']) {
			lines.push('PHOTO:' + escapeVCardValue(props['PhotoURI']));
		}
		if (props['UID']) {
			lines.push('UID:' + escapeVCardValue(props['UID']));
		}
		if (props['LastModifiedDate']) {
			lines.push('REV:' + escapeVCardValue(props['LastModifiedDate']));
		}

		lines.push('END:VCARD');
		return lines.join('\r\n');
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
			.replace(/\n/g, '\\n');
	}

	/**
	 * Gets a property value from a vCard properties object.
	 * @param {Object} vCardProps - Properties object (from parseVCard)
	 * @param {string} property - Property name
	 * @param {*} defaultValue - Default value if property doesn't exist
	 * @returns {*} - Property value or default
	 */
	function getProperty(vCardProps, property, defaultValue) {
		if (!vCardProps || typeof vCardProps !== 'object') {
			return defaultValue;
		}
		return vCardProps.hasOwnProperty(property) ? vCardProps[property] : defaultValue;
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

	return {
		parseVCard: parseVCard,
		generateVCard: generateVCard,
		getProperty: getProperty,
		setProperty: setProperty,
		escapeVCardValue: escapeVCardValue
	};
})();
