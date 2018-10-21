# [Duplicate Contact Manager for Thunderbird](duplicatecontactsmanager-1.0.xpi)

This Thunderbird extension facilitates handling of redundant entries in address books.
After installation it can be invoked via the `Tools->Duplicate Contacts Manager...` menu entry.
One can also customize the `Toolbar` of the `Address Book` window with a `Find Duplicates` button.

The Duplicate Contacts Manager searches address books for matching contact entries, also known as _cards_.
It can automatically delete all cards that match and have equivalent or less information than some other one.
Any remaining pairs of matching cards are presented as potential duplicates for manual treatment.
Each two cards are shown side-by-side with a comparison of all fields containing data, including any photo.
Some important fields are always shown such that they can be filled in when they have been empty so far.

When pairs of candidate duplicates are presented, the reason why they are considered matching is given in the status line.

* The '≡' symbol is shown between fields with identical values.  
All other relations are determined after abstraction of values (see the definitions below).
* The '≃' symbol is used for indicating matching names, email addresses, or phone numbers.
* The '≅' symbol is used for indicating equivalent fields and equivalent cards.
* The '⋦' and '⋧' symbols indicate that a field or a whole card contains less/more information than the other.
* The '⊆' and '⊇' symbols indicate the subset/superset relation on email addresses or phone numbers.
* The '<' and '>' symbols indicate comparison on numerical values or the substring/superstring relation on names and other texts.

During manual treatment of a pair of matching cards the user can skip them, can modify one or both of them, and can decide to delete one of them.
When a card is deleted and it has a primary email address that is contained in one or more mailing lists and the other card does not have the same primary email address, the address is also deleted from the respective mailing lists.

## Matching contact entries

There are two _search modes_ for finding matching cards:

*   within a single address book with n cards, comparing each card with all other cards, resulting in n*(n-1)/2 card comparisons.
*   with two different address books with n and m cards, comparing each card in the first one with each card of the second one, resulting in n*m card comparisons.

Two cards are considered _matching_ if any of the following conditions hold, where the details are explained below.

*   The cards contain matching names, or
*   they contain matching email addresses, or
*   they contain matching phone numbers, or
*   both cards do not contain any name, email address, or phone number that might match.

Yet cards with non-equivalent `AIMScreenName` are never considered matching, which is convenient for preventing cards from being repeatedly presented for manual treatment.

The matching relation is designed to be rather weak, such that it tends to yield more pairs of candidate duplicates.

_Matching_ of names, email addresses, and phone numbers is based upon equivalence of fields modulo abstraction, described below.
As a result, for example, names differing only in letter case are considered to match.
For the matching process, names are completed and their order is normalized —
for example, if two name parts are detected in the `DisplayName` (e.g., "John Doe") or in an email address (e.g., "John.Doe`@`company.com"), they are taken as first and last name.
Both multiple email addresses within a card and multiple phone numbers within a card are treated as sets, i.e., their order is ignored as well as their types.

*   Two cards are considered to have _matching names_ if
    *   their `DisplayName` is not empty and is equivalent, or
    *   both their `FirstName` and their `LastName` are not empty and are pairwise equivalent, or
    *   their `DisplayName` is empty but their `FirstName` and `LastName` are not empty and are pairwise equivalent, or
    *   in one card the `DisplayName` is empty and either the `FirstName` or `LastName` is not empty and is equivalent to the `DisplayName` of the other card, or
    *   their `AIMScreenName` is not empty and is equivalent.
*   Two cards are considered to contain _matching email address_ if any of their `PrimaryEmail` or `SecondEmail` are equivalent.
*   Two cards are considered to contain _matching phone numbers_ if any of their `CellularNumber`, `WorkPhone`, or `PagerNumber` are equivalent.
    The `HomePhone` and `FaxNumber` fields are not considered for matching because such numbers are often shared by a group of people.

## Abstraction of field values

Before card fields are compared their values are _abstracted_ using the following steps.

1.  _Pruning_, which removes stray contents irrelevant for comparison:
    1.  ignore values of certain field types — the set of ignored fields is configurable with the default being `UID, UUID, CardUID, groupDavKey, groupDavVersion, groupDavVersionPrev, RecordKey, DbRowID, PhotoType, PhotoName, LowercasePrimaryEmail, LowercaseSecondEmail, unprocessed:rev, unprocessed:x-ablabel`,
    2.  remove leading/trailing/multiple whitespace and strip non-digit characters from phone numbers,
    3.  strip any stray email address duplicates from names, which get inserted by some email clients as default names, and
    4.  replace `@googlemail.com` by `@gmail.com` in email addresses.
2.  _Transformation_, which re-arranges information for better comparison:
    1.  correct the order of first and last name (for instance, re-order "Doe, John"),
    2.  move middle initials such as "M" from last name to first name, and
    3.  move name prefixes such as "von" to the last name.
3.  _Normalization_, which equalizes representation variants:
    1.  convert to lowercase (except for name part of AOL email addresses),
    2.  convert texts by transcribing umlauts and ligatures, and
    3.  if configured, replace in phone numbers the [international call (IDD) prefix](https://en.wikipedia.org/wiki/List_of_international_call_prefixes) (such as '00') by '+' and
    the national [trunk prefix](https://en.wikipedia.org/wiki/Trunk_prefix) (such as '0') by the default [country calling code](https://en.wikipedia.org/wiki/List_of_country_calling_codes) (such as '+49').
4.  _Simplification_, which strips less relevant information from texts:
    1.  remove accents and punctuation, and
    2.  remove singleton digits and letters (such as initials).

Corresponding fields in two cards are considered _equivalent_ if their abstracted values are equal.
Note that the value adaptations mentioned above are computed only for the comparison, i.e., they do not change the actual card fields.

If automatic removal is chosen, only cards preferred for deletion (which implies equivalent or less information than some other card; for details see below) are removed.
When a pair of matching cards is presented for manual inspection, the card flagged by default with red color for removal is

*   the one preferred for deletion, or else (i.e., if the cards are not comparable):
*   the one used less frequently (i.e., having a smaller `PopularityIndex`, or else
*   the one modified/created earlier (i.e., having a smaller `LastModifiedDate`), or else
*   the one found in the second address book or the one found later in case the two address books are the same.

## Equivalence of information

A card is considered to have _equivalent or less information_ than another if for each non-ignored field:

*   the field is equivalent to the corresponding field of the other card, or else
*   it is a set and its value is a subset of the corresponding field value of the other card, or
*   it is the `FirstName`, `LastName`, or `DisplayName` and its value is a substring of the corresponding field value of the other card, or
*   it is the `PopularityIndex` or `LastModifiedDate` (which are ignored here), or
*   it has the default value, i.e., it is empty for text fields or its value is `0` for number fields or `false` for Boolean fields.

For the above field-wise comparison, the email addresses of a card are treated as a set, the phone numbers of a card are also treated as a set, and the set of names of mailing lists a card belongs to is taken as an additional field.

A card with equivalent or less information than another is _preferred for deletion_ if:

*   not all non-ignored fields are equivalent (which implies that it has less information), or else
*   the character weight of the card is smaller, i.e.,
    its pruned and transformed (non-ignored) field values have an equal or smaller total number of uppercase letters and special characters than the other card, or else the character weight is equal and
*   its `PopularityIndex` is smaller, or else
*   its `LastModifiedDate` is smaller.

Here is an example.

The card on the right will be preferred for deletion because it contains less information.

<table>

<tbody>

<tr>

<td><code>NickName</code></td>

<td>"Péte"</td>

<td>"  pete ! "</td>

<td>accent, punctuation, letter case, and whitespace ignored</td>

</tr>

<tr>

<td><code>FirstName</code></td>

<td>"Peter"</td>

<td>"Peter Y van"</td>

<td>name prefix "van" moved to last name, middle initial "Y" ignored</td>

</tr>

<tr>

<td><code>LastName</code></td>

<td>"van Müller"</td>

<td>"Mueller"</td>

<td>name prefix "van" moved to last name, umlauts transcribed</td>

</tr>

<tr>

<td><code>DisplayName</code></td>

<td>"Hans Peter van Müller"</td>

<td>"van Müller, Peter"</td>

<td>first name moved to the front, name is substring</td>

</tr>

<tr>

<td><code>PreferDisplayName</code></td>

<td>'yes'</td>

<td>'yes'</td>

<td>same truth value</td>

</tr>

<tr>

<td><code>AimScreenName</code></td>

<td>""</td>

<td>""</td>

<td>same AIM name</td>

</tr>

<tr>

<td><code>PreferMailFormat</code></td>

<td>'HTML'</td>

<td>'unknown'</td>

<td>default ('unknown') considered less information</td>

</tr>

<tr>

<td><code>PrimaryEmail</code></td>

<td>"Peter.vanMueller@company.com"</td>

<td>"P.van.Mueller@gmx.de"</td>

<td>emails treated as sets, letter case ignored</td>

</tr>

<tr>

<td><code>SecondaryEmail</code></td>

<td>"p.van.mueller@gmx.de"</td>

<td>""</td>

<td>emails treated as sets, letter case ignored</td>

</tr>

<tr>

<td><code>WorkPhone</code></td>

<td>"089/1234-5678"</td>

<td>"+49 89 12345678"</td>

<td>national prefix normalized and non-digits ignored</td>

</tr>

<tr>

<td><code>PopularityIndex</code></td>

<td>5</td>

<td>3</td>

<td>field ignored for information comparison</td>

</tr>

<tr>

<td><code>LastModifiedDate</code></td>

<td>2018-02-25 07:51:28</td>

<td>2018-02-25 08:30:37</td>

<td>field ignored for information comparison</td>

</tr>

<tr>

<td><code>UUID</code></td>

<td>""</td>

<td>"903a61be-64d5-4844-802a"</td>

<td>field ignored</td>

</tr>

</tbody>

</table>

## Configuration variables

The options/configuration/preferences used by this Thunderbird extension are are saved in configuration keys starting with `extensions.DuplicateContactsManager.` —
for instance, the list of ignored fields is stored in the variable `ignoreFields`.
