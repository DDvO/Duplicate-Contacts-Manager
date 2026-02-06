// -*- mode: js; indent-tabs-mode: t; js-indent-level: 8 -*-
// file: duplicateEntriesWindowContacts.js
//
// Read/write logic for Thunderbird address book contacts (cards and directories).
// Migrated to TB128 WebExtension API (browser.addressBooks)
// Used by duplicateEntriesWindow.js. Load this script before duplicateEntriesWindow.js.

var DuplicateEntriesWindowContacts = (function() {
	"use strict";

	// Use messenger namespace (Thunderbird preferred) or fallback to browser
	const addressBooksAPI = (typeof messenger !== 'undefined' && messenger.addressBooks) ? messenger.addressBooks : browser.addressBooks;

	/**
	 * Gets all address books.
	 * TB128: Returns array of address book objects with id and name properties.
	 * @returns {Promise<Array>} Array of {id, name, ...} objects
	 */
	async function getAddressBooks() {
		if (!addressBooksAPI) {
			console.error("addressBooks API is not available. Make sure 'addressBooks' permission is in manifest.json");
			return [];
		}
		try {
			const addressBooks = await addressBooksAPI.list();
			return addressBooks;
		} catch (error) {
			console.error("Error getting address books:", error);
			return [];
		}
	}

	/**
	 * Gets a single address book by ID.
	 * @param {string} addressBookId - Address book ID
	 * @returns {Promise<Object>} Address book object or null
	 */
	async function getAddressBook(addressBookId) {
		if (!addressBooksAPI || !addressBookId) {
			return null;
		}
		try {
			const addressBooks = await addressBooksAPI.list();
			return addressBooks.find(ab => ab.id === addressBookId) || null;
		} catch (error) {
			console.error("Error getting address book:", error);
			return null;
		}
	}

	/**
	 * Returns all contact cards from an address book. For each card, context.enrichCardForComparison(card, mailLists)
	 * is called so the caller can attach virtual properties (e.g. __NonEmptyFields, __MailListNames).
	 * TB128: Now async, uses addressBooks API and vCard format.
	 * @param {string} addressBookId - Address book ID
	 * @param {object} context - Must have enrichCardForComparison(card, mailLists), parseVCard, generateVCard
	 * @returns {Promise<{ cards: Array, totalBefore: number }>} - cards array and total count
	 */
	async function getAllAbCards(addressBookId, context) {
		if (!addressBooksAPI || !addressBookId) {
			console.error("getAllAbCards: addressBooks API or addressBookId not available");
			return { cards: [], totalBefore: 0 };
		}

		try {
			console.log("Getting contacts from address book:", addressBookId);
			
			// Get all contacts from the address book
			const contacts = await addressBooksAPI.contacts.list(addressBookId);
			console.log("Found", contacts.length, "contacts");
			
			var abCards = [];
			var mailLists = [];
			var processedCount = 0;

			// Process contacts and mailing lists
			for (var i = 0; i < contacts.length; i++) {
				try {
					var contact = contacts[i];
					
					// Check if it's a mailing list
					if (contact.type === 'mailingList') {
						// Get mailing list details
						try {
							const listDetails = await addressBooksAPI.mailingLists.get(contact.id);
							var primaryEmails = [];
							if (listDetails.contacts) {
								for (var j = 0; j < listDetails.contacts.length; j++) {
									var listContact = listDetails.contacts[j];
									if (listContact.properties && listContact.properties.PrimaryEmail) {
										primaryEmails.push(listContact.properties.PrimaryEmail);
									}
								}
							}
							mailLists.push([contact.properties ? contact.properties.DisplayName : contact.id, primaryEmails]);
						} catch (e) {
							console.warn("Error getting mailing list details:", e);
						}
					} else {
						// Regular contact - parse vCard to get properties
						var cardProps = {};
						if (contact.properties) {
							// If properties are already parsed, use them
							cardProps = contact.properties;
						} else if (contact.vCard && context && context.parseVCard) {
							// Parse vCard string
							cardProps = context.parseVCard(contact.vCard);
						} else {
							// Fallback: use contact properties directly
							cardProps = contact.properties || {};
						}
						
						// Add internal tracking properties
						cardProps._id = contact.id;
						cardProps._addressBookId = addressBookId;
						if (contact.vCard) {
							cardProps._vCard = contact.vCard;
						}
						
						abCards.push(cardProps);
						processedCount++;
					}
				} catch (e) {
					console.warn("Error processing contact at index", i, ":", e);
				}
			}

			console.log("Processed", processedCount, "cards successfully");

			// Enrich cards with virtual properties
			for (var j = 0; j < abCards.length; j++) {
				if (context && context.enrichCardForComparison) {
					context.enrichCardForComparison(abCards[j], mailLists);
				}
			}

			console.log("Loaded", abCards.length, "contacts from address book", addressBookId);
			return { cards: abCards, totalBefore: abCards.length };
		} catch (error) {
			console.error("Error in getAllAbCards:", error);
			return { cards: [], totalBefore: 0 };
		}
	}

	/**
	 * Reads a single property from a card.
	 * TB128: Cards are plain objects, access properties directly.
	 * @param {Object} card - Card object (plain JS object)
	 * @param {string} property - Property name
	 * @param {string|number} defaultValue - Default value
	 * @returns {string|number} - Property value or default
	 */
	function getCardProperty(card, property, defaultValue) {
		if (!card || typeof card !== 'object') {
			return defaultValue;
		}
		return card.hasOwnProperty(property) ? card[property] : defaultValue;
	}

	/**
	 * Writes a single property to a card (in memory only). Call saveCard to persist.
	 * TB128: Cards are plain objects, set properties directly.
	 * @param {Object} card - Card object (plain JS object)
	 * @param {string} property - Property name
	 * @param {string|number} value - Value to set
	 */
	function setCardProperty(card, property, value) {
		if (!card || typeof card !== 'object') {
			return;
		}
		card[property] = value;
	}

	/**
	 * Persists card changes to the address book.
	 * TB128: Now async, uses addressBooks API and vCard format.
	 * @param {string} addressBookId - Address book ID
	 * @param {Object} card - Card object with modified properties
	 * @returns {Promise<void>}
	 * @throws on failure
	 */
	async function saveCard(addressBookId, card) {
		if (!addressBooksAPI || !addressBookId || !card) {
			throw new Error("saveCard: Invalid parameters");
		}

		try {
			// Generate vCard from card properties
			var vCardString;
			if (typeof VCardUtils !== 'undefined' && VCardUtils.generateVCard) {
				vCardString = VCardUtils.generateVCard(card);
			} else {
				throw new Error("No vCard generator available");
			}

			if (!card._id) {
				// New contact: API create(parentId, vCard) returns new contact id
				var newId = await addressBooksAPI.contacts.create(addressBookId, vCardString);
				card._id = newId;
			} else {
				// Update: API update(id, vCard) — contact id and vCard string only
				await addressBooksAPI.contacts.update(card._id, vCardString);
			}
		} catch (error) {
			console.error("Error saving card:", error);
			throw error;
		}
	}

	/**
	 * Deletes a card from the address book.
	 * TB128: Now async, uses addressBooks API.
	 * @param {string} addressBookId - Address book ID
	 * @param {Object} card - Card object to delete (must have _id property)
	 * @returns {Promise<void>}
	 * @throws on failure
	 */
	async function deleteCard(addressBookId, card) {
		if (!addressBooksAPI || !addressBookId || !card || !card._id) {
			throw new Error("deleteCard: Invalid parameters - card must have _id property");
		}

		try {
			// API: delete(id) — contact id only (unique within profile)
			await addressBooksAPI.contacts.delete(card._id);
		} catch (error) {
			console.error("Error deleting card:", error);
			throw error;
		}
	}

	return {
		getAddressBooks: getAddressBooks,
		getAddressBook: getAddressBook,
		getAllAbCards: getAllAbCards,
		getCardProperty: getCardProperty,
		setCardProperty: setCardProperty,
		saveCard: saveCard,
		deleteCard: deleteCard
	};
})();
