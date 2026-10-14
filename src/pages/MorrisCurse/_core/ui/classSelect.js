// Выбор тела у Алтаря (portal_class_select → open_class_selection → select_class{classId}).
// Классы приходят с сервера в welcome; к ним добавляются навыки/оружие забега из survivors/data.js.
import { CLASSES } from '../classes.js';
import { RUN_CLASSES, ABILITIES, WEAPONS } from '../survivors/data.js';
import { esc } from './overlay.js';

export class ClassSelect {
  constructor(overlay, getHeroes, onSave, onSelect) {
    this.ov = overlay;
    this.getHeroes = getHeroes; this.onSave = onSave;
    this.onSelect = onSelect;
    this.isOpen = false;
  }

  open(currentClassId) {
    this.isOpen = true;
    const ids = Object.keys(CLASSES).length ? Object.keys(CLASSES) : ['warrior', 'spearman', 'rogue', 'mage'];
    const cards = ids.map((id) => {
      const c = CLASSES[id] || {};
      const rc = RUN_CLASSES[id] || {};
      const ab = c.ability || {};
      const runAb = ABILITIES[rc.ability] || {};
      const w = WEAPONS[rc.startWeapon];
      const hs = this.getHeroes?.()?.[id];
      return `<button class="mc3d-class ${id === currentClassId ? 'active' : ''}" data-id="${esc(id)}" style="border-color:${id === currentClassId ? '' : esc(c.color || rc.color)}55">
        <div class="nm" style="color:${esc(c.color || rc.color)}">${esc(rc.hero || c.name || id)} <span style="font-size:11px;color:#cbd5e1">· ${esc(c.name || rc.name || id)}</span>${hs ? ` <span class="lv">ур. ${hs.lvl}</span>` : ''}</div>
        <div class="ds">❤️ ${c.maxHp ?? '?'} · 🛡️ ${c.armor ?? '?'} · ⚔️ ${c.minAtk ?? '?'}–${c.maxAtk ?? '?'}</div>
        <div class="sk">${runAb.icon || '✦'} ${esc(ab.name || runAb.name || '')} <span style="color:#94a3b8">(кд ${ab.cooldown ?? runAb.serverCooldown ?? '?'}с в мире / ${runAb.runCooldown ?? '?'}с в забеге)</span></div>
        <div class="ds">${esc(ab.desc || runAb.desc || '')}</div>
        ${w ? `<div class="ds">Оружие забега: ${w.icon} ${esc(w.name)}</div>` : ''}
        <div class="ds">${esc(rc.blurb || '')}</div>
      </button>`;
    }).join('');
    const el = this.ov.showScreen(`<h2>АЛТАРЬ ТЕЛ</h2><p>Выберите тело. У каждого героя своё сохранение: уровень, таланты, сумка и надетое. При смене души текущий герой сохраняется сразу.</p><div class="mc3d-classes">${cards}</div>`,
      [{ text: '💾 Сохранить сейчас', cls: 'gold mc-save-now', onClick: () => { this.onSave?.(); } }, { text: 'Закрыть [Esc]', cls: 'ghost', onClick: () => this.close() }], 'mc3d-class-screen');
    el.style.overflowY = 'auto';
    el.querySelectorAll('.mc3d-class').forEach((b) => {
      b.addEventListener('click', (e) => {
        e.stopPropagation();
        this.onSelect(b.dataset.id);
        this.close();
      });
    });
    this.el = el;
  }

  close() {
    if (this.isOpen && this.ov.screen === this.el) this.ov.hideScreen();
    this.isOpen = false;
  }
}
