// PORT: Background script for WebExtension
// ORIGINAL: duplicateContactsManager.js - simple window opener
// This script handles opening the main duplicate finder window

// PORT: Listen for toolbar button click or menu command
browser.browserAction.onClicked.addListener(() => {
  openDuplicateWindow();
});

// PORT: Listen for menu command (if added via menus API)
// PORT: Check if menus API is available before using it
if (browser.menus) {
  browser.menus.onClicked.addListener((info, tab) => {
    if (info.menuItemId === "duplicate-contacts-manager") {
      openDuplicateWindow();
    }
  });

  // PORT: Create menu item on startup
  browser.runtime.onStartup.addListener(() => {
    createMenu();
  });

  browser.runtime.onInstalled.addListener(() => {
    createMenu();
  });

  function createMenu() {
    browser.menus.create({
      id: "duplicate-contacts-manager",
      title: "Duplicate Contacts Manager...",
      contexts: ["tools_menu"]
    });
  }
}

// PORT: Open the duplicate finder window
// ORIGINAL: window.open('chrome://duplicatecontactsmanager/content/duplicateEntriesWindow.xul', ...)
function openDuplicateWindow() {
  browser.windows.create({
    url: browser.runtime.getURL("window/window.html"),
    type: "popup",
    width: 800,
    height: 600
  });
}
