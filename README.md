# Calm Joints — Scale clinic hub (showcase)

**Product:** Brand storefront / Scale clinic hub for joint comfort & mobility.  
**Care:** Books into **Align physiotherapists** (not a separate Calm Joints clinic corp).  
**Trade name:** Calm Joints — Clairvoyant Holdings Inc. (CHI).  
**Domain:** `calmjoints.ca` — not registered yet; preview URL only. DNS later.

## Why standalone (not scalehealthnew)

Randy lock: prefer **GitHub → Vercel** over Replit Agent for cost.  
**Scale Connect Hub / `scalehealthnew` are frozen** unless needed. This repo is a thin static showcase patterned on the ClinicHub / Align booking-card UX, using Scale portal green tokens — without touching the frozen app.

## Best template path (inventory)

| Path | Role | Use for Calm Joints? |
|------|------|----------------------|
| `scalehealthnew` → `ClinicHubPage` + configs (`drHoConfig`, `jillConfig`, Align booking card) | Production hub framework | **Frozen** — do not edit unless Randy unfreezes |
| `/workspace/hubads-site` | Static HTML + `vercel.json` deploy pattern | **Yes** — deploy shape |
| `/workspace/launch/clinichub` | HubAds landing clone | Reference only (ember palette, not greens) |
| `/workspace/clinichub-media` | HubAds buy server (Replit) | No — different product; Replit cost lock |
| `/workspace/clinichubs.dom.html` | ClinicHubs catalog DOM scrape | Reference only |

**Chosen path:** standalone static site (this repo) → GitHub (`randy-ship-it/calm-joints-hub`) → Vercel preview on SBG team. Promote into `ClinicHubPage` config later if Randy unfreezes scalehealthnew.

## Brand greens (Scale + Align family)

From Scale `portalTokens` / `index.css` SSOT:

- Primary `#15A34A` · Hover `#15803D`
- Darkest `#042414` · Dark `#0B1D16`
- Mint `#D3F8DF` · Surface `#EDFAF4` · Paper `#F7F6F1`

## Local

Open `index.html` or:

```bash
npx serve .
```

## Deploy

```bash
vercel --scope sbg-516724e0 --yes
```

## Config gaps (Jon)

See `STATUS.md` — booking embed URL, provider list API, brand tokens confirmation, logo assets.
