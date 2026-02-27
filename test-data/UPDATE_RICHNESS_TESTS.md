# Test Files Update - Whitespace & Auto-Deletion Tests

## What Was Added

### 1. Clarified NEAR-SPACE Test (Whitespace)

**What it tests:**
- Contact A: `NEAR-SPACE-A-001` (normal, no extra spaces)
- Contact B: `NEAR-SPACE-B-001  ` (with 2 trailing spaces at end of name)

**Purpose:** Verifies that the pruning logic removes leading/trailing whitespace before comparison.

**Why important:** Email clients and imports often add inconsistent spacing. The code should normalize:
- `"John Doe  "` (trailing spaces)
- `"  John Doe"` (leading spaces)  
- `"John  Doe"` (double internal spaces)

All should match `"John Doe"` (clean).

### 2. Added AUTO-RICH/POOR Tests (3 new pairs)

**Purpose:** Test automatic deletion based on card "richness" (number of fields).

#### Test Cases:

**Pair 1: AUTO-RICH-001 vs AUTO-POOR-001-B**
- **Rich (Book 1):** Has 6+ extra fields (secondary email, cell phone, address, org, title, URL)
- **Poor (Book 2):** Only has name and email, missing phone
- **Expected:** AUTO-POOR-001-B automatically deleted (rich version kept)

**Pair 2: AUTO-RICH-002 vs AUTO-POOR-002-B**
- **Rich (Book 1):** Has 5+ extra fields (work email, home phone, work address, org, nickname)
- **Poor (Book 2):** Only basic fields (name, email, phone)
- **Expected:** AUTO-POOR-002-B automatically deleted

**Pair 3: AUTO-RICH-003 vs AUTO-POOR-003-B**
- **Rich (Book 1):** Has 6+ extra fields (cell, fax, org, title, URL, address)
- **Poor (Book 2):** Only name and email, missing phone
- **Expected:** AUTO-POOR-003-B automatically deleted

**Key:** All three use **same UID** (`auto-001-shared`, etc.) to ensure they match.

---

## Updated Test Summary

### Total: 122 contacts (56 + 66)

**Expected Matches: 21 pairs**
- 16 regular matching pairs (EXACT, NEAR-*, NAME-ONLY)
- 3 AUTO-RICH/POOR pairs (should auto-delete)
- 2 NAME-ONLY-MATCH pairs (name match via OR logic)

**Expected Deletions: 21 from Book 2**
- 16 regular deletions
- **3 automatic deletions** (poorer cards)
- 2 NAME-ONLY deletions

**Book 2 After Test: 45 contacts**

---

## How to Verify Auto-Deletion

When running duplicate detection with **auto-delete enabled**:

1. **Watch for automatic actions:**
   - The 3 AUTO-POOR contacts should be deleted without manual review
   - This happens because they're clearly inferior (fewer fields)

2. **Check console/stats:**
   - `totalCardsDeletedAuto` should show at least 3
   - No prompts for AUTO-RICH/POOR pairs (handled automatically)

3. **Spot check in Book 2 after test:**
   - Search `AUTO-POOR` → 0 results (all deleted automatically)
   - Search `AUTO-RICH` in Book 1 → 3 results (all kept)

4. **Compare card richness:**
   - Export and compare the AUTO-RICH cards in Book 1
   - Verify they have multiple extra fields (org, title, addresses, etc.)

---

## What "Richness" Means

The duplicate detector considers a card "richer" if it has:
- More non-empty fields
- More contact points (multiple emails/phones)
- Additional data (organization, title, address, URLs, notes)

**Auto-deletion logic:**
- If Card A has significantly more info than Card B
- AND they're duplicates (match)
- AND auto-delete is enabled
- THEN: Delete Card B automatically (keep the richer Card A)

---

## Regenerated Files

✅ `addressbook1-test.vcf` - 56 contacts (was 53, added 3 AUTO-RICH)
✅ `addressbook2-test.vcf` - 66 contacts (was 63, added 3 AUTO-POOR)
✅ `generate_test_vcf.py` - Updated with richness tests

---

## Testing Checklist

### Whitespace Test:
- [ ] NEAR-SPACE-B-001 deleted (trailing spaces normalized)
- [ ] NEAR-SPACE-B-002 deleted (trailing spaces normalized)

### Auto-Deletion Test:
- [ ] AUTO-POOR-001-B auto-deleted (no manual prompt)
- [ ] AUTO-POOR-002-B auto-deleted (no manual prompt)
- [ ] AUTO-POOR-003-B auto-deleted (no manual prompt)
- [ ] `totalCardsDeletedAuto` ≥ 3

### Overall:
- [ ] 21 total matches found
- [ ] Book 2 has 45 contacts remaining (66 - 21 = 45)
- [ ] No errors during deletion

---

**Ready for testing!** The new test files include richness-based auto-deletion scenarios.
