// background.js - Background script for Duplicate Contacts Manager
// TB128: WebExtension background script for menu creation and window management
// Handles extension lifecycle events and menu item creation

// Use messenger namespace (Thunderbird preferred) or fallback to browser
const menusAPI = (typeof messenger !== 'undefined' && messenger.menus) ? messenger.menus : browser.menus;
const runtimeAPI = (typeof messenger !== 'undefined' && messenger.runtime) ? messenger.runtime : browser.runtime;
const windowsAPI = (typeof messenger !== 'undefined' && messenger.windows) ? messenger.windows : browser.windows;
const i18nAPI = (typeof messenger !== 'undefined' && messenger.i18n) ? messenger.i18n : browser.i18n;
const actionAPI = (typeof messenger !== 'undefined' && messenger.action) ? messenger.action : browser.action;

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

if (actionAPI && actionAPI.onClicked) {
  actionAPI.onClicked.addListener(() => {
    openDuplicateManagerWindow();
  });
}

/** Preferred size of the duplicate manager window; smaller screens get less. */
const WINDOW_WIDTH = 960;
const WINDOW_HEIGHT = 850;

/**
 * Size and position for the duplicate manager window: the preferred size, shrunk to fit inside the
 * Thunderbird window it is opened from and centred on it. Without this, an 850px window on a small or
 * scaled screen is pushed above the top edge, hiding its title bar and buttons.
 * @param {?Object} parent - windows.Window with left/top/width/height, or null
 * @returns {{ width: number, height: number, left?: number, top?: number }}
 */
function fitWindowGeometry(parent) {
  if (!parent || !(parent.width > 0) || !(parent.height > 0)) {
    return { width: WINDOW_WIDTH, height: WINDOW_HEIGHT };
  }
  const width = Math.min(WINDOW_WIDTH, parent.width);
  const height = Math.min(WINDOW_HEIGHT, parent.height);
  return {
    width: width,
    height: height,
    left: (parent.left || 0) + Math.round((parent.width - width) / 2),
    top: (parent.top || 0) + Math.round((parent.height - height) / 2)
  };
}

/**
 * Opens the duplicate manager window.
 * TB128: Uses WebExtension windows API instead of window.open() with chrome:// URL.
 * @async
 */
async function openDuplicateManagerWindow() {
  try {
    let parent = null;
    try {
      parent = await windowsAPI.getLastFocused();
    } catch (e) {
      // No focused window: fall back to the preferred size
    }
    const window = await windowsAPI.create(Object.assign({
      url: runtimeAPI.getURL("window.html"),
      type: "popup",
      allowScriptsToClose: true
    }, fitWindowGeometry(parent)));
  } catch (error) {
    console.error("Error opening duplicate manager window:", error);
  }
}
