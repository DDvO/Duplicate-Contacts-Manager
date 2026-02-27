# Corrected Test Data for Duplicate Contacts Manager

## Overview

This test suite validates the duplicate detection logic based on **actual matching behavior**: contacts match if **name OR email OR phone** matches (not AND).

## Test Files

- `addressbook1-test.vcf` - 53 contacts
- `addressbook2-test.vcf` - 63 contacts
- **Total: 116 contacts**

## Expected Results

### Before Test
- Book 1: 53 contacts
- Book 2: 63 contacts

### After Test (with auto-delete)
- Book 1: 53 contacts (unchanged)
- Book 2: 45 contacts (18 deleted)

### Expected Deletions: 18
All -B variants from matching pairs

## Test Categories

### 1. Duplicates That WILL Match (18 pairs = 18 deletions)

| Category | Pairs | Test | Should Delete? |
|----------|-------|------|----------------|
| **EXACT** | 2 | Identical all fields | ✅ Yes |
| **NEAR-GMAIL** | 2 | `@gmail.com` ↔ `@googlemail.com` | ✅ Yes |
| **NEAR-PHONE** | 2 | Phone format variations | ✅ Yes |
| **NEAR-NAME** | 2 | Name order (John Doe ↔ Doe, John) | ✅ Yes |
| **NEAR-CASE** | 2 | Case differences (JOHN ↔ john) | ✅ Yes |
| **NEAR-SPACE** | 2 | Whitespace variations | ✅ Yes |
| **NEAR-ACCENT** | 2 | Accent variations (René ↔ Rene) | ✅ Yes |
| **NEAR-NOREPLY** | 2 | No-reply email detection | ✅ Yes |
| **NAME-ONLY-MATCH** | 2 | **Same name, different email** | ✅ **Yes** (OR logic!) |

**Important:** NAME-ONLY-MATCH contacts have:
- ✅ **Matching names** (triggers match due to OR logic)
- ❌ Different emails
- ❌ Different phones

They WILL match because **name match alone is sufficient**.

### 2. Contacts That Will NOT Match (70 total remain)

| Category | Count | Why No Match? |
|----------|-------|---------------|
| **TRUE-NODUP** | 20 (10+10) | Completely different names, emails, and phones |
| **UNIQUE** | 50 | No counterpart in other book |
| **EDGE** | 10 | Various edge cases (different in each book) |

## Key Test Insights

### Understanding OR Logic

The matching logic is:
```
Match if: (name matches) OR (email matches) OR (phone matches)
```

**Examples:**

✅ **Will Match:**
- Same name, different email → Matches (name sufficient)
- Different name, same email → Matches (email sufficient)
- Different name/email, same phone → Matches (phone sufficient)

❌ **Won't Match:**
- All three must differ (name AND email AND phone all different)

### Why This Design?

From the documentation:
> "The matching relation is designed to be rather weak, such that it tends to yield more pairs of candidate duplicates."

**Philosophy:**
- Better to show potential duplicates that users can reject
- Than to miss real duplicates that users can't recover

## How to Use

### Quick Test (5 minutes)

1. **Import:**
   - Create "Test Book 1" → Import `addressbook1-test.vcf`
   - Create "Test Book 2" → Import `addressbook2-test.vcf`

2. **Run:**
   - Tools → Duplicate Contacts Manager
   - Select both test books
   - Enable auto-delete
   - Start search

3. **Verify:**
   - Should find **18 matching pairs**
   - Book 2 should have **45 contacts remaining** (63 - 18 = 45)
   - No errors during deletion

### Detailed Verification

**Check Book 2 after test:**

**Should be deleted (0 remaining):**
- Search `EXACT-` + `-B` → 0 results
- Search `NEAR-GMAIL-B` → 0 results
- Search `NEAR-PHONE-B` → 0 results
- Search `NEAR-NAME-B` → 0 results
- Search `NEAR-CASE-B` → 0 results
- Search `NEAR-SPACE-B` → 0 results
- Search `NEAR-ACCENT-B` → 0 results
- Search `NEAR-NOREPLY-B` → 0 results
- Search `NAME-ONLY-MATCH` + `-b` → 0 results (deleted due to name match!)

**Should remain (45 total):**
- Search `TRUE-NODUP-B` → 10 results
- Search `UNIQUE-` (021-050) → 30 results
- Search `EDGE-` + `-B` → 5 results

### Spot Checks

**Should NOT be found in Book 2:**
- `EXACT-001-B` → Deleted ✓
- `NEAR-GMAIL-B-001` → Deleted ✓
- `NAME-ONLY-MATCH` (Michael Anderson, companyB) → Deleted ✓

**Should be found in Book 2:**
- `TRUE-NODUP-B-001` (Kevin King) → Found ✓
- `UNIQUE-025` → Found ✓

## Test Categories Explained

### EXACT (2 pairs)
Identical in all fields - basic duplicate detection

### NEAR-GMAIL (2 pairs)
Tests email normalization: `@gmail.com` ↔ `@googlemail.com`

### NEAR-PHONE (2 pairs)
Tests phone normalization: `+1-555-1234` ↔ `5551234` ↔ `(555) 1234`

### NEAR-NAME (2 pairs)
Tests name order: `John Doe` ↔ `Doe, John`

### NEAR-CASE (2 pairs)
Tests case insensitivity: `ROBERT JOHNSON` ↔ `robert johnson`

### NEAR-SPACE (2 pairs)
Tests whitespace normalization: `Name  ` (extra spaces) ↔ `Name`

### NEAR-ACCENT (2 pairs)
Tests accent removal: `René` ↔ `Rene`, `José` ↔ `Jose`

### NEAR-NOREPLY (2 pairs)
Tests no-reply detection: `user@domain.com` ↔ `noreply@domain.com`

### NAME-ONLY-MATCH (2 pairs) ⚠️ Important!
**Same name, different email/phone**
- Michael Anderson: `companyA@` vs `companyB@`
- Sarah Martinez: `companyA@` vs `companyB@`

**WILL match** because name matching alone triggers duplicate flag (OR logic).

This is **correct behavior** - the extension is designed to flag these as potential duplicates for user review.

### TRUE-NODUP (10 pairs)
Completely different contacts:
- Book 1: Alice Anderson, Bob Brown, Carol Chen, etc.
- Book 2: Kevin King, Laura Lopez, Mark Miller, etc.

**No overlap** in names, emails, or phones → No matches

### UNIQUE (50 contacts)
Contacts with no counterpart in the other book:
- Book 1: UNIQUE-001 through UNIQUE-020
- Book 2: UNIQUE-021 through UNIQUE-050

### EDGE (10 contacts)
Edge cases testing boundary conditions:
- Contacts with no phone number
- Contacts with name only (no email/phone)
- Minimal data contacts

## Success Criteria

✅ **Must Pass:**
- 18 matching pairs found
- 18 deletions from Book 2
- Book 2 has exactly 45 contacts remaining
- No errors during deletion

✅ **Validation:**
- All EXACT-B, NEAR-*-B deleted
- All NAME-ONLY-MATCH-B deleted (tests OR logic)
- All TRUE-NODUP-B remain
- All UNIQUE remain

## Files Reference

- `generate_test_vcf.py` - Generator script (corrected for OR logic)
- `QUICK_START.md` - This file
- `TEST_RESULTS_ANALYSIS.md` - Explanation of first test results
- `test-manifest.csv` - Updated manifest (coming soon)

## Regenerating Test Files

```bash
cd test-data
python generate_test_vcf.py
```

---

**Test data validated against actual OR-based matching logic** ✓
