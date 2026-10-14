// Трекер задания (всегда виден): цель, прогресс, подсказка и стрелка-направление к цели.
// Плюс пошаговое обучение для новичка — игрок всегда понимает, что делать дальше.
import { QUEST_BY_ID, turninNpc } from '../../../../../server/meta/quests.ts';
import { NPCS } from '../../../../../server/meta/shared.ts';
import { baseOf } from '../../../../../server/meta/biomes.ts';
import { ZONE_MOBS } from '../../../../../server/meta/defs.ts';
import { esc } from './overlay.js';

const TUT_KEY = 'mc-tut-v2';

export class QuestTracker {
  constructor(overlay, meta, { onOpenBook, mobile }) {
    this.meta = meta;
    this.mobile = mobile;
    const el = document.createElement('div');
    el.className = 'mc-tracker';
    el.innerHTML = '<div class="q"></div><div class="arrow"><i>➤</i><span></span></div><div class="tut"></div>';
    overlay.layer.appendChild(el);
    this.el = el;
    this.qEl = el.querySelector('.q');
    this.arrow = el.querySelector('.arrow');
    this.arrowI = el.querySelector('.arrow i');
    this.arrowS = el.querySelector('.arrow span');
    this.tutEl = el.querySelector('.tut');
    el.addEventListener('pointerdown', (e) => { e.stopPropagation(); onOpenBook?.(); });
    this.sig = '';
    try { this.tut = JSON.parse(localStorage.getItem(TUT_KEY) || '{}'); } catch (_) { this.tut = {}; }
    this.target = null;
  }

  show(on) { this.el.style.display = on ? '' : 'none'; }

  tutDone(k) {
    if (this.tut[k]) return;
    this.tut[k] = 1;
    try { localStorage.setItem(TUT_KEY, JSON.stringify(this.tut)); } catch (_) {}
  }

  // ctx: { world, x, y, hasClass, online, near: {altar, npc}, moved }
  update(ctx) {
    const st = this.meta.state;
    // обучение: короткие шаги, пока игрок их не выполнил
    let tip = '';
    const k = this.mobile ? { move: 'джойстик слева', act: 'кнопка ✋', book: 'кнопка 📖', atk: 'держите ⚔ (наведение на ближайшего)' } : { move: 'WASD', act: 'E', book: 'J / I / K / T', atk: 'ЛКМ в сторону цели (удерживайте)' };
    if (!this.tut.move) tip = `Двигайтесь: ${k.move}. Рывок — ${this.mobile ? 'кнопка ⚡' : 'Пробел'}.`;
    else if (!ctx.online) tip = 'Нет связи с сервером: прогресс героя не сохраняется. Соло-забеги работают у порталов.';
    else if (!this.tut.book && st) tip = `Книга Проклятого: ${k.book} — задания, герой, навыки, снаряжение, бестиарий.`;
    else if (!ctx.hasClass && ctx.near?.altar) tip = `${k.act} — выбрать оболочку у Алтаря.`;
    else if (ctx.hasClass && !this.tut.fight && ctx.mobsNear) tip = `Атака: ${k.atk}. Навыки — ${this.mobile ? 'кнопки навыков' : 'Q / G / F, навык оружия — R'}.`;
    this.tutEl.textContent = tip;
    this.tutEl.style.display = tip ? '' : 'none';

    // задание
    const qid = this.meta.trackedQuest();
    const q = qid && QUEST_BY_ID[qid];
    let html = '';
    this.target = null;
    this.trackTypes = new Set(); // типы мобов-целей (подсветка на экране/мини-карте + компас), если отслеживание не выключено в админке
    if (q && st) {
      const p = st.account.quests.active[qid]?.p || [];
      const complete = st.complete.includes(qid);
      const obj = q.objectives.map((o, i) => {
        const need = o.count || 1, have = Math.min(need, p[i] || 0);
        return `<li class="${have >= need ? 'ok' : ''}">${esc(o.text)}${need > 1 ? ` <b>${have}/${need}</b>` : ''}</li>`;
      }).join('');
      const tn = turninNpc(q), other = tn !== q.npc;
      // сдача другому NPC — подсказка говорит об этом явно (и в процессе, и после выполнения)
      const turnTxt = other ? `Сдать: ${esc(NPCS[tn]?.name || tn)} (не ${esc(NPCS[q.npc]?.name || q.npc)})` : '';
      html = `<div class="t">${complete ? '✔ ' : '◆ '}${esc(q.title)}</div><ul>${complete && !q.auto ? `<li class="ok">${other ? turnTxt : `Вернитесь: ${esc(this.meta.questTarget(qid)?.label || '')}`}</li>` : obj + (other ? `<li class="turnin">↪ ${turnTxt}</li>` : '')}</ul>`;
      this.target = this.meta.questTarget(qid);
      if (!complete && q.track !== false) q.objectives.forEach((o, i) => { if ((o.type === 'kill' || o.type === 'kill_boss') && o.mob && (p[i] || 0) < (o.count || 1)) this.trackTypes.add(o.mob); });
      if (this.trackTypes.size) { // компас — к ближайшей видимой цели, иначе к ближайшему лагерю, где она водится
        const isT = (t) => this.trackTypes.has(t) || this.trackTypes.has(baseOf(t));
        let best = null, bd = Infinity;
        for (const m of ctx.mobs?.values?.() || []) if (isT(m.type) && !(m.hp <= 0)) { const d = Math.hypot(m.x - ctx.x, m.y - ctx.y); if (d < bd) { bd = d; best = { world: ctx.world, x: m.x, y: m.y, label: ZONE_MOBS[m.type]?.name || 'Цель', mob: 1 }; } }
        if (!best) for (const c of ctx.camps || []) if (c[3] > 0 && c[7].some(isT)) { const d = Math.hypot(c[1] - ctx.x, c[2] - ctx.y); if (d < bd) { bd = d; best = { world: ctx.world, x: c[1], y: c[2], label: 'Лагерь: ' + (ZONE_MOBS[c[7].find(isT)]?.name || 'цель'), mob: 1 }; } }
        if (best) this.target = best;
      }
    } else if (st) {
      const av = (st.available || [])[0];
      if (av) {
        const aq = QUEST_BY_ID[av];
        html = `<div class="t">❕ Новое задание</div><ul><li>${esc(aq.title)} — у ${esc(this.meta.questTarget(av)?.label || '')}</li></ul>`;
        this.target = this.meta.questTarget(av);
      }
    } else if (!ctx.hasClass) {
      html = '<div class="t">◆ Начало</div><ul><li>Подойдите к Алтарю перевоплощения в центре Поляны</li></ul>';
      this.target = { world: 'hellfire', x: 565, y: 600, label: 'Алтарь' };
    }
    if (html !== this.sig) { this.sig = html; this.qEl.innerHTML = html; }
    this.qEl.style.display = html ? '' : 'none';
    // стрелка к цели
    const t = this.target;
    if (t && t.world === ctx.world) {
      const dx = t.x - ctx.x, dy = t.y - ctx.y, d = Math.hypot(dx, dy);
      if (d > 90) {
        // мир: +x вправо, +y «вниз» экрана (к камере)
        const ang = Math.atan2(dy, dx);
        this.arrowI.style.transform = `rotate(${ang}rad)`;
        this.arrowS.textContent = `${t.label} · ${Math.round(d / 20)} м`;
        this.arrow.style.display = '';
      } else this.arrow.style.display = 'none';
    } else if (t) {
      this.arrowI.style.transform = 'rotate(0rad)';
      this.arrowS.textContent = t.world === 'arinar' ? 'Цель в Аринаре — разлом на западе Поляны' : 'Цель на Поляне — портал в центре Аринара (Гранатовый двор)';
      this.arrow.style.display = '';
    } else this.arrow.style.display = 'none';
  }
}
