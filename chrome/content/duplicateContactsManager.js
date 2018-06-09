var DuplicateContactsManager = {
	manageDuplicatesIsRunning: false,
	menuButtonAction: function() {
		this.manageDuplicates();
	},
	manageDuplicates: function() {
		this.manageDuplicatesIsRunning = true;
		var dupwindow = window.open('chrome://duplicatecontactsmanager/content/duplicateEntriesWindow.xul', "Duplicate Contacts Manager", "chrome,centerscreen");
		dupwindow.focus();
	}
}
