// Книга → ☠ «Последние смерти» (t1053u): кто бил героя перед гибелью, чем, сколько и какой % макс. ОЗ — коротко, значками.
// Данные — сервер (server/meta/deathLog.ts, только память воркера): { at, mx, world, duel?, hits: [{ ago, k, w, h, d, el?, p?, c?, b?, z? }] }.
import { MOB_INFO } from '../../../../../server/meta/shared.ts';
import { ELEM_COLOR, BP_ELEM_ICONS, ELEMENTS } from '../../../../../server/meta/blackArt.ts';
import { WORLD_NAMES } from '../../../../../server/meta/mobHome.ts';
import { esc } from './overlay.js';

const CAST = { meteor: 'Метеор', ice_fan: 'Ледяной веер', spear_rain: 'Дождь копий', war_axe: 'Боевой топор', glyph_mine: 'Руна-мина', plague_puddle: 'Чумная лужа', auto_daggers: 'Кинжалы',
  circle: 'Круг', nova: 'Взрыв', ring: 'Кольцо', line: 'Луч' };
const PROJ = { fireball: 'Огненный шар', fire_spark: 'Искра', ice_bolt: 'Ледяная стрела', arrow: 'Стрела', bolt: 'Болт', rock: 'Камень', spit: 'Плевок', bone: 'Кость', web: 'Паутина' };
const DOT = { burn: ['🔥', 'Горение'], poison: ['🧪', 'Яд'], bleed: ['🩸', 'Кровотечение'], shock: ['⚡', 'Разряд'], chill: ['❄', 'Холод'] };
const ELN = Object.fromEntries(ELEMENTS.map((e) => [e.id, e.name]));

/** чем ударили: [значок, название] */
export function howOf(h) {
  const s = String(h.h || ''), [a, b] = s.split(':');
  if (h.k === 'e') return a === 'expl' ? ['💥', 'Взрыв мага'] : ['🏹', 'Стрела мага'];
  if (a === 'dot') return DOT[b] || ['☣', 'Урон со временем'];
  if (h.b && h.el) { const ic = BP_ELEM_ICONS[h.el] || '🜏'; return a === 'swing' || a === 'melee' ? [ic, `Чёрный взмах · ${ELN[h.el] || h.el}`] : [ic, `Чёрный снаряд · ${ELN[h.el] || h.el}`]; }
  if (a === 'proj') return [b === 'fireball' ? '🔥' : '🏹', PROJ[b] || 'Снаряд'];
  if (a === 'cast') return ['☄', CAST[b] || 'Умение'];
  if (a === 'aux') return ['✴', 'Осколок'];
  if (a === 'dash') return ['💨', 'Рывок'];
  if (a === 'swing') return ['⚔', 'Взмах'];
  if (a === 'pvp_r') return ['🏹', 'Выстрел'];
  if (a === 'duel') return ['⚔', 'Удар (дуэль)'];
  return ['🗡', 'Удар'];
}
/** кто: [значок, имя] */
export function whoOf(h) {
  if (h.k === 'p') return ['👤', h.w];
  if (h.k === 'e') return ['🜏', 'Чёрный маг'];
  const mi = MOB_INFO[h.w]; return [mi?.boss ? '👑' : '👹', h.n || mi?.name || h.w];
}
const ago = (ms) => { const s = Math.max(0, Math.round((Date.now() - ms) / 1000)); return s < 60 ? `${s} с назад` : s < 3600 ? `${Math.round(s / 60)} мин назад` : `${Math.round(s / 3600)} ч назад`; };
const pct = (d, mx) => (mx > 0 ? Math.max(d > 0 ? 1 : 0, Math.round(d / mx * 100)) : 0);

/** HTML вкладки; list — с сервера (новые первыми) */
export function deathLogHtml(list) {
  if (!list) return '<p class="mc-dim">Загрузка…</p>';
  if (!list.length) return '<div class="mc-dl"><p class="mc-dim">Смертей пока нет (хранятся последние 5 за время работы сервера). Здесь видно, кто, чем и сколько нанёс за 30 с до гибели.</p></div>';
  return `<div class="mc-dl">${list.map((r, i) => {
    const hits = [...(r.hits || [])].sort((a, b) => b.ago - a.ago); // по времени: первый удар сверху, добивающий внизу
    const tot = hits.reduce((s, h) => s + (h.d || 0), 0), last = hits[hits.length - 1];
    const by = new Map(); for (const h of hits) { const [, n] = whoOf(h); by.set(n, (by.get(n) || 0) + h.d); }
    const top = [...by.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3).map(([n, d]) => `${esc(n)} <b>${pct(d, r.mx)}%</b>`).join(' · ');
    const [kwi, kwn] = last ? whoOf(last) : ['❔', '—'], [khi, khn] = last ? howOf(last) : ['', ''];
    return `<details class="mc-dl-d" ${i === 0 ? 'open' : ''}><summary>
      <span class="mc-dl-k">☠ ${kwi} ${esc(kwn)} <span class="mc-dim">· ${khi} ${esc(khn)}</span></span>
      <span class="mc-dl-m">${r.duel ? '⚔ дуэль · ' : ''}${esc(WORLD_NAMES[r.world] || r.world || '')} · ${ago(r.at)} · ОЗ ${r.mx}</span>
      ${top ? `<span class="mc-dl-t">${top}</span>` : ''}</summary>
      <div class="mc-dl-rows">${hits.map((h) => {
        const [wi, wn] = whoOf(h), [hi, hn] = howOf(h), col = h.el ? ELEM_COLOR[h.el] || '#fca5a5' : '#fca5a5';
        return `<div class="mc-dl-r${h === last ? ' kill' : ''}" title="${esc(`${wn} — ${hn}: ${h.d} (${pct(h.d, r.mx)}% макс. ОЗ)${h.p ? `, из них чистого ${h.p}` : ''}${h.c ? ', крит' : ''}`)}">
          <span class="mc-dl-a">−${(h.ago / 1000).toFixed(1)}с</span>
          <span class="mc-dl-w">${hi} ${esc(hn)} <span class="mc-dim">· ${wi} ${esc(wn)}</span></span>
          <span class="mc-dl-n" style="color:${col}">${h.c ? '✦' : ''}${h.z ? '0' : h.d}${h.p ? `<small> (${BP_ELEM_ICONS[h.el] || '✦'}${h.p})</small>` : ''}</span>
          <span class="mc-dl-p">${pct(h.d, r.mx)}%</span></div>`;
      }).join('') || '<p class="mc-dim">Ударов не записано</p>'}</div>
      <div class="mc-dl-f mc-dim">Всего ${tot} урона за ${hits.length ? (hits[0].ago / 1000).toFixed(1) : 0} с · ${pct(tot, r.mx)}% макс. ОЗ</div>
    </details>`;
  }).join('')}</div>`;
}
