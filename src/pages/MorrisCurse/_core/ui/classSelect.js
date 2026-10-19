import { upBadge } from './upBadge.js';
import { curseDef, curseTint, itemColor, itemCls, itemStyle, gems, lookBadges } from './book.js';
import { glowK } from '../meta/curseCfg.js';
// Выбор тела у Алтаря (portal_class_select → open_class_selection → select_class{classId}).
// Слева — полный портрет выбранного героя; справа — карточки, статы, экипировка и сумка из сохранения.
import { CLASSES } from '../classes.js';
import { RUN_CLASSES, ABILITIES, WEAPONS } from '../survivors/data.js';
import { HERO_NAMES, SLOTS, SLOT_ORDER, RARITIES } from '../../../../../server/meta/shared.ts';
import { ITEM_BY_ID, iconHtml } from '../meta/itemCards.js';
import { esc } from './overlay.js';
import { itemStatsHtml } from './book.js';

const IDS = ['warrior', 'spearman', 'rogue', 'mage'];
const PORTRAIT = (id) => `/mc-vn/${id}/full.webp`;
const ICON = (id) => `/mc-vn/${id}/icon.webp`;

export class ClassSelect {
  constructor(overlay, getHeroes, onSave, onSelect) {
    this.ov = overlay;
    this.getHeroes = getHeroes; this.onSave = onSave;
    this.onSelect = onSelect;
    this.isOpen = false;
    this.previewId = null;
    this.tipKey = null; // ключ выбранного слота/сумки для карточки статов
  }

  open(currentClassId) {
    this.isOpen = true;
    this.previewId = currentClassId && IDS.includes(currentClassId) ? currentClassId : IDS[0];
    this.currentClassId = currentClassId || null;
    this.tipKey = null;
    this.render();
  }

  heroes() { return this.getHeroes?.() || {}; }

  render() {
    const id = this.previewId;
    const heroes = this.heroes();
    const hs = heroes[id] || {};
    const c = CLASSES[id] || {};
    const rc = RUN_CLASSES[id] || {};
    const color = c.color || rc.color || '#c4b5fd';
    const name = HERO_NAMES[id] || rc.hero || c.name || id;
    const clsName = c.name || rc.name || id;
    const eff = hs.effective || null;
    const lvl = hs.lvl || 1;
    const hp = eff?.maxHp ?? c.maxHp ?? '?';
    const armor = eff?.armor ?? c.armor ?? '?';
    const dr = eff?.damageReduction != null ? Math.round(eff.damageReduction * 100) : null;
    const atkMin = eff?.weaponMin ?? c.minAtk ?? '?';
    const atkMax = eff?.weaponMax ?? c.maxAtk ?? '?';
    const ab = c.ability || {};
    const runAb = ABILITIES[rc.ability] || {};
    const w = WEAPONS[rc.startWeapon];

    const cards = IDS.map((hid) => {
      const hc = CLASSES[hid] || {};
      const hr = RUN_CLASSES[hid] || {};
      const hh = heroes[hid] || {};
      const col = hc.color || hr.color || '#94a3b8';
      const nm = HERO_NAMES[hid] || hr.hero || hc.name || hid;
      const on = hid === id;
      const worn = hid === this.currentClassId;
      return `<button type="button" class="mc-altar-card ${on ? 'on' : ''} ${worn ? 'worn' : ''}" data-id="${esc(hid)}" style="--c:${esc(col)}">
        <img class="mc-altar-card-ic" src="${ICON(hid)}" alt="" loading="lazy">
        <span class="nm" style="color:${esc(col)}">${esc(nm)}</span>
        <span class="lv">ур. ${hh.lvl || 1}</span>
        ${worn ? '<span class="tag">на вас</span>' : ''}
      </button>`;
    }).join('');

    const equip = hs.equip || {};
    const slots = SLOT_ORDER.map((slot) => {
      const e = equip[slot];
      const d = e && curseDef(ITEM_BY_ID[e.id], e);
      const rar = d ? { color: itemColor(d) } : {};
      const on = this.tipKey === `eq:${slot}`;
      const tip = d ? `data-tip="eq:${slot}" data-item="${esc(d.id)}"` : '';
      return `<button type="button" class="mc-altar-slot ${d ? 'filled' : ''}${itemCls(d)} ${on ? 'on' : ''}" ${tip} title="${d ? esc(d.name) + ' — статы' : esc(SLOTS[slot]) + ': пусто'}" ${d ? `style="border-color:${esc(rar.color || '#3b2c52')};${itemStyle(d)}"` : ''}>${gems(d)}
        <span class="ic">${d ? iconHtml(d, 28) + upBadge(e.up, e.cursed) : '·'}</span>
        <small>${esc(SLOTS[slot])}</small>
        ${d ? `<b style="color:${esc(rar.color || '#e2e8f0')}">${esc(d.name)}</b>` : ''}
      </button>`;
    }).join('');

    const bag = (hs.bag || []).slice().sort((a, b) => {
      const ra = RARITIES[ITEM_BY_ID[a.id]?.rarity]?.order || 0;
      const rb = RARITIES[ITEM_BY_ID[b.id]?.rarity]?.order || 0;
      return rb - ra;
    });
    const bagHtml = bag.length
      ? bag.map((it) => {
          const d = curseDef(ITEM_BY_ID[it.id], it);
          if (!d) return '';
          const rar = { color: itemColor(d) };
          const on = this.tipKey === `bag:${it.uid}`;
          return `<button type="button" class="mc-altar-item filled${itemCls(d)} ${on ? 'on' : ''}" data-tip="bag:${esc(it.uid)}" data-item="${esc(d.id)}" title="${esc(d.name)} — статы" style="border-color:${esc(rar.color || '#3b2c52')};${itemStyle(d)}">${gems(d)}${iconHtml(d, 28)}${upBadge(it.up, it.cursed)}</button>`;
        }).join('')
      : '<p class="mc-altar-empty">Сумка пуста</p>';

    // карточка статов (только просмотр — с алтаря нельзя надеть/снять)
    let tipHtml = '';
    if (this.tipKey) {
      let inst = null;
      if (this.tipKey.startsWith('eq:')) {
        const slot = this.tipKey.slice(3);
        inst = equip[slot] || null;
      } else if (this.tipKey.startsWith('bag:')) {
        const uid = this.tipKey.slice(4);
        inst = bag.find((i) => String(i.uid) === uid) || null;
      }
      const d = inst && curseDef(ITEM_BY_ID[inst.id], inst);
      if (d) {
        const rar = { color: itemColor(d), name: (RARITIES[d.rarity] || RARITIES.common).name };
        tipHtml = `<div class="mc-altar-tip"><div class="nm" style="color:${esc(rar.color)}">${iconHtml(d, 28)} ${esc(d.name)}</div>
          <div class="rr">${lookBadges(d)}${esc(rar.name)} · ${esc(SLOTS[d.slot] || d.slot)} · ур. ${d.lvl || 1}</div>
          <div class="ss">${itemStatsHtml(d) || '<span class="mc-altar-empty">без статов</span>'}</div>
          <div class="fx">Требуется уровень героя: ${Math.max(1, d.req || 1, d.lvl || 1)}. Только просмотр — надеть/снять в Книге (I).</div>
          ${d.lore ? `<div class="lore">${esc(d.lore)}</div>` : ''}</div>`;
      } else {
        this.tipKey = null;
      }
    }

    const isCurrent = id === this.currentClassId;
    const acceptLabel = isCurrent ? 'Уже в этом теле' : `Принять тело · ${name}`;

    const html = `<div class="mc-altar">
      <div class="mc-altar-head"><h2>АЛТАРЬ ТЕЛ</h2>
        <p>Выберите тело. У каждого героя своё сохранение: уровень, таланты, сумка и надетое.</p></div>
      <div class="mc-altar-body">
        <aside class="mc-altar-portrait" style="--c:${esc(color)}">
          <img src="${PORTRAIT(id)}" alt="${esc(name)}" data-portrait="${esc(id)}" ${(() => { const cg = eff?.cursedGlow | 0, k = glowK(cg), bk = Math.max(0, Math.min(100, eff?.blkVis | 0)) / 100; const bf = bk ? `brightness(${Math.round((1 - 0.75 * bk) * 100) / 100}) saturate(${Math.round((1 - 0.6 * bk) * 100) / 100}) ` : ''; // очернение — темнее/серее
            if (!k) return bf ? `style="filter:${bf}"` : ''; const c = curseTint(); // свечение проклятия по контуру портрета (drop-shadow повторяет альфу)
            return `class="mc-cursed-glow ${cg >= 5 ? 'pulse' : ''}" style="filter:${bf}drop-shadow(0 0 ${Math.round(2 + 6 * k)}px ${c}) drop-shadow(0 0 ${Math.round(1 + 3 * k)}px ${c}) drop-shadow(0 0 1px ${c})"`; })()}>
          <div class="mc-altar-pname" style="color:${esc(color)}">${esc(name)} <small>· ${esc(clsName)}</small></div>
        </aside>
        <div class="mc-altar-right">
          <div class="mc-altar-cards">${cards}</div>
          <div class="mc-altar-panels">
            <section class="mc-altar-panel mc-altar-stats">
              <h3>Характеристики · ур. ${lvl}</h3>
              <div class="mc-altar-kv">
                <span>❤️ Здоровье</span><b>${hp}</b>
                <span>🛡️ Защита</span><b>${armor}${dr != null ? ` <small>(−${dr}%)</small>` : ''}</b>
                <span>⚔️ Атака</span><b>${atkMin}–${atkMax}</b>
                <span>🧬 Класс</span><b style="color:${esc(color)}">${esc(clsName)}</b>
                ${eff?.dmgPct ? `<span>💥 Урон</span><b>+${eff.dmgPct}%</b>` : ''}
                ${eff?.critPct ? `<span>✦ Крит</span><b>${eff.critPct}%</b>` : ''}
              </div>
              <div class="mc-altar-skill">${runAb.icon || '✦'} ${esc(ab.name || runAb.name || '')}
                <small>${esc(ab.desc || runAb.desc || '')}</small>
                ${w ? `<small>Оружие забега: ${w.icon} ${esc(w.name)}</small>` : ''}
              </div>
            </section>
            <section class="mc-altar-panel">
              <h3>Надето</h3>
              <div class="mc-altar-slots">${slots}</div>
              ${tipHtml}
            </section>
            <section class="mc-altar-panel mc-altar-bag">
              <h3>Сумка <small>${bag.length}</small></h3>
              <div class="mc-altar-items">${bagHtml}</div>
            </section>
          </div>
        </div>
      </div>
    </div>`;

    const btns = [
      { text: acceptLabel, cls: `gold mc-altar-accept${isCurrent ? ' dim' : ''}`, onClick: () => {
        if (isCurrent) { this.close(); return; }
        this.onSelect(id);
        this.close();
      } },
      { text: '💾 Сохранить сейчас', cls: 'gold mc-save-now', onClick: () => { this.onSave?.(); } },
      { text: 'Закрыть [Esc]', cls: 'ghost', onClick: () => this.close() },
    ];

    const el = this.ov.showScreen(html, btns, 'mc3d-class-screen mc-altar-screen');
    // На весь game-screen поверх боковых панелей HUD (слой оверлея покрывает только канвас)
    const host = this.ov.container;
    if (host && el.parentElement !== host) host.appendChild(el);
    el.style.overflowY = 'auto';
    el.querySelectorAll('.mc-altar-card').forEach((b) => {
      b.addEventListener('click', (e) => {
        e.stopPropagation();
        const next = b.dataset.id;
        if (next === this.previewId) return;
        this.previewId = next;
        this.tipKey = null;
        this.render();
      });
    });
    el.querySelectorAll('[data-tip]').forEach((b) => {
      b.addEventListener('click', (e) => {
        e.stopPropagation();
        const k = b.dataset.tip;
        this.tipKey = this.tipKey === k ? null : k;
        this.render();
      });
    });
    this.el = el;
  }

  close() {
    if (this.isOpen && this.ov.screen === this.el) this.ov.hideScreen();
    this.isOpen = false;
  }
}
