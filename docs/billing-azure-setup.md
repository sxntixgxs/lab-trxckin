# Billing Azure + Convex env

Outlook ingest uses **app-only** Microsoft Graph (`Mail.Read`). Create one Entra ID app per tenant that receives invoices.

## Azure app registration (repeat per tenant)

1. Entra ID → **App registrations** → **New registration**.
2. Name it e.g. `lab-trxckin-billing-primary`. Accounts in this organizational directory only.
3. **API permissions** → Microsoft Graph → **Application** → `Mail.Read` → **Grant admin consent**.
4. **Certificates & secrets** → New client secret. Copy the value once.
5. Note **Application (client) ID** and **Directory (tenant) ID**.
6. Optional: Exchange **application access policy** so the app can only read the reception mailbox stored in Convex `facturacionConfiguracion` key `cuenta_recepcion`.

### Tenants / env prefixes

| Empresa | Graph env prefix |
| --- | --- |
| Companies 1, 3, 4 (default tenant) | `MS_*` |
| Company 2 (secondary tenant) | `MS_SECONDARY_*` |

## Convex env (dev)

Set on the Convex **dev** deployment (`npx convex env set`, never `npx convex deploy` for this):

```bash
npx convex env set MS_TENANT_ID "<tenant-id>"
npx convex env set MS_CLIENT_ID "<client-id>"
npx convex env set MS_CLIENT_SECRET "<secret>"
npx convex env set MS_SECONDARY_TENANT_ID "<tenant-id>"
npx convex env set MS_SECONDARY_CLIENT_ID "<client-id>"
npx convex env set MS_SECONDARY_CLIENT_SECRET "<secret>"
npx convex env set ENABLE_BACKGROUND_JOBS true # crons only do work when "true"
npx convex env set NEST_INTERNAL_KEY "<same as Nest NEST_INTERNAL_KEY>"
npx convex env set BACKEND_URL "http://localhost:8000"
npx convex env set FRONTEND_URL "http://localhost:3000"
npx convex env set DEFAULT_CONTACT_EMAIL "no-email@example.com"
npx convex env set FACTURACION_GRAPH_MAILBOXES "ops@example.com,admin@example.com" # sync-alert recipients
npx convex env set NOTIFICATIONS_INTERNAL_KEY "<same as Next>"
npx convex env set FACTURACION_SLA_DIGEST_SECRET "<hmac shared with Next>"
npx convex env set CONVEX_SERVER_SECRET "<same as Next>"
```

Generate secrets with `openssl rand -hex 32`. The full list lives in `apps/frontend/convex/.env.convex.example`.

`FRONTEND_URL` and `BACKEND_URL` must be reachable from Convex's cloud; with a cloud dev deployment use a tunnel instead of `localhost` to test alerts and supplier upserts.

Next.js (`apps/frontend/.env.local`) also needs:

- `RESEND_API_KEY`, `RESEND_FROM_EMAIL` (sender), `NEXT_PUBLIC_APP_URL`
- `NOTIFICATIONS_INTERNAL_KEY` (must match Convex)
- `FACTURACION_SLA_DIGEST_SECRET` (must match Convex; signs sync alerts and the SLA digest)
- `CONVEX_SERVER_SECRET` (must match Convex)

Nest (`apps/backend/.env`) needs `NEST_INTERNAL_KEY` matching Convex.

## Mailbox

In `/billing/settings`, set `cuenta_recepcion` to the Outlook mailbox that receives DIAN AttachedDocument emails.

## Manual verify (no Azure yet)

Upload a real DIAN AttachedDocument XML on `/billing/upload`. Confirm a `facturacionFacturas` row and PDF/XML URLs.

After Azure secrets exist, run `sincronizarBandeja` once from `/billing/emails`.

## Graph 403 `ErrorAccessDenied`

Auth succeeded (secret is valid) but Graph refused the mailbox. Almost always one of:

1. **Delegated `Mail.Read` instead of Application.** The sync uses client credentials. Delegated permissions never appear on that token.
2. **Admin consent not granted.** API permissions must show a green check for the tenant, not “Not granted for …”.
3. **Application Access Policy** in Exchange that does not include `cuenta_recepcion`.

Fix:

1. Entra ID → **App registrations** → the app whose Client ID is `MS_CLIENT_ID`.
2. **API permissions** → **Add a permission** → **Microsoft Graph** → **Application permissions** (not Delegated) → `Mail.Read`.
3. **Grant admin consent for [tenant]**.
4. Wait ~2 minutes, then run `npx convex run facturacionGraph:diagnosticarConexionGraph` (dev). `roles` must include `Mail.Read`.
5. If `roles` already has `Mail.Read` and the inbox probe is still 403, in Exchange Online PowerShell:

```powershell
Get-ApplicationAccessPolicy
```

Remove the policy or add the reception mailbox (e.g. `facturas@example.com`) to the allowed group.
