import { objText } from '../../../../../server/meta/objText.ts';
// Диалог с персонажем (Алзи, Лэйр, Петр, Кьют): реплики задания, принять/сдать.
// Сервер присылает npc_dialog {npc, quests:[{id,state}]}; тексты — из server/meta/quests.ts.
import { QUEST_BY_ID } from '../../../../../server/meta/quests.ts';
import { NPCS } from '../../../../../server/meta/shared.ts';
import { esc } from './overlay.js';
import { QUEST_DIALOGUES, VN_CHARS, VN_HERO, vnImg, vnIcon, npcVnChar } from '../../../../../server/meta/vnChars.ts';

/** иконка квестодателя (арт VN) для шапки диалога/маркеров; null — арта нет */
export const npcIconUrl = (npc) => { const c = npcVnChar(npc); return c ? vnIcon(c) : null; };

const IDLE = {
  alzi: ['Слышишь гул? Это не гроза. Это вентиляторы. …Забудь, что я сказал.', 'Мир держится на опорах. Иногда опоры — это люди.'],
  leyr: ['Пахнет фиалками. Ты чувствуешь? Значит, мир ещё жив.', 'Ветер… я так долго его ждала.'],
  petr: ['Принёс архивы? Распакую. Хитин, крылья, серебро — всё в дело.', 'Без материалов даже я не сошью сапоги из мухи.'],
  kyut: ['Отражение не жалеет. Сразись с ним — или с другом.', 'Арена дуэлей — к северо-востоку от меня. Войди в розовый портал.'],
};

// звёздный квест: «N ★» после названия (N — сколько звёзд даёт награда)
export const starCount = (q) => Object.values(q?.rewards?.stars || {}).reduce((a, b) => a + (Number(b) || 0), 0);
const starTag = (q) => { const n = starCount(q); return n ? ` <span class="q-stars">${n} ★</span>` : ''; };
export class NpcDialog {
  constructor(overlay, meta) {
    this.ov = overlay;
    this.meta = meta;
    this.isOpen = false;
  }

  open(npc, quests) {
    const n = NPCS[npc];
    if (!n) return;
    const list = quests || [];
    this.npc = npc; this.list = list;
    const complete = list.find((q) => q.state === 'complete' && !QUEST_BY_ID[q.id]?.auto);
    const avail = list.find((q) => q.state === 'available');
    const active = list.find((q) => q.state === 'active');
    let lines = [], btns = [];
    const close = { text: 'Уйти', cls: 'ghost', onClick: () => this.close() };
    const all = { text: '📜 Все квесты', id: 'npc-all-quests', onClick: () => this.showAll() };
    const vnAll = list.some((x) => QUEST_BY_ID[x.id]) ? [all] : [];
    if (complete && QUEST_DIALOGUES[complete.id]?.done?.length) { const q = QUEST_BY_ID[complete.id];
      return this.playVN(QUEST_DIALOGUES[q.id].done, q, [{ text: `✔ Сдать: ${q.title}`, cls: 'gold', id: 'vn-turnin', onClick: () => { this.meta.turnIn(q.id); this.close(); } }, close]); }
    if (!complete && avail && QUEST_DIALOGUES[avail.id]?.offer?.length) { const q = QUEST_BY_ID[avail.id];
      return this.playVN(QUEST_DIALOGUES[q.id].offer, q, [{ text: `Взять: ${q.title}`, cls: 'gold', id: 'vn-accept', onClick: () => { this.meta.accept(q.id); this.close(); } }, ...vnAll, close]); }
    if (complete) {
      const q = QUEST_BY_ID[complete.id];
      lines = q.done;
      btns = [{ text: `✔ Сдать: ${q.title}`, cls: 'gold', onClick: () => { this.meta.turnIn(q.id); this.close(); } }, close];
    } else if (avail) {
      const q = QUEST_BY_ID[avail.id];
      lines = q.offer;
      btns = [{ text: `Взять: ${q.title}`, cls: 'gold', onClick: () => { this.meta.accept(q.id); this.close(); } }, close];
    } else if (active) {
      const q = QUEST_BY_ID[active.id];
      lines = [q.progress, q.hint ? `Подсказка: ${q.hint}` : ''].filter(Boolean);
      btns = [close];
    } else {
      const idle = IDLE[npc] || ['…'];
      lines = [idle[Math.floor(Math.random() * idle.length)]];
      if (npc === 'petr') btns.push({ text: '⚒️ Ремесло', cls: 'gold', onClick: () => { this.close(); this.onCraft?.(); } });
      btns.push(close);
    }
    if (list.some((x) => QUEST_BY_ID[x.id])) btns.splice(btns.indexOf(close), 0, all);
    const q = (complete || avail || active) && QUEST_BY_ID[(complete || avail || active).id];
    const ic = npcIconUrl(npc);
    this.ov.showScreen(`<div class="mc-dialog"><div class="who" style="color:${n.color}">${ic ? `<img class="npc-ic" src="${ic}" alt="">` : ''}${esc(n.name)} <small>${esc(n.title)}</small></div>
      ${q ? `<div class="qt">${esc(q.title)}${starTag(q)} · <small>${esc(q.chapter || '')}</small></div>` : ''}
      ${lines.map((l) => `<p>${esc(l)}</p>`).join('')}</div>`, btns, 'mc-dialog-screen');
    this.isOpen = true;
  }

  // «Все квесты»: доступные (взять), готовые к сдаче, активные, выполненные (перечитать лор). Заблокированные НЕ показываются.
  showAll() {
    const n = NPCS[this.npc]; const list = (this.list || []).filter((x) => QUEST_BY_ID[x.id] && x.state !== 'locked');
    const G = [['available', '❕ Доступные'], ['complete', '✔ Готовы к сдаче'], ['active', '◆ В процессе'], ['done', '📖 Выполнены']];
    const html = G.map(([st, title]) => { const xs = list.filter((x) => x.state === st || (st === 'done' && x.state === 'elsewhere')); if (!xs.length) return '';
      return `<div class="qa-grp"><b>${title}</b>${xs.map((x) => { const q = QUEST_BY_ID[x.id]; return `<button class="mc3d-btn qa-row qa-${st}" data-q="${esc(x.id)}" data-st="${st}">${esc(q.title)}${starTag(q)}${x.reason ? `<small> — ${esc(x.reason)}</small>` : ''}</button>`; }).join('')}</div>`; }).join('');
    const el = this.ov.showScreen(`<div class="mc-dialog mc-qall"><div class="who" style="color:${n.color}">${esc(n.name)} · Все квесты</div>${html || '<p>Пока нечего предложить.</p>'}</div>`,
      [{ text: '← Назад', onClick: () => this.open(this.npc, this.list) }, { text: 'Уйти', cls: 'ghost', onClick: () => this.close() }], 'mc-dialog-screen');
    el.querySelectorAll('.qa-row').forEach((b) => (b.onclick = (e) => { e.stopPropagation(); this.showQuest(b.dataset.q, b.dataset.st); }));
    this.isOpen = true;
  }
  showQuest(id, st) {
    const q = QUEST_BY_ID[id], n = NPCS[this.npc], x = (this.list || []).find((y) => y.id === id) || {};
    const lines = st === 'done' ? (q.lore ? [q.lore] : q.done) : st === 'complete' ? q.done : st === 'active' ? [q.progress, q.hint ? `Подсказка: ${q.hint}` : ''].filter(Boolean) : q.offer;
    const goals = q.objectives.map((o) => `<li>${esc(objText(o))}</li>`).join('');
    const btns = [];
    if (st === 'available') btns.push({ text: `Взять: ${q.title}`, cls: 'gold', id: 'npc-take', onClick: () => { this.meta.accept(q.id); this.close(); } });
    if (st === 'complete') btns.push({ text: `✔ Сдать`, cls: 'gold', onClick: () => { this.meta.turnIn(q.id); this.close(); } });
    btns.push({ text: '← Все квесты', onClick: () => this.showAll() }, { text: 'Уйти', cls: 'ghost', onClick: () => this.close() });
    this.ov.showScreen(`<div class="mc-dialog"><div class="who" style="color:${n.color}">${esc(n.name)}</div><div class="qt">${esc(q.title)}${starTag(q)} · <small>${esc(q.chapter || '')}</small></div>
      ${st === 'locked' ? `<p class="qa-lock">🔒 ${esc(x.reason || 'Пока недоступно')} — можно только прочитать.</p>` : ''}${st === 'done' ? '<p class="qa-lock">📖 Выполнено. Лор:</p>' : ''}
      ${lines.map((l) => `<p>${esc(l)}</p>`).join('')}${st !== 'done' ? `<ul class="qa-goals">${goals}</ul>` : ''}</div>`, btns, 'mc-dialog-screen');
    this.isOpen = true;
  }
  // ---------- визуальная новелла: окна диалога из админки (аватар с эмоцией слева, имя + текст, «Дальше») ----------
  speaker(w) {
    let id = w.who;
    if (id === VN_HERO) { const cls = this.meta?.hero?.cls; id = VN_CHARS[cls] ? cls : null; if (!id) return { id: null, name: 'Вы', color: '#e2e8f0' }; }
    const c = VN_CHARS[id]; return c ? { id, name: c.name, color: c.color } : { id: null, name: '…', color: '#e2e8f0' };
  }
  playVN(wins, q, endBtns) {
    this.vn = { wins, q, endBtns, i: 0 };
    for (const w of wins) { const sp = this.speaker(w); if (sp.id) { const im = new Image(); im.src = vnImg(sp.id, w.emo); } } // предзагрузка
    if (!this.vnKey) { // Space/Enter — «Дальше» (до игровых клавиш: рывок/чат)
      this.vnKey = (e) => { if (!this.vn || !this.isOpen) return; if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); e.stopImmediatePropagation(); if (!e.repeat) this.vnNext(); } };
      window.addEventListener('keydown', this.vnKey, true);
    }
    this.vnRender();
  }
  vnNext() { const v = this.vn; if (!v) return; if (v.i < v.wins.length - 1) { v.i++; this.vnRender(); } else { const b = v.endBtns.find((x) => x.cls === 'gold'); if (b) b.onClick(); } }
  vnRender() {
    const v = this.vn, w = v.wins[v.i], sp = this.speaker(w), last = v.i === v.wins.length - 1;
    const btns = last ? v.endBtns : [{ text: 'Дальше ▸', cls: 'gold', id: 'vn-next', onClick: () => this.vnNext() }, { text: 'Уйти', cls: 'ghost', onClick: () => this.close() }];
    const el = this.ov.showScreen(`<div class="mc-vn" data-vn-i="${v.i}" data-who="${esc(w.who)}" data-emo="${esc(w.emo)}">
      ${sp.id ? `<img class="vn-av" src="${vnImg(sp.id, w.emo)}" alt="${esc(sp.name)}">` : ''}
      <div class="mc-dialog vn-box"><div class="vn-top"><span class="who" style="color:${sp.color}">${esc(sp.name)}</span>${v.q ? `<span class="qt">${esc(v.q.title)}${starTag(v.q)}</span>` : ''}<span class="vn-n">${v.i + 1} / ${v.wins.length}</span></div>
      ${w.text.split('\n').map((l) => `<p>${esc(l)}</p>`).join('')}${last ? '' : '<small class="vn-hint">Пробел / Enter — дальше</small>'}</div></div>`, btns, 'mc-dialog-screen mc-vn-screen');
    // клик по тексту — тоже «дальше»
    el.querySelector('.vn-box').onclick = (e) => { e.stopPropagation(); if (!last) this.vnNext(); };
    this.isOpen = true;
  }
  close() { if (this.isOpen) this.ov.hideScreen(); this.isOpen = false; this.vn = null; }
}
