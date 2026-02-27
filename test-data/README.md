# Test Data for Duplicate Contacts Manager

This directory contains test VCF files for verifying duplicate detection and deletion functionality.

## Test Files

- `addressbook1-test.vcf` - 300 test contacts (Book 1)
- `addressbook2-test.vcf` - 400 test contacts (Book 2)
- `test-manifest.csv` - Expected outcomes for verification
- `verification-checklist.md` - Manual verification steps

## Test Coverage

### Categories

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
11. **UNIQUE** (100 in Book 1, 150 in Book 2) - No duplicates
12. **SHARED** (50) - Same UID in both books (bug reproduction test)
13. **EDGE** (35 in each) - Edge cases with minimal/multiple fields

## Expected Results

### Before Test
- Book 1: 300 contacts
- Book 2: 400 contacts
- **Total: 700 contacts**

### After Test (with auto-delete)
- Book 1: 300 contacts (unchanged)
- Book 2: 235 contacts (165 deleted)
- **Total: 535 contacts**

### Expected Deletions: 165
- EXACT-B variants: 50
- NEAR-*-B variants: 65
- SHARED duplicates: 50

### Should Remain: 235 (in Book 2)
- NODUP variants: 50
- UNIQUE contacts: 150
- EDGE contacts: 35

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
- Search: `SHARED-` → 0 results expected

Search for categories that should remain:
- Search: `NODUP-` + `-B-` → 50 results expected
- Search: `UNIQUE-` → 150 results expected

## Bug Reproduction Test

The SHARED-xxx contacts have identical UIDs in both books. This tests the bug fix from v2.2.2 where deletion would fail with "contact not found" error.

**Old behavior (v2.2.1):** Would throw errors during deletion
**New behavior (v2.2.2):** Should delete cleanly without errors
