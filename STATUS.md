# Calm Joints hub — STATUS
**Date:** 2026-09-28 ~6:50 PM ET (America/Toronto)  
**Agent:** Grok Bot (executor)  
**Product:** Scale clinic hub storefront → books into Align physios  
**Owner of trade name:** CHI (Clairvoyant Holdings Inc.)  
**Domain:** `calmjoints.ca` — **NOT registered** (another agent / DNS later). OBR payment **not touched**.

---

## Preview URL (live)

| Surface | URL |
|---------|-----|
| **Aliased preview** | **https://calm-joints-hub.vercel.app** |
| Deployment | https://calm-joints-d0vkh11q8-sbg-516724e0.vercel.app |
| Inspect | https://vercel.com/sbg-516724e0/calm-joints-hub/6gmTtaCNQMP5zLvsMxPRXq9PUw7L |
| GitHub | https://github.com/randy-ship-it/calm-joints-hub |
| Local path | `/workspace/calm-joints-hub-2026-09-28/` |

Vercel project: `sbg-516724e0/calm-joints-hub` (SBG team). Static HTML — no Replit.

---

## 1) Inventory — best hub template path

| Candidate | Verdict |
|-----------|---------|
| **`scalehealthnew` `ClinicHubPage` + hub configs** (drHo, jill, AlignBookingCard, Jane) | **Best production pattern** — but **FROZEN** (Scale Connect Hub / scalehealthnew lock). Do not edit unless Randy unfreezes. |
| `/workspace/hubads-site` (+ `/workspace/launch/clinichub`) | **Best deploy shape** for a standalone showcase: static `index.html` + `vercel.json` → Vercel. Ember palette (not greens) — used as structure only. |
| `/workspace/clinichub-media` | HubAds buy server on Replit — **skip** (cost lock; wrong product). |
| `/workspace/clinichubs.dom.html` / `scalehealth_slots` | Catalog DOM reference only. |
| Existing brand-hub / location-hub records in scalehealthnew | Future path once unfrozen: add Calm Joints as a ClinicHub config or brand-hub record. |

**Chosen now:** Standalone static showcase (this folder/repo) patterned on ClinicHub + Align booking card UX, Scale portal greens (`#15A34A` family). GitHub → Vercel. No touch to scalehealthnew.

**Brand greens used (Scale portalTokens SSOT):**
- Primary `#15A34A` · Hover `#15803D`
- Darkest `#042414` · Dark `#0B1D16`
- Mint `#D3F8DF` · Surface `#EDFAF4` · Paper `#F7F6F1`

---

## 2) What we need from Jon (ask list)

1. **Booking embed URL** — iframe-safe (or deep-link) Align physio booking URL for Calm Joints CTA. Today: interim `scalehealth.janeapp.com` …/scale-health-x-dr-ho (config `booking.status = interim-jane`). Confirm correct Align location / staff / treatment IDs.
2. **Provider list API** — endpoint (or static roster) of Align physios to show on hub (name, credentials, photo, bookingUrl). Schema preferred: `{ id, name, credentials, photoUrl, bookingUrl, provinces[] }`.
3. **Brand tokens confirmation** — OK to keep Scale greens above, or send Align-specific Calm Joints palette / co-brand rules.
4. **Logo assets** — final Calm Joints wordmark + mark (SVG/PNG, light + dark), optional Align co-brand lockup, OG image 1200×630.
5. **Copy sign-off** — “CHI trade name / Align delivers care / Scale powers hub” legal line; any province gating copy.
6. **(Optional later)** Promote into `scalehealthnew` ClinicHubPage config / brand-hub record when frozen lock lifts.

Wire answers into `config.js` (`booking.embedUrl`, `booking.providerListApi`, `booking.status = 'live'`).

---

## 3) Next DNS steps (do NOT buy yet — another agent / Randy)

When ready to attach `calmjoints.ca`:

1. Register `calmjoints.ca` at Porkbun (`rgilling`) — domain agent owns purchase.
2. In Vercel project `calm-joints-hub` → Domains → add `calmjoints.ca` + `www.calmjoints.ca`.
3. At Porkbun DNS: add Vercel-required records (usually A `76.76.21.21` for apex + CNAME `cname.vercel-dns.com` for www — confirm in Vercel UI at attach time).
4. Wait for SSL; remove `noindex` in `index.html` when public.
5. Flip interim Jane URL to Jon’s live Align embed.

OBR trade-name filing / Beanstream payment: **out of scope** (other agent).

---

## Done this turn

- [x] Inventory templates; chose standalone static over frozen scalehealthnew  
- [x] Scaffold landing + Align book CTA (Scale/Align greens)  
- [x] Push GitHub `randy-ship-it/calm-joints-hub`  
- [x] Deploy Vercel preview `https://calm-joints-hub.vercel.app`  
- [x] STATUS.md (this file)  
- [x] Did **not** buy domain or touch OBR payment  

## Gaps remaining

- Jon: embed URL, provider API, logos, token confirm  
- Domain purchase + DNS  
- Optional: production ClinicHub config inside scalehealthnew (needs unfreeze)
