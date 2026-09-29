# Calm Joints hub — STATUS

**Date:** 2026-09-29 ~1:40 AM ET (America/Toronto)
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
| Vercel project | `calm-joints-hub` (`prj_Y2OAVqC0nJ2jZXcuNMwMRNAC0vY6`) |
| Team | `sbg-516724e0` (`team_lOeMvVi5qA620Xr4vVA0C59W`) |
| GitHub | https://github.com/randy-ship-it/calm-joints-hub |
| Inspect | https://vercel.com/sbg-516724e0/calm-joints-hub |

Public index is on (`noindex` removed). Canonical and Open Graph still point at the Vercel preview until `calmjoints.ca` exists. Flip those to `https://calmjoints.ca/` when DNS is attached.

Interim Jane booking CTA is still in place (`config.js` → `booking.status = interim-jane`):

`https://scalehealth.janeapp.com/locations/scale-health-x-dr-ho/book#/staff_member/91/treatment/346`

Deploy path is GitHub → Vercel only. No Replit publish. `scalehealthnew` / Scale Connect Hub were not touched.

---

## Friday env (set on the Vercel project — values not in git)

| Variable | Role |
| --- | --- |
| `FRIDAY_INTAKE_URL` | POST target for intake |
| `FRIDAY_INTAKE_SECRET` | `Authorization: Bearer …` and `X-Friday-Secret` |

Webhook JSON:

```json
{
  "type": "newsletter or apply",
  "source": "calmjoints.ca",
  "payload": { "notify_email": "info@calmjoints.ca" },
  "received_at": "2026-09-29T00:00:00.000Z"
}
```

`POST /api/newsletter` — email, optional name. Meant for blogs, newsletters, and the latest. Payload includes `notify_email: info@calmjoints.ca`.

`POST /api/apply` — physio hello for every Canadian province and territory: name, email, optional phone, provinces, optional college/registration number, LinkedIn handle or URL, short bio, optional years, optional availability.

If Friday is unset or returns an error, the same record is appended locally (`data/intakes.jsonl` in dev, `/tmp/calmjoints-intakes.jsonl` on Vercel) and inserted into Neon when `NEON_DATABASE_URL`, `DATABASE_URL`, or `POSTGRES_URL` is set (table `calm_joints_intakes`, created on first write).

**These env vars are not set on the project yet.** Until `FRIDAY_INTAKE_URL` or a Neon URL is added in Vercel → calm-joints-hub → Settings → Environment Variables (Production + Preview), production submissions only hit ephemeral `/tmp` and can disappear when the function instance goes away. Add Friday (and Neon if you want a database copy) before relying on the forms.

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
