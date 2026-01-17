# Comparison Guide: stefmorp Fork vs DDvO Original

This document explains how to compare your fork (`stefmorp/DuplicateContactsManager`) with the original repository (`DDvO/Duplicate-Contacts-Manager`).

## Setup

The upstream remote has been configured. You can verify it with:

```bash
git remote -v
```

You should see:
- `origin` → your fork: `https://github.com/stefmorp/DuplicateContactsManager.git`
- `upstream` → original: `https://github.com/DDvO/Duplicate-Contacts-Manager.git`

## Comparison Commands

### 1. Fetch Latest from Upstream

Always fetch the latest changes from the original repository before comparing:

```bash
git fetch upstream
```

This updates your local references to the upstream repository without modifying your working directory.

### 2. See Summary of Changes

Get a quick overview of which files changed and how many lines:

```bash
git diff --stat upstream/master..Port_to_TB128
```

**Output example:**
```
47 files changed, 3063 insertions(+), 3822 deletions(-)
```

This shows:
- Total files changed
- Lines added (+)
- Lines deleted (-)

### 3. See List of Changed Files

Get a detailed list of all files that were added (A), modified (M), or deleted (D):

```bash
git diff --name-status upstream/master..Port_to_TB128
```

**Output shows:**
- `A` = Added (new files)
- `M` = Modified (changed files)
- `D` = Deleted (removed files)

### 4. See Commits in Your Branch

View all commits that are in your branch but not in the original:

```bash
git log --oneline upstream/master..Port_to_TB128
```

**Output:**
```
093b895 Remove remaining old XUL/XPCOM directories
663b3cf Remove old XUL/XPCOM files and unnecessary artifacts
cdac940 Port duplicateEntriesWindow.js to WebExtension API for TB128+
3d51f64 Update .gitignore to ensure originalCode.js is tracked correctly
...
```

### 5. See Detailed Commit History

View commits with a graph visualization:

```bash
git log --oneline --graph upstream/master..Port_to_TB128
```

### 6. See Full Diff

View the complete differences between the two branches (warning: can be very long):

```bash
git diff upstream/master..Port_to_TB128
```

### 7. Compare Specific Files

Compare a specific file between branches:

```bash
git diff upstream/master..Port_to_TB128 -- path/to/file.js
```

### 8. See What Changed in a Specific Directory

Compare only files in a specific directory:

```bash
git diff upstream/master..Port_to_TB128 -- window/
```

## Current Comparison Results

### Summary Statistics

**Comparison:** `upstream/master` vs `Port_to_TB128`

- **47 files changed**
- **3,063 insertions(+)**
- **3,822 deletions(-)**

### Key Changes

#### Added Files (New WebExtension Code)
- `window/window.js` (1,762 lines) - Ported duplicate detection logic
- `window/window.html` (149 lines) - HTML UI converted from XUL
- `window/window.css` (197 lines) - CSS styling
- `popup/popup.html` and `popup/popup.js` - Browser action popup
- `background.js` - Background script for window management
- `lib/duplicateFinder.js` - Duplicate finding logic
- `manifest.json` - WebExtension manifest (updated)
- `icons/` - New icon files

#### Removed Files (Old XUL/XPCOM Code)
- `chrome/` directory - All XUL/XPCOM source files
- `skin/` directory - Old XUL CSS files
- `locale/` directory - Old XUL locale files
- `doc/` directory - Documentation images
- `chrome.manifest`, `install.rdf`, `zip.sh` - Old build files

#### Modified Files
- `manifest.json` - Converted to WebExtension format

### Commits in Port_to_TB128 Branch

1. `093b895` - Remove remaining old XUL/XPCOM directories
2. `663b3cf` - Remove old XUL/XPCOM files and unnecessary artifacts
3. `cdac940` - Port duplicateEntriesWindow.js to WebExtension API for TB128+
4. `3d51f64` - Update .gitignore to ensure originalCode.js is tracked correctly
5. `dae2439` - Release 0.0
6. `43fdb01` - Update README.md
7. `3efcd22` - Made the window editable
8. `ae1e713` - first commit

## GitHub Web Interface

You can also view comparisons directly on GitHub:

### Compare Branches
```
https://github.com/DDvO/Duplicate-Contacts-Manager/compare/master...stefmorp:DuplicateContactsManager:Port_to_TB128
```

### Create Pull Request
When ready, create a pull request from your fork to the original repository:
1. Go to: `https://github.com/DDvO/Duplicate-Contacts-Manager`
2. Click "New Pull Request"
3. Select "compare across forks"
4. Choose: `DDvO/Duplicate-Contacts-Manager:master` ← `stefmorp/DuplicateContactsManager:Port_to_TB128`

## Quick Reference

**Most useful commands:**

```bash
# Update and see summary
git fetch upstream && git diff --stat upstream/master..Port_to_TB128

# See what files changed
git diff --name-status upstream/master..Port_to_TB128

# See commit history
git log --oneline upstream/master..Port_to_TB128
```

## Notes

- The original repository uses `master` as the default branch (not `main`)
- Your porting work is on the `Port_to_TB128` branch
- All original XUL/XPCOM code has been removed but is preserved in git history
- The port maintains the same logic and structure as the original for familiarity
