# Calm Joints

Digital clinic landing and intake for **Calm Joints**.

- **CHI** (Clairvoyant Holdings Inc.) owns the trade name.
- Care by registered physiotherapists (internal: Align). Public site shows no Align or Scale branding.
- Hub carousel: DR-HO’S, Jill Health, Jack Health, Roll Recovery, Sole.
- Contact: [info@calmjoints.org](mailto:info@calmjoints.org)
- Production: https://calmjoints.org
- This deployment: https://calm-joints-kk4d9irzr-sbg-516724e0.vercel.app
- Domain **calmjoints.org** purchased via Replit Domains ($8.49). DNS: A `@` → `76.76.21.21`, www CNAME → `cname.vercel-dns.com`. Attached on Vercel project `calm-joints-hub` (team `sbg-516724e0`).

GitHub → Vercel project `calm-joints-hub` on team `sbg-516724e0`. No Replit publish.

## Local

```bash
npm install
npm test
npm run dev
```

Dev server: http://127.0.0.1:4173 — static site plus `POST /api/newsletter` and `POST /api/apply`.

## Intake

`POST /api/newsletter` and `POST /api/apply` validate, rate-limit lightly, then POST both forms to one Friday intake:

`https://fridayapp.org/api/intake`

Headers: `Authorization: Bearer $INTAKE_WEBHOOK_SECRET` and `X-Intake-Secret`. The handler reads `INTAKE_WEBHOOK_SECRET`, and falls back to `FRIDAY_API_KEY` when that name is the one already set. Both are the existing Scale/Birch door secret (the same value as `INTAKE_WEBHOOK_SECRET` on the `friday-crm` project and `FRIDAY_API_KEY` on `scalehealth`). Do not invent a second secret, and do not commit the value.

Each submission gets one stable `externalId` (`cj-news-<uuid>` or `cj-physio-<uuid>`) and sends `site: "calmjoints.org"`.

Newsletter: `{ externalId, email, site, source: "calmjoints_newsletter", path: "/newsletter", kind: "form", contact_type: "patient", tags: ["calmjoints","newsletter","type:patient"], meta?: { name } }`. A stored partner visit (the same `cj_ref` the booking ledger uses, within 30 days) is sent as top-level `partner` and `qr_code` on newsletter, question, and intake, and also as tags `partner:{slug}` and `qr:{code}`.

Physio: `{ externalId, email, firstName, lastName, site, source: "calmjoints_physio_apply", path: "/apply", kind: "providers", country: "CA", province, website, message, meta: { linkedin, license?, phone?, provinces?, years_experience?, availability? }, tags: ["calmjoints","physio-apply","type:provider"] }`. `website` is the LinkedIn URL. `message` is the short bio. `province` is the first selected code. Careers applications use `type:provider` as well.

Field ambassador applications use that same `POST /api/apply` door (same Friday post, same alert email). The body is tagged `role=ambassador` and `type:ambassador`, `source` is `calmjoints_ambassador_apply`, `kind` is `form` (not mirrored into the physio lane), and the email subject starts with `Ambassador application`.

`/drive` is an unlisted kit page (noindex, not in the sitemap, not in the nav). The three kits are In-car, In-car + outside decals, and Door-drop (250 double-sided 3.5×8.5 in door hangers). Each order auto-assigns a unique handle and QR. Car kits use `calmjoints.org/<handle>?src=decal`. Door-drop uses `calmjoints.org/<handle>?src=hanger`. `CJ_DRIVE_MODE=manual` opens a public order form that records the order as `awaiting payment`, reserves that handle, and emails the buyer and `CJ_ALERT_EMAILS`. That form has no card fields and no handle field. Optional `STRIPE_PAYMENT_LINK_INCAR`, `STRIPE_PAYMENT_LINK_FULL`, and `STRIPE_PAYMENT_LINK_HANGER` (`https://buy.stripe.com/...`) redirect the buyer to a Stripe Payment Link after submit. `/admin/decals` can mark the order paid, which creates the partner, artwork, and Friday record. Card Checkout stays closed unless `CJ_DRIVE_LIVE` is exactly `true`. The charged price is computed from `config/drive-kits.js` (`print_cost` and `ship_cost` per kit) as `(print + ship + Stripe fee + HST handling) × 1.10`, rounded up to the next `$X.99`. Door-drop uses placeholder costs of print 60 and ship 15 until a real quote lands. HST handling is an internal allowance, not Stripe Tax. A paid Checkout webhook creates the partner (`drv-<handle>` plus alias `/<handle>`), print PDFs, and a printer submission. Cimpress Open is used when `CIMPRESS_CLIENT_ID`, `CIMPRESS_SECRET`, `CIMPRESS_PARTNER_ID`, and `CIMPRESS_VARIANT_ID` are set. Otherwise Printful is used when `PRINTFUL_API_TOKEN` and a variant id for every piece on that order (`PRINTFUL_VARIANT_HEADREST`, `PRINTFUL_VARIANT_POCKET`, `PRINTFUL_VARIANT_SIDE`, `PRINTFUL_VARIANT_REAR`, and `PRINTFUL_VARIANT_HANGER` for door hangers) are set. Sticker Mule’s public API only reorders saved items, so it is never selected. If neither print API is configured, the order waits in `/admin/decals` (Vistaprint has no ordering API). Ambassadors earn 20% of net revenue. Other drive partner types are configured at 10% and flagged `PENDING RANDY DECISION`. Commission is paid monthly once $500 is owed. The partner dashboard is `/me/<handle>`.

Ambassador partner records (a person with a QR or pen link, not a venue signup) are created only by an admin:

`POST /api/admin-partner` with `Authorization: Bearer $CJ_ADMIN_KEY` and JSON `{ "slug", "name", "email", "alias?", "notify?" }`. `slug` is stored exactly (lowercased), for example `amb-randyg-cj`. The record is `contact_type: "ambassador"` with a 20% share of net revenue. Friday gets `partner:<slug>`, `type:ambassador`, and `contact_type: "ambassador"`. Nothing is emailed unless `notify` is true, and then only the ambassador is emailed. An optional `alias` such as `randy` publishes `https://calmjoints.org/randy`, which redirects to `https://calmjoints.org/p/<slug>?src=pen`. Scans of `/p/<slug>?src=qr` and pen visits (`src=pen`) are stored on that partner and counted on `/sales`.

Every Friday record from these forms sends a top-level `contact_type` (`patient` for newsletter, question, and intake, `business` for the partner form, `provider` for physio and careers, `ambassador` for field ambassador) plus the matching `type:` tag. Physio applications send `role: "physiotherapist"`. Careers send `role` as the chosen role. Ambassadors send `role: "ambassador"` and `source: "calmjoints_ambassador_apply"`. Intake sends top-level `org_type` when one was picked. Sales send top-level `sale_type`. Tag lists stay under 12.

This site does not call `/api/webhooks/calmjoints/*`.

If Friday is unconfigured or returns non-2xx, the handler still writes a local JSONL row and, when a database URL is set, a Neon row, then returns the same friendly success. The stored envelope is `{ "type", "source": "calmjoints.org", "payload": <Friday body>, "received_at", "notify_email": "info@calmjoints.org" }`. `/tmp` on Vercel is ephemeral — Neon (`NEON_DATABASE_URL`, `DATABASE_URL`, or `POSTGRES_URL`, table `calm_joints_intakes`) is the durable copy when Friday is down. `INTAKE_STORE_PATH` overrides the JSONL file (default `data/intakes.jsonl` off Vercel).

Booking links read `config.js` → `booking.primaryUrl` and open the CHI Calm Joints location on Jane.

## Cookies, analytics and Calming Newsletters

- `js/consent.js` shows the cookie banner (Accept / Reject / Manage) on public pages and stores the choice in the first-party `cj_consent` cookie for 180 days. Nothing optional loads before a yes. Footer "Cookie settings" links reopen it.
- Analytics yes loads Vercel Web Analytics and Speed Insights (cookieless; turn both on in the Vercel project's Analytics / Speed Insights tabs). GA4 and Meta pixel hooks are wired but empty: set `ga4Id` / `metaPixelId` at the top of `js/consent.js` (or `window.CALM_JOINTS.analytics` in `config.js`) once real IDs exist.
- `js/calming.js` renders the Calming Newsletters popup, the mid-page band and the footer signup. Popup: once per visitor, about 15s after load, never after a signup, never while the cookie banner or any dialog (partner, hub) is open. Close, “No thanks”, or Escape dismisses it.
- Signups use the existing `POST /api/newsletter` → Friday (`fridayapp.org/api/intake`) with `source`/tag `cj-calming-newsletter`, a placement tag, and the CASL express-consent record stored in `meta.consent` (`consent: true` is required server side; pressing the button is the opt-in). The popup says “Be first to know.”, “Follow our challenges and get first look at new products and insider deals from our brand partners.”, and “Count me in”. Inline and footer forms still show email, Subscribe, and “Unsubscribe anytime.” Sender ID + unsubscribe link belong in every outbound email (`meta.consent.sender`), not on the site.
- QA: add `?cjqa=1` to a page URL and signups from that tab are tagged `test` in Friday (externalId `cj-news-test-…`) and skip the team Slack/email alert.
