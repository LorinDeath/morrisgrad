import { objText } from '../../../../../server/meta/objText.ts';
// Трекер задания (всегда виден): цель, прогресс, подсказка и стрелка-направление к цели.
// Плюс пошаговое обучение для новичка — игрок всегда понимает, что делать дальше.
import { QUEST_BY_ID, turninNpc } from '../../../../../server/meta/quests.ts';
import { NPCS } from '../../../../../server/meta/shared.ts';
import { baseOf } from '../../../../../server/meta/biomes.ts';
import { ZONE_MOBS } from '../../../../../server/meta/defs.ts';
import { nearestHome, WORLD_NAMES } from '../../../../../server/meta/mobHome.ts';
import { esc } from './overlay.js';

const TUT_KEY = 'mc-tut-v2';

export class QuestTracker {
  constructor(overlay, meta, { onOpenBook, mobile }) {
    this.meta = meta;
    this.mobile = mobile;
    const el = document.createElement('div');
    el.className = 'mc-tracker';
    el.innerHTML = '<div class="q"></div><div class="arrow"><i>➤</i><span></span><b class="d"></b></div><div class="tut"></div>';
    overlay.layer.appendChild(el);
    this.el = el;
    this.qEl = el.querySelector('.q');
    this.arrow = el.querySelector('.arrow');
    this.arrowI = el.querySelector('.arrow i');
    this.arrowS = el.querySelector('.arrow span');
    this.arrowD = el.querySelector('.arrow .d');
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
    // все отслеживаемые задания (выбор в журнале); стрелка — к первому, подсветка мобов — по всем
    const tracked = this.meta.trackedQuests ? this.meta.trackedQuests() : [this.meta.trackedQuest()].filter(Boolean);
    const qid = tracked[0];
    const q = qid && QUEST_BY_ID[qid];
    let html = '';
    this.target = null;
    this.trackTypes = new Set(); // типы мобов-целей (подсветка на экране/мини-карте + компас), если отслеживание не выключено в админке
    if (q && st) {
      for (const oid of tracked) { const oq = QUEST_BY_ID[oid], op = st.account.quests.active[oid]?.p || [];
        if (oq && !st.complete.includes(oid) && oq.track !== false) oq.objectives.forEach((o, i) => { if ((o.type === 'kill' || o.type === 'kill_boss') && o.mob && (op[i] || 0) < (o.count || 1)) this.trackTypes.add(o.mob); }); }
      const p = st.account.quests.active[qid]?.p || [];
      const complete = st.complete.includes(qid);
      const obj = q.objectives.map((o, i) => {
        const need = o.count || 1, have = Math.min(need, p[i] || 0);
        return `<li class="${have >= need ? 'ok' : ''}">${esc(objText(o))}${need > 1 ? ` <b>${have}/${need}</b>` : ''}</li>`;
      }).join('');
      const tn = turninNpc(q), other = tn !== q.npc;
      // сдача другому NPC — подсказка говорит об этом явно (и в процессе, и после выполнения)
      const turnTxt = other ? `Сдать: ${esc(NPCS[tn]?.name || tn)} (не ${esc(NPCS[q.npc]?.name || q.npc)})` : '';
      html = `<div class="t">${complete ? '✔ ' : '◆ '}${esc(q.title)}</div><ul>${complete && !q.auto ? `<li class="ok">${other ? turnTxt : `Вернитесь: ${esc(this.meta.questTarget(qid)?.label || '')}`}</li>` : obj + (other ? `<li class="turnin">↪ ${turnTxt}</li>` : '')}</ul>`;
      // остальные отслеживаемые — компактно, по строке
      const more = tracked.slice(1, 4).map((id) => { const x = QUEST_BY_ID[id], c = st.complete.includes(id), xp = st.account.quests.active[id]?.p || [];
        const o = x.objectives.findIndex((ob, i) => (xp[i] || 0) < (ob.count || 1)), ob = x.objectives[o];
        return `<div class="t2">${c ? '✔' : '◇'} ${esc(x.title)}${!c && ob && (ob.count || 1) > 1 ? ` <b>${Math.min(ob.count, xp[o] || 0)}/${ob.count}</b>` : ''}</div>`; }).join('');
      html += more + (tracked.length > 4 ? `<div class="t2">… ещё ${tracked.length - 4}</div>` : '');
      this.target = this.meta.questTarget(qid);
      if (this.trackTypes.size) { // компас — к ближайшей видимой цели, иначе к ближайшему лагерю, где она водится
        const isT = (t) => this.trackTypes.has(t) || this.trackTypes.has(baseOf(t));
        let best = null, bd = Infinity;
        for (const m of ctx.mobs?.values?.() || []) if (isT(m.type) && !(m.hp <= 0)) { const d = Math.hypot(m.x - ctx.x, m.y - ctx.y); if (d < bd) { bd = d; best = { world: ctx.world, x: m.x, y: m.y, label: ZONE_MOBS[m.type]?.name || 'Цель', mob: 1 }; } }
        if (!best) for (const c of ctx.camps || []) if (c[3] > 0 && c[7].some(isT)) { const d = Math.hypot(c[1] - ctx.x, c[2] - ctx.y); if (d < bd) { bd = d; best = { world: ctx.world, x: c[1], y: c[2], label: 'Лагерь: ' + (ZONE_MOBS[c[7].find(isT)]?.name || 'цель'), mob: 1 }; } }
        if (!best) { // нет рядом — место обитания первого незакрытого моба-цели (в другой локации — портал туда)
          let ty = null, n = null, nd = Infinity; // ближайшее место обитания среди всех мобов-целей (своя локация важнее)
          for (const t0 of this.trackTypes) { const r = nearestHome(t0, ctx.world, ctx.x, ctx.y); if (!r) continue; const d = r.portal ? 1e12 : Math.hypot(r.home.x - ctx.x, r.home.y - ctx.y); if (d < nd) { nd = d; n = r; ty = t0; } }
          const nm = ZONE_MOBS[ty]?.name || ty;
          if (n && !n.portal && n.home.world === ctx.world) best = { world: ctx.world, x: n.home.x, y: n.home.y, label: nm + ' · ' + n.home.region.split(':')[0], mob: 1 };
          else if (n?.portal) best = { world: ctx.world, x: n.portal.x, y: n.portal.y, label: `${nm}: портал в ${WORLD_NAMES[n.home.world] || n.home.world}`, mob: 1 };
          if (n && n.home.world !== ctx.world) html = html.replace('</ul>', `<li class="turnin">↪ ${esc(nm)} — ${esc(WORLD_NAMES[n.home.world] || n.home.world)} · ${esc(n.home.region)}</li></ul>`);
        }
        if (best) this.target = best;
      }
    } else if (st && !Object.keys(st.account.quests.active).length) { // всё снято с отслеживания — трекер молчит
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
    // «Отслеживать» из Бестиария: строка «Охота: <моб>» с подсказкой места; подсветка (экран/мини-карта/карта M) и компас —
    // к ближайшему живому мобу, иначе к лагерю, иначе к месту обитания; в другой локации — к порталу туда
    const mt = this.meta.mobTrack;
    this.hunt = null;
    if (mt && (ZONE_MOBS[mt] || ZONE_MOBS[baseOf(mt)])) {
      this.trackTypes.add(mt);
      const isT = (t) => t === mt || baseOf(t) === mt;
      const nm = ZONE_MOBS[mt]?.name || ZONE_MOBS[baseOf(mt)]?.name || mt;
      let best = null, bd = Infinity, where = '';
      for (const m of ctx.mobs?.values?.() || []) if (isT(m.type) && !(m.hp <= 0)) { const d = Math.hypot(m.x - ctx.x, m.y - ctx.y); if (d < bd) { bd = d; best = { world: ctx.world, x: m.x, y: m.y, label: '🎯 ' + nm, mob: 1, hunt: 'mob' }; } }
      if (best) where = 'рядом';
      if (!best) for (const c of ctx.camps || []) if (c[3] > 0 && c[7].some(isT)) { const d = Math.hypot(c[1] - ctx.x, c[2] - ctx.y); if (d < bd) { bd = d; best = { world: ctx.world, x: c[1], y: c[2], label: '🎯 Лагерь: ' + nm, mob: 1, hunt: 'camp' }; } }
      if (best && !where) where = 'лагерь неподалёку';
      if (!best) { const n = nearestHome(mt, ctx.world, ctx.x, ctx.y);
        if (n && !n.portal && n.home.world === ctx.world) { best = { world: ctx.world, x: n.home.x, y: n.home.y, label: '🎯 ' + nm + ' · ' + n.home.region.split(':')[0], mob: 1, hunt: 'home' }; where = n.home.region; }
        else if (n) { where = `${WORLD_NAMES[n.home.world] || n.home.world} · ${n.home.region}`; best = n.portal ? { world: ctx.world, x: n.portal.x, y: n.portal.y, label: `🎯 ${nm}: портал в ${WORLD_NAMES[n.home.world] || n.home.world}`, hunt: 'portal', far: n.home.world } : { world: n.home.world, x: n.home.x, y: n.home.y, label: '🎯 ' + nm, hunt: 'far' }; }
        else where = 'место обитания неизвестно'; }
      this.hunt = { id: mt, name: nm, where, target: best };
      // охота из Бестиария и цель задания: компас ведёт к БЛИЖАЙШЕЙ из целей в этом мире (раньше охота всегда перебивала задание,
      // даже если до мобов задания 20 м, а охота — «портал в Аринар»)
      if (best) {
        const q = this.target, here = (t) => t && t.world === ctx.world, dist = (t) => Math.hypot(t.x - ctx.x, t.y - ctx.y);
        if (!here(q) || (here(best) && dist(best) <= dist(q)) || (!q.mob && best.hunt === 'mob')) this.target = best;
      }
      html += `<div class="hunt${html ? ' sep' : ''}"><div class="t">🎯 Охота: ${esc(nm)}</div><ul><li>${esc(where)}</li></ul></div>`;
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
        // название — в одну строку с многоточием (полное — в подсказке), расстояние отдельно и всегда видно
        if (this.arrowS.textContent !== t.label) { this.arrowS.textContent = t.label; this.arrow.title = t.label; }
        this.arrowD.textContent = `${Math.round(d / 20)} м`;
        this.arrow.style.display = '';
      } else this.arrow.style.display = 'none';
    } else if (t) {
      this.arrowI.style.transform = 'rotate(0rad)';
      this.arrowD.textContent = '';
      this.arrowS.textContent = t.world === 'arinar' ? 'Цель в Аринаре — разлом на западе Поляны' : 'Цель на Поляне — портал в центре Аринара (Гранатовый двор)';
      this.arrow.style.display = '';
    } else this.arrow.style.display = 'none';
  }
}
