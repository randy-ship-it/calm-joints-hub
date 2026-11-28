/**
 * Calm Joints guide — real next availability from the Calm Joints public
 * online-booking calendar (the same page the Book button opens). Read-only.
 * Used by the agent's get_next_availability server tool so it can propose a
 * specific, real time ("today at 3:40 PM, or tomorrow at 8:00 AM") and hand the
 * visitor a link that opens booking on that day. Never invents times: if the
 * calendar can't be read, it says so and the agent opens the booking page.
 */
const JANE_HOST = 'https://calmjoints.janeapp.com';
const BOOK_PATH = '/locations/calm-joints/book';
const BOOKING_PAGE = 'https://calmjoints.janeapp.com/locations/calm-joints/book#/discipline/2/treatment/346';
const TZ = 'America/Toronto';
// Fallbacks if the public page can't be parsed (values from the public booking page).
const FALLBACK = { locationId: 1, staffIds: [91], treatments: { initial: 346, followup: 347 } };
let cache = { at: 0, key: '', value: null };

function ymd(d) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);
}
function label(start, now) {
  const day = ymd(start);
  const today = ymd(now);
  const tomorrow = ymd(new Date(now.getTime() + 24 * 3600 * 1000));
  const time = new Intl.DateTimeFormat('en-CA', { timeZone: TZ, hour: 'numeric', minute: '2-digit', hour12: true }).format(start).replace(/\s?a\.m\./i, ' AM').replace(/\s?p\.m\./i, ' PM');
  if (day === today) return `today at ${time}`;
  if (day === tomorrow) return `tomorrow at ${time}`;
  const dname = new Intl.DateTimeFormat('en-CA', { timeZone: TZ, weekday: 'long', month: 'long', day: 'numeric' }).format(start);
  return `${dname} at ${time}`;
}
function bookUrl(staffId, treatmentId, start) {
  return `${JANE_HOST}${BOOK_PATH}#/staff_member/${staffId}/treatment/${treatmentId}/${ymd(start)}`;
}

async function discover(fetchImpl) {
  try {
    const res = await fetchImpl(`${JANE_HOST}${BOOK_PATH}`, { headers: { 'User-Agent': 'Mozilla/5.0 (CalmJointsGuide)' }, signal: AbortSignal.timeout(6000) });
    const html = await res.text();
    const loc = /App\.location_id\s*=\s*(\d+)/.exec(html);
    const staff = /staff_members:\s*(\[.*?\])\s*,\s*\n/s.exec(html);
    const treat = /treatments:\s*(\[.*?\])\s*,\s*\n/s.exec(html);
    const staffIds = staff ? JSON.parse(staff[1]).map((s) => s.id).filter(Boolean) : [];
    const list = treat ? JSON.parse(treat[1]) : [];
    const initial = (list.find((t) => /initial|assess/i.test(t.name)) || {}).id;
    const followup = (list.find((t) => /session|follow/i.test(t.name)) || {}).id;
    return {
      locationId: loc ? Number(loc[1]) : FALLBACK.locationId,
      staffIds: staffIds.length ? staffIds.slice(0, 6) : FALLBACK.staffIds,
      treatments: { initial: initial || FALLBACK.treatments.initial, followup: followup || FALLBACK.treatments.followup },
    };
  } catch {
    return FALLBACK;
  }
}

/**
 * kind: 'initial' (first visit, default) or 'followup'.
 * Returns { ok, today_available, slots:[{label,start_at,book_url}], ... }.
 */
async function nextAvailability(opts = {}, fetchImpl = fetch, nowDate = new Date()) {
  const kind = opts.kind === 'followup' ? 'followup' : 'initial';
  const key = kind;
  if (cache.value && cache.key === key && Date.now() - cache.at < 60 * 1000) return refreshLabels(cache.value, nowDate);
  const cfg = await discover(fetchImpl);
  const treatmentId = cfg.treatments[kind];
  const openings = [];
  // Jane's public calendar serves up to 7 days per request: read this week and next.
  const starts = [ymd(nowDate), ymd(new Date(nowDate.getTime() + 7 * 24 * 3600 * 1000))];
  await Promise.all(cfg.staffIds.flatMap((staffId) => starts.map((d) => [staffId, d])).map(async ([staffId, startDate]) => {
    const url = `${JANE_HOST}/api/v2/openings?location_id=${cfg.locationId}&staff_member_id=${staffId}&treatment_id=${treatmentId}&date=${startDate}&num_days=7`;
    try {
      const res = await fetchImpl(url, { headers: { Accept: 'application/json', 'User-Agent': 'Mozilla/5.0 (CalmJointsGuide)' }, signal: AbortSignal.timeout(6000) });
      if (!res.ok) return;
      const data = await res.json();
      for (const s of Array.isArray(data) ? data : []) {
        for (const o of s.openings || []) {
          if (o.status === 'opening' && o.start_at) openings.push({ staffId: o.staff_member_id || staffId, treatmentId: o.treatment_id || treatmentId, start: new Date(o.start_at), duration: o.duration });
        }
      }
    } catch { /* ignore one calendar */ }
  }));
  const soon = nowDate.getTime() + 45 * 60 * 1000; // need time to book and join
  const future = openings.filter((o) => o.start.getTime() >= soon).sort((a, b) => a.start - b.start);
  if (!future.length && !openings.length) {
    const out = { ok: false, message: 'Live availability could not be read right now. Offer today if available, otherwise the first available time, and open the booking page so they can pick.', booking_page: BOOKING_PAGE };
    return out;
  }
  // Earliest slot, then the next one on a different hour, plus first slot of the next day if different.
  const picks = [];
  for (const o of future) {
    if (picks.length >= 3) break;
    if (picks.some((p) => Math.abs(p.start - o.start) < 60 * 60 * 1000)) continue;
    picks.push(o);
  }
  const value = {
    ok: true,
    kind,
    visit: kind === 'initial' ? 'First video visit with a registered physiotherapist (about 60 minutes)' : 'Follow-up physiotherapy video session',
    region_note: 'Video visits are currently with Ontario-registered physiotherapists for people located in Ontario.',
    timezone: 'Eastern Time (Toronto)',
    raw: picks.map((p) => ({ start_at: p.start.toISOString(), book_url: bookUrl(p.staffId, p.treatmentId, p.start) })),
  };
  cache = { at: Date.now(), key, value };
  return refreshLabels(value, nowDate);
}
function refreshLabels(v, nowDate) {
  if (!v.ok) return v;
  const slots = v.raw.map((r) => ({ label: label(new Date(r.start_at), nowDate), start_at: r.start_at, book_url: r.book_url }));
  const todayAvailable = slots.some((s) => s.label.startsWith('today'));
  return {
    ok: true, visit: v.visit, region_note: v.region_note, timezone: v.timezone,
    now: label(nowDate, nowDate).replace('today at ', 'It is now '),
    today_available: todayAvailable,
    slots,
    how_to_offer: slots.length
      ? `${todayAvailable ? 'There is a time today.' : 'Nothing left today.'} Propose the first one or two slots by their label, e.g. "I can get you in ${slots[0].label}${slots[1] ? `, or ${slots[1].label}` : ''}. Want one of those?" When they pick, call open_booking with that slot's book_url. Only these times are real.`
      : 'No openings in the next two weeks. Open the booking page so they can check, or offer to email them.',
    booking_page: BOOKING_PAGE,
  };
}


/**
 * Full calendar of real openings for the next `days` (default 14).
 * Same Jane public calendar the Book button uses. Never invents times.
 * Does not include clinician names — only staff ids needed for the hand-off URL.
 */
let listCache = { at: 0, key: '', value: null };

async function listOpenings(opts = {}, fetchImpl = fetch, nowDate = new Date()) {
  const kind = opts.kind === 'followup' ? 'followup' : 'initial';
  const days = Math.min(Math.max(Number(opts.days) || 14, 7), 21);
  const key = kind + ':' + days + ':' + (opts.from || '');
  if (listCache.value && listCache.key === key && Date.now() - listCache.at < 60 * 1000) {
    return decorateList(listCache.value, nowDate);
  }
  const cfg = await discover(fetchImpl);
  const treatmentId = cfg.treatments[kind];
  const start0 = opts.from ? new Date(opts.from + 'T12:00:00-05:00') : nowDate;
  const weekStarts = [];
  for (let i = 0; i < days; i += 7) {
    weekStarts.push(ymd(new Date(start0.getTime() + i * 24 * 3600 * 1000)));
  }
  const openings = [];
  await Promise.all(cfg.staffIds.flatMap((staffId) => weekStarts.map((d) => [staffId, d])).map(async ([staffId, startDate]) => {
    const url = `${JANE_HOST}/api/v2/openings?location_id=${cfg.locationId}&staff_member_id=${staffId}&treatment_id=${treatmentId}&date=${startDate}&num_days=7`;
    try {
      const res = await fetchImpl(url, { headers: { Accept: 'application/json', 'User-Agent': 'Mozilla/5.0 (CalmJointsGuide)' }, signal: AbortSignal.timeout(8000) });
      if (!res.ok) return;
      const data = await res.json();
      for (const s of Array.isArray(data) ? data : []) {
        for (const o of s.openings || []) {
          if (o.status === 'opening' && o.start_at) {
            openings.push({
              staffId: o.staff_member_id || staffId,
              treatmentId: o.treatment_id || treatmentId,
              start: new Date(o.start_at),
              end: o.end_at ? new Date(o.end_at) : null,
              duration: o.duration,
            });
          }
        }
      }
    } catch { /* ignore one calendar */ }
  }));
  const soon = nowDate.getTime() + 20 * 60 * 1000;
  const seen = new Set();
  const future = openings
    .filter((o) => o.start.getTime() >= soon)
    .sort((a, b) => a.start - b.start)
    .filter((o) => {
      const k = o.staffId + ':' + o.start.toISOString();
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    });
  const value = {
    ok: future.length > 0 || openings.length > 0,
    kind,
    treatment_id: treatmentId,
    visit: kind === 'initial' ? 'Initial physio assessment (60 minutes)' : 'Physiotherapy session (30 minutes)',
    price: kind === 'followup' ? 99 : 129,
    duration_min: kind === 'initial' ? 60 : 30,
    region_note: 'Video visits are with Ontario-registered physiotherapists, for people located in Ontario.',
    timezone: 'America/Toronto',
    booking_page: BOOKING_PAGE,
    raw: future.map((p) => ({
      start_at: p.start.toISOString(),
      end_at: p.end ? p.end.toISOString() : null,
      duration: p.duration,
      staff_id: p.staffId,
      treatment_id: p.treatmentId,
      book_url: bookUrl(p.staffId, p.treatmentId, p.start),
    })),
  };
  if (!future.length) {
    value.ok = false;
    value.message = openings.length
      ? 'No remaining times in this window. Open the booking page to check further out, or leave a callback.'
      : 'Live availability could not be read right now. Open the booking page to pick a time, or leave a callback.';
  }
  listCache = { at: Date.now(), key, value };
  return decorateList(value, nowDate);
}

function decorateList(v, nowDate) {
  const slots = (v.raw || []).map((r) => {
    const start = new Date(r.start_at);
    return {
      start_at: r.start_at,
      end_at: r.end_at,
      day: ymd(start),
      label: label(start, nowDate),
      time: new Intl.DateTimeFormat('en-CA', { timeZone: TZ, hour: 'numeric', minute: '2-digit', hour12: true }).format(start).replace(/\s?a\.m\./i, ' AM').replace(/\s?p\.m\./i, ' PM'),
      book_url: r.book_url,
      staff_id: r.staff_id,
      treatment_id: r.treatment_id,
    };
  });
  const days = {};
  for (const s of slots) {
    if (!days[s.day]) days[s.day] = { date: s.day, count: 0, slots: [] };
    days[s.day].count += 1;
    days[s.day].slots.push(s);
  }
  return {
    ok: v.ok,
    kind: v.kind,
    visit: v.visit,
    price: v.price,
    duration_min: v.duration_min,
    treatment_id: v.treatment_id,
    region_note: v.region_note,
    timezone: v.timezone,
    booking_page: v.booking_page,
    message: v.message || '',
    count: slots.length,
    slots,
    days,
  };
}

module.exports = { nextAvailability, listOpenings, label, bookUrl, _reset: () => { cache = { at: 0, key: '', value: null }; listCache = { at: 0, key: '', value: null }; } };

