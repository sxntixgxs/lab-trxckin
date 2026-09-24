---
version: 1
slug: "apps-frontend-app-page-tsx"
primary_target: "apps/frontend/app/page.tsx"
related_targets: []
---

# Lab Trxckin entry page

Scope: `/` (`app/page.tsx`), the signed-out front door of the public demo at app.sxntixgxs.dev. Mode: Persuade. It extends the app's existing navy sidebar world; DESIGN.md does not change.

Audience and job: hiring managers and engineers arriving from www.sxntixgxs.dev or GitHub, plus returning demo users. Within one screen they should understand that this is a working multi-company finance operations system, then choose Sign in, Create account or Request access (the owner's LinkedIn, from `NEXT_PUBLIC_ACCESS_REQUEST_URL`). A returning user signs in with one click and lands back on the module named in `?next=`.

Proof:
- One fictional supplier invoice in the Billing workflow: its eight phases with the app's own labels, its current owner, its business-day SLA and its append-only history. It is labeled as fictional.
- One real fragment each from Finance (the advance chain), Suppliers (risk decides the review tier, with two parallel lanes) and Customers (payment terms and tiered approval).
- Facts come from docs/billing.md, finance.md, suppliers.md and customers.md.

Copy:
- English. Santiago speaks in the first person in the access note.
- Access note: "New accounts start with the dashboard and your profile. Message me on LinkedIn with the email you signed up with and I'll turn on the modules you want to try."
- Notes: "The app itself is in Spanish." and "Every company, NIT and email here is fictional."
- Privacy line: "Your name and email are only used to run this demo and set up your access."
- Footer: Built by Santiago Sandoval, and Code on GitHub (MIT).

Constraints:
- Dark navy whatever the visitor's theme; `lang="en"` on the page root.
- Plain links to `/sign-in` and `/sign-up`; no inputs.
- No invented metrics, customers or claims.
- The WorkOS hosted form and the Spanish app are not touched.

Memorable moment: the "now" light travels along the invoice's phase line and stops at its current owner, and the SLA meter settles on its business day.

## Direction contract

THESIS: The front door is the platform's own board. One fictional invoice moving through Billing's eight phases proves the mechanism: who holds it, since when, and what comes next. Three sibling panels prove the breadth. It refuses the centered sign-in card and the SaaS marketing hero.

OWN-WORLD: The sidebar's world, unchanged. Navy gradient #0B1020 → #0E1426 with indigo glows at rgb(99 102 241). Tonal panels at white 4% with 1px white 8% borders and 16px radius. Indigo-300 icons, slate text, and the TRXCKIN wordmark in tracked capitals. Ubuntu for prose; Ubuntu Mono only for identifiers, amounts and business days.

STORY: The visitor reads one sentence and sees an invoice sitting with Contabilidad on day 2 of a 3-business-day SLA, after three logged steps. They scan the advance, onboarding and payment-terms fragments, then sign in, create an account or request access. The notes say how access works and that every record is fictional.

FIRST VIEWPORT (1440×900):
- **Top band.** TX tile and wordmark at left, above a two-line H1 of about 44px with a 2-line lead. At right: Sign in (filled indigo), Create account (tonal), Request access (host shown), then the access and privacy lines.
- **Middle.** A full-width Billing panel. Its eight-station phase line spans the panel, never wraps and lights Contabilidad. Under it sit the current-owner block with a segmented SLA meter and the history list.
- **Bottom.** Finance, Suppliers and Customers in unequal columns (5/4/3).

FORM: Module board, position 6 on the ordered list of 7, dealt as the lead; seed key a55a4fdb. Raised from the step-row challenger: the phase line never wraps, it scales, and one light marks where now is.

FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance
