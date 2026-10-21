import type { APIRoute } from 'astro';
import { parseCspReports } from '../../lib/csp';
import { memLimit, clientIp } from '../../lib/antiabuse';
export const prerender = false;

// Приёмник отчётов CSP (режим report-only): пишет короткую строку «[csp] …» в журнал воркера. IP не пишется.
export const POST: APIRoute = async ({ request }) => {
  if (!memLimit(`csp:${clientIp(request)}`, 30)) return new Response(null, { status: 204 });
  try {
    const raw = await request.text();
    if (raw.length > 64 * 1024) return new Response(null, { status: 204 });
    for (const r of parseCspReports(JSON.parse(raw))) console.log(`[csp] ${r.dir} blocked=${r.blocked} page=${r.page} src=${r.src}`);
  } catch { /* мусор — молча */ }
  return new Response(null, { status: 204 });
};
