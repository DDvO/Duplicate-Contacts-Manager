# Test Data for Duplicate Contacts Manager

This directory contains test VCF files for verifying duplicate detection and deletion functionality.

## Test Files

- `addressbook1-test.vcf` - Test contacts for Book 1 (regenerate with `generate_test_vcf.py`; currently **64** cards)
- `addressbook2-test.vcf` - Test contacts for Book 2 (currently **74** cards)
- `test-manifest.csv` - Expected outcomes for verification
- `verification-checklist.md` - Manual verification steps
- `generate_test_vcf.py` - Source of truth for both `.vcf` files; run from this directory to rebuild them

## Test Coverage

### Categories

The numbers below describe the **intended** taxonomy (full-scale datasets). The **checked-in** `generate_test_vcf.py` emits a **smaller** sample (e.g. 2 EXACT pairs); run the script and read its console summary for exact pair counts.

1. **EXACT** (50 pairs) - Exact duplicates that should always match
2. **NEAR-GMAIL** (10 pairs) - Gmail/Googlemail variations
3. **NEAR-PHONE** (10 pairs) - Phone format variations
4. **NEAR-NAME** (10 pairs) - Name order/spacing variations
5. **NEAR-CASE** (10 pairs) - Case differences
6. **NEAR-SPACE** (10 pairs) - Whitespace variations
7. **NEAR-ACCENT** (10 pairs) - Accented character variations
8. **NEAR-NOREPLY** (5 pairs) - No-reply email variations
9. **NODUP-COMMON** (25 pairs) - Same name, different email (should NOT match)
10. **NODUP-SIMILAR** (25 pairs) - Similar but distinct (should NOT match)
11. **UNIQUE** — No duplicates across books (count depends on generator; see `generate_test_vcf.py`)
12. **SHARED** — Same UID in both books (bug reproduction test) when present in generator output
13. **EDGE** — Edge cases with minimal/multiple fields
14. **PHASE12** (6 in Book 1, 6 in Book 2) — Phase 1–2 MV3 / vCardUtils (REV, BDAY, multi-EMAIL, structured N); **unique** across books
15. **DUPVIEW** (2 duplicate **pairs**, A in Book 1 / B in Book 2) — Same **PrimaryEmail** so they **match** as duplicates; use to inspect **BDAY**, **two EMAIL lines**, **REV**, structured **N**, and a **triple-EMAIL** card in the comparison table (`DUPVIEW-FULL-*`, `DUPVIEW-TRIPLE-*`)

## Phase 1–2 contacts (`PHASE12-*` prefix)

These are **unique** in each book (different names/emails) so they **do not** add duplicate pairs or change the expected **21 deletions from Book 2** when running the standard duplicate test.

| Card (Book 1 / Book 2) | What it exercises |
|------------------------|---------------------|
| `PHASE12-REV-001` / `PHASE12-REV-101` | **REV** compact UTC → `LastModifiedDate`, display via `parseLastModifiedDateForDisplay`, round-trip `formatRevForVCard` |
| `PHASE12-REV-002` / `PHASE12-REV-102` | **REV** 8-digit date |
| `PHASE12-BDAY-001` / `PHASE12-BDAY-101` | **BDAY** → BirthYear / BirthMonth / day-of-month |
| `PHASE12-MAIL2-*` | Two **EMAIL** lines → PrimaryEmail + SecondEmail order |
| `PHASE12-MAIL3-*` | Three **EMAIL** lines → third ignored by parser (see NOTE on card) |
| Structured **N** (`Phase12 N Middle`) | **N:** `Last;First;Middle` vs FN |

**Manual checks:** Open a `PHASE12-*` contact after import; confirm Last Modified, birthday, and email fields; optional edit/save/reload for round-trip.

### DUPVIEW pairs (`DUPVIEW-FULL-*`, `DUPVIEW-TRIPLE-*`)

These are **real duplicate pairs** (same **PrimaryEmail** in Book 1 and Book 2). They appear in the duplicate manager **one pair at a time** when the search reaches them — use **Skip** until you see names **DUPVIEW-FULL-A** / **DUPVIEW-FULL-B** (or TRIPLE-A / TRIPLE-B). Then compare **Last Modified**, **BirthYear/BirthMonth/BirthDay**, **PrimaryEmail**, **SecondEmail**, and **names**.

## Expected Results

Counts match `python generate_test_vcf.py` (re-run after editing the generator).

### Before Test
- Book 1: **64** contacts
- Book 2: **74** contacts
- **Total: 138** contacts

### After Test (with auto-delete)
- Book 1: **64** contacts (unchanged)
- Book 2: **51** contacts (**23** deleted)
- **Total: 115** contacts

### Expected Deletions from Book 2: **23**

See console summary of `generate_test_vcf.py` (EXACT, NEAR-\*, NAME-ONLY-MATCH, AUTO-RICH poor copies, etc.).

### Should Remain in Book 2 (51)

Includes all six **PHASE12-*** Book 2 contacts** — they have no duplicate in Book 1.

## How to Use

1. **Import into Thunderbird:**
   - Create new address book "Test Book 1"
   - Import `addressbook1-test.vcf`
   - Create new address book "Test Book 2"
   - Import `addressbook2-test.vcf`

2. **Run Duplicate Detection:**
   - Open Duplicate Contacts Manager
   - Select both test books
   - Run with auto-delete enabled

3. **Verify Results:**
   - Check contact counts
   - Use `verification-checklist.md`
   - Compare against `test-manifest.csv`

4. **Export for Analysis:**
   - Export both books after test
   - Use naming like `book1-after-test.vcf`
   - Count by category prefix

## Verification Commands

Search for specific categories in Book 2 after test (should find zero):
- Search: `EXACT-` + `-B-` → 0 results expected
- Search: `NEAR-` + `-B-` → 0 results expected
- Search: `SHARED-` → 0 results expected (if SHARED cards exist in the generated VCF)

Search for categories that should remain:
- Search: `Phase12` (substring) → **6** results expected (all Phase 1–2 Book 2 contacts remain; one FN is `Phase12b N Middle`)
- Search: `NODUP-` + `-B-` → depends on generator output
- Search: `UNIQUE-` → depends on generator output

## Bug Reproduction Test

The SHARED-xxx contacts have identical UIDs in both books. This tests the bug fix from v2.2.2 where deletion would fail with "contact not found" error.

**Old behavior (v2.2.1):** Would throw errors during deletion
**New behavior (v2.2.2):** Should delete cleanly without errors
