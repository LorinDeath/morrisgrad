// Панель действий (низ по центру) — открытый мир и забег.
// Слоты: навыки раскладки (Q/G/F, 2–3; R — навык оружия), рывок (Space), базовая атака (ЛКМ, в мире); в забеге — ещё ряд оружия и пассивок.
// Каждый слот: пиксельная иконка 24 px (skill_icons.png, ×2), клавиша, радиальная «шторка» перезарядки + секунды,
// рамка цвета Сияния (жёлтое/красное/фиолетовое), состояния «пусто»/«закрыто», подсказка при наведении.
// Перезарядка навыков в мире — подтверждённая сервером (ability_cd), до подтверждения слот «ожидает».
import iconsSrc from '../../../../assets/mc/skill_icons.png';
import ICONS from '../../../../assets/mc/skill_icons.json';

const URL_ = typeof iconsSrc === 'object' && iconsSrc ? iconsSrc.src || iconsSrc.default || '' : iconsSrc;
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

export function skillIcon(id, px = 48, cls = '') {
  const n = ICONS.index[id] ?? ICONS.index.empty;
  const k = px / ICONS.cell, col = n % ICONS.cols, row = Math.floor(n / ICONS.cols);
  return `<i class="mc-sic ${cls}" style="width:${px}px;height:${px}px;background-image:url('${URL_}');background-size:${ICONS.cols * ICONS.cell * k}px auto;background-position:-${col * ICONS.cell * k}px -${row * ICONS.cell * k}px"></i>`;
}
export function hasSkillIcon(id) { return ICONS.index[id] !== undefined; }

export function radColor(rad) {
  if (!rad) return '#5b4a7a';
  return rad <= 3 ? '#facc15' : rad <= 6 ? '#ef4444' : '#a855f7';
}

export class ActionBar {
  constructor(layer, { onSlot } = {}) {
    const el = document.createElement('div');
    el.className = 'mc-abar';
    el.innerHTML = '<div class="mc-abar-run"></div><div class="mc-abar-main"></div>';
    layer.appendChild(el);
    this.el = el; this.runRow = el.querySelector('.mc-abar-run'); this.main = el.querySelector('.mc-abar-main');
    this.onSlot = onSlot; this.sig = ''; this.rsig = ''; this.slots = [];
    this.main.addEventListener('pointerdown', (e) => {
      const s = e.target.closest('.mc-as'); if (!s) return;
      e.preventDefault(); e.stopPropagation();
      if (s.dataset.slot !== undefined && s.dataset.slot !== '') this.onSlot?.(Number(s.dataset.slot), s.dataset.kind);
    });
  }

  show(on) { this.el.style.display = on ? '' : 'none'; }

  // list: [{kind:'ab'|'dash'|'atk', slot, id, key, name, desc, rad, locked, lockText, empty, cdLeft, cdTotal, pending}]
  setSlots(list) {
    const sig = list.map((s) => [s.kind, s.id, s.key, s.rad, s.locked ? 1 : 0, s.empty ? 1 : 0, s.name].join(':')).join('|');
    if (sig !== this.sig) {
      this.sig = sig;
      this.main.innerHTML = list.map((s) => {
        const icon = s.locked ? 'locked' : s.empty ? 'empty' : (hasSkillIcon(s.id) ? s.id : (s.kind === 'dash' ? 'dash' : s.kind === 'atk' ? 'attack' : 'empty'));
        const tip = s.locked ? `${s.name || 'Слот'} — ${s.lockText || 'закрыто'}` : s.empty ? `Слот ${s.key} пуст — назначьте навык в Книге (K)` : `${s.name}${s.rad ? ` · Сияние ${s.rad}` : ''}${s.cdTotal ? ` · перезарядка ${(+s.cdTotal).toFixed(1)} с` : ''}${s.desc ? `\n${s.desc}` : ''}`;
        return `<div class="mc-as ${s.kind} ${s.locked ? 'locked' : ''} ${s.empty ? 'empty' : ''}" data-slot="${s.slot ?? ''}" data-kind="${s.kind}" data-id="${esc(s.id || '')}" style="--rc:${s.kind === 'ab' ? radColor(s.rad) : s.kind === 'rs' ? '#fde68a' : s.kind === 'dash' ? '#38bdf8' : '#94a3b8'}">
          ${s.kind === 'rs' && s.icon && !s.locked ? `<span class="mc-as-emo">${s.icon}</span>` : skillIcon(icon, s.kind === 'ab' || s.kind === 'rs' ? 48 : 36)}<div class="sw"></div><span class="cd"></span><b class="key">${esc(s.key)}</b><div class="tip">${esc(tip).replace(/\n/g, '<br>')}</div></div>`;
      }).join('');
      this.slots = [...this.main.querySelectorAll('.mc-as')].map((e) => ({ e, sw: e.querySelector('.sw'), cd: e.querySelector('.cd'), p: -1, t: '', pend: null }));
    }
    list.forEach((s, i) => {
      const o = this.slots[i]; if (!o) return;
      const left = Math.max(0, s.cdLeft || 0), tot = Math.max(0.01, s.cdTotal || 0);
      const p = left > 0 ? Math.round(Math.min(1, left / tot) * 100) : 0;
      if (p !== o.p) { o.p = p; o.sw.style.background = p ? `conic-gradient(rgba(5,3,12,.72) ${p}%, transparent 0)` : 'none'; o.e.classList.toggle('oncd', p > 0); }
      const t = left > 0 ? (left >= 1 ? String(Math.ceil(left)) : left.toFixed(1)) : '';
      if (t !== o.t) { o.t = t; o.cd.textContent = t; }
      const pend = !!s.pending;
      if (pend !== o.pend) { o.pend = pend; o.e.classList.toggle('pending', pend); }
    });
  }

  // ряд забега: оружие и пассивки с уровнями
  setRun(weapons, passives, W, P) {
    if (!weapons) { if (this.rsig) { this.rsig = ''; this.runRow.innerHTML = ''; } return; }
    const sig = Object.entries(weapons).map(([k, v]) => k + v.lv).join() + '/' + Object.entries(passives || {}).map(([k, v]) => k + v).join();
    if (sig === this.rsig) return;
    this.rsig = sig;
    const cell = (id, ic, name, lv, kind) => `<div class="mc-rs ${kind}" title="${esc(name)} — ур. ${lv}">${hasSkillIcon(id) ? skillIcon(id, 32) : `<span>${ic}</span>`}<b>${lv}</b></div>`;
    this.runRow.innerHTML = Object.entries(weapons).map(([k, v]) => cell('w_' + k, W[k]?.icon, W[k]?.name || k, v.lv, 'w')).join('')
      + (Object.keys(passives || {}).length ? '<i class="sep"></i>' : '')
      + Object.entries(passives || {}).map(([k, v]) => cell('p_' + k, P[k]?.icon, P[k]?.name || k, v, 'p')).join('');
  }
}
