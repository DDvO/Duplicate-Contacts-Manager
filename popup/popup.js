// PORT: Popup script - opens main window
// ORIGINAL: Simple window opener in duplicateContactsManager.js

document.getElementById('openWindow').addEventListener('click', () => {
  browser.windows.create({
    url: browser.runtime.getURL("window/window.html"),
    type: "popup",
    width: 800,
    height: 600
  });
  window.close();
});
