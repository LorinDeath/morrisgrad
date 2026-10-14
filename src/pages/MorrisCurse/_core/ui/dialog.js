// Диалог с персонажем (Алзи, Лэйр, Петр, Кьют): реплики задания, принять/сдать.
// Сервер присылает npc_dialog {npc, quests:[{id,state}]}; тексты — из server/meta/quests.ts.
import { QUEST_BY_ID } from '../../../../../server/meta/quests.ts';
import { NPCS } from '../../../../../server/meta/shared.ts';
import { esc } from './overlay.js';

const IDLE = {
  alzi: ['Слышишь гул? Это не гроза. Это вентиляторы. …Забудь, что я сказал.', 'Мир держится на опорах. Иногда опоры — это люди.'],
  leyr: ['Пахнет фиалками. Ты чувствуешь? Значит, мир ещё жив.', 'Ветер… я так долго его ждала.'],
  petr: ['Принёс архивы? Распакую. Хитин, крылья, серебро — всё в дело.', 'Без материалов даже я не сошью сапоги из мухи.'],
  kyut: ['Отражение не жалеет. Сразись с ним — или с другом.', 'Арена дуэлей — к северо-востоку от меня. Войди в розовый портал.'],
};

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
    this.ov.showScreen(`<div class="mc-dialog"><div class="who" style="color:${n.color}">${esc(n.name)} <small>${esc(n.title)}</small></div>
      ${q ? `<div class="qt">${q.star ? '★ ' : ''}${esc(q.title)} · <small>${esc(q.chapter || '')}</small></div>` : ''}
      ${lines.map((l) => `<p>${esc(l)}</p>`).join('')}</div>`, btns, 'mc-dialog-screen');
    this.isOpen = true;
  }

  // «Все квесты»: доступные (взять), активные, заблокированные (только просмотр + причина), выполненные (перечитать лор)
  showAll() {
    const n = NPCS[this.npc]; const list = (this.list || []).filter((x) => QUEST_BY_ID[x.id]);
    const G = [['available', '❕ Доступные'], ['complete', '✔ Готовы к сдаче'], ['active', '◆ В процессе'], ['locked', '🔒 Заблокированы'], ['done', '📖 Выполнены']];
    const html = G.map(([st, title]) => { const xs = list.filter((x) => x.state === st || (st === 'done' && x.state === 'elsewhere')); if (!xs.length) return '';
      return `<div class="qa-grp"><b>${title}</b>${xs.map((x) => { const q = QUEST_BY_ID[x.id]; return `<button class="mc3d-btn qa-row qa-${st}" data-q="${esc(x.id)}" data-st="${st}">${q.star ? '★ ' : ''}${esc(q.title)}${x.reason ? `<small> — ${esc(x.reason)}</small>` : ''}</button>`; }).join('')}</div>`; }).join('');
    const el = this.ov.showScreen(`<div class="mc-dialog mc-qall"><div class="who" style="color:${n.color}">${esc(n.name)} · Все квесты</div>${html || '<p>Пока нечего предложить.</p>'}</div>`,
      [{ text: '← Назад', onClick: () => this.open(this.npc, this.list) }, { text: 'Уйти', cls: 'ghost', onClick: () => this.close() }], 'mc-dialog-screen');
    el.querySelectorAll('.qa-row').forEach((b) => (b.onclick = (e) => { e.stopPropagation(); this.showQuest(b.dataset.q, b.dataset.st); }));
    this.isOpen = true;
  }
  showQuest(id, st) {
    const q = QUEST_BY_ID[id], n = NPCS[this.npc], x = (this.list || []).find((y) => y.id === id) || {};
    const lines = st === 'done' ? (q.lore ? [q.lore] : q.done) : st === 'complete' ? q.done : st === 'active' ? [q.progress, q.hint ? `Подсказка: ${q.hint}` : ''].filter(Boolean) : q.offer;
    const goals = q.objectives.map((o) => `<li>${esc(o.text)}</li>`).join('');
    const btns = [];
    if (st === 'available') btns.push({ text: `Взять: ${q.title}`, cls: 'gold', id: 'npc-take', onClick: () => { this.meta.accept(q.id); this.close(); } });
    if (st === 'complete') btns.push({ text: `✔ Сдать`, cls: 'gold', onClick: () => { this.meta.turnIn(q.id); this.close(); } });
    btns.push({ text: '← Все квесты', onClick: () => this.showAll() }, { text: 'Уйти', cls: 'ghost', onClick: () => this.close() });
    this.ov.showScreen(`<div class="mc-dialog"><div class="who" style="color:${n.color}">${esc(n.name)}</div><div class="qt">${esc(q.title)} · <small>${esc(q.chapter || '')}</small></div>
      ${st === 'locked' ? `<p class="qa-lock">🔒 ${esc(x.reason || 'Пока недоступно')} — можно только прочитать.</p>` : ''}${st === 'done' ? '<p class="qa-lock">📖 Выполнено. Лор:</p>' : ''}
      ${lines.map((l) => `<p>${esc(l)}</p>`).join('')}${st !== 'done' ? `<ul class="qa-goals">${goals}</ul>` : ''}</div>`, btns, 'mc-dialog-screen');
    this.isOpen = true;
  }
  close() { if (this.isOpen) this.ov.hideScreen(); this.isOpen = false; }
}
