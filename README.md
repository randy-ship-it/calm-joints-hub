# Calm Joints

Digital clinic landing and intake for **Calm Joints**.

- **CHI** (Clairvoyant Holdings Inc.) owns the trade name.
- **Align** physiotherapists deliver care.
- **Scale** powers the hub.
- Contact: [info@calmjoints.ca](mailto:info@calmjoints.ca)
- Production: https://calm-joints-hub.vercel.app
- This deployment: https://calm-joints-kk4d9irzr-sbg-516724e0.vercel.app
- Domain `calmjoints.ca` is not purchased yet.

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

Each submission gets one stable `externalId` (`cj-news-<uuid>` or `cj-physio-<uuid>`) and sends `site: "calmjoints.ca"`.

Newsletter: `{ externalId, email, site, source: "calmjoints_newsletter", path: "/newsletter", kind: "form", tags: ["calmjoints","newsletter"], meta?: { name } }`.

Physio: `{ externalId, email, firstName, lastName, site, source: "calmjoints_physio_apply", path: "/apply", kind: "providers", country: "CA", province, website, message, meta: { linkedin, license?, phone?, provinces?, years_experience?, availability? }, tags: ["calmjoints","physio-apply"] }`. `website` is the LinkedIn URL. `message` is the short bio. `province` is the first selected code.

This site does not call `/api/webhooks/calmjoints/*`.

If Friday is unconfigured or returns non-2xx, the handler still writes a local JSONL row and, when a database URL is set, a Neon row, then returns the same friendly success. The stored envelope is `{ "type", "source": "calmjoints.ca", "payload": <Friday body>, "received_at", "notify_email": "info@calmjoints.ca" }`. `/tmp` on Vercel is ephemeral — Neon (`NEON_DATABASE_URL`, `DATABASE_URL`, or `POSTGRES_URL`, table `calm_joints_intakes`) is the durable copy when Friday is down. `INTAKE_STORE_PATH` overrides the JSONL file (default `data/intakes.jsonl` off Vercel).

Booking still uses the interim Jane calendar in `config.js` until Align sends a live embed URL.
