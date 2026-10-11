// Pen aliases (/randy) redirect to the ambassador landing with src=pen.
// Reserved site paths are skipped in the matcher so real pages never hit this.
import { next } from '@vercel/functions';
import { aliasRedirect } from './lib/partner-alias.js';

export const config = {
  runtime: 'nodejs',
  matcher: ['/((?!api/|js/|css/|media/|blog/|lib/|scripts/|data/|_next/|api$|js$|css$|media$|blog$|lib$|scripts$|data$|_next$|about$|admin$|alias$|ambassadors$|app$|apply$|assets$|blog$|book$|careers$|cdn$|chat$|chat-glen$|chat-gwen$|contact$|data$|favicon$|fonts$|glen$|guide$|gwen$|health$|images$|index$|intake$|login$|mail$|newsletter$|p$|partner$|partner-terms$|partners$|privacy$|question$|report$|resume$|robots$|sales$|share$|sitemap$|sms$|static$|status$|team$|terms$|www$)[a-z0-9-]{2,32})/?'],
};

export default async function middleware(request) {
  const { pathname } = new URL(request.url);
  const m = pathname.match(/^\/([a-z0-9-]{2,32})\/?$/i);
  if (!m) return next();
  try {
    const dest = await aliasRedirect(m[1], process.env);
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
