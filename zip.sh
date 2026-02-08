#!/bin/sh
# Build XPI for Duplicate Contacts Manager (TB128 WebExtension)
# Per https://developer.thunderbird.net/add-ons/hello-world-add-on
# Use build-xpi.ps1 on Windows (PowerShell) for correct path separators

VERSION=2.2.0
OUT="duplicateContactsManager-${VERSION}.xpi"

zip -r "$OUT" \
  manifest.json background.js window.html chrome _locales skin \
  -x "*~" ".git/*" ".gitignore" "README.md" "zip.sh" "doc/*" \
  -x "ARCHITECTURE_AND_HISTORY.md"

echo "Created $OUT"
