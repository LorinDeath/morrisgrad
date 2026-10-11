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
    const complete = list.find((q) => q.state === 'complete' && !QUEST_BY_ID[q.id]?.auto);
    const avail = list.find((q) => q.state === 'available');
    const active = list.find((q) => q.state === 'active');
    let lines = [], btns = [];
    const close = { text: 'Уйти', cls: 'ghost', onClick: () => this.close() };
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
    const q = (complete || avail || active) && QUEST_BY_ID[(complete || avail || active).id];
    this.ov.showScreen(`<div class="mc-dialog"><div class="who" style="color:${n.color}">${esc(n.name)} <small>${esc(n.title)}</small></div>
      ${q ? `<div class="qt">${q.star ? '★ ' : ''}${esc(q.title)} · <small>${esc(q.chapter || '')}</small></div>` : ''}
      ${lines.map((l) => `<p>${esc(l)}</p>`).join('')}</div>`, btns, 'mc-dialog-screen');
    this.isOpen = true;
  }

  close() { if (this.isOpen) this.ov.hideScreen(); this.isOpen = false; }
}
