# Calm Joints

Digital clinic landing and intake for **Calm Joints**.

- **CHI** (Clairvoyant Holdings Inc.) owns the trade name.
- **Align** physiotherapists deliver care.
- **Scale** powers the hub.
- Contact: [info@calmjoints.ca](mailto:info@calmjoints.ca)
- Preview: https://calm-joints-hub.vercel.app
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

Both routes validate, rate-limit lightly, and persist a body of:

```json
{ "type": "newsletter|apply", "source": "calmjoints.ca", "payload": {}, "received_at": "ISO-8601" }
```

`payload.notify_email` is `info@calmjoints.ca`.

Environment variables (set on the Vercel project; do not commit values):

| Name | Required | Purpose |
| --- | --- | --- |
| `FRIDAY_INTAKE_URL` | For Friday CRM | Webhook that receives the JSON body |
| `FRIDAY_INTAKE_SECRET` | With the URL | Sent as `Authorization: Bearer` and `X-Friday-Secret` |
| `NEON_DATABASE_URL` or `DATABASE_URL` | Fallback | Neon/Postgres row in `calm_joints_intakes` when Friday is down or unset |
| `INTAKE_STORE_PATH` | Optional | Local JSONL path. Defaults to `data/intakes.jsonl` off Vercel, and `/tmp/calmjoints-intakes.jsonl` as a last resort |

If Friday is unavailable, the handler writes the local file and Neon (when a database URL is set) so the submission is not dropped. `/tmp` on Vercel is ephemeral — set Friday or Neon before treating production signups as durable.

Booking still uses the interim Jane calendar in `config.js` until Align sends a live embed URL.
