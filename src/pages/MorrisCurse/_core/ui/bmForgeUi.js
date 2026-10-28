// «Чёрная магия», этап Б — окно «🔥 Кузня Знахаря» (Альказак): Детали (из кусочков чертежа) · Сборка (живое превью, имя) · Разбор.
// Всё решает сервер (bm_forge_*, salvage): клиент показывает витрину из ответа bm_forge и просит. Огненный стиль; арт — заглушки.
import { BM_PARTS, BM_KEYS, BM_NAMES, BP_TYPES, BP_TYPE_NAMES, computeArtifact } from '../../../../../server/meta/blackArt.ts';
import { RESOURCES } from '../../../../../server/meta/shared.ts';
import { ITEM_BY_ID } from '../meta/itemCards.js';
import { esc } from './overlay.js';
import { bmCss, fmtBm, isArtItem } from './bmArtUi.js';
import { WeaponPreview, drawWeapon } from './bmWeaponArt.js';

const CSS = `
.bmf{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;z-index:60;background:#0008}
.bmf-box{width:min(940px,96vw);max-height:92vh;overflow:auto;border-radius:12px;border:1px solid #a8320f;color:#ffe9d0;
  background:radial-gradient(120% 80% at 50% 120%,#5c1a0b 0%,#1a0d08 55%,#0b0604 100%);box-shadow:0 0 40px #ff3d0044,inset 0 0 30px #00000088;font:13px/1.35 system-ui,sans-serif}
.bmf-hd{display:flex;align-items:center;gap:10px;padding:10px 14px;border-bottom:1px solid #5c1a0b;background:linear-gradient(#2a0f06,#160905)}
.bmf-hd b{font-size:16px;color:#ffb347;text-shadow:0 0 8px #ff3d00}
.bmf-hd .sp{flex:1}
.bmf-tabs{display:flex;gap:6px;padding:8px 14px 0}
.bmf-tab{background:#1a0d08;border:1px solid #5c1a0b;color:#fdba74;border-radius:6px 6px 0 0;padding:5px 12px;cursor:pointer}
.bmf-tab.on{background:#3a1206;color:#ffe08a;border-color:#ff6a1a}
.bmf-bd{display:grid;grid-template-columns:170px 1fr;gap:12px;padding:12px 14px}
@media (max-width:720px){.bmf-bd{grid-template-columns:1fr}}
.bmf-npc{text-align:center}
.bmf-npc .av{width:120px;height:120px;margin:0 auto;border-radius:50%;background:radial-gradient(circle at 50% 60%,#ffb347 0%,#ff6a1a 30%,#5c1a0b 70%);display:flex;align-items:center;justify-content:center;font-size:54px;box-shadow:0 0 22px #ff6a1a88;animation:bmfPulse 2.2s ease-in-out infinite}
.bmf-npc .say{margin-top:8px;font-style:italic;color:#fdba74;font-size:12px}
.bmf-npc .res{margin-top:10px;text-align:left;font-size:12px;border-top:1px solid #5c1a0b;padding-top:6px}
.bmf-npc .res div{display:flex;justify-content:space-between}
.bmf-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(210px,1fr));gap:8px}
.bmf-part{border:1px solid #5c1a0b;border-radius:8px;padding:8px;background:#140904;position:relative}
.bmf-part.can{border-color:#ff6a1a}
.bmf-part h5{margin:0 0 4px;color:#ffb347;font-size:13px}
.bmf-part .st{font-size:11px;color:#fde3c0;opacity:.9}
.bmf-part .cost{font-size:12px;margin:4px 0}.bmf-part .cost.no{color:#fca5a5}.bmf-part .cost.ok{color:#86efac}
.bmf-part .have{position:absolute;top:6px;right:8px;color:#ffe08a;font-weight:700}
.bmf-h{margin:8px 0 4px;color:#ffb347;font-weight:700}
.bmf-slots{display:grid;grid-template-columns:1fr 1fr;gap:6px}
.bmf-slot{display:flex;flex-direction:column;gap:2px;font-size:12px}
.bmf-slot select,.bmf-name{background:#1a0d08;color:#ffe9d0;border:1px solid #a8320f;border-radius:5px;padding:4px}
.bmf-slot.req span::after{content:' *';color:#ff6a1a}
.bmf-asm{display:grid;grid-template-columns:260px 1fr;gap:12px}
@media (max-width:720px){.bmf-asm{grid-template-columns:1fr}}
.bmf-cv{width:260px;height:260px;border-radius:10px;border:1px solid #a8320f;display:block}
.bmf-stats .bm-row{font-size:12px}
.bmf-stats b{color:#ffe08a}
.bmf-err{color:#fca5a5;font-size:12px;min-height:16px}
.bmf-ok{color:#86efac}
.bmf-btn{background:linear-gradient(#ff7a1a,#a8320f);color:#fff7e6;border:1px solid #ffb347;border-radius:6px;padding:6px 14px;font-weight:700;cursor:pointer;text-shadow:0 1px 0 #0006}
.bmf-btn[disabled]{opacity:.45;cursor:default}
.bmf-btn.sm{padding:2px 8px;font-size:12px}
.bmf-btn.dark{background:#2a0f06;border-color:#a8320f}
.bmf-salv{display:flex;align-items:center;gap:8px;border:1px solid #5c1a0b;border-radius:8px;padding:6px 8px;margin:4px 0;background:#140904}
.bmf-salv canvas{width:44px;height:44px;border-radius:6px;background:#1a0d08}
.bmf-salv .nm{flex:1}
.bmf-done{animation:bmfDone 1.2s ease-out}
@keyframes bmfPulse{0%,100%{box-shadow:0 0 18px #ff6a1a66}50%{box-shadow:0 0 30px #ffb347aa}}
@keyframes bmfDone{0%{box-shadow:0 0 0 #ffe08a}30%{box-shadow:0 0 50px #ffe08a}100%{box-shadow:0 0 40px #ff3d0044}}
`;
let cssOn = false;
const css = () => { if (cssOn || typeof document === 'undefined') return; cssOn = true; const s = document.createElement('style'); s.id = 'bm-forge-css'; s.textContent = CSS; document.head.appendChild(s); };
const SAY = { idle: 'Огонь помнит форму. Принеси кусочки чертежа — выкую деталь, а из деталей — оружие.', craft: 'Деталь готова. Тёплая ещё.', build: 'Готово. Назови — и оно твоё.', salv: 'Разобрал. Осколки огня сохрани.', err: 'Не выйдет. Посмотри, чего не хватает.' };
const statLine = (st) => BM_KEYS.filter((k) => st?.[k]).map((k) => `${BM_NAMES[k].icon} ${fmtBm(k, st[k])}`).join(' · ');

export class BmForgeWin {
  constructor(overlay, meta, send) {
    css(); bmCss();
    this.ov = overlay; this.meta = meta; this.send = send; this.isOpen = false; this.tab = 'parts'; this.st = null; this.sel = { handle: '', blade: '', blade2: '', blade3: '', crystal: '' };
    this.name = ''; this.err = ''; this.say = SAY.idle; this.confirm = null;
    const el = document.createElement('div'); el.className = 'bmf'; el.style.display = 'none'; overlay.layer.appendChild(el); this.el = el;
    el.addEventListener('pointerdown', (e) => e.stopPropagation());
    el.addEventListener('keydown', (e) => e.stopPropagation());
    el.addEventListener('wheel', (e) => e.stopPropagation(), { passive: true });
    el.addEventListener('click', (e) => this.onClick(e));
    el.addEventListener('change', (e) => this.onChange(e));
    el.addEventListener('input', (e) => { if (e.target.matches('.bmf-name')) { this.name = e.target.value; this.err = ''; const er = this.el.querySelector('.bmf-err'); if (er) er.textContent = ''; const bb = this.el.querySelector('[data-f="build"]'); if (bb) bb.disabled = !(this.el.querySelector('.bmf-cv') && this.sel.handle && this.sel.blade && this.name.trim().length >= 2); } }); // кнопка оживает по мере ввода (без перерисовки — фокус не теряется)
    meta.on(() => { if (this.isOpen && this.tab === 'salv') this.render(); });
    this.prev = null;
  }
  open(tab) { this.isOpen = true; this.el.style.display = ''; if (tab) this.tab = tab; this.say = SAY.idle; this.err = ''; this.send({ type: 'bm_forge_open' }); this.render(); }
  close() { this.isOpen = false; this.el.style.display = 'none'; this.prev?.stop(); this.onClose?.(); }
  onMsg(d) {
    if (d.st) { this.st = d.st; for (const p of d.st.parts || []) if (!BM_PARTS[p.id]) BM_PARTS[p.id] = p; } // свои детали админки — и в превью
    if (d.err) { this.err = d.err; this.say = SAY.err; }
    if (d.built) { this.say = `${SAY.build} «${d.name}» — в сумке.`; this.name = ''; this.err = ''; this.done = Date.now(); for (const k of BP_TYPES) this.sel[k] = ''; }
    if (this.isOpen) this.render();
  }
  onToast(ok, msg) { if (!this.isOpen) return; if (ok) { if (/Создано/.test(msg)) this.say = SAY.craft; else if (/Разобрано|Осколок/.test(msg)) this.say = SAY.salv; } else { this.err = msg; this.say = SAY.err; } this.render(); }
  onClick(e) {
    const b = e.target.closest('[data-f]'); if (!b) return; e.stopPropagation();
    const a = b.dataset.f, v = b.dataset.v;
    if (a === 'x') return this.close();
    if (a === 'tab') { this.tab = v; this.err = ''; this.confirm = null; return this.render(); }
    if (a === 'craft') { this.send({ type: 'bm_forge_craft', part: v, n: Number(b.dataset.n) || 1 }); return; }
    if (a === 'build') {
      const m = { type: 'bm_forge_build', name: this.name };
      for (const k of BP_TYPES) if (this.sel[k]) m[k] = this.sel[k];
      if (!m.handle || !m.blade) { this.err = 'Нужны рукоять и лезвие'; return this.render(); }
      this.send(m); return;
    }
    if (a === 'salv') { if (this.confirm !== v) { this.confirm = v; return this.render(); } this.confirm = null; this.send({ type: 'salvage', uid: v }); setTimeout(() => this.send({ type: 'bm_forge_open' }), 400); return; }
    if (a === 'asm') { this.tab = 'asm'; return this.render(); }
  }
  onChange(e) { const s = e.target.closest('[data-slot]'); if (!s) return; this.sel[s.dataset.slot] = s.value; this.err = ''; this.render(); }
  owned(type) { const st = this.st; if (!st) return []; return st.parts.filter((p) => p.type === type && p.have > 0); }
  rParts() {
    const st = this.st; if (!st) return '<p class="mc-dim">Знахарь раскладывает инструменты…</p>';
    return BP_TYPES.map((t) => { const L = st.parts.filter((p) => p.type === t); if (!L.length) return '';
      return `<div class="bmf-h">${esc(BP_TYPE_NAMES[t])}</div><div class="bmf-grid">${L.map((p) => { const have = st.pieces[p.piece] || 0;
        return `<div class="bmf-part ${p.can ? 'can' : ''}" data-part="${esc(p.id)}"><span class="have" title="Создано деталей">×${p.have}</span><h5>${esc(p.icon || '•')} ${esc(p.name)}${p.ranged ? ' 🏹' : ''}</h5>
          <div class="st">${statLine(p.stats) || '—'}</div>${p.desc ? `<div class="st mc-dim">${esc(p.desc)}</div>` : ''}
          <div class="cost ${have >= p.cost ? 'ok' : 'no'}">${RESOURCES[p.piece]?.icon || '📜'} ${esc(RESOURCES[p.piece]?.name || p.piece)}: <b>${have}/${p.cost}</b>${p.reqLvl ? ` · ур. ${p.reqLvl}+` : ''}</div>
          <button class="bmf-btn sm" data-f="craft" data-v="${esc(p.id)}" ${p.can ? '' : 'disabled'}>🔥 Создать</button></div>`; }).join('')}</div>`; }).join('');
  }
  rAsm() {
    const st = this.st; if (!st) return '<p class="mc-dim">…</p>';
    for (const k of BP_TYPES) if (this.sel[k] && !this.owned(k).some((p) => p.id === this.sel[k])) this.sel[k] = '';
    const slots = BP_TYPES.map((t) => `<label class="bmf-slot ${t === 'handle' || t === 'blade' ? 'req' : ''}"><span>${esc(BP_TYPE_NAMES[t])}</span>
      <select data-slot="${t}"><option value="">${t === 'handle' || t === 'blade' ? '— выберите —' : '— нет —'}</option>${this.owned(t).map((p) => `<option value="${esc(p.id)}" ${this.sel[t] === p.id ? 'selected' : ''}>${esc(p.name)} ×${p.have}</option>`).join('')}</select></label>`).join('');
    const parts = Object.fromEntries(BP_TYPES.filter((k) => this.sel[k]).map((k) => [k, this.sel[k]]));
    const A = parts.handle && parts.blade ? computeArtifact(parts, Object.fromEntries(st.parts.map((p) => [p.id, p]))) : null;
    const stats = A ? BM_KEYS.map((k) => `<div class="bm-row"><span>${BM_NAMES[k].icon} ${esc(BM_NAMES[k].name)}</span><b>${fmtBm(k, A.stats[k] || 0)}</b></div>`).join('')
      + `<div class="bm-row"><span>Удар</span><b>${A.ranged ? `дальний · ${Math.round(A.atk.range)} px` : `ближний · дуга ${Math.round(((A.atk.arc || 0) * 180) / Math.PI)}° · ${Math.round(A.atk.range)} px`}</b></div><div class="bm-row"><span>Навыки артефакта</span><b>${(A.skills || []).length}</b></div>` : '<p class="mc-dim">Выберите рукоять и лезвие — появятся чёрные параметры.</p>';
    const none = !this.owned('handle').length || !this.owned('blade').length;
    return `<div class="bmf-asm"><div><canvas class="bmf-cv" width="260" height="260"></canvas></div><div>
      <div class="bmf-slots">${slots}</div>
      ${none ? '<p class="mc-dim">Сначала создайте во вкладке «Детали» хотя бы рукоять и лезвие.</p>' : ''}
      <div class="bmf-h">Чёрные параметры</div><div class="bmf-stats">${stats}</div>
      <div class="bmf-h">Имя оружия</div><input class="bmf-name" maxlength="24" placeholder="Например: Пепельный клык" value="${esc(this.name)}" autocomplete="off" spellcheck="false">
      <div class="bmf-err">${esc(this.err)}</div>
      <button class="bmf-btn" data-f="build" ${A && this.name.trim().length >= 2 ? '' : 'disabled'}>⚒ Выковать</button>
      <span class="mc-dim" style="font-size:11px">Артефактов: ${st.arts}/${st.max}. Имя проверяется: 2–24 символа, буквы/цифры, без брани.</span></div></div>`;
  }
  rSalv() {
    const a = this.meta.account, h = this.meta.hero; if (!a) return '';
    const worn = new Set(Object.values(h?.equip || {}));
    const arts = a.inv.filter(isArtItem);
    if (!arts.length) return '<p class="mc-dim">Артефактов нет. Разбор даёт базовые осколки огня.</p>';
    const S = this.st?.salvage || { base: 10, per: 4 };
    return `<p class="mc-dim">Разбор: ${S.base} 🔸 осколков огня + ${S.per} за каждую деталь сверх рукояти и лезвия. Надетый и закреплённый не разбираются.</p>` + arts.map((it) => { const d = ITEM_BY_ID[it.id]; const n = Object.keys(d?.art?.parts || {}).length; const q = S.base + Math.max(0, n - 2) * S.per;
      const busy = worn.has(it.uid) || it.lk;
      return `<div class="bmf-salv"><canvas width="44" height="44" data-parts="${esc(JSON.stringify(d?.art?.parts || {}))}"></canvas><div class="nm"><b>${esc(d?.name || 'Артефакт')}</b><br><small class="mc-dim">${n} дет. · ${worn.has(it.uid) ? 'в руке' : it.lk ? 'закреплён' : `→ ${q} 🔸`}</small></div>
        <button class="bmf-btn sm ${this.confirm === it.uid ? '' : 'dark'}" data-f="salv" data-v="${esc(it.uid)}" ${busy ? 'disabled' : ''}>${this.confirm === it.uid ? 'Точно разобрать?' : 'Разобрать'}</button></div>`; }).join('');
  }
  render() {
    const st = this.st, tabs = [['parts', '📜 Детали'], ['asm', '⚒ Сборка'], ['salv', '🔸 Разбор']];
    const res = st ? Object.entries(st.pieces).map(([k, n]) => `<div><span>${RESOURCES[k]?.icon || '📜'} ${esc((RESOURCES[k]?.name || k).replace('Кусочек чертежа: ', ''))}</span><b>${n}</b></div>`).join('') + `<div><span>🔸 Осколки огня</span><b>${st.shards}</b></div>` : '';
    const body = this.tab === 'asm' ? this.rAsm() : this.tab === 'salv' ? this.rSalv() : this.rParts();
    const fl = this.done && Date.now() - this.done < 1500 ? 'bmf-done' : '';
    this.el.innerHTML = `<div class="bmf-box ${fl}"><div class="bmf-hd"><b>🔥 Кузня Знахаря</b><span class="mc-dim">Альказак · чёрная магия огня</span><span class="sp"></span><button class="mc-book-x" data-f="x" title="Закрыть (Esc)">✕</button></div>
      <div class="bmf-tabs">${tabs.map(([k, n]) => `<button class="bmf-tab ${this.tab === k ? 'on' : ''}" data-f="tab" data-v="${k}">${n}</button>`).join('')}</div>
      <div class="bmf-bd"><aside class="bmf-npc"><div class="av">🧙</div><div class="say">«${esc(this.say)}»</div><div class="res"><div class="mc-dim">Кусочки чертежа</div>${res}</div></aside><section>${body}</section></div></div>`;
    const cv = this.el.querySelector('.bmf-cv');
    if (cv) { if (!this.prev || this.prev.cv !== cv) { this.prev?.stop(); this.prev = new WeaponPreview(cv); } this.prev.set(Object.fromEntries(BP_TYPES.filter((k) => this.sel[k]).map((k) => [k, this.sel[k]]))); this.prev.start(); }
    else this.prev?.stop();
    for (const c of this.el.querySelectorAll('.bmf-salv canvas[data-parts]')) { try { const p = JSON.parse(c.dataset.parts); const ctx = c.getContext('2d'); drawWeapon(ctx, p, 0.3, { x: 22, y: 34, scale: 0.36, angle: -0.6 }); } catch (_) {} }
  }
}
