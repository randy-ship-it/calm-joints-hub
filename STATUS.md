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

## Clinic desk blogs (2026-09-28 evening)

Added `#desk` “From the clinic desk” section with six externally linked education pieces (CPA, APA, MedlinePlus ×2, OrthoInfo AAOS ×2). URLs verified HTTP 200. No invented medical claims — blurbs describe the linked pages only. Contact remains `info@calmjoints.org`; canonical domain `calmjoints.org`.

## Lean landing + new logo + team alerts (2026-09-29 AM)

- Page is now: hero, hub carousel, physio hiring (team + application), a short Questions form, and a footer with a Partnership opportunities link. How-it-works, reading list, product/store copy and the newsletter panel are gone.
- Carousel is three hub pages (DR-HO’S, Jill Health, Jack Health), each recaptured at 1600×800 webp with the same 2:1 crop. Roll Recovery and Sole slides were removed because their images showed products.
- New logo: a knee joint (two limbs, joint node) with a range-of-motion arc on a green rounded square; wordmark text is outlined DM Sans Bold paths. Favicon PNG, apple-touch PNG, 512 icon and a new OG image were generated from it.
- New `POST /api/question` (kind `question`): Friday `kind: form`, source `calmjoints_question`, tags `calmjoints`, `question` (+ `newsletter` when the box is ticked).
- Team alerts: every accepted newsletter, question or application posts a short Slack message when `CJ_ALERT_SLACK_WEBHOOK_URL` (a Slack incoming webhook) is set on Vercel. Friday already writes an in-app notification to workspace admins for each physio application.
