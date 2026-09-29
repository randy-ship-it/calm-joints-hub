# Calm Joints hub — STATUS

**Date:** 2026-09-28 ~10:11 PM ET (America/Toronto)
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
| GitHub | https://github.com/randy-ship-it/calm-joints-hub |
| Pull request | https://github.com/randy-ship-it/calm-joints-hub/pull/1 |
| Branch | `cursor/calmjoints-intake-carousel-9ceb` |

Both forms post to Friday `POST https://fridayapp.org/api/intake` with `site: calmjoints.ca`. Auth: `Authorization: Bearer` + `X-Intake-Secret` from `INTAKE_WEBHOOK_SECRET` (fallback `FRIDAY_API_KEY`). The `/api/webhooks/calmjoints/*` paths are not used. A non-2xx still queues locally (Neon when configured). Contact display remains `info@calmjoints.ca`.

Public index is on. Canonical / Open Graph / Twitter still point at the Vercel preview until `calmjoints.ca` exists.

Interim Jane booking CTA is still in place (`config.js` → `booking.status = interim-jane`).

Deploy path is GitHub → Vercel only. No Replit publish. `scalehealthnew` / Scale Connect Hub were **not** touched.

---

## Visual polish (this pass)

- Cute CJ monogram (gradient green tile, soft highlight, joint-dot) + wordmark + apple-touch icon
- Premium white/green clinic hero: Fraunces + DM Sans, mint washes, proof pills, booking card shadow
- Hub carousel (Jill Health, Effortless, DR-HO’S, Sole, Roll Recovery) with prev/next + dots
- Form success / error / pending states with icons, client invalid highlight, loading spinner on submit
- Twitter card + richer OG meta; favicon SVG + mask-icon
- Mobile: sticky CTA, full-width primary buttons under 480px, tighter nav links

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
