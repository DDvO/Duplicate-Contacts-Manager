# Verification Checklist for Duplicate Contacts Manager Testing

## Pre-Test Setup

- [ ] Created new Thunderbird address book named "Test Book 1"
- [ ] Imported `addressbook1-test.vcf` into Test Book 1
- [ ] Verified count in Test Book 1: **Should show 64 contacts** (run `python generate_test_vcf.py` if counts differ)
- [ ] Created new Thunderbird address book named "Test Book 2"
- [ ] Imported `addressbook2-test.vcf` into Test Book 2
- [ ] Verified count in Test Book 2: **Should show 74 contacts**

## Running the Test

- [ ] Opened Duplicate Contacts Manager extension
- [ ] Selected both "Test Book 1" and "Test Book 2" for comparison
- [ ] Enabled auto-delete option (if testing automatic deletion)
- [ ] Started duplicate detection
- [ ] **Bug Test**: No "contact with id=... could not be found" errors occurred ✓
- [ ] Process completed without crashes

## Post-Test Verification

### Contact Counts

- [ ] **Test Book 1**: Still has **64** contacts (unchanged)
- [ ] **Test Book 2**: Has **51** contacts (**23** deleted)
- [ ] **Total deletion count**: **23** contacts deleted from Book 2

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

### DUPVIEW duplicate pairs (comparison table)

When the duplicate finder reaches a **DUPVIEW-FULL** or **DUPVIEW-TRIPLE** pair (same primary email as the other book), the side-by-side table should show populated rows for **birthday / date parts**, **Second email**, **Last Modified**, and **names** — re-import the regenerated VCFs if you do not see `dupview.full@` / `dupview.triple@` contacts.

- [ ] At least one duplicate step shows **DUPVIEW-FULL-A** vs **DUPVIEW-FULL-B** (or TRIPLE-A vs TRIPLE-B)

### Phase 1–2 (MV3 vCard) spot checks

After import (before or after duplicate run), open these **Book 1** contacts and confirm fields load from vCard:

- [ ] `PHASE12-REV-001` — Last Modified shows a sensible date (REV compact UTC)
- [ ] `PHASE12-BDAY-001` — Birthday / date fields populated from `BDAY:1990-05-15`
- [ ] `PHASE12-MAIL2-001` — Two email addresses (primary + second)
- [ ] `PHASE12-MAIL3-001` — At most two emails stored (third ignored; see NOTE on card)
- [ ] `Phase12 N Middle` — Structured name (Last / First / Middle) matches **N:** line

Optional round-trip: edit a field, save, reopen — vCard should remain consistent (REV/EMAIL order).

**After duplicate run**, all six **Book 2** `Phase12` contacts should still exist (search substring `Phase12` → 6).

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

### Bug Reproduction Test (SHARED / CardDAV)

If your imported VCF includes **SHARED-** contacts (not in the default `generate_test_vcf.py` output as of Phase 1–2):

- [ ] SHARED duplicates delete without **"contact with id=… could not be found"**
- [ ] Process completed cleanly without alerts

**What was being tested:** same logical contact in two books → delete uses correct `_addressBookId` (v2.2.2+).

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
| Book 1 Count | 64 | | |
| Book 2 Count | 51 | | |
| Total Deleted (from Book 2) | 23 | | |
| Phase12 remaining (Book 2, search `Phase12`) | 6 | | |
| EXACT-B remaining | 0 | | |
| NEAR-B remaining | 0 | | |
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
