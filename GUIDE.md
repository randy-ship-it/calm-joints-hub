# Calm Joints guide (chat + voice) — 2026-10-06

- Page: `/chat` (QR: `https://calmjoints.org/chat?src=qr&venue={slug}`). Disclaimer gate first, then Chat · Voice · Book a video visit. Voice consent line shows before the mic prompt. Persistent footer.
- Every `[data-book]` / `/#book` control opens the same gated pop-up (`js/guide.js`, loaded by `js/book.js`) with a quick triage email form. Desktop also gets a corner launcher.
- Booking hand-off: `/?intent=book&area=&province=&src=&venue=` → `CALM_JOINTS.booking.primaryUrl` (config.js). Fallback href on every Book button is the same booking page.
- Agent: ElevenLabs Agents `agent_8401m48tn2g5ehwsa0p84e8pnaf8` (id in `config.js` → `guide.agentId`). SDK: @elevenlabs/client 1.26.0 pinned from jsDelivr (`+esm`), lazy-loaded on Chat/Voice. Chat = text-only websocket; voice = WebRTC.
- Client tools: `open_booking` (opens the hand-off URL, shows a button), `save_lead` (POST `/api/qr-lead` with `kind=guide-triage`).
- Leads: `lib/guide-lead.js` → Friday `POST /api/intake`, org `calmjoints`, `form=guide-triage`, source `cj-guide`, tags `cj-guide`, `src:*`, `venue:*`, `area:*`, `province:*`. Fields: first name, email, phone, province, area label, day/time window, src, venue, via, clicked_book, newsletter_opt_in (+ CASL consent text). No symptoms, transcript or history. Secret stays server-side (`INTAKE_WEBHOOK_SECRET` / `FRIDAY_API_KEY`). Shares the `api/qr-lead` function (keeps the function count unchanged). Test leads: email `+test@` or `?cjtest=1` → `meta.is_test=true`.
- Not in scope: writing an appointment into the clinic calendar from inside the chat (needs a scheduling API credential and a privacy review).
