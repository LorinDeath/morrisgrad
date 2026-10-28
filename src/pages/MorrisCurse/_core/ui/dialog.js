import { objText } from '../../../../../server/meta/objText.ts';
// Диалог с персонажем (Алзи, Лэйр, Петр, Кьют): реплики задания, принять/сдать.
// Сервер присылает npc_dialog {npc, quests:[{id,state}]}; тексты — из server/meta/quests.ts.
import { QUEST_BY_ID } from '../../../../../server/meta/quests.ts';
import { NPCS } from '../../../../../server/meta/shared.ts';
import { esc } from './overlay.js';
import { avatarHtml } from './uiSkin.js';
import { QUEST_DIALOGUES, VN_CHARS, VN_HERO, vnImg, vnIcon, npcVnChar, questFlow } from '../../../../../server/meta/vnChars.ts';
import { autoObjText, condLine } from '../../../../../server/meta/objText.ts';
import { ITEM_BY_ID } from '../../../../../server/meta/defs.ts';
import { RESOURCES } from '../../../../../server/meta/shared.ts';

const STAR_NAMES = { yellow: 'жёлтая', red: 'красная', purple: 'фиолетовая', black: 'чёрная' };
const objTarget = (o) => (o.type === 'level' ? 1 : o.count || 1);
/** цели с реальными именами целей и прогрессом: «Убить: Мошкара-Жнец 0/3» (+ текст автора, если свой) */
export function objectivesHtml(q, p) {
  if (q.bt) return btGoalsHtml(q);
  return `<ul class="vn-goals">${q.objectives.map((o, i) => { const n = objTarget(o), c = Math.min(n, p?.[i] || 0), own = objText(o), auto = autoObjText(o);
    return `<li class="${c >= n ? 'ok' : ''}"><b>${esc(auto)}</b> <span class="vn-cnt">${c}/${n}</span>${own !== auto ? `<small>${esc(own)}</small>` : ''}${condLine(o) ? `<small class="mc-qcond">✦ ${esc(condLine(o))}</small>` : ''}</li>`; }).join('')}</ul>`;
}
/** сундуки квеста от сервера (npc_dialog chv): «🎁 Добротный сундук ×1 · шанс улучшиться до Редкого 15 %» */
export function chestHtml(L) {
  if (!Array.isArray(L) || !L.length) return '';
  return L.map((c) => { const up = (c.up || []).map((u) => `до <b style="color:${esc(u.c)}">${esc(u.n)}</b> ${u.p}%`).join(', ');
    const lv = c.L ? ` · ур. ${c.L}${c.L2 && c.L2 !== c.L ? '–' + c.L2 : ''}` : '', cur = c.cp > 0 && c.cp < 100 ? ` · ☠ ${c.cp}%` : '';
    return `<span class="vn-chest" style="--cc:${esc(c.c || '#e5c07b')}">🎁 <b>${esc(c.n)}</b>${c.k > 1 ? ` ×${c.k}` : ''}${lv}${cur}${up ? `<small class="vn-up">шанс улучшиться ${up}</small>` : ''}</span>`; }).join('');
}
/** награда с учётом ветки (выбор в диалоге): заполненные поля ветки заменяют основные — как на сервере (questRewardsFor) */
export function branchRewards(q, k) {
  const b = q.rewards || {}, v = k ? b.alt?.[k] : null; if (!v) return b;
  const has = (x) => x != null && !(Array.isArray(x) && !x.length) && !(typeof x === 'object' && !Array.isArray(x) && !Object.keys(x).length);
  return { ...b, xp: v.xp != null ? v.xp : b.xp, items: has(v.items) ? v.items : b.items, res: has(v.res) ? v.res : b.res };
}
export const REPEAT_NAMES = { daily: '🔁 Ежедневный — снова после сброса доски (полночь по Киеву)', weekly: '🔁 Еженедельный — снова после недельного сброса доски' };
export function rewardsHtml(q, x = {}) {
  if (q.bt) { const L = q.store.rewardList(q.bt, q.r.i); return L.length ? `<div class="vn-rew"><b>Награда:</b> ${L.map((x) => `<span>${esc(x)}</span>`).join('')}</div>` : ''; }
  const r = branchRewards(q, x.br), out = [];
  if (r.xp) out.push(`✨ ${r.xp} опыта`);
  for (const [c, n] of Object.entries(r.stars || {})) if (n) out.push(`★ ${n} ${STAR_NAMES[c] || c}`);
  for (const id of r.items || []) out.push(`🎁 ${ITEM_BY_ID[id]?.name || id}`);
  for (const [id, n] of Object.entries(r.res || {})) out.push(`${RESOURCES[id]?.icon || '🪨'} ${RESOURCES[id]?.name || id} ×${n}`);
  if (r.blkFix > 0) out.push(`🌑 Очищение надетого снаряжения ${r.blkFix}%`);
  const alt = q.rewards?.alt || {}, ks = Object.keys(alt), chs = chestHtml((x.br && x.chvB?.[x.br]) || x.chv);
  const brl = ks.length ? `<small class="vn-alt">${x.br && alt[x.br] ? `Ваш выбор: <b>${esc(alt[x.br].name || x.br)}</b> — награда этой ветки` : `Награда зависит от выбора в диалоге: ${ks.map((k) => `«${esc(alt[k].name || k)}»`).join(', ')}`}</small>` : '';
  const rep = q.repeat ? `<small class="vn-rep">${esc(REPEAT_NAMES[q.repeat] || '')}</small>` : '';
  return out.length || chs || brl || rep ? `<div class="vn-rew"><b>Награда:</b> ${out.map((x) => `<span>${esc(x)}</span>`).join('')}${chs}${brl}${rep}</div>` : '';
}

// ——— личные задания персонажа (доска заданий, поле «кто выдаёт» = этот НПС) в том же потоке квеста ———
// Из определения задания собирается «квест» того же вида (title/npc/turnin/progress + окна VN), поэтому окна, кнопки,
// цели и награды — те же, что у сюжетных квестов. Взять/сдать — board_take/board_claim (сервер проверяет, что игрок у персонажа).
const BT_LINES = {
  alzi: { offer: 'Есть дело для охотника. Возьмёшься?', progress: 'Пока не готово. Возвращайся, когда закончишь.', done: 'Справился. Держи — заслужил.' },
  leyr: { offer: 'У меня просьба… Поможешь?', progress: 'Я подожду. Ветер подскажет, когда ты вернёшься.', done: 'Спасибо. Мир стал чуть живее.' },
  petr: { offer: 'Мастерской нужна помощь. Найдёшь время?', progress: 'Ещё не всё. Без этого работа стоит.', done: 'Отлично! Вот, держи за труды.' },
  kyut: { offer: 'Хочешь испытание? У меня есть одно.', progress: 'Ещё не закончено. Не сдавайся.', done: 'Неплохо. Награда твоя.' },
  city_27: { offer: 'Королева Мэл просила помочь… а я прошу тебя. Мяу?', progress: 'Ещё не всё? Я пока обойду город.', done: 'Спасибо! Госпожа будет довольна. Вот, держи.' }, // Китти, горничная королевы Мэл
};
function btGoalsHtml(q) {
  const t = q.bt, r = q.r, tier = r.all > 1 ? `<small>Ступень ${Math.min(r.c + 1, r.all)} из ${r.all}</small>` : '';
  return `<ul class="vn-goals"><li class="${r.ready ? 'ok' : ''}"><b>${esc(q.title)}</b> <span class="vn-cnt">${r.have}/${r.n}</span>${q.why ? `<small>${esc(q.why)}</small>` : ''}${tier}</li></ul>`;
}
export function boardQuest(store, npc, id) {
  const t = store?.def(id); if (!t) return null;
  const r = store.tier(t), why = store.why(t), L = BT_LINES[npc] || { offer: 'Есть задание.', progress: 'Ещё не готово.', done: 'Готово.' };
  return { id, bt: t, r, store, npc, turnin: npc, title: store.title(t), why, chapter: 'Личное задание', progress: L.progress, offer: [L.offer], done: [L.done], hint: '' };
}

// ——— карточка главы (тёмный ар-деко, золото): перед первым окном квеста с q.card.on; один раз на устройстве; пропуск — клик/тап/Esc/пробел ———
export function chapterCard(title, sub, done, { kicker = 'Глава', ms = 3600 } = {}) {
  const el = document.createElement('div'); el.className = 'mc-chcard'; el.setAttribute('role', 'dialog');
  el.innerHTML = `<div class="chc-frame"><i class="chc-c tl"></i><i class="chc-c tr"></i><i class="chc-c bl"></i><i class="chc-c br"></i>
    <div class="chc-fan"></div><div class="chc-k">${esc(kicker)}</div><div class="chc-rule"><span>◆</span></div><h2 class="chc-t">${esc(title)}</h2>${sub ? `<div class="chc-s">${esc(sub)}</div>` : ''}<div class="chc-rule"><span>◆</span></div></div>
    <small class="chc-skip">нажмите, чтобы продолжить</small>`;
  let fin = false; const end = () => { if (fin) return; fin = true; window.removeEventListener('keydown', key, true); clearTimeout(tm); el.classList.add('out'); setTimeout(() => { el.remove(); done?.(); }, 380); };
  const key = (e) => { if (['Escape', ' ', 'Enter'].includes(e.key)) { e.preventDefault(); e.stopImmediatePropagation(); end(); } };
  el.addEventListener('pointerdown', (e) => { e.preventDefault(); e.stopPropagation(); end(); });
  window.addEventListener('keydown', key, true); const tm = setTimeout(end, ms);
  document.body.appendChild(el); return { el, end };
}
const cardSeen = (id) => { try { return localStorage.getItem('mc_chcard_' + id) === '1'; } catch { return false; } };
const cardMark = (id) => { try { localStorage.setItem('mc_chcard_' + id, '1'); } catch { /* приватный режим */ } };

/** иконка квестодателя (арт VN) для шапки диалога/маркеров; null — арта нет */
export const npcIconUrl = (npc) => { const c = npcVnChar(npc); return c ? vnIcon(c) : null; };

const IDLE = {
  alzi: ['Слышишь гул? Это не гроза. Это вентиляторы. …Забудь, что я сказал.', 'Мир держится на опорах. Иногда опоры — это люди.'],
  leyr: ['Пахнет фиалками. Ты чувствуешь? Значит, мир ещё жив.', 'Ветер… я так долго его ждала.'],
  petr: ['Принёс архивы? Распакую. Хитин, крылья, серебро — всё в дело.', 'Без материалов даже я не сошью сапоги из мухи.'],
  black_mage: ['…', 'Тише. Здесь кто-то спит.', 'Не трогай то, что под куполом.'],
  kyut: ['Отражение не жалеет. Сразись с ним — или с другом.', 'Арена дуэлей — к северо-востоку от меня. Войди в розовый портал.'],
};

// Услуги NPC (не зависят от квестов): показываются в диалоге при ЛЮБОМ состоянии — квест предложен/в процессе/к сдаче/нет квестов.
// key → { text, cb } — cb: имя колбэка NpcDialog (назначается в game.js). Новая услуга NPC — одна строка здесь.
export const NPC_SERVICES = {
  petr: [{ id: 'npc-svc-craft', text: '⚒️ Ремесло', cb: 'onCraft' }, { id: 'npc-svc-upgrade', text: '🔨 Улучшение', cb: 'onUpgrade' }],
};
// услуги по ИМЕНИ NPC (у жителей городов id вида city_N зависит от порядка в конфиге города)
export const NPC_SERVICES_BY_NAME = {
  'Знахарь': [{ id: 'npc-svc-forge', text: '🔥 Кузня Знахаря', cb: 'onForge' }],
};
const svcOf = (npc) => NPC_SERVICES[npc] || NPC_SERVICES_BY_NAME[NPCS[npc]?.name] || [];

// звёздный квест: «N ★» после названия (N — сколько звёзд даёт награда)
export const starCount = (q) => Object.values(q?.rewards?.stars || {}).reduce((a, b) => a + (Number(b) || 0), 0);
const starTag = (q) => { const n = starCount(q); return n ? ` <span class="q-stars">${n} ★</span>` : ''; };
export class NpcDialog {
  constructor(overlay, meta, board) {
    this.ov = overlay;
    this.meta = meta;
    this.board = board; // доска заданий (личные задания персонажа)
    this.isOpen = false;
  }

  open(npc, quests, tasks) {
    const n = NPCS[npc];
    if (!n) return;
    if (tasks !== undefined) this.tasks = (tasks || []).filter((x) => this.board?.def(x.id)).map((x) => ({ ...x, bt: 1 }));
    else if (npc !== this.npc) this.tasks = [];
    const list = [...(quests || []), ...(this.tasks || [])];
    this.npc = npc; this.list = list; this.quests0 = quests;
    const complete = list.find((q) => q.state === 'complete' && (q.bt || !QUEST_BY_ID[q.id]?.auto));
    const avail = list.find((q) => q.state === 'available');
    const active = list.find((q) => q.state === 'active');
    let lines = [], btns = [];
    const close = { text: 'Уйти', cls: 'ghost', onClick: () => this.close() };
    const all = { text: '📜 Все квесты', id: 'npc-all-quests', onClick: () => this.showAll() };
    const vnAll = list.some((x) => QUEST_BY_ID[x.id]) ? [all] : [];
    // единый поток квеста (окна из админки или старые реплики → окна квестодателя)
    if (complete) return this.flowDone(complete.id);
    if (avail) return this.flowOffer(avail.id);
    if (active) return this.flowProgress(active.id);
    if (complete) {
      const q = QUEST_BY_ID[complete.id];
      lines = q.done;
      btns = [{ text: `✔ Сдать: ${q.title}`, cls: 'gold', onClick: () => { this.turnIn(q); this.close(); } }, close];
    } else if (avail) {
      const q = QUEST_BY_ID[avail.id];
      lines = q.offer;
      btns = [{ text: `Взять: ${q.title}`, cls: 'gold', onClick: () => { this.accept(q); this.close(); } }, close];
    } else if (active) {
      const q = QUEST_BY_ID[active.id];
      lines = [q.progress, q.hint ? `Подсказка: ${q.hint}` : ''].filter(Boolean);
      btns = [close];
    } else {
      const idle = IDLE[npc] || ['…'];
      lines = [idle[Math.floor(Math.random() * idle.length)]];
      btns.push(...this.btnSvc(), close);
    }
    if (list.some((x) => x.bt || QUEST_BY_ID[x.id])) btns.splice(btns.indexOf(close), 0, all);
    const q = (complete || avail || active) && QUEST_BY_ID[(complete || avail || active).id];
    const ic = npcIconUrl(npc);
    this.ov.showScreen(`<div class="mc-dialog"><div class="who" style="color:${n.color}">${avatarHtml(npc, 0, 64, 'npc')}${ic ? `<img class="npc-ic" src="${ic}" alt="">` : ''}<span class="who-t">${esc(n.name)} <small>${esc(n.title)}</small></span></div>
      ${q ? `<div class="qt">${esc(q.title)}${starTag(q)} · <small>${esc(q.chapter || '')}</small></div>` : ''}
      ${lines.map((l) => `<p>${esc(l)}</p>`).join('')}</div>`, btns, 'mc-dialog-screen');
    this.isOpen = true;
  }

  // «Все квесты»: доступные (взять), готовые к сдаче, активные, выполненные (перечитать лор), закрытые цепочки — с причиной
  // («сначала: «X» — выбор «Пощадить»», «нужен уровень 10»); закрытые без явного шага (звёзды и т.п.) не показываются.
  showAll() {
    const n = NPCS[this.npc]; const list = (this.list || []).filter((x) => this.qOf(x.id) && (x.state !== 'locked' || /^(сначала|нужен уровень)/.test(x.reason || '')));
    const G = [['available', '❕ Доступные'], ['complete', '✔ Готовы к сдаче'], ['active', '◆ В процессе'], ['locked', '🔒 Откроются позже'], ['done', '📖 Выполнены']];
    const html = G.map(([st, title]) => { const xs = list.filter((x) => x.state === st || (st === 'done' && x.state === 'elsewhere')); if (!xs.length) return '';
      return `<div class="qa-grp"><b>${title}</b>${xs.map((x) => { const q = this.qOf(x.id); return `<button class="mc3d-btn qa-row qa-${st}${st === 'locked' ? ' qa-locked' : ''}" data-q="${esc(x.id)}" data-st="${st}">${st === 'locked' ? '🔒 ' : ''}${esc(q.title)}${starTag(q)}${q.repeat ? ' <span class="q-rep">🔁</span>' : ''}${x.reason ? `<small> — ${esc(x.reason)}</small>` : ''}</button>`; }).join('')}</div>`; }).join('');
    const el = this.ov.showScreen(`<div class="mc-dialog mc-qall"><div class="who" style="color:${n.color}">${esc(n.name)} · Все квесты</div>${html || '<p>Пока нечего предложить.</p>'}</div>`,
      [{ text: '← Назад', onClick: () => this.open(this.npc, this.quests0) }, ...this.btnSvc(), { text: 'Уйти', cls: 'ghost', onClick: () => this.close() }], 'mc-dialog-screen');
    el.querySelectorAll('.qa-row').forEach((b) => (b.onclick = (e) => { e.stopPropagation(); this.showQuest(b.dataset.q, b.dataset.st); }));
    this.isOpen = true;
  }
  showQuest(id, st) {
    if (st === 'available') return this.flowOffer(id);
    if (st === 'complete') return this.flowDone(id);
    if (st === 'active') return this.flowProgress(id);
    const q = this.qOf(id), n = NPCS[this.npc], x = (this.list || []).find((y) => y.id === id) || {};
    if (q.bt) { // личное задание: выполнено / закрыто
      this.ov.showScreen(`<div class="mc-dialog"><div class="who" style="color:${n.color}">${esc(n.name)}</div><div class="qt">${esc(q.title)} · <small>${esc(q.chapter)}</small></div>
        ${st === 'locked' ? `<p class="qa-lock">🔒 ${esc(x.reason || 'Пока недоступно')}</p>` : '<p class="qa-lock">📖 Выполнено.</p>'}${q.why ? `<p>${esc(q.why)}</p>` : ''}</div>`,
        [{ text: '← Все квесты', onClick: () => this.showAll() }, ...this.btnSvc(), { text: 'Уйти', cls: 'ghost', onClick: () => this.close() }], 'mc-dialog-screen');
      this.isOpen = true; return;
    }
    const lines = st === 'done' ? (q.lore ? [q.lore] : q.done) : st === 'complete' ? q.done : st === 'active' ? [q.progress, q.hint ? `Подсказка: ${q.hint}` : ''].filter(Boolean) : q.offer;
    const goals = q.objectives.map((o) => `<li>${esc(objText(o))}${condLine(o) ? `<small class="mc-qcond">✦ ${esc(condLine(o))}</small>` : ''}</li>`).join('');
    const btns = [];
    if (st === 'available') btns.push({ text: `Взять: ${q.title}`, cls: 'gold', id: 'npc-take', onClick: () => { this.accept(q); this.close(); } });
    if (st === 'complete') btns.push({ text: `✔ Сдать`, cls: 'gold', onClick: () => { this.turnIn(q); this.close(); } });
    btns.push({ text: '← Все квесты', onClick: () => this.showAll() }, ...this.btnSvc(), { text: 'Уйти', cls: 'ghost', onClick: () => this.close() });
    this.ov.showScreen(`<div class="mc-dialog"><div class="who" style="color:${n.color}">${esc(n.name)}</div><div class="qt">${esc(q.title)}${starTag(q)} · <small>${esc(q.chapter || '')}</small></div>
      ${st === 'locked' ? `<p class="qa-lock">🔒 ${esc(x.reason || 'Пока недоступно')} — можно только прочитать.</p>` : ''}${st === 'done' ? '<p class="qa-lock">📖 Выполнено. Лор:</p>' : ''}
      ${lines.map((l) => `<p>${esc(l)}</p>`).join('')}${st !== 'done' ? `<ul class="qa-goals">${goals}</ul>${rewardsHtml(q, x)}` : ''}</div>`, btns, 'mc-dialog-screen');
    this.isOpen = true;
  }
  // ---------- визуальная новелла: окна диалога из админки (аватар с эмоцией слева, имя + текст, «Дальше») ----------
  speaker(w) {
    let id = w.who;
    if (id === VN_HERO) { const cls = this.meta?.hero?.cls; id = VN_CHARS[cls] ? cls : null; if (!id) return { id: null, name: 'Вы', color: '#e2e8f0' }; }
    const c = VN_CHARS[id]; return c ? { id, name: c.name, color: c.color } : { id: null, name: '…', color: '#e2e8f0' };
  }
  /** сюжетный квест или личное задание (собранное в тот же вид) */
  qOf(id) { return QUEST_BY_ID[id] || ((this.list || []).some((x) => x.bt && x.id === id) ? boardQuest(this.board, this.npc, id) : null); }
  flow(id) { const q = this.qOf(id); if (!q) return null; const x = (this.list || []).find((y) => y.id === id) || {};
    if (this.brLocal?.[id]) x.br = this.brLocal[id]; // выбор только что сделан в этом диалоге
    return { q, f: questFlow(q, q.bt ? null : QUEST_DIALOGUES[id]), x }; }
  accept(q) { if (q.bt) this.board.take(q.id, true); else this.meta.accept(q.id); }
  turnIn(q) { if (q.bt) this.board.claim(q.id); else this.meta.turnIn(q.id); }
  /** кнопки услуг NPC (Пётр: Ремесло/Улучшение) — во всех окнах диалога, рядом с квестами */
  // окно услуги открыто — NPC продолжает стоять (сервер держит его до npc_talk_end, который шлёт game.js при закрытии окна услуги)
  btnSvc() { return svcOf(this.npc).map((s) => ({ text: s.text, cls: 'svc', id: s.id, onClick: () => { const npc = this.npc; this.close(true); this.svcNpc = npc; this[s.cb]?.(); } })); }
  /** «Все квесты» + услуги — для промежуточных окон VN и концовок */
  btnMid() { return [...this.btnAll(), ...this.btnSvc()]; }
  btnAll() { return (this.list || []).some((x) => x.bt || QUEST_BY_ID[x.id]) ? [{ text: '📜 Все квесты', id: 'npc-all-quests', onClick: () => this.showAll() }] : []; }
  // 1) окна пояснения → 2) окно получения
  flowOffer(id) { const F = this.flow(id); if (!F) return;
    if (F.q.card?.on && !this.cardOn && !cardSeen(id)) { // карточка главы — один раз, затем обычный поток
      this.cardOn = true; cardMark(id); this.ov.hideScreen?.();
      chapterCard(F.q.card.t || F.q.chapter || F.q.title, F.q.card.s || F.q.title, () => { this.cardOn = false; if (this.npc) this.flowOffer(id); }); this.isOpen = true; return; }
    if (!F.f.offer.length) return this.flowAccept(id);
    this.playVN(F.f.offer, F.q, [{ text: 'Дальше ▸', cls: 'gold', id: 'vn-next', onClick: () => this.flowAccept(id) }, ...this.btnMid(), { text: 'Уйти', cls: 'ghost', onClick: () => this.close() }], { mid: this.btnMid() }); }
  // 2) окно получения: говорящий + текст, цели с реальными именами, награда, «Взять»/«Уйти»
  flowAccept(id) { const F = this.flow(id); if (!F) return;
    this.playVN([F.f.accept], F.q, [{ text: `Взять: ${F.q.title}`, cls: 'gold', id: 'vn-accept', onClick: () => { this.accept(F.q); this.close(); } }, ...this.btnMid(), { text: 'Уйти', cls: 'ghost', onClick: () => this.close() }],
      { kind: 'accept', extra: `<div class="vn-step">📜 Задание</div>${objectivesHtml(F.q, null)}${rewardsHtml(F.q, F.x)}` }); }
  // 3) «В процессе»: одно окно + прогресс целей
  flowProgress(id) { const F = this.flow(id); if (!F) return;
    const w = F.f.progress || { who: npcVnChar(F.q.npc) || VN_HERO, emo: 'think', text: F.q.progress || '…' };
    const drop = F.q.bt?.take ? [{ text: 'Отказаться', cls: 'ghost', id: 'vn-drop', onClick: () => { this.board.take(F.q.id, false); this.close(); } }] : [];
    this.playVN([w], F.q, [...this.btnMid(), ...drop, { text: 'Уйти', cls: 'ghost', onClick: () => this.close() }],
      { kind: 'progress', extra: `${objectivesHtml(F.q, F.x.p)}${F.q.hint ? `<small class="vn-hintq">Подсказка: ${esc(F.q.hint)}</small>` : ''}` }); }
  // 4) окна сдачи, на последнем — награда и «Сдать»
  flowDone(id) { const F = this.flow(id); if (!F) return;
    const wins = F.f.done.length ? F.f.done : [{ who: npcVnChar(F.q.turnin || F.q.npc) || VN_HERO, emo: 'joy', text: 'Готово.' }];
    this.playVN(wins, F.q, [{ text: `✔ Сдать: ${F.q.title}`, cls: 'gold', id: 'vn-turnin', onClick: () => { this.turnIn(F.q); this.close(); } }, ...this.btnMid(), { text: 'Уйти', cls: 'ghost', onClick: () => this.close() }],
      { kind: 'done', extra: rewardsHtml(F.q, F.x), mid: this.btnMid(), re: () => rewardsHtml(F.q, this.flow(id)?.x || F.x) }); }
  playVN(wins, q, endBtns, opt = {}) {
    this.vn = { wins, q, endBtns, i: 0, opt };
    for (const w of wins) { const sp = this.speaker(w); if (sp.id) { const im = new Image(); im.src = vnImg(sp.id, w.emo); } } // предзагрузка
    if (!this.vnKey) { // Space/Enter — «Дальше» (до игровых клавиш: рывок/чат)
      this.vnKey = (e) => { if (!this.vn || !this.isOpen) return; if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); e.stopImmediatePropagation(); if (!e.repeat) this.vnNext(); } };
      window.addEventListener('keydown', this.vnKey, true);
    }
    this.vnRender();
  }
  /** куда ведёт окно: метка go / «end» / следующее по порядку; ≥ длины — конец фазы */
  vnTo(go, i) { const v = this.vn; if (!go) return i + 1; if (go === 'end') return v.wins.length; const j = v.wins.findIndex((w) => w.id === go); return j < 0 ? i + 1 : j; }
  vnLast() { const v = this.vn, w = v.wins[v.i]; return v.fin || (!w.ch?.length && this.vnTo(w.go, v.i) >= v.wins.length); }
  /** выбор игрока: на сервер (ветка: награда, открытие квестов), затем переход по ветке */
  vnChoose(ci) { const v = this.vn; if (!v) return; const w = v.wins[v.i], c = w.ch?.[ci]; if (!c) return;
    const kind = v.opt.kind || 'offer';
    if (v.q && !v.q.bt && (kind === 'offer' || kind === 'done')) { this.meta?.send?.({ type: 'quest_choice', id: v.q.id, ph: kind, wi: v.i, ci });
      if (c.k) (this.brLocal = this.brLocal || {})[v.q.id] = c.k; }
    const j = this.vnTo(c.go, v.i);
    if (j < v.wins.length) { v.i = j; return this.vnRender(); }
    if (kind === 'done') { v.fin = true; if (v.opt.re) v.opt.extra = v.opt.re(); return this.vnRender(); } // концовка ветки: награда этой ветки и «Сдать»
    const b = v.endBtns.find((x) => x.cls === 'gold'); if (b) b.onClick(); }
  vnNext() { const v = this.vn; if (!v) return; const w = v.wins[v.i]; if (w.ch?.length && !v.fin) return; // выбор — только кнопкой
    const j = this.vnTo(w.go, v.i); if (!v.fin && j < v.wins.length) { v.i = j; this.vnRender(); } else if (v.opt.kind === 'accept' || v.opt.kind === 'progress') { /* «Взять» — только кнопкой */ } else { const b = v.endBtns.find((x) => x.cls === 'gold'); if (b) b.onClick(); } }
  vnRender() {
    const v = this.vn, w = v.wins[v.i], sp = this.speaker(w), last = this.vnLast(), choice = !!w.ch?.length && !v.fin;
    if (v.opt.re && last && !v.fin && (v.opt.kind === 'done')) v.opt.extra = v.opt.re();
    const btns = choice ? [...(v.opt.mid || []), { text: 'Уйти', cls: 'ghost', onClick: () => this.close() }] : last ? v.endBtns : [{ text: 'Дальше ▸', cls: 'gold', id: 'vn-next', onClick: () => this.vnNext() }, ...(v.opt.mid || []), { text: 'Уйти', cls: 'ghost', onClick: () => this.close() }];
    const kind = v.opt.kind || 'offer', many = v.wins.length > 1;
    const el = this.ov.showScreen(`<div class="mc-vn vn-${kind}" data-vn-i="${v.i}" data-who="${esc(w.who)}" data-emo="${esc(w.emo)}" data-kind="${kind}">
      ${sp.id ? `<img class="vn-av" src="${vnImg(sp.id, w.emo)}" alt="${esc(sp.name)}">` : ''}
      <div class="mc-dialog vn-box"><div class="vn-top"><span class="who" style="color:${sp.color}">${esc(sp.name)}</span>${v.q ? `<span class="qt">${esc(v.q.title)}${starTag(v.q)}</span>` : ''}${many ? `<span class="vn-n">${v.i + 1} / ${v.wins.length}</span>` : ''}</div>
      ${(w.text || '').split('\n').filter(Boolean).map((l) => `<p>${esc(l)}</p>`).join('')}${choice ? `<div class="vn-choices">${w.ch.map((c, ci) => `<button class="mc3d-btn vn-ch" data-ci="${ci}">${esc(c.t)}${c.k && v.q?.rewards?.alt?.[c.k] ? '<small>✦ меняет награду</small>' : ''}</button>`).join('')}</div>` : ''}${last && v.opt.extra ? v.opt.extra : ''}${choice ? '<small class="vn-hint">Выберите ответ</small>' : last && kind === 'offer' ? '<small class="vn-hint">Дальше — условия задания</small>' : last ? '' : '<small class="vn-hint">Пробел / Enter — дальше</small>'}</div></div>`, btns, 'mc-dialog-screen mc-vn-screen');
    el.querySelector('.vn-box').onclick = (e) => { e.stopPropagation(); if (!last && !choice) this.vnNext(); };
    el.querySelectorAll('.vn-ch').forEach((b) => (b.onclick = (e) => { e.stopPropagation(); this.vnChoose(Number(b.dataset.ci)); }));
    this.isOpen = true;
  }
  // keep — не отпускать NPC (открывается окно его услуги); иначе NPC снова может гулять
  close(keep = false) { this.brLocal = null; const was = this.isOpen; if (this.isOpen) this.ov.hideScreen(); this.isOpen = false; this.vn = null; if (was && !keep && this.npc) this.meta?.send?.({ type: 'npc_talk_end', npc: this.npc }); }
  /** окно услуги (Кузня/Ремесло) закрыто — отпустить NPC */
  svcDone() { if (this.svcNpc && !this.isOpen) this.meta?.send?.({ type: 'npc_talk_end', npc: this.svcNpc }); this.svcNpc = null; }
}
