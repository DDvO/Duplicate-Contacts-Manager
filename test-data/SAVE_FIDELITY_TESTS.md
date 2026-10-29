# Save fidelity tests

`save-fidelity-test.vcf` checks that saving a contact from the duplicates window keeps data the add-on does not show, and that addresses land in the right fields. It is separate from the matching tests in `addressbook1-test.vcf` / `addressbook2-test.vcf`.

## Setup

1. Back up your profile, or use a test profile.
2. Create an empty address book (e.g. "DCM Save Test") and import `save-fidelity-test.vcf` into it (26 contacts).
3. Thunderbird may normalise cards on import (e.g. vCard 3.0 → 4.0). For a baseline, export the address book (or a contact) to `.vcf` **after** importing and before running the add-on. Compare against that export, not against this file.
4. Open the add-on and choose "DCM Save Test" as **both** address books.

## Expected pairs

The search shows 12 pairs: Save01 – Save10, Save12, Save13 (each `-a` with its `-b`).
**Save11 AimSplit is never shown**: the two contacts have different AIM names.

## Per pair: action and what to check

For each pair, unless stated otherwise: change one visible field on the `-a` side (e.g. add a Home City), click **Keep both**, then open the `-a` contact in Thunderbird (or export it) and check the list.

| Pair | What it contains | Check after Keep both |
|------|------------------|-----------------------|
| Save01 MultiEmail | 3 emails | All three emails are still there, in the same order |
| Save02 MultiPhone | 2 work phones, work fax, mobile | Both work phones still there; the fax is shown as **Fax** in the table, not as Work Phone |
| Save03 Extras | ORG with department, categories, IMPP, anniversary, custom fields, two web pages | Company "Acme SpA", Department "Sales"; categories, chat address, anniversary, Custom 1/2 and both web pages unchanged; the work URL still contains `1,2` (no backslash) |
| Save04 NameParts | Prefix "Dr.", middle "Maria", suffix "PhD" | Change First Name: prefix and suffix are kept |
| Save05 EmptyStreet | Home and work address with no street | Table shows City "Orta San Giulio", State "NO", ZIP "28016", Country "Italy" (work: Milano / MI / 20127 / Italy). After saving, Thunderbird shows the same |
| Save06 PoBox | PO box, extended address, street | Change City: PO box "Casella Postale 12" and "Scala B" are kept |
| Save07 Escapes | Street containing `;` and `,` | Table shows "Via Verdi 3; int. 4, piano 2" in Work Address (not split across fields) |
| Save08 LongNote | Note folded over two lines, with a Windows path | Table shows "…and the word after the fold…" (with a space) and `C:\new\folder`, then "Second line." on a new line. Note unchanged after saving |
| Save09 Photo | Small photo (vCard 3.0) | Photo shown in the table and still present after saving |
| Save10 PartialBday | Birthday without a year (12 June) | Birthday still set after saving. Optionally set Birth Year/Month/Day on `-a`: it is replaced by the full date |
| Save11 AimSplit | Same name, different AIM names | Never shown |
| Save12 AimSame | Same name, same AIM name | Shown. Type different values in the **AIM Name** row on each side, click **Keep both**, start the search again: the pair is no longer shown |
| Save13 ShiftedAddress | Address stored shifted by an old build | Shown shifted on purpose (Address "Orta San Giulio", Address 2 "NO", City "28016", State "Italy"). Reference for what damaged data looks like; fix the cells by hand and **Keep both** to repair it |

## Also try

- **Remove one** on a pair: the kept contact is unchanged apart from your edits.
- **Merge left**: the left column is now marked "to be kept". Then **Remove one** keeps the merged left contact and removes the right one; **Keep both** saves the merged values; nothing else on the left contact is lost.
- Run the search a second time on the same pair after saving: edits are merged into what was saved the first time.
