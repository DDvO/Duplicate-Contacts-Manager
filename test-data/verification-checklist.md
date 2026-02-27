# Verification Checklist for Duplicate Contacts Manager Testing

## Pre-Test Setup

- [ ] Created new Thunderbird address book named "Test Book 1"
- [ ] Imported `addressbook1-test.vcf` into Test Book 1
- [ ] Verified count in Test Book 1: **Should show ~300 contacts**
- [ ] Created new Thunderbird address book named "Test Book 2"
- [ ] Imported `addressbook2-test.vcf` into Test Book 2
- [ ] Verified count in Test Book 2: **Should show ~400 contacts**

## Running the Test

- [ ] Opened Duplicate Contacts Manager extension
- [ ] Selected both "Test Book 1" and "Test Book 2" for comparison
- [ ] Enabled auto-delete option (if testing automatic deletion)
- [ ] Started duplicate detection
- [ ] **Bug Test**: No "contact with id=... could not be found" errors occurred ✓
- [ ] Process completed without crashes

## Post-Test Verification

### Contact Counts

- [ ] **Test Book 1**: Still has ~300 contacts (unchanged)
- [ ] **Test Book 2**: Has ~235 contacts (165 deleted)
- [ ] **Total deletion count**: 165 contacts deleted

### Category Verification in Test Book 2

Search for each category prefix in Test Book 2 and verify counts:

**Should be ZERO (all deleted):**
- [ ] Search `EXACT` + `-B` → 0 results
- [ ] Search `NEAR-GMAIL-B` → 0 results  
- [ ] Search `NEAR-PHONE-B` → 0 results
- [ ] Search `NEAR-NAME-B` → 0 results
- [ ] Search `NEAR-CASE-B` → 0 results
- [ ] Search `NEAR-SPACE-B` → 0 results
- [ ] Search `NEAR-ACCENT-B` → 0 results
- [ ] Search `NEAR-NOREPLY-B` → 0 results
- [ ] Search `SHARED-` → 0 results

**Should be PRESENT (not deleted):**
- [ ] Search `NODUP-COMMON-B` → ~25 results
- [ ] Search `NODUP-SIMILAR-B` → ~25 results
- [ ] Search `UNIQUE-1` → ~150 results
- [ ] Search `EDGE-` → ~35 results

### Spot Checks - Specific Contacts

**In Test Book 2, search for these - should NOT be found:**
- [ ] `EXACT-001-B` → Not found ✓
- [ ] `EXACT-025-B` → Not found ✓
- [ ] `NEAR-GMAIL-B-001` → Not found ✓
- [ ] `NEAR-PHONE-B-005` → Not found ✓
- [ ] `NEAR-NAME-B-010` → Not found ✓
- [ ] `SHARED-001` → Not found ✓
- [ ] `SHARED-050` → Not found ✓

**In Test Book 2, search for these - should BE found:**
- [ ] `NODUP-COMMON-B-001` (John Smith) → Found ✓
- [ ] `NODUP-COMMON-B-025` (Andrew Walker) → Found ✓
- [ ] `NODUP-SIMILAR-B-010` → Found ✓
- [ ] `UNIQUE-150` → Found ✓
- [ ] `EDGE-EMPTY-001-B` → Found ✓

### Matching Logic Verification

**Gmail normalization:**
- [ ] Confirm `neargmail001@gmail.com` (Book 1) matched `neargmail001@googlemail.com` (Book 2)

**Phone format normalization:**
- [ ] Confirm `+1-555-1001` (Book 1) matched `5551001` (Book 2)

**Name order:**
- [ ] Confirm `John Doe` (Book 1) matched `Doe, John` (Book 2)

**Case insensitivity:**
- [ ] Confirm `JOHN DOE` (Book 1) matched `john doe` (Book 2)

**Accent normalization:**
- [ ] Confirm `René` (Book 1) matched `Rene` (Book 2)

**False positives prevented:**
- [ ] Confirm `john.smith.companyA@example.com` did NOT match `john.smith.companyB@example.com`

### Bug Reproduction Test

The SHARED contacts were the critical test for the v2.2.2 bug fix:

- [ ] All 50 SHARED-xxx contacts were deleted successfully
- [ ] **No errors** like "Error: contact with id=xxx could not be found" occurred
- [ ] Process completed cleanly without alerts

**What was being tested:**
- SHARED contacts have identical UIDs in both books
- Old code (v2.2.1): Would use wrong address book ID → "not found" error
- Fixed code (v2.2.2): Uses card's actual `_addressBookId` → deletes correctly

## Export for Detailed Analysis (Optional)

If you want to do detailed post-test analysis:

- [ ] Export Test Book 1 after test as `book1-after-test.vcf`
- [ ] Export Test Book 2 after test as `book2-after-test.vcf`
- [ ] Compare file sizes (Book 2 should be ~60% of original size)
- [ ] Use text search on VCF files to count category prefixes

## Summary Results

Fill in after test:

| Metric | Expected | Actual | Status |
|--------|----------|--------|--------|
| Book 1 Count | 300 | | |
| Book 2 Count | 235 | | |
| Total Deleted | 165 | | |
| EXACT-B remaining | 0 | | |
| NEAR-B remaining | 0 | | |
| SHARED remaining | 0 | | |
| NODUP-B remaining | 50 | | |
| UNIQUE remaining | 150 | | |
| Errors occurred | 0 | | |

## Test Result

- [ ] **PASS** - All checks passed, no errors
- [ ] **FAIL** - Issues detected (document below)

### Issues Found:

(Document any problems here)

---

**Test Date:** _______________  
**Tester:** _______________  
**Extension Version:** _______________  
**Thunderbird Version:** _______________
