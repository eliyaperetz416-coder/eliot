---
name: israeli-legal-compliance
description: Use when building or reviewing a website, landing page, app or marketing system for an Israeli business (or any business, with local-law adaptation). Checks privacy policy, accessibility (IS 5568 / WCAG 2.0 AA + accessibility statement), anti-spam rules for email/SMS marketing, consent checkboxes, cancellation of subscriptions, copyright of images/fonts, fake reviews and unsupported claims, terms/returns/shipping pages. Not legal advice. Triggers - "legal", "lawsuit", "privacy policy", "accessibility", "GDPR", תביעה, חוק, נגישות, מדיניות פרטיות, ספאם, "שלא יתבעו אותי".
---

# Legal compliance for AI-built sites (Israel-focused)

Distilled from ~10 Hebrew/English videos. **This is not legal advice.** Flag risks and recommend a lawyer for anything material.

Why it matters: the examples in the videos show ₪400K–500K of exposure on a site with **₪0 in sales**, because most fines are counted **per item** (per email, per image).

## The risk table

| Issue | Exposure (as cited) | Fix |
|---|---|---|
| Customer list / personal data leaks (unsecured DB) | Privacy Protection Authority fines, hundreds of thousands of ₪ | Lock the DB (see `security-hardening`), collect only necessary data |
| Site not accessible | Up to ~₪50,000 **without proof of damage** | IS 5568 / WCAG 2.0 AA, accessibility statement page |
| Marketing email/SMS without consent, without "פרסומת" in the subject, without an unsubscribe link | Up to ₪1,000 **per message** | Explicit opt-in, mark as advertisement, unsubscribe link, don't send to non-consenters |
| Subscription that can't easily be cancelled | Up to ~₪10,000 | A clear cancel button / process |
| Images taken from Google | Up to ~₪100,000 **per image** | Only licensed/own images and fonts |
| Fake reviews / invented testimonials | Consumer-protection violation | Remove; only real reviews |

## Checklist: add, check, or flag

**Pages**
- Privacy policy that matches **what the site actually collects** (what, why, who it's shared with, retention, user rights). **Claude-generated policies often state things that aren't true about the business**: verify every claim with the owner and against the code (what's really collected, which third parties really receive data).
- Accessibility statement (official page: standard level, adjustments made, contact for accessibility issues).
- Terms of use; returns/refund policy and shipping & delivery policy (e-commerce only).
- Real business details (name, registration number, address, contact).
- Custom 404 page.

**Consent and data**
- Consent checkbox on forms: **unticked by default**, with a link to the privacy policy ("אני מאשר/ת קבלת דיוור…", I agree to receive mailings…).
- Check analytics/tracking scripts: what they collect must appear in the privacy policy. (A cookie-consent banner isn't an explicit requirement in Israel the way it is in the EU. Add one only if you have EU visitors.)
- Collect **only necessary data**.
- **Account deletion button** for users.

**Accessibility (practical)**
- Alt text on images, clear button labels, keyboard-friendly forms, colour contrast ≥ 4.5:1, focus states, an accessibility menu/widget **in addition to** (not instead of) real fixes.

**Content**
- Remove fake reviews, invented statistics and unsupported claims (Claude tends to invent reviews on landing pages, even while claiming it doesn't).
- Check licences of fonts and icons, not only images.
- Check third-party embeds (what data they send).

**Marketing systems** (when building email/SMS senders)
- Only send to opted-in contacts; store consent with a timestamp and source.
- The "פרסומת" label + an unsubscribe link in every commercial message.
- Honour unsubscribes immediately.

## How to run it

Prompt pattern (from the videos):
> "עבור על כל האתר ובדוק אותו מול החוק בישראל" (go over the whole site and check it against Israeli law): privacy, accessibility (IS 5568), the anti-spam law, consumer protection, copyright. Bring a table of what you found and what you fixed, and flag anything that needs a lawyer.

English variant:
> "I do not want my site to get sued. Add privacy and terms pages (and a refund policy if you sell); add form consent; collect only necessary data; check analytics and third-party embeds; make the site accessible (alt text, contrast, keyboard forms, clear labels); remove fake reviews and unsupported claims; add business details; check image copyright; check applicable local laws and flag any other risks."

Pair it with `security-hardening` (a data leak is also a legal issue) and `launch-readiness`.
