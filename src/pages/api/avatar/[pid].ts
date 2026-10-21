import type { APIRoute } from 'astro';
import { findDb } from '../../../lib/api/currentUser';
import { PID_RE, uidForPid } from '../../../lib/publicId';
import { memLimit } from '../../../lib/antiabuse';
import { DICEBEAR_BASE, FALLBACK_SVG, SVG_HEADERS, safeSvg } from '../../../lib/defaultAvatar';

// /api/avatar/<номер> — робот по умолчанию для игрока без своей картинки (src/lib/defaultAvatar.ts). Открыт всем.
export const GET: APIRoute = async ({ params, request, locals }) => {
  const pid = String(params.pid || '');
  if (pid === '0') return new Response(FALLBACK_SVG, { status: 200, headers: SVG_HEADERS(86400) }); // автор без номера
  if (!PID_RE.test(pid)) return new Response('bad pid', { status: 400 });
  const cache = (globalThis as any).caches?.default;
  const ck = new Request(new URL(`/api/avatar/${pid}`, request.url).toString());
  try { const hit = await cache?.match(ck); if (hit) return hit; } catch { /* локально кэша нет */ }
  const ip = request.headers.get('cf-connecting-ip') || '';
  if (!memLimit(`ava:${ip}`, 300)) return new Response('too many requests', { status: 429, headers: { 'retry-after': '60' } });
  const db = findDb(locals);
  const uid = db ? await uidForPid(db, pid) : null;
  const seed = uid || `mg${pid}`;
  let svg: string | null = null;
  try {
    const r = await fetch(DICEBEAR_BASE + encodeURIComponent(seed), { headers: { accept: 'image/svg+xml' }, redirect: 'error', signal: AbortSignal.timeout(4000) });
    if (r.ok && (r.headers.get('content-type') || '').includes('svg')) svg = safeSvg(await r.text());
  } catch { /* недоступен — запасная картинка */ }
  const res = svg
    ? new Response(svg, { status: 200, headers: SVG_HEADERS(86400) })
    : new Response(FALLBACK_SVG, { status: 200, headers: SVG_HEADERS(300) });
  if (svg) { try { await cache?.put(ck, res.clone()); } catch { /* ок */ } }
  return res;
};
