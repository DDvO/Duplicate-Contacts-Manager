# Change history
## Version 2.2.0: port to Thunderbird 128+
## Version 1.1.1 (seen as 2.1.1 by Thunderbird 68+):
 * compatiblility with Thunderbird 68+; slightly improve documentation
## Version 1.1:
 * improve progress calculation and display; clean up photo image handling
## Version 1.0.9:
 * fix bug introduced in version 1.0.8 regarding manual selection which side to keep
## Version 1.0.8:
 * make vertical size more flexible for small displays
 * fix display layout for overlong list membership information etc.
 * add comparison of number of non-empty fields for determining card preferred for deletion
 * improve calculation of character weight for determining card preferred for deletion
 * correct comparison of selection fields determining which side has less information
 * fix use of default value for ignoreFields; ignore by default also phone number types
 * various implementation improvements for more efficiency and better readability
## Version 1.0.7:
 * add option for normalizing international call prefix
 * fix horizontal layout issues, automatic width of contents
 * improve name matching: allow substrings, stop removing singleton digits and letters
 * mail user names like no-reply@... or no.service@... not anymore taken as first+last names
## Version 1.0.6:
 * various UI layout (width, vertical scrolling) and small documentation improvements
## Version 1.0.5:
 * correction of mistake in packaging version 1.0.4 that prevented it from running
## Version 1.0.4:
 * various small UI improvements: indication for card matching, layout, language, doc
## Version 1.0.3:
 * fixed syntax error in de-DE locale that lead to obscure initialization error
 * minor improvements of localization in the extension and of the entry in the TB add-ons list
## Version 1.0.1 and 1.0.2:
 * improved label of DCM menu entry for address book window
## Version 1.0:
 * major speedup in particular when searching for duplicates in large address books
 * improved user guidance; new Tools menu entry with default address book selection
 * various improvements of content matching and card comparison for equivalence
 * cards may be excluded from being presented as matching by setting a different AIM name
 * photos are compared for equality and are shown during manual inspection
 * mailing list membership is taken into account for comparison and shown during inspection
 * during manual inspection, field-by-field (resp. set-by-set) comparison information is shown
 * option to consider phone numbers with national prefix and with default country code equivalent
 * option to customize list of ignored fields; output summary of different fields
 * option to preserve entries of first address book when auto-deleting redundant entries
 * options are saved in TB configuration/preferences at `extensions.DuplicateContactsManager.*`
## Version 0.9.2:
 * few critical bug fixes
 * layout improvements
## Version 0.9:
 * Can now edit contacts.
 * Auto-removal of contacts which only contain some less fields.
 * Can work across two address books.
 * Option to collect all potential duplicates before interacting with the user.
 * Progress bar and other usability improvements
## Version 0.8:
 * Offer to delete exact duplicates without asking
 * Correctly search for exact duplicates
 * upgrade to support Thunderbird 7

