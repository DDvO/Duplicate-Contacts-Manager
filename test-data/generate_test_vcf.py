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
    
    # AUTO-RICH - RICHER variants (3 pairs) - These have MORE fields, should be kept
    rich_contacts = [
        {
            "fn": "AUTO-RICH-001 Complete Person",
            "n": ["Person", "Complete"],
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
            "notes": "[TEST] AUTO-RICH - RICHER card with 6+ extra fields. Should BE KEPT (poorer AUTO-POOR-001-B deleted).",
            "uid": "auto-001-shared"
        },
        {
            "fn": "AUTO-RICH-002 Full Contact",
            "n": ["Contact", "Full"],
            "email": "rich002@example.com",
            "tel": "555-9002",
            "extra": {
                "EMAIL;TYPE=INTERNET": "rich002.work@example.com",
                "TEL;TYPE=HOME": "555-9002-HOME",
                "ADR;TYPE=WORK": ";;456 Business Ave;Worktown;ST;67890;USA",
                "ORG": "Business Corp",
                "NICKNAME": "FullGuy"
            },
            "notes": "[TEST] AUTO-RICH - RICHER card with 5+ extra fields. Should BE KEPT (poorer AUTO-POOR-002-B deleted).",
            "uid": "auto-002-shared"
        },
        {
            "fn": "AUTO-RICH-003 Detailed Entry",
            "n": ["Entry", "Detailed"],
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
            "notes": "[TEST] AUTO-RICH - RICHER card with 6+ extra fields. Should BE KEPT (poorer AUTO-POOR-003-B deleted).",
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
    
    # AUTO-POOR - POORER variants (3 pairs) - Minimal fields, should be AUTO-DELETED
    poor_contacts = [
        {
            "fn": "AUTO-POOR-001-B",
            "n": ["Person", "Complete"],
            "email": "rich001@example.com",  # Same as rich version
            "tel": "",  # Missing phone
            "extra": None,  # No extra fields
            "notes": "[TEST] AUTO-POOR - POORER card (minimal fields). Should be AUTO-DELETED (AUTO-RICH-001 has more info).",
            "uid": "auto-001-shared"  # Same UID
        },
        {
            "fn": "AUTO-POOR-002-B",
            "n": ["Contact", "Full"],
            "email": "rich002@example.com",
            "tel": "555-9002",  # Same phone
            "extra": None,  # No extra fields (rich has 5)
            "notes": "[TEST] AUTO-POOR - POORER card (basic fields only). Should be AUTO-DELETED (AUTO-RICH-002 has more info).",
            "uid": "auto-002-shared"
        },
        {
            "fn": "AUTO-POOR-003-B",
            "n": ["Entry", "Detailed"],
            "email": "rich003@example.com",
            "tel": "",  # Missing phone (rich has 2 phones)
            "extra": None,  # No extra fields (rich has 6)
            "notes": "[TEST] AUTO-POOR - POORER card (minimal). Should be AUTO-DELETED (AUTO-RICH-003 has much more info).",
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
    print(f"\nExpected matches: 21 pairs (18 + 3 AUTO)")
    print(f"  - 2 EXACT")
    print(f"  - 2 NEAR-GMAIL")
    print(f"  - 2 NEAR-PHONE")
    print(f"  - 2 NEAR-NAME")
    print(f"  - 2 NEAR-CASE")
    print(f"  - 2 NEAR-SPACE (tests trailing/leading whitespace removal)")
    print(f"  - 2 NEAR-ACCENT")
    print(f"  - 2 NEAR-NOREPLY")
    print(f"  - 2 NAME-ONLY-MATCH (name matches, different email - WILL match due to OR logic)")
    print(f"  - 3 AUTO-RICH/POOR pairs (richness-based auto-deletion)")
    print(f"\nExpected AUTO-DELETIONS: 3 contacts")
    print(f"  - AUTO-POOR-001-B (minimal, rich version has 6+ extra fields)")
    print(f"  - AUTO-POOR-002-B (basic, rich version has 5+ extra fields)")
    print(f"  - AUTO-POOR-003-B (minimal, rich version has 6+ extra fields)")
    print(f"\nExpected non-matches:")
    print(f"  - 10 TRUE-NODUP pairs (completely different)")
    print(f"  - 50 UNIQUE contacts (no counterpart)")
    print(f"  - 10 EDGE cases (various)")
    print(f"\nExpected total deletions from Book 2: 21 contacts")
    print(f"Book 2 after test: {count2 - 21} contacts remaining")
