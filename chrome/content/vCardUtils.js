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

		for (var i = 0; i < lines.length; i++) {
			var line = lines[i].trim();
			
			// Handle line continuation (starts with space or tab)
			if (line.length > 0 && (line[0] === ' ' || line[0] === '\t')) {
				if (currentProperty) {
					currentValue.push(line.substring(1));
				}
				continue;
			}

			// Process accumulated value
			if (currentProperty && currentValue.length > 0) {
				var value = currentValue.join('').replace(/\\n/g, '\n').replace(/\\,/g, ',').replace(/\\;/g, ';').replace(/\\\\/g, '\\');
				setProperty(props, currentProperty, value);
				currentValue = [];
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

			// Extract property name (before first semicolon)
			var semicolonIndex = propertyPart.indexOf(';');
			var propertyName = semicolonIndex === -1 ? propertyPart : propertyPart.substring(0, semicolonIndex);

			// Map vCard properties to Thunderbird property names
			currentProperty = mapVCardPropertyToTB(propertyName, propertyPart);
			if (valuePart) {
				currentValue.push(valuePart);
			}
		}

		// Process last property
		if (currentProperty && currentValue.length > 0) {
			var value = currentValue.join('').replace(/\\n/g, '\n').replace(/\\,/g, ',').replace(/\\;/g, ';').replace(/\\\\/g, '\\');
			setProperty(props, currentProperty, value);
		}

		return props;
	}

	/**
	 * Maps vCard property names to Thunderbird property names.
	 * @param {string} vCardProp - vCard property name (e.g., "FN", "EMAIL")
	 * @param {string} fullProperty - Full property line including parameters
	 * @returns {string} - Thunderbird property name
	 */
	function mapVCardPropertyToTB(vCardProp, fullProperty) {
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

		// Handle structured name (N property)
		if (vCardProp === 'N') {
			// N format: Family;Given;Additional;Prefix;Suffix
			// We'll parse this in setProperty
			return 'N';
		}

		// Handle TEL with TYPE parameter
		if (vCardProp === 'TEL' && fullProperty) {
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

		// Handle ADR with TYPE parameter
		if (vCardProp === 'ADR' && fullProperty) {
			if (fullProperty.indexOf('TYPE=HOME') !== -1) {
				return 'HomeAddress';
			} else if (fullProperty.indexOf('TYPE=WORK') !== -1) {
				return 'WorkAddress';
			}
			return 'HomeAddress';
		}

		// Handle EMAIL - check if we already have PrimaryEmail
		if (vCardProp === 'EMAIL') {
			return 'PrimaryEmail'; // Will handle SecondEmail in setProperty
		}

		return propMap[vCardProp] || vCardProp;
	}

	/**
	 * Sets a property value, handling special cases like structured names and multiple emails.
	 * @param {Object} props - Properties object
	 * @param {string} property - Property name
	 * @param {string} value - Property value
	 */
	function setProperty(props, property, value) {
		if (property === 'N') {
			// Parse structured name: Family;Given;Additional;Prefix;Suffix
			var parts = value.split(';');
			if (parts.length >= 2) {
				props['LastName'] = parts[0] || '';
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
		} else if (property === 'ADR') {
			// Parse address: ;;;Street;City;State;Zip;Country
			var parts = value.split(';');
			if (parts.length >= 4) {
				var baseProp = property.replace('Address', '');
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
