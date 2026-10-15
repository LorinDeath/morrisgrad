// Выбор тела у Алтаря (portal_class_select → open_class_selection → select_class{classId}).
// Слева — полный портрет выбранного героя; справа — карточки, статы, экипировка и сумка из сохранения.
import { CLASSES } from '../classes.js';
import { RUN_CLASSES, ABILITIES, WEAPONS } from '../survivors/data.js';
import { HERO_NAMES, SLOTS, SLOT_ORDER, RARITIES } from '../../../../../server/meta/shared.ts';
import { ITEM_BY_ID, iconHtml } from '../meta/itemCards.js';
import { esc } from './overlay.js';

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
  }

  open(currentClassId) {
    this.isOpen = true;
    this.previewId = currentClassId && IDS.includes(currentClassId) ? currentClassId : IDS[0];
    this.currentClassId = currentClassId || null;
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
      const d = e && ITEM_BY_ID[e.id];
      const rar = d ? (RARITIES[d.rarity] || {}) : {};
      return `<div class="mc-altar-slot ${d ? 'filled' : ''}" title="${d ? esc(d.name) : esc(SLOTS[slot]) + ': пусто'}" ${d ? `style="border-color:${esc(rar.color || '#3b2c52')}"` : ''}>
        <span class="ic">${d ? iconHtml(d, 28) : '·'}</span>
        <small>${esc(SLOTS[slot])}</small>
        ${d ? `<b style="color:${esc(rar.color || '#e2e8f0')}">${esc(d.name)}</b>` : ''}
      </div>`;
    }).join('');

    const bag = (hs.bag || []).slice().sort((a, b) => {
      const ra = RARITIES[ITEM_BY_ID[a.id]?.rarity]?.order || 0;
      const rb = RARITIES[ITEM_BY_ID[b.id]?.rarity]?.order || 0;
      return rb - ra;
    });
    const bagHtml = bag.length
      ? bag.map((it) => {
          const d = ITEM_BY_ID[it.id];
          if (!d) return '';
          const rar = RARITIES[d.rarity] || {};
          return `<div class="mc-altar-item" title="${esc(d.name)}" style="border-color:${esc(rar.color || '#3b2c52')}">${iconHtml(d, 28)}</div>`;
        }).join('')
      : '<p class="mc-altar-empty">Сумка пуста</p>';

    const isCurrent = id === this.currentClassId;
    const acceptLabel = isCurrent ? 'Уже в этом теле' : `Принять тело · ${name}`;

    const html = `<div class="mc-altar">
      <div class="mc-altar-head"><h2>АЛТАРЬ ТЕЛ</h2>
        <p>Выберите тело. У каждого героя своё сохранение: уровень, таланты, сумка и надетое.</p></div>
      <div class="mc-altar-body">
        <aside class="mc-altar-portrait" style="--c:${esc(color)}">
          <img src="${PORTRAIT(id)}" alt="${esc(name)}" data-portrait="${esc(id)}">
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
