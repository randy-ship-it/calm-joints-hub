# Calm Joints hub — STATUS

**Date:** 2026-09-29 ~2:15 AM ET (America/Toronto)
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
| This deployment | https://calm-joints-omvvxgyq3-sbg-516724e0.vercel.app |
| Inspect | https://vercel.com/sbg-516724e0/calm-joints-hub/CfVCX9GR1JLGBSZw86ntJv2hehgG |
| GitHub | https://github.com/randy-ship-it/calm-joints-hub |
| Pull request | https://github.com/randy-ship-it/calm-joints-hub/pull/2 |
| Branch | `cursor/calmjoints-clinic-polish-9ceb` |

Both forms post to Friday `POST https://fridayapp.org/api/intake` with `site: calmjoints.ca`. Auth: `Authorization: Bearer` + `X-Intake-Secret` from `INTAKE_WEBHOOK_SECRET` (fallback `FRIDAY_API_KEY`). The `/api/webhooks/calmjoints/*` paths are not used. A non-2xx still queues locally (Neon when configured). Contact display remains `info@calmjoints.ca`.

Public index is on. Canonical / Open Graph / Twitter still point at the Vercel preview until `calmjoints.ca` exists.

Interim Jane booking CTA is still in place (`config.js` → `booking.status = interim-jane`).

Deploy path is GitHub → Vercel only. No Replit publish. `scalehealthnew` / Scale Connect Hub were **not** touched.

---

## Visual polish (this pass)

- Hero promise is calmer joints and Canada-wide Align physiotherapy, with primary paths to the clinic notes and the physio hello. Booking stays one honest Jane button — no sample time chips
- CJ monogram stays in the header, favicon, apple-touch icon, and Open Graph image
- Hub carousel (Jill Health, Effortless, DR-HO’S, Sole, Roll Recovery): 960×600 crops, snap scrolling, arrow keys, dots, and previous/next that announce the leading hub
- Forms keep success, error, and pending states, with a specific message for an empty email, a short bio, LinkedIn, or a missing province
- Mobile menu for the section links, plus a sticky bar for notes and booking

**Intake contract unchanged** (`lib/intake.js`, `api/*`, Friday payload shape).

---

## Friday env (set on the Vercel project — value not in git)

| Variable | Role |
| --- | --- |
| `INTAKE_WEBHOOK_SECRET` | Preferred. Bearer + X-Intake-Secret on `POST https://fridayapp.org/api/intake`. |
| `FRIDAY_API_KEY` | Same door secret under the older name. Used only if `INTAKE_WEBHOOK_SECRET` is unset. |

Site routes stay `POST /api/newsletter` and `POST /api/apply`.

---

## Domain (do not buy here)

`calmjoints.ca` still needs purchase. After: attach on Vercel, flip canonical/OG/sitemap to `https://calmjoints.ca/`, swap Jane when Jon sends Align embed.

---

## Not in this change

- No domain purchase / OBR / Stripe card digits
- No edits to Scale Connect Hub / scalehealthnew
