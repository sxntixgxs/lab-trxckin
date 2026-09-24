# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

- **Inside the product:** the finance back office of a group of companies. Reception, process leaders, accounting (causación), management, treasury, purchasing, compliance and sales each act on their own step of supplier invoices, employee advances, petty cash and supplier or customer onboarding, every working day.
- **Public demo:** hiring managers and engineers evaluating Santiago Sandoval. They arrive from his portfolio (www.sxntixgxs.dev) or the GitHub repository and want to see the system working.

## Product Purpose

Lab Trxckin replaces the mailboxes, spreadsheets and forwarded emails of a finance back office with explicit workflows. Every document has a current owner, an audit trail and an SLA counted in Colombian business days. For the demo, success means a visitor understands what the system does within one screen, gets an account, and can follow a real workflow from start to finish.

## Positioning

It is the public extraction of an internal tool that ran in production. Each workflow is a set of named phases with a current owner and an append-only history, so the system can always answer who acts next and how late a document is. Authorization is enforced on the server for every public function.

## Operating Context

- Four modules on one platform:
  - **Billing:** supplier e-invoices, from the Microsoft 365 reception mailboxes to payment.
  - **Finance:** employee advances and petty cash.
  - **Suppliers** and **Customers:** risk-based onboarding against an ERP catalog of third parties (*terceros*).
- **Multi-company:** users belong to one or more companies. The active company sets the data scope and the app's accent colour.
- **Access:**
  - Roles and route permissions live in Postgres.
  - Self sign-up creates a `member`, who sees only the Dashboard and Perfil.
  - An administrator turns modules on when someone asks through the access-request link (the owner's LinkedIn).
  - Demo accounts never get full access.
- **Public demo:** runs at app.sxntixgxs.dev. People sign in on WorkOS AuthKit's hosted page.

## Capabilities and Constraints

- Every company, NIT and email is fictional demo data. Label demonstrations as fictional wherever a visitor could mistake them for real.
- The app's interface is in Spanish. The public entry page (`/`) is in English for portfolio visitors.
- Naming: URLs and infrastructure in English, business terms in Spanish.
- The known gaps in the README's "Security notes and known limitations" stay documented, not hidden.

## Brand Commitments

- Name: Lab Trxckin. Wordmark: TRXCKIN in tracked capitals. Compact mark: the TX tile.
- Built by Santiago Sandoval (sxntixgxs), under the MIT license.
- On the public entry page, Santiago speaks in the first person: specific and technical.

## Evidence on Hand

- README.md.
- The module guides: docs/billing.md, finance.md, suppliers.md, customers.md and erp.md.
- The diagrams in docs/diagrams: swimlanes, architecture, module map.
- The fictional company icons in apps/frontend/public/images/empresas.
- This repository has no customers, testimonials or usage metrics. Do not invent them.

## Product Principles

- Show the mechanism, not adjectives: phases, owners, SLAs.
- Every claim can be traced to this repository.
- Fictional data is labeled as fictional.
- Access is explicit: nobody sees a module without an assigned permission.
