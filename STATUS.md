# Calm Joints hub — STATUS

**Date:** 2026-09-29 ~1:55 AM ET (America/Toronto)
**Product:** Calm Joints digital clinic landing + intake
**Trade name:** CHI (Clairvoyant Holdings Inc.)
**Care:** Align physiotherapists
**Hub rails:** Scale
**Contact:** info@calmjoints.ca
**Domain:** `calmjoints.ca` — **still not purchased**. Do not buy from this repo.

---

## What’s live

| Surface | URL |
| --- | --- |
| **Production** | **https://calm-joints-hub.vercel.app** |
| This deployment | https://calm-joints-mu0re0k63-sbg-516724e0.vercel.app |
| Inspect | https://vercel.com/sbg-516724e0/calm-joints-hub/4Z1wwSdxDTD2yBQTuAw9H9AHWcV4 |
| Vercel project | `calm-joints-hub` (`prj_Y2OAVqC0nJ2jZXcuNMwMRNAC0vY6`) |
| Team | `sbg-516724e0` (`team_lOeMvVi5qA620Xr4vVA0C59W`) |
| GitHub | https://github.com/randy-ship-it/calm-joints-hub |
| Pull request | https://github.com/randy-ship-it/calm-joints-hub/pull/1 |

Both forms post to Friday `POST https://fridayapp.org/api/intake` with `site: calmjoints.ca`. The earlier `/api/webhooks/calmjoints/*` paths are not used. Friday marked this intake READY, so submissions go live there. A non-2xx still queues locally (and Neon when configured) and the visitor still sees the friendly success. Neon is not set, so that queue is ephemeral `/tmp` on Vercel.

Public index is on (`noindex` removed). Canonical and Open Graph still point at the Vercel preview until `calmjoints.ca` exists. Flip those to `https://calmjoints.ca/` when DNS is attached.

Interim Jane booking CTA is still in place (`config.js` → `booking.status = interim-jane`):

`https://scalehealth.janeapp.com/locations/scale-health-x-dr-ho/book#/staff_member/91/treatment/346`

Deploy path is GitHub → Vercel only. No Replit publish. `scalehealthnew` / Scale Connect Hub were not touched.

---

## Friday env (set on the Vercel project — value not in git)

| Variable | Role |
| --- | --- |
| `INTAKE_WEBHOOK_SECRET` | Preferred. `Authorization: Bearer` and `X-Intake-Secret` on `POST https://fridayapp.org/api/intake`. |
| `FRIDAY_API_KEY` | Same door secret under the older name. Used only if `INTAKE_WEBHOOK_SECRET` is unset. Sensitive. Production, Preview, and Development. |

This is the existing Scale/Birch door key: the same secret already stored as `INTAKE_WEBHOOK_SECRET` on Vercel project `friday-crm`, and as `FRIDAY_API_KEY` on `scalehealth`. No new secret was created. The value is not in this repo.

Primary path (do not switch to the webhook aliases):

`POST https://fridayapp.org/api/intake`

Newsletter JSON: `{ "externalId": "cj-news-<uuid>", "email", "site": "calmjoints.ca", "source": "calmjoints_newsletter", "path": "/newsletter", "kind": "form", "tags": ["calmjoints","newsletter"], "meta"?: { "name"? } }`.

Physio JSON: `{ "externalId": "cj-physio-<uuid>", "email", "firstName", "lastName", "site": "calmjoints.ca", "source": "calmjoints_physio_apply", "path": "/apply", "kind": "providers", "country": "CA", "province", "website", "message", "meta": { "linkedin", "license"? }, "tags": ["calmjoints","physio-apply"] }`. `website` is the LinkedIn URL. `message` is the short bio. `province` is the first selected code. Phone, the full province list, years, and availability are added inside `meta` only when the form has them. One `externalId` per submission, reused if that same payload is queued locally.

Site routes stay `POST /api/newsletter` and `POST /api/apply`. Contact display remains `info@calmjoints.ca`.

If Friday is missing the key or returns non-2xx, the handler still appends a local JSONL row (`data/intakes.jsonl` in dev, `/tmp/calmjoints-intakes.jsonl` on Vercel) and inserts into Neon when `NEON_DATABASE_URL`, `DATABASE_URL`, or `POSTGRES_URL` is set (table `calm_joints_intakes`). The visitor still sees the friendly success when that local or Neon queue succeeds. `/tmp` on Vercel is ephemeral. Neon is **not** set on this project yet.

Optional: `INTAKE_STORE_PATH` to override the JSONL file.

---

## Domain (do not buy here)

`calmjoints.ca` still needs to be purchased (Porkbun / domain owner — not this change). After purchase:

1. Vercel project `calm-joints-hub` → Domains → add `calmjoints.ca` and `www.calmjoints.ca`.
2. At the registrar, add the records Vercel shows (typically apex A `76.76.21.21` and www CNAME `cname.vercel-dns.com` — confirm in the Vercel UI).
3. Point canonical / `og:url` / sitemap at `https://calmjoints.ca/`.
4. Swap the interim Jane URL when Jon sends the Align embed.

---

## This ship

- White + `#15A34A` clinic page, CJ monogram SVG, Fraunces + DM Sans
- Hub carousel: Jill Health, Effortless Admin, DR-HO’S, Sole, Roll Recovery (cropped 8:5 portal/booking shots)
- Newsletter + physio apply forms posting to `/api/newsletter` and `/api/apply`
- `noindex` removed; Jane CTA kept
- Sole and Roll Recovery currently share Scale’s “early access” portal screen; both are labeled
