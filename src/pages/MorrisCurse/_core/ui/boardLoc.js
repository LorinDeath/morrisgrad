// Куда ведёт трекер по заданию доски. Стрелка и указатель — ТОЛЬКО у заданий с местом на карте
// (идти/найти/убить конкретного моба или босса/подземелье/сбор/NPC/доска). «Без места» (разобрать N, потратить, уровень…) —
// только счётчик прогресса. hasPlace() — статически по определению; taskTarget() — точка с учётом живых мобов/узлов.
import { WORLD_GEN } from '../../../../../server/meta/zoneGen.ts';
import { goalMatch } from '../../../../../server/meta/biomes.ts';
import { ZONE_MOBS } from '../../../../../server/meta/defs.ts';
import { RESOURCES, NPCS } from '../../../../../server/meta/shared.ts';
import { nearestHome, WORLD_NAMES } from '../../../../../server/meta/mobHome.ts';
import { bossCfg, bossLairs, pickLair, lairTarget } from './bossSpawn.js';
import { WORLD_PORTALS } from '../../../../../server/worlds/portals.ts';
import { npcPos } from '../meta/npcLive.js';

const P = Object.fromEntries(WORLD_PORTALS.map((p) => [p.id, p]));
const at = (id, label) => { const p = P[id]; return p ? { world: p.world || 'hellfire', x: p.x, y: p.y, label: label || p.name } : null; };
const ALTAR = { world: 'hellfire', x: 565, y: 600, label: 'Алтарь перевоплощения' };
const flags = (t) => new Set(String(t.f || '').split(',').filter(Boolean));
const mobOf = (t) => { const m = String(t.m || ''); if (t.ev === 'st' && m.startsWith('mob:')) return m.slice(4); if (t.ev === 'kill' && m && !/^(biome|role|cls):/.test(m)) return m; return ''; };

const isNpcAt = (t) => !!t.at && t.at !== 'board';
/** живая позиция персонажа-выдающего (личные задания) */
function npcAt(id, label) { const n = NPCS[id], p = npcPos(id); return n && p ? { world: n.world || 'hellfire', x: p.x, y: p.y, label: `${label}: ${n.name}`, npc: id } : null; }
/** есть ли у задания место на карте (иначе — только счётчик) */
export function hasPlace(t) {
  if (!t || t.hid) return false;
  if (t.nb || t.take || isNpcAt(t)) return true; // взятие/сдача — у Доски объявлений или у персонажа (личное задание)
  const F = flags(t), m = String(t.m || '');
  switch (t.ev) {
    case 'kill': return !!mobOf(t) || m.startsWith('biome:') || F.has('wboss') || F.has('rare');
    case 'st': return m.startsWith('mob:') || m === 'wbosses';
    case 'gather': case 'run': case 'trial': case 'duel': case 'duel_win': case 'pvp': case 'upgrade': case 'craft':
    case 'select_hero': case 'soul': case 'reach': case 'portal': case 'bm_find': return true;
    case 'ui': return m === 'board';
    default: return false;
  }
}

function nearestOf(list, ctx) { let best = null, bd = Infinity; for (const p of list) { if (!p) continue; const d = p.world === ctx.world ? Math.hypot(p.x - ctx.x, p.y - ctx.y) : 1e12; if (d < bd) { bd = d; best = p; } } return best; }
function mobTarget(id, ctx, bcfg) {
  const nm = ZONE_MOBS[id]?.name || id;
  let best = null, bd = Infinity;
  for (const m of ctx.mobs?.values?.() || []) if (goalMatch(id, m.type) && !(m.hp <= 0)) { const d = Math.hypot(m.x - ctx.x, m.y - ctx.y); if (d < bd) { bd = d; best = { world: ctx.world, x: m.x, y: m.y, label: nm, mob: id }; } }
  if (best) return best;
  for (const c of ctx.camps || []) if (c[3] > 0 && c[7].some((ty) => goalMatch(id, ty))) { const d = Math.hypot(c[1] - ctx.x, c[2] - ctx.y); if (d < bd) { bd = d; best = { world: ctx.world, x: c[1], y: c[2], label: 'Лагерь: ' + nm, mob: id }; } }
  if (best) return best;
  { const l = pickLair(bossLairs((ty) => goalMatch(id, ty), ctx.world), ctx); if (l) return lairTarget(l, nm, bcfg, { mob: id }); } // мировой босс: живое состояние логова
  const n = nearestHome(id, ctx.world, ctx.x, ctx.y); if (!n) return null;
  return { world: n.home.world, x: n.home.x, y: n.home.y, label: nm + (n.home.region ? ' · ' + n.home.region.split(':')[0] : ''), mob: id };
}
function regionsWhere(fn) { const out = []; for (const [world, G] of Object.entries(WORLD_GEN)) for (const r of G.regions || []) if (fn(r)) out.push({ world, x: (r.rect[0] + r.rect[2]) / 2, y: (r.rect[1] + r.rect[3]) / 2, label: r.name }); return out; }
const BIOME_REG = new Map();
function bossSpots() { const out = []; for (const [world, G] of Object.entries(WORLD_GEN)) for (const b of G.bosses || []) out.push({ world, x: b.x, y: b.y, label: (ZONE_MOBS[b.type]?.name || 'Мировой босс') + (b.where ? ' · ' + b.where : ''), mob: b.type }); return out; }
function rareSpots() { const out = []; for (const [world, G] of Object.entries(WORLD_GEN)) { const by = new Map((G.regions || []).map((r) => [r.id, r])); for (const r of G.rares || []) { const rg = by.get(r.region); if (rg) out.push({ world, x: (rg.rect[0] + rg.rect[2]) / 2, y: (rg.rect[1] + rg.rect[3]) / 2, label: (ZONE_MOBS[r.type]?.name || 'Редкий') + ' · ' + rg.name, mob: r.type }); } } return out; }

/** в другой локации — к порталу туда */
export function viaPortal(tg, ctx) {
  if (!tg || tg.world === ctx.world) return tg;
  const p = WORLD_PORTALS.find((q) => (q.world || 'hellfire') === ctx.world && q.targetWorld === tg.world && q.x != null);
  return p ? { world: ctx.world, x: p.x, y: p.y, label: `${tg.label} — портал в ${WORLD_NAMES[tg.world] || tg.world}`, via: tg } : { ...tg, far: 1 };
}

/** точка цели или null. store — BoardStore, ctx — {world,x,y,mobs,camps,nodes,bmDomes} */
export function taskTarget(t, store, ctx) {
  if (!hasPlace(t)) return null;
  const props = store.defs?.props || {}, nb = props.nb && { world: props.nb.world, x: props.nb.x, y: props.nb.y, label: 'Доска объявлений', board: 'nb' };
  const r = store.tier(t);
  if (isNpcAt(t)) { // личное задание: взять и сдать — у персонажа (как сюжетный квест)
    if (t.take && !store.taken(t.id)) return viaPortal(npcAt(t.at, 'Взять'), ctx);
    if (r.ready && !r.done) return viaPortal(npcAt(t.at, 'Сдать'), ctx);
  }
  if (t.take && !store.taken(t.id)) return viaPortal(nb, ctx);
  if (t.nb && r.ready) return viaPortal({ ...nb, label: 'Сдать: Доска объявлений' }, ctx);
  if (r.done) return null;
  const F = flags(t), m = String(t.m || ''), bcfg = bossCfg(store);
  let tg = null;
  switch (t.ev) {
    case 'kill': case 'st': {
      const id = mobOf(t);
      if (id) tg = mobTarget(id, ctx, bcfg);
      else if (m.startsWith('biome:')) { const b = 'b_' + m.slice(6); if (!BIOME_REG.has(b)) BIOME_REG.set(b, regionsWhere((rg) => rg.biome === b)); tg = nearestOf(BIOME_REG.get(b), ctx); }
      else if (F.has('wboss') || m === 'wbosses') { const l = pickLair(bossLairs(() => true, ctx.world), ctx); tg = l ? lairTarget(l, (ZONE_MOBS[l.type]?.name || 'Мировой босс'), bcfg, { mob: l.type }) : nearestOf(bossSpots(), ctx); }
      else if (F.has('rare')) tg = nearestOf(rareSpots(), ctx);
      break;
    }
    case 'gather': {
      let best = null, bd = Infinity, alt = null, ad = Infinity;
      for (const n of ctx.nodes?.values?.() || []) { if (m && n.def.res !== m) continue; const d = Math.hypot(n.def.x - ctx.x, n.def.y - ctx.y);
        if (n.ready && d < bd) { bd = d; best = n; } else if (!n.ready && d < ad) { ad = d; alt = n; } }
      const nd = best || alt, nm = m ? RESOURCES[m]?.name || m : 'Ресурс';
      tg = nd ? { world: ctx.world, x: nd.def.x, y: nd.def.y, label: best ? nm : `${nm} (вырастет)` } : ctx.world === 'hellfire' ? at('portal_arinar', `${nm}: узлы в Аринаре`) : null;
      break;
    }
    case 'run': tg = m === 'crypt' ? at('portal_run_crypt') : m === 'abyss' ? at('portal_run_abyss') : nearestOf([at('portal_run_crypt'), at('portal_run_abyss')], ctx); break;
    case 'trial': tg = at('portal_trial'); break;
    case 'duel': case 'duel_win': case 'pvp': tg = at('portal_duel'); break;
    case 'upgrade': case 'craft': { const p = npcPos('petr'); tg = p ? { world: 'hellfire', x: p.x, y: p.y, label: t.ev === 'craft' ? 'Петр — ремесло' : 'Петр — улучшение' } : null; break; }
    case 'select_hero': case 'soul': tg = ALTAR; break;
    case 'reach': case 'portal': tg = ctx.world === 'arinar' && t.ev === 'reach' ? null : at('portal_arinar'); break;
    case 'bm_find': {
      const h = store.bmHint; const domes = (ctx.bmDomes || []).map((d) => ({ world: 'arinar', x: d.x, y: d.y, label: 'Купол Чёрного мага' }));
      tg = h ? { world: 'arinar', x: h.x, y: h.y, label: 'Чёрный маг (примерно)' } : nearestOf(domes, { ...ctx, world: 'arinar' });
      if (!tg && ctx.world !== 'arinar') tg = { world: 'arinar', x: 24000, y: 24000, label: 'Чёрный маг бродит по Аринару' };
      break;
    }
    case 'ui': tg = nb; break;
  }
  return viaPortal(tg, ctx);
}
