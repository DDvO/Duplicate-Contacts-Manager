# Old address format tests

`old-address-test.vcf` checks that addresses saved by version 2.2.3 and earlier are read into the right fields. Those versions wrote `;;;Street;City;State;Zip;Country`, usually with every `;` escaped (`\;\;\;Via Roma 1\;Orta San Giulio\;…`). Thunderbird's own editor does not show such addresses.

## Setup

1. Use a test profile, or back up your profile.
2. Create an empty address book (e.g. "DCM Old Address Test") and import `old-address-test.vcf` into it (8 contacts).
3. **Check the import kept the old format.** Export `Old01 EscapedHome` (the `-a` contact, the one whose address Thunderbird does **not** show) and look at its `ADR` line. It should still contain `\;\;\;`. If Thunderbird rewrote it on import, this file cannot reproduce old data; use real contacts saved by 2.2.3 instead.
4. Open the add-on and choose the test address book as **both** address books.

## Expected pairs

The search shows 4 pairs, Old01 – Old04. In each pair one side has the old format and the other the standard one.

| Pair | What it contains | What the table should show |
|------|------------------|----------------------------|
| Old01 EscapedHome | Old escaped home address vs the same address in standard form | Both sides: Home Address "Via Roma 1", City "Orta San Giulio", State "NO", ZIP "28016", Country "Italy". Before the fix the old side was empty |
| Old02 PlainWork | Old layout without escapes (`;;;Via Po 2;Milano;…`) vs standard | Both sides: Work Address "Via Po 2", City "Milano", State "MI", ZIP "20127", Country "Italy". Before the fix the old side was shifted (street in City, country lost) |
| Old03 EmptyStreet | Standard address with no street, one side with extra `;;` at the end | Both sides: Home Address empty, City "Orta San Giulio", State "NO", ZIP "28016", Country "Italy" (must **not** be taken for the old format) |
| Old04 EditOld | Old escaped home and work addresses | Home: Via Garibaldi 5 / Novara / NO / 28100 / Italy. Work: Corso Italia 9 / Torino / TO / 10121 / Italy |

## Saving an old address

On **Old04 EditOld**, change the Home City of the old side to "Novara Centro" and click **Keep both**. Then open that contact in Thunderbird:

* The home address now shows in Thunderbird's editor: Via Garibaldi 5, Novara Centro, NO, 28100, Italy, with no PO box.
* The work address was not edited, so it is kept unchanged (still in the old format, still hidden in Thunderbird's editor, still shown correctly by the add-on).
