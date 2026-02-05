// window-init.js - Initialization script for window.html
// TB128: Moved from inline script to external file for Content Security Policy (CSP) compliance
// Handles i18n localization and event listener setup

// Initialize i18n on page load
document.addEventListener('DOMContentLoaded', function() {
	// Use messenger namespace (Thunderbird preferred) or fallback to browser
	const i18nAPI = (typeof messenger !== 'undefined' && messenger.i18n) ? messenger.i18n : browser.i18n;
	
	// Apply i18n to all elements with data-i18n attribute
	document.querySelectorAll('[data-i18n]').forEach(el => {
		const key = el.getAttribute('data-i18n');
		if (i18nAPI) {
			const message = i18nAPI.getMessage(key);
			if (message) {
				if (el.tagName === 'INPUT' && (el.type === 'checkbox' || el.type === 'radio')) {
					// For checkboxes/radios, set the label text
					const label = el.closest('label');
					if (label) {
						label.childNodes.forEach(node => {
							if (node.nodeType === Node.TEXT_NODE) {
								node.textContent = message;
							}
						});
					}
				} else {
					el.textContent = message;
				}
			}
		}
	});
	
	// Set title
	if (i18nAPI) {
		document.title = i18nAPI.getMessage('handleDuplicates.windowtitle') || document.title;
	}
	
	// Initialize window when scripts are loaded
	if (typeof DuplicateEntriesWindow !== 'undefined') {
		DuplicateEntriesWindow.init();
	} else {
		// Wait for scripts to load
		window.addEventListener('load', function() {
			if (typeof DuplicateEntriesWindow !== 'undefined') {
				DuplicateEntriesWindow.init();
			}
		});
	}
});

// Handle window unload
window.addEventListener('beforeunload', function() {
	if (typeof DuplicateEntriesWindow !== 'undefined' && DuplicateEntriesWindow.OnUnloadWindow) {
		DuplicateEntriesWindow.OnUnloadWindow();
	}
});

// Set up button event handlers
document.addEventListener('DOMContentLoaded', function() {
	const startButton = document.getElementById('startbutton');
	if (startButton) {
		startButton.addEventListener('click', function() {
			if (typeof DuplicateEntriesWindow !== 'undefined') {
				DuplicateEntriesWindow.startSearch();
			}
		});
	}
	
	const skipButton = document.getElementById('skipnextbutton');
	if (skipButton) {
		skipButton.addEventListener('click', function() {
			if (typeof DuplicateEntriesWindow !== 'undefined') {
				DuplicateEntriesWindow.skipAndSearchNextDuplicate();
			}
		});
	}
	
	const keepButton = document.getElementById('keepnextbutton');
	if (keepButton) {
		keepButton.addEventListener('click', function() {
			if (typeof DuplicateEntriesWindow !== 'undefined') {
				DuplicateEntriesWindow.keepAndSearchNextDuplicate();
			}
		});
	}
	
	const applyButton = document.getElementById('applynextbutton');
	if (applyButton) {
		applyButton.addEventListener('click', function() {
			if (typeof DuplicateEntriesWindow !== 'undefined') {
				DuplicateEntriesWindow.applyAndSearchNextDuplicate();
			}
		});
	}
	
	const stopButton = document.getElementById('stopbutton');
	if (stopButton) {
		stopButton.addEventListener('click', function() {
			if (typeof DuplicateEntriesWindow !== 'undefined') {
				DuplicateEntriesWindow.endSearch();
			}
		});
	}
	
	const quitButton = document.getElementById('quitbutton');
	if (quitButton) {
		quitButton.addEventListener('click', function() {
			window.close();
		});
	}
	
	// Radio button handlers for keep left/right
	const keepLeft = document.getElementById('keepLeft');
	const keepRight = document.getElementById('keepRight');
	if (keepLeft) {
		keepLeft.addEventListener('change', function() {
			if (this.checked && typeof DuplicateEntriesWindow !== 'undefined') {
				DuplicateEntriesWindow.setContactLeftRight('left');
			}
		});
	}
	if (keepRight) {
		keepRight.addEventListener('change', function() {
			if (this.checked && typeof DuplicateEntriesWindow !== 'undefined') {
				DuplicateEntriesWindow.setContactLeftRight('right');
			}
		});
	}
});
