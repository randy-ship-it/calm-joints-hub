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

Newsletter: `{ externalId, email, site, source: "calmjoints_newsletter", path: "/newsletter", kind: "form", tags: ["calmjoints","newsletter"], meta?: { name } }`.

Physio: `{ externalId, email, firstName, lastName, site, source: "calmjoints_physio_apply", path: "/apply", kind: "providers", country: "CA", province, website, message, meta: { linkedin, license?, phone?, provinces?, years_experience?, availability? }, tags: ["calmjoints","physio-apply"] }`. `website` is the LinkedIn URL. `message` is the short bio. `province` is the first selected code.

This site does not call `/api/webhooks/calmjoints/*`.

If Friday is unconfigured or returns non-2xx, the handler still writes a local JSONL row and, when a database URL is set, a Neon row, then returns the same friendly success. The stored envelope is `{ "type", "source": "calmjoints.org", "payload": <Friday body>, "received_at", "notify_email": "info@calmjoints.org" }`. `/tmp` on Vercel is ephemeral — Neon (`NEON_DATABASE_URL`, `DATABASE_URL`, or `POSTGRES_URL`, table `calm_joints_intakes`) is the durable copy when Friday is down. `INTAKE_STORE_PATH` overrides the JSONL file (default `data/intakes.jsonl` off Vercel).

Booking links read `config.js` → `booking.primaryUrl` and open the CHI Calm Joints location on Jane.

## Cookies, analytics and Calming Newsletters

- `js/consent.js` shows the cookie banner (Accept / Reject / Manage) on public pages and stores the choice in the first-party `cj_consent` cookie for 180 days. Nothing optional loads before a yes. Footer "Cookie settings" links reopen it.
- Analytics yes loads Vercel Web Analytics and Speed Insights (cookieless; turn both on in the Vercel project's Analytics / Speed Insights tabs). GA4 and Meta pixel hooks are wired but empty: set `ga4Id` / `metaPixelId` at the top of `js/consent.js` (or `window.CALM_JOINTS.analytics` in `config.js`) once real IDs exist.
- `js/calming.js` renders the Calming Newsletters popup, the mid-page band and the footer signup. Popup: exit intent on desktop, ~45s or 50% scroll on mobile, at most once per 14 days, never after a signup, never while the cookie banner or any dialog (partner, hub) is open.
- Signups use the existing `POST /api/newsletter` → Friday (`fridayapp.org/api/intake`) with `source`/tag `cj-calming-newsletter`, a placement tag, and the CASL express-consent text stored in `meta.consent`. The checkbox is required server side.
- QA: add `?cjqa=1` to a page URL and signups from that tab are tagged `test` in Friday (externalId `cj-news-test-…`) and skip the team Slack/email alert.
