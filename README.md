# Calm Joints

Digital clinic landing and intake for **Calm Joints**.

- **CHI** (Clairvoyant Holdings Inc.) owns the trade name.
- **Align** physiotherapists deliver care.
- **Scale** powers the hub.
- Contact: [info@calmjoints.ca](mailto:info@calmjoints.ca)
- Production: https://calm-joints-hub.vercel.app
- This deployment: https://calm-joints-mu0re0k63-sbg-516724e0.vercel.app
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

`POST /api/newsletter` and `POST /api/apply` validate, rate-limit lightly, then POST to Friday:

| Flow | URL |
| --- | --- |
| Newsletter | `https://fridayapp.org/api/webhooks/calmjoints/newsletter` |
| Physio apply | `https://fridayapp.org/api/webhooks/calmjoints/physio-apply` |

Header: `Authorization: Bearer $FRIDAY_API_KEY`.

Newsletter body: `{ "email", "source": "calmjoints_newsletter", "host": "calmjoints.ca", "meta"?: { "name"? } }`.

Physio body: `{ "name", "email", "linkedin", "profile", "province"?, "provinces"?, "license"?, "phone"?, "source": "calmjoints_physio_apply", "host": "calmjoints.ca", "meta"?: {} }`. Years and availability notes, when present, go in `meta` only.

`FRIDAY_API_KEY` is the existing Scale/Birch Friday door key (the same value as `INTAKE_WEBHOOK_SECRET` on the `friday-crm` Vercel project, and as `FRIDAY_API_KEY` on `scalehealth`). It is set on `calm-joints-hub` as a sensitive env var for Production, Preview, and Development. Do not invent a second secret, and do not commit the value.

If Friday is unconfigured or returns non-2xx, the handler still writes a local JSONL row and, when a database URL is set, a Neon row, then returns the same friendly success. The stored envelope is `{ "type", "source": "calmjoints.ca", "payload": <Friday body>, "received_at", "notify_email": "info@calmjoints.ca" }`. `/tmp` on Vercel is ephemeral — Neon (`NEON_DATABASE_URL`, `DATABASE_URL`, or `POSTGRES_URL`, table `calm_joints_intakes`) is the durable copy when Friday is down. `INTAKE_STORE_PATH` overrides the JSONL file (default `data/intakes.jsonl` off Vercel).

Booking still uses the interim Jane calendar in `config.js` until Align sends a live embed URL.
