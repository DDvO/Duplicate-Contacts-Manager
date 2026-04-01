#!/usr/bin/env python3
"""
Generate CORRECTED test VCF files for Duplicate Contacts Manager testing
Based on actual matching logic: OR (name OR email OR phone)
Includes richness-based auto-deletion tests
"""

def create_vcard_advanced(fn, n_parts, email, tel, notes, uid, extra_fields=None):
    """Create a vCard 3.0 entry with optional extra fields"""
    lastname = n_parts[0] if len(n_parts) > 0 else ""
    firstname = n_parts[1] if len(n_parts) > 1 else ""
    
    vcard = f"""BEGIN:VCARD
VERSION:3.0
FN:{fn}
N:{lastname};{firstname};;;"""
    
    if email:
        vcard += f"\nEMAIL;TYPE=INTERNET:{email}"
    if tel:
        vcard += f"\nTEL;TYPE=WORK:{tel}"
    
    # Add extra fields if provided
    if extra_fields:
        for key, value in extra_fields.items():
            if value:
                vcard += f"\n{key}:{value}"
    
    vcard += f"\nNOTE:{notes}"
    vcard += f"\nUID:{uid}"
    vcard += "\nEND:VCARD\n"
    
    return vcard

def create_vcard(fn, n_parts, email, tel, notes, uid):
    """Simple wrapper for basic vcards"""
    return create_vcard_advanced(fn, n_parts, email, tel, notes, uid, None)


def phase12_book1_mv3_vcfs():
    """
    Phase 1–2 regression contacts for Book 1 (unique; no duplicate in Book 2).

    Phase 1: MV3 vCard-only loading — structured N, multiple EMAIL lines parsed into
    PrimaryEmail / SecondEmail (third EMAIL ignored by parser, by design).

    Phase 2: REV (compact UTC + 8-digit date), BDAY split into BirthYear/Month/Day,
    inverse-consistent with generateVCard / formatRevForVCard.
    """
    return (
        """BEGIN:VCARD
VERSION:3.0
FN:PHASE12-REV-001
N:Rev001;Phase12;;;
EMAIL;TYPE=INTERNET:phase12.rev001@example.com
TEL;TYPE=WORK:555-12001
REV:20230215T120000Z
NOTE:[TEST] Phase2 REV compact UTC. Verify Last Modified after load; round-trip save.
UID:phase12-rev-001-a
END:VCARD
"""
        """BEGIN:VCARD
VERSION:3.0
FN:PHASE12-REV-002
N:Rev002;Phase12;;;
EMAIL;TYPE=INTERNET:phase12.rev002@example.com
TEL;TYPE=WORK:555-12002
REV:20230101
NOTE:[TEST] Phase2 REV 8-digit date. parseLastModifiedDateForDisplay + formatRev round-trip.
UID:phase12-rev-002-a
END:VCARD
"""
        """BEGIN:VCARD
VERSION:3.0
FN:PHASE12-BDAY-001
N:Birthday;Phase12;;;
EMAIL;TYPE=INTERNET:phase12.bday001@example.com
TEL;TYPE=WORK:555-12003
BDAY:1990-05-15
NOTE:[TEST] Phase2 BDAY line -> BirthYear/BirthMonth/BirthDay (mapVCardPropertyToTB BirthDay).
UID:phase12-bday-001-a
END:VCARD
"""
        """BEGIN:VCARD
VERSION:3.0
FN:PHASE12-MAIL2-001
N:MailTwo;Phase12;;;
EMAIL;TYPE=INTERNET:phase12.mail2.primary@example.com
EMAIL;TYPE=INTERNET:phase12.mail2.secondary@example.com
TEL;TYPE=WORK:555-12004
NOTE:[TEST] Phase1/2 two EMAIL lines -> PrimaryEmail + SecondEmail order matches generateVCard.
UID:phase12-mail2-001-a
END:VCARD
"""
        """BEGIN:VCARD
VERSION:3.0
FN:PHASE12-MAIL3-001
N:MailThree;Phase12;;;
EMAIL;TYPE=INTERNET:phase12.mail3.first@example.com
EMAIL;TYPE=INTERNET:phase12.mail3.second@example.com
EMAIL;TYPE=INTERNET:phase12.mail3.third@example.com
TEL;TYPE=WORK:555-12005
NOTE:[TEST] Phase1 third EMAIL ignored by parser (Primary+Second only). Intentional.
UID:phase12-mail3-001-a
END:VCARD
"""
        """BEGIN:VCARD
VERSION:3.0
FN:Phase12 N Middle
N:Structured;Phase12;Middle;;;
EMAIL;TYPE=INTERNET:phase12.nstruct@example.com
TEL;TYPE=WORK:555-12006
NOTE:[TEST] Phase1 structured N (Last;First;Middle). FN separate from N.
UID:phase12-nstruct-001-a
END:VCARD
"""
    )


def phase12_book2_mv3_vcfs():
    """
    Phase 1–2 regression contacts for Book 2 (unique; different emails/FN from Book 1).

    Use for manual compare / open contact: no duplicate pair with Book 1 PHASE12-*.
    """
    return (
        """BEGIN:VCARD
VERSION:3.0
FN:PHASE12-REV-101
N:Rev101;Phase12b;;;
EMAIL;TYPE=INTERNET:phase12.rev101@example.org
TEL;TYPE=WORK:555-22001
REV:20240620T153045Z
NOTE:[TEST] Phase2 REV compact (book2). Independent from Book1 PHASE12-REV-001.
UID:phase12-rev-101-b
END:VCARD
"""
        """BEGIN:VCARD
VERSION:3.0
FN:PHASE12-REV-102
N:Rev102;Phase12b;;;
EMAIL;TYPE=INTERNET:phase12.rev102@example.org
TEL;TYPE=WORK:555-22002
REV:20241225
NOTE:[TEST] Phase2 REV 8-digit date (book2).
UID:phase12-rev-102-b
END:VCARD
"""
        """BEGIN:VCARD
VERSION:3.0
FN:PHASE12-BDAY-101
N:Birthday;Phase12b;;;
EMAIL;TYPE=INTERNET:phase12.bday101@example.org
TEL;TYPE=WORK:555-22003
BDAY:1985-11-23
NOTE:[TEST] Phase2 BDAY (book2).
UID:phase12-bday-101-b
END:VCARD
"""
        """BEGIN:VCARD
VERSION:3.0
FN:PHASE12-MAIL2-101
N:MailTwo;Phase12b;;;
EMAIL;TYPE=INTERNET:phase12.mail2a@example.org
EMAIL;TYPE=INTERNET:phase12.mail2b@example.org
TEL;TYPE=WORK:555-22004
NOTE:[TEST] Phase1/2 two EMAIL lines (book2).
UID:phase12-mail2-101-b
END:VCARD
"""
        """BEGIN:VCARD
VERSION:3.0
FN:PHASE12-MAIL3-101
N:MailThree;Phase12b;;;
EMAIL;TYPE=INTERNET:phase12.m3a@example.org
EMAIL;TYPE=INTERNET:phase12.m3b@example.org
EMAIL;TYPE=INTERNET:phase12.m3c@example.org
TEL;TYPE=WORK:555-22005
NOTE:[TEST] Phase1 third EMAIL ignored (book2).
UID:phase12-mail3-101-b
END:VCARD
"""
        """BEGIN:VCARD
VERSION:3.0
FN:Phase12b N Middle
N:Structured;Phase12b;Middle;;;
EMAIL;TYPE=INTERNET:phase12.nstruct@example.org
TEL;TYPE=WORK:555-22006
NOTE:[TEST] Phase1 structured N (book2).
UID:phase12-nstruct-101-b
END:VCARD
"""
    )


def dupview_duplicate_pairs_book1():
    """
    A variants for duplicate pairs that intentionally match Book 2 B cards (same PrimaryEmail).

    Use these when stepping through duplicates: comparison table should show BDAY, BirthYear/Month/Day,
    two EMAIL lines, structured N, Last Modified (REV), and related fields.
    Search by FN prefix DUPVIEW- in the duplicate flow or by email dupview.full@ / dupview.triple@.
    """
    return (
        """BEGIN:VCARD
VERSION:3.0
FN:DUPVIEW-FULL-A
N:Full;Dup;Viewer;;;
EMAIL;TYPE=INTERNET:dupview.full@example.com
EMAIL;TYPE=INTERNET:dupview.full.alt@example.com
TEL;TYPE=WORK:555-87101
BDAY:1988-03-14
REV:20200115T120000Z
NOTE:[TEST] DUPVIEW duplicate pair A — BDAY + 2 EMAIL + N + REV. Same primary email as DUPVIEW-FULL-B.
UID:dupview-full-a
END:VCARD
"""
        """BEGIN:VCARD
VERSION:3.0
FN:DUPVIEW-TRIPLE-A
N:Triple;Dup;Viewer;;;
EMAIL;TYPE=INTERNET:dupview.triple@example.com
EMAIL;TYPE=INTERNET:dupview.triple.second@example.com
EMAIL;TYPE=INTERNET:dupview.triple.third@example.com
TEL;TYPE=WORK:555-87102
BDAY:1992-11-07
REV:20220601T090000Z
NOTE:[TEST] DUPVIEW duplicate pair A — three EMAIL lines (parser keeps Primary+Second; third ignored for matching). Matches DUPVIEW-TRIPLE-B.
UID:dupview-triple-a
END:VCARD
"""
    )


def dupview_duplicate_pairs_book2():
    """
    B variants: same PrimaryEmail (and same second email where applicable) as Book 1 DUPVIEW-*-A cards.
    SHOULD BE DELETED as duplicates when comparing Book 1 vs Book 2 (same as other B variants).
    """
    return (
        """BEGIN:VCARD
VERSION:3.0
FN:DUPVIEW-FULL-B
N:Full;Dup;Viewer;;;
EMAIL;TYPE=INTERNET:dupview.full@example.com
EMAIL;TYPE=INTERNET:dupview.full.alt@example.com
TEL;TYPE=WORK:555-87101
BDAY:1988-03-14
REV:20200115T120000Z
NOTE:[TEST] DUPVIEW duplicate pair B — SHOULD match DUPVIEW-FULL-A (same emails). Delete B when keeping A.
UID:dupview-full-b
END:VCARD
"""
        """BEGIN:VCARD
VERSION:3.0
FN:DUPVIEW-TRIPLE-B
N:Triple;Dup;Viewer;;;
EMAIL;TYPE=INTERNET:dupview.triple@example.com
EMAIL;TYPE=INTERNET:dupview.triple.second@example.com
EMAIL;TYPE=INTERNET:dupview.triple.third@example.com
TEL;TYPE=WORK:555-87102
BDAY:1992-11-07
REV:20220601T090000Z
NOTE:[TEST] DUPVIEW duplicate pair B — three EMAIL lines. Matches DUPVIEW-TRIPLE-A.
UID:dupview-triple-b
END:VCARD
"""
    )


def generate_book1():
    """Generate addressbook1-test.vcf"""
    vcards = []
    
    # EXACT duplicates - A variants (2 pairs)
    for i in range(1, 3):
        fn = f"EXACT-{i:03d}-A"
        email = f"exact{i:03d}@example.com"
        tel = f"555-{i:04d}"
        notes = f"[TEST] EXACT duplicate pair {i}, variant A. Should match EXACT-{i:03d}-B."
        uid = f"exact-{i:03d}-uid-a"
        vcards.append(create_vcard(fn, [fn, ""], email, tel, notes, uid))
    
    # NEAR-GMAIL - A variants (2 pairs)
    for i in range(1, 3):
        fn = f"NEAR-GMAIL-A-{i:03d}"
        email = f"neargmail{i:03d}@gmail.com"
        tel = f"555-{2000+i:04d}"
        notes = f"[TEST] NEAR duplicate (Gmail variant). Should match NEAR-GMAIL-B-{i:03d}."
        uid = f"near-gmail-{i:03d}-a"
        vcards.append(create_vcard(fn, [fn, ""], email, tel, notes, uid))
    
    # NEAR-PHONE - A variants (2 pairs)
    phone_formats_a = ["+1-555-1001", "(555) 1002"]
    for i in range(1, 3):
        fn = f"NEAR-PHONE-A-{i:03d}"
        email = f"nearphone{i:03d}@example.com"
        tel = phone_formats_a[i-1]
        notes = f"[TEST] NEAR duplicate (Phone format). Should match NEAR-PHONE-B-{i:03d}."
        uid = f"near-phone-{i:03d}-a"
        vcards.append(create_vcard(fn, [fn, ""], email, tel, notes, uid))
    
    # NEAR-NAME - A variants (2 pairs)
    names_a = [
        ("John Doe", ["Doe", "John"]),
        ("Jane Smith", ["Smith", "Jane"])
    ]
    for i, (fn, n_parts) in enumerate(names_a, 1):
        email = f"nearname{i:03d}@example.com"
        tel = f"555-{3000+i:04d}"
        notes = f"[TEST] NEAR duplicate (Name order). Should match NEAR-NAME-B-{i:03d}."
        uid = f"near-name-{i:03d}-a"
        vcards.append(create_vcard(fn, n_parts, email, tel, notes, uid))
    
    # NEAR-CASE - A variants (2 pairs)
    names_case = ["ROBERT JOHNSON", "MARY WILLIAMS"]
    for i, name in enumerate(names_case, 1):
        fn = name
        email = f"nearcase{i:03d}@example.com"
        tel = f"555-{4000+i:04d}"
        notes = f"[TEST] NEAR duplicate (Case difference). Should match NEAR-CASE-B-{i:03d}."
        uid = f"near-case-{i:03d}-a"
        vcards.append(create_vcard(fn, [name, ""], email, tel, notes, uid))
    
    # NEAR-SPACE - A variants (2 pairs) - Tests whitespace normalization
    for i in range(1, 3):
        fn = f"NEAR-SPACE-A-{i:03d}"  # Normal spacing
        email = f"nearspace{i:03d}@example.com"
        tel = f"555-{5000+i:04d}"
        notes = f"[TEST] NEAR duplicate (Whitespace). Tests trailing/leading space removal. Should match NEAR-SPACE-B-{i:03d}."
        uid = f"near-space-{i:03d}-a"
        vcards.append(create_vcard(fn, [fn, ""], email, tel, notes, uid))
    
    # NEAR-ACCENT - A variants (2 pairs)
    names_accent = ["René Dubois", "José Garcia"]
    for i, name in enumerate(names_accent, 1):
        fn = name
        email = f"nearaccent{i:03d}@example.com"
        tel = f"555-{6000+i:04d}"
        notes = f"[TEST] NEAR duplicate (Accented chars). Should match NEAR-ACCENT-B-{i:03d}."
        uid = f"near-accent-{i:03d}-a"
        parts = name.split()
        vcards.append(create_vcard(fn, [parts[-1], parts[0]], email, tel, notes, uid))
    
    # NEAR-NOREPLY - A variants (2 pairs)
    for i in range(1, 3):
        fn = f"NEAR-NOREPLY-A-{i:03d}"
        emails_a = ["test@example.com", "info@company.com"]
        email = emails_a[i-1]
        tel = f"555-{7000+i:04d}"
        notes = f"[TEST] NEAR duplicate (No-reply variant). Should match NEAR-NOREPLY-B-{i:03d}."
        uid = f"near-noreply-{i:03d}-a"
        vcards.append(create_vcard(fn, [fn, ""], email, tel, notes, uid))
    
    # NAME-ONLY-MATCH - A variants (2 pairs) - WILL match because names match
    common_names = ["Michael Anderson", "Sarah Martinez"]
    for i, name in enumerate(common_names, 1):
        fn = name
        parts = name.split()
        email = f"{parts[0].lower()}.{parts[1].lower()}.companyA@example.com"
        tel = f"555-{8000+i:04d}"
        notes = f"[TEST] NAME-ONLY-MATCH - Same name, different email. WILL MATCH on name (OR logic). Pair {i}."
        uid = f"name-only-{i:03d}-a"
        vcards.append(create_vcard(fn, [parts[1], parts[0]], email, tel, notes, uid))
    
    # AUTO-RICH - RICHER variants (3 pairs) - True supersets, poor is subset with identical DisplayName/Notes
    rich_contacts = [
        {
            "fn": "Auto Test Person 001",
            "n": ["Person", "Auto Test"],
            "email": "rich001@example.com",
            "tel": "555-9001",
            "extra": {
                "EMAIL;TYPE=INTERNET": "rich001.secondary@example.com",
                "TEL;TYPE=CELL": "555-9001-CELL",
                "ADR;TYPE=HOME": ";;123 Main St;Hometown;State;12345;USA",
                "ORG": "Tech Company Inc",
                "TITLE": "Senior Engineer",
                "URL": "https://example.com/rich001"
            },
            "notes": "[TEST] Auto-delete pair 001. Rich has extra fields. Poor is subset.",
            "uid": "auto-001-shared"
        },
        {
            "fn": "Auto Test Contact 002",
            "n": ["Contact", "Auto Test"],
            "email": "rich002@example.com",
            "tel": "555-9002",
            "extra": {
                "EMAIL;TYPE=INTERNET": "rich002.work@example.com",
                "TEL;TYPE=HOME": "555-9002-HOME",
                "ADR;TYPE=WORK": ";;456 Business Ave;Worktown;ST;67890;USA",
                "ORG": "Business Corp",
                "NICKNAME": "FullGuy"
            },
            "notes": "[TEST] Auto-delete pair 002. Rich has extra fields. Poor is subset.",
            "uid": "auto-002-shared"
        },
        {
            "fn": "Auto Test Entry 003",
            "n": ["Entry", "Auto Test"],
            "email": "rich003@example.com",
            "tel": "555-9003",
            "extra": {
                "TEL;TYPE=CELL": "555-9003-CELL",
                "TEL;TYPE=FAX": "555-9003-FAX",
                "ORG": "Enterprise Ltd",
                "TITLE": "Manager",
                "URL": "https://example.com/rich003",
                "ADR;TYPE=HOME": ";;789 Oak St;Hometown;State;11111;USA"
            },
            "notes": "[TEST] Auto-delete pair 003. Rich has extra fields. Poor is subset.",
            "uid": "auto-003-shared"
        }
    ]
    
    for contact in rich_contacts:
        vcards.append(create_vcard_advanced(
            contact["fn"],
            contact["n"],
            contact["email"],
            contact["tel"],
            contact["notes"],
            contact["uid"],
            contact["extra"]
        ))
    
    # TRUE-NODUP - A variants (10 pairs) - Completely different, should NOT match
    nodup_contacts = [
        ("Alice Anderson", "alice.anderson@email.com", "555-9101"),
        ("Bob Brown", "bob.brown@email.com", "555-9102"),
        ("Carol Chen", "carol.chen@email.com", "555-9103"),
        ("David Davis", "david.davis@email.com", "555-9104"),
        ("Emma Evans", "emma.evans@email.com", "555-9105"),
        ("Frank Foster", "frank.foster@email.com", "555-9106"),
        ("Grace Green", "grace.green@email.com", "555-9107"),
        ("Henry Harris", "henry.harris@email.com", "555-9108"),
        ("Iris Irving", "iris.irving@email.com", "555-9109"),
        ("Jack Johnson", "jack.johnson@email.com", "555-9110")
    ]
    for i, (name, email, tel) in enumerate(nodup_contacts, 1):
        fn = name
        parts = name.split()
        notes = f"[TEST] TRUE-NODUP - Completely different contact. Should NOT match TRUE-NODUP-B-{i:03d}."
        uid = f"true-nodup-{i:03d}-a"
        vcards.append(create_vcard(fn, [parts[1], parts[0]], email, tel, notes, uid))
    
    # UNIQUE contacts (20)
    for i in range(1, 21):
        fn = f"UNIQUE-{i:03d}"
        email = f"unique{i:03d}@example.com"
        tel = f"555-{10000+i:04d}"
        notes = f"[TEST] UNIQUE - No duplicate exists in other book."
        uid = f"unique-{i:03d}"
        vcards.append(create_vcard(fn, [fn, ""], email, tel, notes, uid))
    
    # EDGE cases (5)
    # Email only, no phone
    for i in range(1, 3):
        fn = f"EDGE-NOPHONE-{i:03d}"
        email = f"edgenophone{i:03d}@example.com"
        tel = ""
        notes = f"[TEST] EDGE - No phone number."
        uid = f"edge-nophone-{i:03d}-a"
        vcards.append(create_vcard(fn, [fn, ""], email, tel, notes, uid))
    
    # Name only, no email/phone
    for i in range(1, 3):
        fn = f"EDGE-NAMEONLY-{i:03d}"
        email = ""
        tel = ""
        notes = f"[TEST] EDGE - Name only, no contact info."
        uid = f"edge-nameonly-{i:03d}-a"
        vcards.append(create_vcard(fn, [fn, ""], email, tel, notes, uid))
    
    # Empty contact (minimal data)
    fn = "EDGE-MINIMAL"
    email = "edgeminimal@example.com"
    tel = ""
    notes = "[TEST] EDGE - Minimal data."
    uid = "edge-minimal-a"
    vcards.append(create_vcard(fn, [fn, ""], email, tel, notes, uid))

    # DUPVIEW: duplicate pairs (same PrimaryEmail as Book 2) — BDAY, multi-EMAIL, N, REV in comparison UI
    vcards.append(dupview_duplicate_pairs_book1())

    # Phase 1–2: MV3 vCard parse (N, multi-EMAIL), REV/BDAY (see README Phase 1–2 section)
    vcards.append(phase12_book1_mv3_vcfs())

    return "".join(vcards)

def generate_book2():
    """Generate addressbook2-test.vcf"""
    vcards = []
    
    # EXACT duplicates - B variants (2) - should match and be deleted
    for i in range(1, 3):
        fn = f"EXACT-{i:03d}-B"
        email = f"exact{i:03d}@example.com"
        tel = f"555-{i:04d}"
        notes = f"[TEST] EXACT duplicate pair {i}, variant B. SHOULD BE DELETED (matches EXACT-{i:03d}-A)."
        uid = f"exact-{i:03d}-uid-b"
        vcards.append(create_vcard(fn, [fn, ""], email, tel, notes, uid))
    
    # NEAR-GMAIL - B variants (2) - googlemail variant
    for i in range(1, 3):
        fn = f"NEAR-GMAIL-B-{i:03d}"
        email = f"neargmail{i:03d}@googlemail.com"
        tel = f"555-{2000+i:04d}"
        notes = f"[TEST] NEAR duplicate (Googlemail). SHOULD BE DELETED (matches NEAR-GMAIL-A-{i:03d})."
        uid = f"near-gmail-{i:03d}-b"
        vcards.append(create_vcard(fn, [fn, ""], email, tel, notes, uid))
    
    # NEAR-PHONE - B variants (2) - different phone formats
    phone_formats_b = ["5551001", "555.1002"]
    for i in range(1, 3):
        fn = f"NEAR-PHONE-B-{i:03d}"
        email = f"nearphone{i:03d}@example.com"
        tel = phone_formats_b[i-1]
        notes = f"[TEST] NEAR duplicate (Phone format). SHOULD BE DELETED (matches NEAR-PHONE-A-{i:03d})."
        uid = f"near-phone-{i:03d}-b"
        vcards.append(create_vcard(fn, [fn, ""], email, tel, notes, uid))
    
    # NEAR-NAME - B variants (2) - reversed name order
    names_b = [
        ("Doe, John", ["Doe", "John"]),
        ("Smith, Jane", ["Smith", "Jane"])
    ]
    for i, (fn, n_parts) in enumerate(names_b, 1):
        email = f"nearname{i:03d}@example.com"
        tel = f"555-{3000+i:04d}"
        notes = f"[TEST] NEAR duplicate (Name order). SHOULD BE DELETED (matches NEAR-NAME-A-{i:03d})."
        uid = f"near-name-{i:03d}-b"
        vcards.append(create_vcard(fn, n_parts, email, tel, notes, uid))
    
    # NEAR-CASE - B variants (2) - lowercase
    names_case = ["robert johnson", "mary williams"]
    for i, name in enumerate(names_case, 1):
        fn = name
        email = f"nearcase{i:03d}@example.com"
        tel = f"555-{4000+i:04d}"
        notes = f"[TEST] NEAR duplicate (Case). SHOULD BE DELETED (matches NEAR-CASE-A-{i:03d})."
        uid = f"near-case-{i:03d}-b"
        vcards.append(create_vcard(fn, [name, ""], email, tel, notes, uid))
    
    # NEAR-SPACE - B variants (2) - trailing spaces
    for i in range(1, 3):
        fn = f"NEAR-SPACE-B-{i:03d}  "  # Two trailing spaces
        email = f"nearspace{i:03d}@example.com"
        tel = f"555-{5000+i:04d}"
        notes = f"[TEST] NEAR duplicate (Whitespace). Tests trailing space removal. SHOULD BE DELETED (matches NEAR-SPACE-A-{i:03d})."
        uid = f"near-space-{i:03d}-b"
        vcards.append(create_vcard(fn, [fn, ""], email, tel, notes, uid))
    
    # NEAR-ACCENT - B variants (2) - without accents
    names_noaccent = ["Rene Dubois", "Jose Garcia"]
    for i, name in enumerate(names_noaccent, 1):
        fn = name
        email = f"nearaccent{i:03d}@example.com"
        tel = f"555-{6000+i:04d}"
        notes = f"[TEST] NEAR duplicate (No accent). SHOULD BE DELETED (matches NEAR-ACCENT-A-{i:03d})."
        uid = f"near-accent-{i:03d}-b"
        parts = name.split()
        vcards.append(create_vcard(fn, [parts[-1], parts[0]], email, tel, notes, uid))
    
    # NEAR-NOREPLY - B variants (2) - noreply emails
    for i in range(1, 3):
        fn = f"NEAR-NOREPLY-B-{i:03d}"
        emails_b = ["noreply@example.com", "no-reply@company.com"]
        email = emails_b[i-1]
        tel = f"555-{7000+i:04d}"
        notes = f"[TEST] NEAR duplicate (No-reply email). SHOULD BE DELETED (matches NEAR-NOREPLY-A-{i:03d})."
        uid = f"near-noreply-{i:03d}-b"
        vcards.append(create_vcard(fn, [fn, ""], email, tel, notes, uid))
    
    # NAME-ONLY-MATCH - B variants (2) - WILL match because names match (OR logic)
    common_names = ["Michael Anderson", "Sarah Martinez"]
    for i, name in enumerate(common_names, 1):
        fn = name
        parts = name.split()
        email = f"{parts[0].lower()}.{parts[1].lower()}.companyB@example.com"
        tel = f"555-{8100+i:04d}"
        notes = f"[TEST] NAME-ONLY-MATCH - Same name, different email. WILL BE DELETED (name matches, OR logic). Pair {i}."
        uid = f"name-only-{i:03d}-b"
        vcards.append(create_vcard(fn, [parts[1], parts[0]], email, tel, notes, uid))
    
    # AUTO-POOR - POORER variants (3 pairs) - True subsets: identical DisplayName/Notes, fewer fields
    poor_contacts = [
        {
            "fn": "Auto Test Person 001",
            "n": ["Person", "Auto Test"],
            "email": "rich001@example.com",
            "tel": "",
            "extra": None,
            "notes": "[TEST] Auto-delete pair 001. Rich has extra fields. Poor is subset.",
            "uid": "auto-001-shared"
        },
        {
            "fn": "Auto Test Contact 002",
            "n": ["Contact", "Auto Test"],
            "email": "rich002@example.com",
            "tel": "555-9002",
            "extra": None,
            "notes": "[TEST] Auto-delete pair 002. Rich has extra fields. Poor is subset.",
            "uid": "auto-002-shared"
        },
        {
            "fn": "Auto Test Entry 003",
            "n": ["Entry", "Auto Test"],
            "email": "rich003@example.com",
            "tel": "",
            "extra": None,
            "notes": "[TEST] Auto-delete pair 003. Rich has extra fields. Poor is subset.",
            "uid": "auto-003-shared"
        }
    ]
    
    for contact in poor_contacts:
        vcards.append(create_vcard_advanced(
            contact["fn"],
            contact["n"],
            contact["email"],
            contact["tel"],
            contact["notes"],
            contact["uid"],
            contact["extra"]
        ))
    
    # TRUE-NODUP - B variants (10) - Completely different, should NOT match
    nodup_contacts = [
        ("Kevin King", "kevin.king@email.com", "555-9201"),
        ("Laura Lopez", "laura.lopez@email.com", "555-9202"),
        ("Mark Miller", "mark.miller@email.com", "555-9203"),
        ("Nina Nelson", "nina.nelson@email.com", "555-9204"),
        ("Oscar Olson", "oscar.olson@email.com", "555-9205"),
        ("Paula Parker", "paula.parker@email.com", "555-9206"),
        ("Quinn Quinn", "quinn.quinn@email.com", "555-9207"),
        ("Rachel Roberts", "rachel.roberts@email.com", "555-9208"),
        ("Steve Stevens", "steve.stevens@email.com", "555-9209"),
        ("Tina Turner", "tina.turner@email.com", "555-9210")
    ]
    for i, (name, email, tel) in enumerate(nodup_contacts, 1):
        fn = name
        parts = name.split()
        notes = f"[TEST] TRUE-NODUP - Completely different. Should NOT be deleted (no match with TRUE-NODUP-A-{i:03d})."
        uid = f"true-nodup-{i:03d}-b"
        vcards.append(create_vcard(fn, [parts[1], parts[0]], email, tel, notes, uid))
    
    # UNIQUE contacts - different from book 1 (30)
    for i in range(21, 51):
        fn = f"UNIQUE-{i:03d}"
        email = f"unique{i:03d}@example.com"
        tel = f"555-{10000+i:04d}"
        notes = f"[TEST] UNIQUE - No duplicate exists in other book."
        uid = f"unique-{i:03d}"
        vcards.append(create_vcard(fn, [fn, ""], email, tel, notes, uid))
    
    # EDGE cases (5) - different from book 1
    for i in range(1, 3):
        fn = f"EDGE-NOPHONE-{i:03d}-B"
        email = f"edgenophoneB{i:03d}@example.com"
        tel = ""
        notes = f"[TEST] EDGE - No phone number (different from book 1)."
        uid = f"edge-nophone-{i:03d}-b"
        vcards.append(create_vcard(fn, [fn, ""], email, tel, notes, uid))
    
    for i in range(1, 3):
        fn = f"EDGE-NAMEONLY-{i:03d}-B"
        email = ""
        tel = ""
        notes = f"[TEST] EDGE - Name only (different from book 1)."
        uid = f"edge-nameonly-{i:03d}-b"
        vcards.append(create_vcard(fn, [fn, ""], email, tel, notes, uid))
    
    fn = "EDGE-MINIMAL-B"
    email = "edgeminimalB@example.com"
    tel = ""
    notes = "[TEST] EDGE - Minimal data (different from book 1)."
    uid = "edge-minimal-b"
    vcards.append(create_vcard(fn, [fn, ""], email, tel, notes, uid))

    # DUPVIEW: B variants (match dupview_duplicate_pairs_book1)
    vcards.append(dupview_duplicate_pairs_book2())

    # Phase 1–2: independent contacts in Book 2 (no duplicate of Book 1 PHASE12-*)
    vcards.append(phase12_book2_mv3_vcfs())

    return "".join(vcards)

if __name__ == "__main__":
    print("Generating CORRECTED test VCF files...")
    print("(Based on actual OR matching logic + richness auto-deletion tests)\n")
    
    print("Generating addressbook1-test.vcf...")
    book1 = generate_book1()
    with open("addressbook1-test.vcf", "w", encoding="utf-8") as f:
        f.write(book1)
    count1 = book1.count('BEGIN:VCARD')
    print(f"  Created with {count1} contacts")
    
    print("Generating addressbook2-test.vcf...")
    book2 = generate_book2()
    with open("addressbook2-test.vcf", "w", encoding="utf-8") as f:
        f.write(book2)
    count2 = book2.count('BEGIN:VCARD')
    print(f"  Created with {count2} contacts")
    
    print(f"\nTest files generated successfully!")
    print(f"Total contacts: {count1 + count2} ({count1} in book1, {count2} in book2)")
    print(f"  Includes {6} PHASE12 contacts per book (Phase 1–2 MV3 / vCardUtils regression).")
    print(f"  Includes 2 DUPVIEW duplicate pairs per book (BDAY / multi-EMAIL / REV / N — for comparison UI).")
    print(f"\nExpected matches: 23 pairs (20 + 3 AUTO)")
    print(f"  - 2 EXACT")
    print(f"  - 2 NEAR-GMAIL")
    print(f"  - 2 NEAR-PHONE")
    print(f"  - 2 NEAR-NAME")
    print(f"  - 2 NEAR-CASE")
    print(f"  - 2 NEAR-SPACE (tests trailing/leading whitespace removal)")
    print(f"  - 2 NEAR-ACCENT")
    print(f"  - 2 NEAR-NOREPLY")
    print(f"  - 2 NAME-ONLY-MATCH (name matches, different email - WILL match due to OR logic)")
    print(f"  - 2 DUPVIEW (BDAY + 2 EMAIL + REV + N, and triple EMAIL)")
    print(f"  - 3 AUTO-RICH/POOR pairs (richness-based auto-deletion)")
    print(f"\nExpected AUTO-DELETIONS: 3 contacts (poor copies, true subsets)")
    print(f"  - Auto Test Person 001 (Book 2 copy - subset of Book 1)")
    print(f"  - Auto Test Contact 002 (Book 2 copy - subset of Book 1)")
    print(f"  - Auto Test Entry 003 (Book 2 copy - subset of Book 1)")
    print(f"\nExpected non-matches:")
    print(f"  - 10 TRUE-NODUP pairs (completely different)")
    print(f"  - 50 UNIQUE contacts (no counterpart)")
    print(f"  - 10 EDGE cases (various)")
    print(f"\nExpected total deletions from Book 2: 23 contacts")
    print(f"Book 2 after test: {count2 - 23} contacts remaining")
