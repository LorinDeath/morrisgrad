// Окно «Улучшение у Петра»: портрет Петра, вещи героя, стоимость (материал уровня ×3; проклятая — ×2 и второй материал),
// статы сейчас → после с ▲. Всё решает сервер (item_upgrade): провалов и поломок нет — хватает материалов, значит +1.
import { esc } from './overlay.js';
import { ITEM_BY_ID, iconHtml } from '../meta/itemCards.js';
import { RARITIES, SLOTS, RESOURCES } from '../../../../../server/meta/shared.ts';
import { UPG, upgCost, upgStats, isPctStat } from '../../../../../server/meta/upgrade.ts';
import { vnImg } from '../../../../../server/meta/vnChars.ts';
import { curseDef, curseTint, itemColor, itemCls, itemStyle, gems, lookBadges } from './book.js';
import { ENCH } from '../meta/enchCfg.js';
import { statIcon } from './statIcons.js';
import { upBadge } from './upBadge.js';

const LBL = { dmgMin: 'Урон (мин)', dmgMax: 'Урон (макс)', hp: 'Здоровье', armor: 'Броня', critPct: 'Крит, %', speedPct: 'Скорость, %', regen: 'Регенерация/с', cdrPct: 'Перезарядка −%',
  magnetPct: 'Радиус сбора, %', lifestealPct: 'Вампиризм, %', atkSpeedPct: 'Скорость атаки, %', dmgPct: 'Урон, %', armorPen: 'Пробитие брони', armorPenPct: 'Пробитие брони, %' };
const SAY = { idle: 'Неси вещь — сделаю крепче. Мне нужен материал: каждый уровень — свой.', ok: 'Держи. Крепче прежнего.', max: 'Дальше некуда — это предел.', need: 'Материала не хватает. Сначала добудь.' };
const fmt = (v) => (Number.isInteger(v) ? String(v) : String(Math.round(v * 100) / 100));

export class UpgradeWin {
  constructor(overlay, meta, { nearPetr }) {
    this.ov = overlay; this.meta = meta; this.nearPetr = nearPetr; this.isOpen = false; this.sel = null; this.say = SAY.idle; this.emo = 'calm';
    const el = document.createElement('div'); el.className = 'mc-upg'; el.style.display = 'none'; overlay.layer.appendChild(el); this.el = el;
    el.addEventListener('pointerdown', (e) => e.stopPropagation());
    el.addEventListener('wheel', (e) => e.stopPropagation(), { passive: true });
    el.addEventListener('click', (e) => this.onClick(e));
    meta.on(() => { if (this.isOpen) this.render(); });
  }
  open() { this.isOpen = true; this.el.style.display = ''; this.say = SAY.idle; this.emo = 'calm'; this.render(); }
  close() { this.isOpen = false; this.el.style.display = 'none'; }
  onResult(d) {
    if (!this.isOpen) return;
    if (d.ok) { this.say = d.up >= UPG.maxLvl ? SAY.max : `${SAY.ok} Теперь +${d.up}.`; this.emo = 'determined'; this.flash = Date.now(); }
    else { this.say = d.err || SAY.need; this.emo = 'anger'; }
    this.busy = false; this.render();
  }
  onClick(e) {
    const b = e.target.closest('[data-u]'); if (!b) return; e.stopPropagation();
    const a = b.dataset.u, v = b.dataset.v;
    if (a === 'x') return this.close();
    if (a === 'sel') { this.sel = v; this.say = SAY.idle; this.emo = 'calm'; return this.render(); }
    if (a === 'go' && !this.busy) {
      const it = this.meta.account?.inv.find((i) => i.uid === v); if (!it) return;
      this.busy = true; this.meta.upgrade(v, it.up | 0); setTimeout(() => { this.busy = false; }, 1500);
    }
  }
  items() {
    const a = this.meta.account, h = this.meta.hero; if (!a) return [];
    const worn = new Set(Object.values(h?.equip || {}));
    return a.inv.filter((i) => ITEM_BY_ID[i.id]).map((i) => ({ it: i, worn: worn.has(i.uid) }))
      .sort((x, y) => +y.worn - +x.worn || (y.it.up | 0) - (x.it.up | 0) || (RARITIES[ITEM_BY_ID[y.it.id].rarity]?.order || 0) - (RARITIES[ITEM_BY_ID[x.it.id].rarity]?.order || 0));
  }
  render() {
    const a = this.meta.account, list = this.items();
    if (!this.sel || !list.some((x) => x.it.uid === this.sel)) this.sel = list[0]?.it.uid || null;
    const col = itemColor;
    const cells = list.map(({ it, worn }) => { const d = curseDef(ITEM_BY_ID[it.id], it);
      return `<button class="mc-item${itemCls(d)} ${this.sel === it.uid ? 'on' : ''} ${worn ? 'eq' : ''}" data-u="sel" data-v="${it.uid}" style="border-color:${col(d)};${itemStyle(d)}">${gems(d)}${iconHtml(d, 32)}${upBadge(it.up, it.cursed)}${it.lk ? '<i class="mc-lk">🔒</i>' : ''}</button>`; }).join('');
    let right = '<p class="mc-dim">В сумке нет вещей.</p>';
    const sel = this.sel && list.find((x) => x.it.uid === this.sel);
    if (sel) {
      const it = sel.it, d = curseDef(ITEM_BY_ID[it.id], it), up = it.up | 0, max = UPG.maxLvl | 0, cz = !!it.cursed, en = d.ench | 0, T = en ? ENCH.tiers[en - 1] : null;
      const base = d.baseStats || d.stats || {}, next = up < max ? upgStats(base, up + 1, cz, UPG, en) : null, cost = up < max ? upgCost(up + 1, cz, UPG, en) : null;
      const rows = Object.keys(base).filter((k) => typeof base[k] === 'number' && base[k]).map((k) => {
        const c = d.stats[k], n = next?.[k], dv = n != null ? Math.round((n - c) * 100) / 100 : 0;
        return `<tr><td>${statIcon(k)}${esc(LBL[k] || k)}</td><td><b>${fmt(c)}</b></td>${next ? `<td>→</td><td><b class="${dv > 0 ? 'up' : ''}">${fmt(n)}</b> ${dv > 0 ? `<span class="up">▲ +${fmt(dv)}</span>` : '<span class="mc-dim">=</span>'}</td>` : ''}</tr>`; }).join('');
      const can = cost && Object.entries(cost).every(([r, n]) => (a.res?.[r] || 0) >= n);
      const costHtml = cost ? Object.entries(cost).map(([r, n]) => { const have = a.res?.[r] || 0; return `<div class="cost ${have >= n ? 'ok' : 'no'}">${RESOURCES[r]?.icon || '•'} ${esc(RESOURCES[r]?.name || r)} <b>${have}/${n}</b></div>`; }).join('') : '';
      const per = cz ? `+${UPG.cFlatPct}% к числам и +${UPG.cPctPts} п.п. к процентам за уровень${T ? ` · зачарование «${esc(T.name)}»: ещё +${T.upPct}% ко всем характеристикам` : ''}` : T ? `зачарование «${esc(T.name)}»: +${T.upPct}% ко всем характеристикам за уровень` : `+${UPG.flatPct}% к числам и +${UPG.pctPts} п.п. к процентам за уровень`;
      right = `<div class="nm" style="color:${col(d)}">${iconHtml(d, 32)} ${esc(up ? d.name.replace(/ \+\d+$/, '') : d.name)}${upBadge(up, cz, true)}</div>
        <div class="rr">${lookBadges(d)}${esc(RARITIES[d.rarity]?.name || '')} · ${esc(SLOTS[d.slot] || '')} · ур. ${d.lvl || 1}${sel.worn ? ' · <i>надето</i>' : ''}</div>
        <div class="lv"><span>Улучшение: <b>+${up}</b> / +${max}</span><span class="bar"><i style="width:${max ? (up / max) * 100 : 0}%"></i></span></div>
        <table class="st">${rows || '<tr><td class="mc-dim">Без характеристик</td></tr>'}</table>
        <div class="per mc-dim">${per}${cz ? ' · проклятая: материалов ×' + UPG.cursedMult + ' и второй материал' : ''}${T ? ` · ${cz ? '+' : ''}материалов ×${T.matMult} за ярус` : ''}. Итог героя — с учётом капов.</div>
        ${cost ? `<div class="h">Нужно для +${up + 1}:</div>${costHtml}
          <button class="mc-btn gold big" data-u="go" data-v="${it.uid}" ${can && !this.busy ? '' : 'disabled'}>🔨 Улучшить до +${up + 1}</button>
          <div class="mc-dim sm">Улучшение всегда успешно — провалов и поломок нет.</div>` : `<div class="h">Достигнут предел +${max}.</div>`}`;
    }
    const fl = this.flash && Date.now() - this.flash < 900 ? 'flash' : '';
    this.el.innerHTML = `<div class="mc-upg-box ${fl}"><div class="hd"><b>⚒ Кузня Петра · Улучшение</b><button class="mc-book-x" data-u="x" title="Закрыть (Esc)">✕</button></div>
      <div class="bd"><aside class="pt"><img src="${vnImg('petr', this.emo)}" alt="Пётр" onerror="this.src='${vnImg('petr', 'calm')}'"><div class="say">«${esc(this.say)}»</div></aside>
      <section class="ls"><div class="h">Вещи героя · ${list.length}</div><div class="mc-bag">${cells}</div></section>
      <section class="dt">${right}</section></div></div>`;
  }
}
