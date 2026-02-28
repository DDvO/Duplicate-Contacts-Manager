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

### 2. AUTO-RICH/POOR Tests (3 pairs) - True Superset/Subset

**Purpose:** Test automatic deletion when one card is a true superset of the other (all shared fields identical or poor has empty/subset values).

#### Test Cases:

**Pair 1: Auto Test Person 001**
- **Rich (Book 1):** Has 6+ extra fields (secondary email, cell phone, address, org, title, URL). Identical DisplayName and Notes to poor.
- **Poor (Book 2):** Same DisplayName, same Notes, same email. No phone, no extra fields.
- **Expected:** Poor copy auto-deleted (rich version kept)

**Pair 2: Auto Test Contact 002**
- **Rich (Book 1):** Has 5+ extra fields (work email, home phone, work address, org, nickname)
- **Poor (Book 2):** Same DisplayName, same Notes, same email and phone. No extra fields.
- **Expected:** Poor copy auto-deleted

**Pair 3: Auto Test Entry 003**
- **Rich (Book 1):** Has 6+ extra fields (cell, fax, org, title, URL, address)
- **Poor (Book 2):** Same DisplayName, same Notes, same email. No phone, no extra fields.
- **Expected:** Poor copy auto-deleted

**Key:** Both cards in each pair have identical DisplayName and Notes. Rich has extra fields; poor is a true subset. All use same UID for matching.

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
   - Search `Auto Test` → 0 results (all 3 poor copies deleted automatically)
   - Search `Auto Test` in Book 1 → 3 results (all kept)

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
- If Card A is a true superset of Card B (B's fields are empty/identical/subset of A's)
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
- [ ] Auto Test Person 001 (Book 2) auto-deleted (no manual prompt)
- [ ] Auto Test Contact 002 (Book 2) auto-deleted (no manual prompt)
- [ ] Auto Test Entry 003 (Book 2) auto-deleted (no manual prompt)
- [ ] `totalCardsDeletedAuto` ≥ 3

### Overall:
- [ ] 21 total matches found
- [ ] Book 2 has 45 contacts remaining (66 - 21 = 45)
- [ ] No errors during deletion

---

**Ready for testing!** The new test files include richness-based auto-deletion scenarios.
