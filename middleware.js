// Pen aliases (/randy) redirect to the ambassador landing with src=pen.
// Reserved site paths are skipped in the matcher so real pages never hit this.
import { next } from '@vercel/functions';
import { aliasRedirect } from './lib/partner-alias.js';
import { logAiBotHit } from './lib/ai-bots.js';

// AI layer (Nov 21 2026): these paths only log AI crawler visits (bot family + path, no PII) and pass through.
const AI_PATHS = ['/', '/llms.txt', '/llms-full.txt', '/robots.txt', '/sitemap.xml', '/index.md', '/enterprise.md', '/partners.md', '/racquets.md', '/squash.md', '/tennis.md', '/pickleball.md', '/enterprise', '/partners', '/racquets', '/squash', '/tennis', '/pickleball', '/paddle', '/badminton', '/careers', '/chat'];
const AI_PATH_SET = new Set(AI_PATHS);

export const config = {
  runtime: 'nodejs',
  matcher: [
    // AI layer paths (keep in sync with AI_PATHS; literal so the matcher stays statically parseable).
    '/',
    '/llms.txt',
    '/llms-full.txt',
    '/robots.txt',
    '/sitemap.xml',
    '/index.md',
    '/enterprise.md',
    '/partners.md',
    '/racquets.md',
    '/squash.md',
    '/tennis.md',
    '/pickleball.md',
    '/enterprise',
    '/partners',
    '/racquets',
    '/squash',
    '/tennis',
    '/pickleball',
    '/paddle',
    '/badminton',
    '/careers',
    '/chat',
    '/blog/:path*',
    '/((?!api/|js/|css/|media/|blog/|lib/|scripts/|data/|_next/|api$|js$|css$|media$|blog$|lib$|scripts$|data$|_next$|about$|admin$|alias$|ambassadors$|app$|apply$|assets$|blog$|body-map-demo$|book$|careers$|cdn$|chat$|chat-glen$|chat-gwen$|contact$|data$|drive$|enterprise$|favicon$|fonts$|glen$|guide$|gwen$|health$|images$|index$|intake$|login$|localdemand$|localvibe$|near-you$|hub$|mail$|me$|newsletter$|p$|partner$|partner-terms$|partners$|privacy$|question$|report$|resume$|robots$|sales$|share$|sitemap$|sms$|squash$|paddle$|pickleball$|tennis$|badminton$|racquets$|static$|status$|team$|terms$|www$)[a-z0-9-]{2,32})',
    '/((?!api/|js/|css/|media/|blog/|lib/|scripts/|data/|_next/|api$|js$|css$|media$|blog$|lib$|scripts$|data$|_next$|about$|admin$|alias$|ambassadors$|app$|apply$|assets$|blog$|body-map-demo$|book$|careers$|cdn$|chat$|chat-glen$|chat-gwen$|contact$|data$|drive$|enterprise$|favicon$|fonts$|glen$|guide$|gwen$|health$|images$|index$|intake$|login$|localdemand$|localvibe$|near-you$|hub$|mail$|me$|newsletter$|p$|partner$|partner-terms$|partners$|privacy$|question$|report$|resume$|robots$|sales$|share$|sitemap$|sms$|squash$|paddle$|pickleball$|tennis$|badminton$|racquets$|static$|status$|team$|terms$|www$)[a-z0-9-]{2,32})/',
  ],
};

export default async function middleware(request) {
  const { pathname } = new URL(request.url);
  try { logAiBotHit('calmjoints.org', request.headers.get('user-agent'), pathname); } catch {}
  if (AI_PATH_SET.has(pathname) || pathname.startsWith('/blog/')) return next();
  const m = pathname.match(/^\/([a-z0-9-]{2,32})\/?$/i);
  if (!m) return next();
  try {
    const dest = await aliasRedirect(m[1], process.env, new URL(request.url).searchParams.get('src'));
    if (!dest) return next();
    const url = new URL(dest.location, request.url);
    return new Response(null, {
      status: 302,
      headers: { Location: url.toString(), 'Cache-Control': 'no-store' },
    });
  } catch {
    return next();
  }
}
