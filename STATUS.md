# Calm Joints hub — STATUS

**Date:** 2026-09-28 ~11:25 PM ET (America/Toronto)
**Product:** Calm Joints digital clinic landing + intake
**Trade name:** CHI (Clairvoyant Holdings Inc.)
**Care:** Align physiotherapists
**Hub rails:** Scale
**Contact:** info@calmjoints.org
**Domain:** `calmjoints.org` — **purchased** via Replit Domains ($8.49). DNS A `@` → `76.76.21.21`, www CNAME → `cname.vercel-dns.com`. Attached on Vercel `calm-joints-hub` / `sbg-516724e0`.

---

## What’s live

| Surface | URL |
| --- | --- |
| **Production** | **https://calmjoints.org** |
| This deployment | https://calm-joints-omvvxgyq3-sbg-516724e0.vercel.app |
| Inspect | https://vercel.com/sbg-516724e0/calm-joints-hub/CfVCX9GR1JLGBSZw86ntJv2hehgG |
| GitHub | https://github.com/randy-ship-it/calm-joints-hub |
| Pull request | (this PR — calmjoints.org cutover) |
| Branch | `cursor/calmjoints-org-domain` |

Both forms post to Friday `POST https://fridayapp.org/api/intake` with `site: calmjoints.org`. Auth: `Authorization: Bearer` + `X-Intake-Secret` from `INTAKE_WEBHOOK_SECRET` (fallback `FRIDAY_API_KEY`). The `/api/webhooks/calmjoints/*` paths are not used. A non-2xx still queues locally (Neon when configured). Contact display remains `info@calmjoints.org`.

Public index is on. Canonical / Open Graph / Twitter / sitemap / robots point at `https://calmjoints.org/`.

Interim Jane booking CTA is still in place (`config.js` → `booking.status = interim-jane`).

Deploy path is GitHub → Vercel only. No Replit publish. `scalehealthnew` / Scale Connect Hub were **not** touched.

---

## Domain cutover (this pass)

- Public URLs, contact, canonical/OG/Twitter, sitemap, robots → `https://calmjoints.org/`
- Footer no longer says domain is pending; home is https://calmjoints.org
- Friday site key `calmjoints.org`; notify `info@calmjoints.org`
- Domain purchased via Replit Domains ($8.49); DNS A@ 76.76.21.21 + www CNAME cname.vercel-dns.com

## Visual polish (prior pass)

- Hero promise is calmer joints and Canada-wide Align physiotherapy, with primary paths to the clinic notes and the physio hello. Booking stays one honest Jane button — no sample time chips
- CJ monogram stays in the header, favicon, apple-touch icon, and Open Graph image
- Hub carousel (Jill Health, Effortless, DR-HO’S, Sole, Roll Recovery): 960×600 crops, snap scrolling, arrow keys, dots, and previous/next that announce the leading hub
- Forms keep success, error, and pending states, with a specific message for an empty email, a short bio, LinkedIn, or a missing province
- Mobile menu for the section links, plus a sticky bar for notes and booking

**Domain cutover:** Friday `site` / envelope `source` and `notify_email` now use `calmjoints.org` / `info@calmjoints.org` (`lib/intake.js`). Payload shape otherwise unchanged.

---

## Friday env (set on the Vercel project — value not in git)

| Variable | Role |
| --- | --- |
| `INTAKE_WEBHOOK_SECRET` | Preferred. Bearer + X-Intake-Secret on `POST https://fridayapp.org/api/intake`. |
| `FRIDAY_API_KEY` | Same door secret under the older name. Used only if `INTAKE_WEBHOOK_SECRET` is unset. |

Site routes stay `POST /api/newsletter` and `POST /api/apply`.

---

## Domain (do not buy here)

`calmjoints.org` is live on Vercel. Swap Jane when Jon sends Align embed. Do not buy further domains from this repo.

---

## Not in this change

- No domain purchase / OBR / Stripe card digits
- No edits to Scale Connect Hub / scalehealthnew
