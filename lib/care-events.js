/**
 * Persist first-party funnel / booking-lead envelopes.
 * Friday (when configured) is primary for consented leads.
 * Neon / JSONL is the durable/local copy, same pattern as lib/intake.js.
 */
const fs = require('fs');
const path = require('path');

const SOURCE = 'calmjoints.org';
let neonReady = null;

function storePath(env) {
  return env.INTAKE_STORE_PATH || path.join(process.cwd(), 'data', 'intakes.jsonl');
}

function writeJsonl(record, env) {
  try {
    const file = storePath(env);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.appendFileSync(file, JSON.stringify(record) + '\n');
    return { ok: true };
  } catch (err) {
    console.error('[care-events] jsonl failed', err && err.message);
    return { ok: false };
  }
}

async function writeNeon(record, env) {
  const url = env.NEON_DATABASE_URL || env.DATABASE_URL || env.POSTGRES_URL;
  if (!url) return { ok: false, skipped: true };
  try {
    const { neon } = await import('@neondatabase/serverless');
    const sql = neon(url);
    if (!neonReady) {
      neonReady = sql`CREATE TABLE IF NOT EXISTS calm_joints_intakes (
        id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
        type text NOT NULL,
        source text NOT NULL,
        payload jsonb NOT NULL,
        received_at timestamptz NOT NULL,
        stored_at timestamptz NOT NULL DEFAULT now()
      )`;
    }
    await neonReady;
    await sql`INSERT INTO calm_joints_intakes (type, source, payload, received_at)
      VALUES (${record.type}, ${record.source}, ${JSON.stringify(record.payload)}::jsonb, ${record.received_at})`;
    return { ok: true };
  } catch (err) {
    neonReady = null;
    console.error('[care-events] neon failed', err && err.message);
    return { ok: false, skipped: false };
  }
}

async function persistEnvelope(record, env) {
  const jsonl = writeJsonl(record, env);
  const neon = await writeNeon(record, env);
  return { jsonl, neon };
}

function intakeSecret(env) {
  return env.INTAKE_WEBHOOK_SECRET || env.FRIDAY_API_KEY || '';
}

async function postFriday(payload, env, fetchImpl = fetch) {
  const secret = intakeSecret(env);
  if (!secret) return { ok: false, skipped: true };
  try {
    const res = await fetchImpl('https://fridayapp.org/api/intake', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer ' + secret,
        'X-Intake-Secret': secret,
      },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(8000),
    });
    return { ok: res.ok, status: res.status };
  } catch (err) {
    console.error('[care-events] friday failed', err && err.message);
    return { ok: false };
  }
}

module.exports = { persistEnvelope, postFriday, intakeSecret, writeJsonl, writeNeon, SOURCE };
