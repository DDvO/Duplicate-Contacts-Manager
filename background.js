// background.js - Background script for Duplicate Contacts Manager
// TB128: WebExtension background script for menu creation and window management
// Handles extension lifecycle events and menu item creation

// Use messenger namespace (Thunderbird preferred) or fallback to browser
const menusAPI = (typeof messenger !== 'undefined' && messenger.menus) ? messenger.menus : browser.menus;
const runtimeAPI = (typeof messenger !== 'undefined' && messenger.runtime) ? messenger.runtime : browser.runtime;
const windowsAPI = (typeof messenger !== 'undefined' && messenger.windows) ? messenger.windows : browser.windows;
const i18nAPI = (typeof messenger !== 'undefined' && messenger.i18n) ? messenger.i18n : browser.i18n;

// Create menu items when extension loads
runtimeAPI.onStartup.addListener(() => {
  createMenus();
});

runtimeAPI.onInstalled.addListener(() => {
  createMenus();
});

/**
 * Creates menu items for the extension.
 * TB128: Uses WebExtension menus API instead of XUL overlays.
 */
function createMenus() {
  if (!menusAPI) {
    console.error("menus API is not available. Make sure 'menus' permission is in manifest.json");
    return;
  }

  try {
    // Tools menu item
    menusAPI.create({
      id: "duplicate-contacts-manager-tools",
      title: i18nAPI.getMessage("toolsmenu.items.handleduplicates.label") || "Duplicate Contacts Manager...",
      contexts: ["tools_menu"]
    });

    // Note: "addressbook" context is not available in Thunderbird menus API
    // The address book toolbar button functionality would need to be implemented
    // via a different mechanism (e.g., action button or compose_action context)
    // For now, users can access via Tools menu
  } catch (error) {
    console.error("Error creating menus:", error);
  }
}

// Handle menu clicks
if (menusAPI && menusAPI.onClicked) {
  menusAPI.onClicked.addListener((info, tab) => {
    if (info.menuItemId === "duplicate-contacts-manager-tools") {
      openDuplicateManagerWindow();
    }
  });
}

/**
 * Opens the duplicate manager window.
 * TB128: Uses WebExtension windows API instead of window.open() with chrome:// URL.
 * @async
 */
async function openDuplicateManagerWindow() {
  try {
    const window = await windowsAPI.create({
      url: runtimeAPI.getURL("window.html"),
      type: "popup",
      width: 900,
      height: 700,
      allowScriptsToClose: true
    });
  } catch (error) {
    console.error("Error opening duplicate manager window:", error);
  }
}
