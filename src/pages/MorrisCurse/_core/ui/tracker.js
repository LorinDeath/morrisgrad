import { objText, condLine } from '../../../../../server/meta/objText.ts';
// Трекер задания (всегда виден): цель, прогресс, подсказка и стрелка-направление к цели.
// Плюс пошаговое обучение для новичка — игрок всегда понимает, что делать дальше.
import { QUEST_BY_ID, turninNpc } from '../../../../../server/meta/quests.ts';
import { NPCS, RESOURCES } from '../../../../../server/meta/shared.ts';
import { baseOf, goalMatch } from '../../../../../server/meta/biomes.ts';
import { ZONE_MOBS } from '../../../../../server/meta/defs.ts';
import { nearestHome, WORLD_NAMES } from '../../../../../server/meta/mobHome.ts';
import { esc } from './overlay.js';
import { taskTarget, hasPlace, viaPortal } from './boardLoc.js';

const TUT_KEY = 'mc-tut-v2';
const FOLD_KEY = 'mc-tut-fold'; // «свернуть подсказки обучения» — только на этом устройстве (выключить совсем — в настройках, хранит сервер)
const angOf = (t, ctx) => Math.atan2(t.y - ctx.y, t.x - ctx.x);

export class QuestTracker {
  constructor(overlay, meta, { onOpenBook, onOpenBoard, mobile, board }) {
    this.meta = meta; this.board = board || null;
    this.mobile = mobile;
    const el = document.createElement('div');
    el.className = 'mc-tracker';
    el.innerHTML = '<div class="q"></div><div class="bq"></div><div class="arrow"><i>➤</i><span></span><b class="d"></b></div><div class="tut"></div>';
    overlay.layer.appendChild(el);
    this.el = el;
    this.qEl = el.querySelector('.q');
    this.arrow = el.querySelector('.arrow');
    this.arrowI = el.querySelector('.arrow i');
    this.arrowS = el.querySelector('.arrow span');
    this.arrowD = el.querySelector('.arrow .d');
    this.tutEl = el.querySelector('.tut');
    this.bqEl = el.querySelector('.bq');
    // клик по строке доски / шагу обучения — окно «Задания»; ▾ — свернуть обучение; остальное — журнал квестов (как раньше)
    el.addEventListener('pointerdown', (e) => { e.stopPropagation();
      const f = e.target.closest('[data-fold]'); if (f) { this.setFold(!this.fold); return; }
      const b = e.target.closest('[data-bt]'); if (b) { onOpenBoard?.(b.dataset.bt); return; }
      onOpenBook?.(); });
    try { this.fold = localStorage.getItem(FOLD_KEY) === '1'; } catch (_) { this.fold = false; }
    this.bsig = ''; this.rowArrows = [];
    this.sig = '';
    try { this.tut = JSON.parse(localStorage.getItem(TUT_KEY) || '{}'); } catch (_) { this.tut = {}; }
    this.target = null;
  }

  show(on) { this.el.style.display = on ? '' : 'none'; }

  setFold(on) { this.fold = !!on; try { localStorage.setItem(FOLD_KEY, on ? '1' : '0'); } catch (_) {} this.bsig = ''; }
  tutDone(k) {
    if (['move', 'book', 'map', 'board'].includes(k)) this.board?.ui(k); // шаг обучения на сервере (белый список, без наград сверх шага)
    if (this.tut[k]) return;
    this.tut[k] = 1;
    try { localStorage.setItem(TUT_KEY, JSON.stringify(this.tut)); } catch (_) {}
  }

  // ctx: { world, x, y, hasClass, online, near: {altar, npc}, moved }
  update(ctx) {
    const st = this.meta.state;
    // обучение: короткие шаги, пока игрок их не выполнил
    let tip = '';
    const B = this.board, srvTut = !!(B?.ready && B.defs.cfg.tutOn);
    const k = this.mobile ? { move: 'джойстик слева', act: 'кнопка ✋', book: 'кнопка 📖', atk: 'держите ⚔ (наведение на ближайшего)' } : { move: 'WASD', act: 'E', book: 'J / I / K / T', atk: 'ЛКМ в сторону цели (удерживайте)' };
    if (srvTut) { if (!ctx.online) tip = 'Нет связи с сервером: прогресс героя не сохраняется. Соло-забеги работают у порталов.'; }
    else if (!this.tut.move) tip = `Двигайтесь: ${k.move}. Рывок — ${this.mobile ? 'кнопка ⚡' : 'Пробел'}.`;
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
    let primTypes = new Set(); // типы мобов ПЕРВОГО (ведущего) задания — только они перенаправляют стрелку (баг: стрелка вела к целям другого задания)
    if (q && st) {
      { const pp = st.account.quests.active[qid]?.p || []; if (!st.complete.includes(qid) && q.track !== false) q.objectives.forEach((o, i) => { if ((o.type === 'kill' || o.type === 'kill_boss') && o.mob && (pp[i] || 0) < (o.count || 1)) primTypes.add(o.mob); }); }
      for (const oid of tracked) { const oq = QUEST_BY_ID[oid], op = st.account.quests.active[oid]?.p || [];
        if (oq && !st.complete.includes(oid) && oq.track !== false) oq.objectives.forEach((o, i) => { if ((o.type === 'kill' || o.type === 'kill_boss') && o.mob && (op[i] || 0) < (o.count || 1)) this.trackTypes.add(o.mob); }); }
      const p = st.account.quests.active[qid]?.p || [];
      const complete = st.complete.includes(qid);
      const obj = q.objectives.map((o, i) => {
        const need = o.count || 1, have = Math.min(need, p[i] || 0);
        const cl = have < need ? condLine(o) : '', cs = this.cond?.[qid + ':' + i];
        const cst = !cl ? '' : cs && !cs.ok && Date.now() - cs.at < 90000 ? `<div class="qc bad">✖ условие нарушено: ${esc(cs.reason)}${cs.kill ? ' — убийство не засчитано' : ''}. Новая попытка — в следующем бою</div>`
          : cs?.armed && Date.now() - cs.at < 600000 ? `<div class="qc arm">⚔ попытка идёт — условия соблюдены</div>` : '';
        return `<li class="${have >= need ? 'ok' : ''}">${esc(objText(o))}${need > 1 ? ` <b>${have}/${need}</b>` : ''}${cl ? `<div class="qc">✦ ${esc(cl)}</div>` : ''}${cst}</li>`;
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
      { // «добыть ресурс»: компас — к ближайшему готовому узлу этого ресурса (узлы светятся), а не к центру пятна
        const gi = q.objectives.findIndex((o, i) => o.type === 'gather' && (p[i] || 0) < (o.count || 1));
        const res = gi >= 0 ? q.objectives[gi].res : null;
        if (res && ctx.nodes && !complete) { let best = null, bd = 6000, alt = null, ad = 6000;
          for (const n of ctx.nodes.values()) { if (n.def.res !== res) continue; const d = Math.hypot(n.def.x - ctx.x, n.def.y - ctx.y);
            if (n.ready && d < bd) { bd = d; best = n; } else if (!n.ready && d < ad) { ad = d; alt = n; } }
          const nd = best || alt, nm = RESOURCES[res]?.name || res;
          if (nd) this.target = { world: ctx.world, x: nd.def.x, y: nd.def.y, label: best ? `✨ ${nm}` : `${nm} (вырастет)`, node: 1 }; }
      }
      if (primTypes.size) { // компас — к ближайшей видимой цели ведущего задания, иначе к ближайшему лагерю, где она водится
        const isT = (t) => { for (const g of primTypes) if (goalMatch(g, t)) return true; return false; }; // вариант-босс ≠ базовый босс
        let best = null, bd = Infinity;
        for (const m of ctx.mobs?.values?.() || []) if (isT(m.type) && !(m.hp <= 0)) { const d = Math.hypot(m.x - ctx.x, m.y - ctx.y); if (d < bd) { bd = d; best = { world: ctx.world, x: m.x, y: m.y, label: ZONE_MOBS[m.type]?.name || 'Цель', mob: 1 }; } }
        if (!best) for (const c of ctx.camps || []) if (c[3] > 0 && c[7].some(isT)) { const d = Math.hypot(c[1] - ctx.x, c[2] - ctx.y); if (d < bd) { bd = d; best = { world: ctx.world, x: c[1], y: c[2], label: 'Лагерь: ' + (ZONE_MOBS[c[7].find(isT)]?.name || 'цель'), mob: 1 }; } }
        if (!best) { // нет рядом — место обитания первого незакрытого моба-цели (в другой локации — портал туда)
          let ty = null, n = null, nd = Infinity; // ближайшее место обитания среди всех мобов-целей (своя локация важнее)
          for (const t0 of primTypes) { const r = nearestHome(t0, ctx.world, ctx.x, ctx.y); if (!r) continue; const d = r.portal ? 1e12 : Math.hypot(r.home.x - ctx.x, r.home.y - ctx.y); if (d < nd) { nd = d; n = r; ty = t0; } }
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
      const isT = (t) => goalMatch(mt, t);
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
      if (best) this.target = best; // охота из Бестиария — явный выбор игрока, компас ведёт к ней (среди целей заданий — ближайшая)
      html += `<div class="hunt${html ? ' sep' : ''}"><div class="t">🎯 Охота: ${esc(nm)}</div><ul><li>${esc(where)}</li></ul></div>`;
    }
    if (html !== this.sig) { this.sig = html; this.qEl.innerHTML = html; }
    this.qEl.style.display = html ? '' : 'none';
    this.boardUpdate(ctx);
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

  /** доска: шаг обучения (подсказка ПК/телефон) и отслеживаемые задания. Мини-стрелка — только у заданий с местом на карте;
   *  у остальных — счётчик. Главная стрелка — к шагу/заданию, только если у квестов и охоты из Бестиария цели нет. */
  boardUpdate(ctx) {
    const B = this.board; this.boardTarget = null;
    if (!B?.ready || !B.defs.on || !ctx.hasClass && !B.tutStep()) { if (this.bsig) { this.bsig = ''; this.bqEl.innerHTML = ''; } this.bqEl.style.display = 'none'; return; }
    const rows = [], arrows = [];
    const st = B.tutStep();
    if (st) {
      const { t, r } = st, hint = (this.mobile ? t.mob : t.pc) || '';
      const tg = taskTarget(t, B, ctx) || viaPortal(this.tutHl(t, ctx), ctx);
      if (this.fold) rows.push(`<div class="bt fold" data-bt="tut"><span class="nm">🧭 Обучение: ${esc(t.t)}</span><b data-fold title="Развернуть">▸</b></div>`);
      else rows.push(`<div class="bt tutr" data-bt="tut"><div class="nm">🧭 ${esc(t.t)}${r.n > 1 ? ` <b>${r.have}/${r.n}</b>` : ''}<b class="fd" data-fold title="Свернуть">▾</b></div>`
        + (hint ? `<div class="hk">${esc(hint)}</div>` : '') + (t.w ? `<div class="wy">${esc(t.w)}</div>` : '') + (tg ? `<div class="ra" data-i="${arrows.length}"><i>➤</i><span></span><b></b></div>` : '') + '</div>');
      if (tg) arrows.push(tg);
      if (tg && !this.target) this.boardTarget = tg;
    }
    for (const id of B.st.pin || []) {
      const t = B.def(id); if (!t) continue;
      const r = B.tier(t), tg = hasPlace(t) ? taskTarget(t, B, ctx) : null;
      const cnt = r.done ? '✔' : r.ready && !(t.take && !B.taken(id)) ? '✔ забрать' : `${r.have}/${r.n}`;
      rows.push(`<div class="bt pin" data-bt="${t.cat}"><div class="nm">◇ ${esc(B.title(t))} <b>${cnt}</b></div>${tg ? `<div class="ra" data-i="${arrows.length}"><i>➤</i><span></span><b></b></div>` : ''}</div>`);
      if (tg) { arrows.push(tg); if (!this.target && !this.boardTarget) this.boardTarget = tg; if (tg.mob || tg.via?.mob) this.trackTypes?.add(tg.mob || tg.via.mob); }
    }
    const html = rows.join('');
    if (html !== this.bsig) { this.bsig = html; this.bqEl.innerHTML = html; this.rowArrows = [...this.bqEl.querySelectorAll('.ra')]; }
    this.bqEl.style.display = html ? '' : 'none';
    this.rowArrows.forEach((el, i) => { const tg = arrows[i]; if (!tg) return; const same = tg.world === ctx.world, d = same ? Math.hypot(tg.x - ctx.x, tg.y - ctx.y) : 0;
      const ii = el.children[0], sp = el.children[1], db = el.children[2]; ii.style.transform = `rotate(${same ? angOf(tg, ctx) : 0}rad)`;
      if (sp.textContent !== tg.label) { sp.textContent = tg.label; el.title = tg.label; }
      const dt = !same ? '' : d <= 90 ? 'здесь' : `${Math.round(d / 20)} м`; if (db.textContent !== dt) db.textContent = dt; });
    if (!this.target && this.boardTarget) this.target = this.boardTarget;
  }
  /** подсветка шага обучения без своей цели: Алтарь, Петр/Кьют, ближайший моб/узел/мешок */
  tutHl(t, ctx) {
    const h = String(t.hl || '');
    if (h === 'altar') return { world: 'hellfire', x: 565, y: 600, label: 'Алтарь перевоплощения' };
    if (h.startsWith('npc:')) { const n = NPCS[h.slice(4)]; return n ? { world: n.world, x: n.x, y: n.y, label: n.name } : null; }
    if (h === 'mob' && ctx.mobs) { let best = null, bd = 1400; for (const m of ctx.mobs.values()) { if (m.hp <= 0) continue; const d = Math.hypot(m.x - ctx.x, m.y - ctx.y); if (d < bd) { bd = d; best = { world: ctx.world, x: m.x, y: m.y, label: ZONE_MOBS[m.type]?.name || 'Отголосок' }; } } return best; }
    if (h === 'noticeboard') { const p = this.board?.defs?.props?.nb; return p && { world: p.world, x: p.x, y: p.y, label: 'Доска объявлений' }; }
    return null;
  }
}
