// Клиент мета-прогрессии: хранит последний снимок профиля с сервера (meta_state) и шлёт запросы.
// Всё решает сервер (server/meta/*): клиент лишь показывает и просит.
import { patchOf } from '../../../../../server/meta/zoneGen.ts';
import { QUEST_BY_ID, turninNpc } from '../../../../../server/meta/quests.ts';
import { NPCS, HERO_NAMES } from '../../../../../server/meta/shared.ts';
import { addCards } from './itemCards.js';

export class MetaClient {
  constructor(send) {
    this.send = send;
    this.state = null; // { verified, account, hero, heroes, available, complete, zone }
    this.listeners = new Set();
    this.version = 0;
    try { this.mobTrack = localStorage.getItem('mc-mob-track') || null; } catch (_) { this.mobTrack = null; }
  }
  // отслеживание моба из Бестиария (одна цель; работает вместе с отслеживанием квеста)
  setMobTrack(id) { this.mobTrack = id || null; try { localStorage.setItem('mc-mob-track', this.mobTrack || ''); } catch (_) {} }
  on(fn) { this.listeners.add(fn); return () => this.listeners.delete(fn); }
  apply(st) {
    addCards(st.cards);
    if (st.account && this.state?.account && !st.recipes && this.state.recipes) st.recipes = this.state.recipes;
    this.state = st;
    this.version++;
    for (const fn of this.listeners) { try { fn(st); } catch (err) { console.error('[meta]', err); } }
  }
  applyProgress(list) {
    if (!this.state) return;
    for (const q of list || []) {
      const a = this.state.account.quests.active[q.id];
      if (a && q.p) a.p = q.p;
      if (q.complete && !this.state.complete.includes(q.id)) this.state.complete.push(q.id);
    }
    this.apply(this.state);
  }
  get ready() { return !!this.state; }
  get account() { return this.state?.account || null; }
  get hero() { return this.state?.hero || null; }
  flag(f) { return !!this.state?.account?.flags?.[f]; }

  // Квест, за которым следит трекер: сначала готовые к сдаче, потом активные (сюжет важнее звёзд)
  trackedQuest() {
    const a = this.account;
    if (!a) return null;
    const order = ['prologue', 'leyr', 'alzi', 'joint', 'star', 'exam', 'black'];
    const ids = Object.keys(a.quests.active).filter((id) => QUEST_BY_ID[id]);
    ids.sort((x, y) => order.indexOf(QUEST_BY_ID[x].campaign) - order.indexOf(QUEST_BY_ID[y].campaign));
    const done = ids.find((id) => this.state.complete.includes(id));
    return done || ids[0] || null;
  }
  // Куда идти по квесту: {world,x,y,label} или null
  questTarget(qid) {
    const q = QUEST_BY_ID[qid];
    if (!q) return null;
    const complete = this.state.complete.includes(qid);
    if (complete) { // сдавать — NPC сдачи (может отличаться от выдавшего)
      const n = NPCS[turninNpc(q)];
      if (n) return { world: n.world, x: n.x, y: n.y, label: n.name, other: turninNpc(q) !== q.npc };
    }
    const talk = q.objectives.find((o) => o.type === 'talk');
    if (talk) { const n = NPCS[talk.npc || q.npc]; if (n) return { world: n.world, x: n.x, y: n.y, label: n.name }; }
    return QUEST_WAYPOINTS[qid] || null;
  }
  heroName(cls) { return HERO_NAMES[cls] || 'Душа'; }

  // запросы
  talentLearn(id) { this.send({ type: 'talent_learn', id }); }
  setLoadout(ids) { this.send({ type: 'loadout_set', ids }); }
  radianceUp(id) { this.send({ type: 'radiance_up', id }); }
  silence(id) { this.send({ type: 'ability_silence', id, confirm: 'ЗАГЛУШИТЬ' }); }
  soulBuy(id) { this.send({ type: 'soul_buy', id }); }
  equip(uid) { this.send({ type: 'equip', uid }); }
  unequip(slot) { this.send({ type: 'unequip', slot }); }
  salvage(uid) { this.send({ type: 'salvage', uid }); }
  salvagePreview(rarity) { this.send({ type: 'salvage_preview', rarity }); }
  salvageMany(rarity, uids) { this.send({ type: 'salvage_many', rarity, uids }); }
  craft(recipe) { this.send({ type: 'craft', recipe }); }
  talk(npc) { this.send({ type: 'npc_talk', npc }); }
  accept(id) { this.send({ type: 'quest_accept', id }); }
  turnIn(id) { this.send({ type: 'quest_turnin', id }); }
  refresh() { this.send({ type: 'meta_get' }); }
  // Библиотека предметов/мобов (вкладки Книги): сервер присылает только открытое
  libGet() { this.send({ type: 'lib_get' }); }
  applyLibrary(lib) { this.library = lib; addCards(lib.items); this.libVersion = (this.libVersion || 0) + 1; for (const fn of this.listeners) { try { fn(this.state); } catch (err) { console.error('[meta]', err); } } }
  // Снять «новое»: копим id и отправляем пачкой (не чаще раза в 600 мс)
  markSeen(kind, ids) {
    if (!ids?.length) return;
    this.seenQ = this.seenQ || { inv: new Set(), items: new Set(), mobs: new Set(), feats: new Set() };
    for (const id of ids) this.seenQ[kind].add(id);
    clearTimeout(this.seenT);
    this.seenT = setTimeout(() => {
      const q = this.seenQ; this.seenQ = null;
      const msg = { type: 'mark_seen' };
      for (const k of ['inv', 'items', 'mobs', 'feats']) if (q[k].size) msg[k] = [...q[k]].slice(0, 200);
      this.send(msg);
      // оптимистично снимаем подсветку локально; сервер подтвердит следующим meta_state/library
      const a = this.state?.account;
      if (a) {
        for (const it of a.inv) if (q.inv.has(it.uid)) it.n = 0;
        for (const id of q.items) if (a.disc?.items?.[id]) a.disc.items[id].v = 1;
        for (const id of q.mobs) if (a.bestiary?.[id]) a.bestiary[id].v = 1;
        for (const id of q.feats) if (a.disc?.feats?.[id]) a.disc.feats[id].v = 1;
      }
      const L = this.library;
      if (L) { for (const id of q.items) if (L.items[id]) L.items[id].isNew = false; for (const id of q.mobs) if (L.mobs[id]) L.mobs[id].isNew = false; }
    }, 600);
  }
  // счётчики «новое» для вкладок Книги и кнопки Книги
  unread() {
    const a = this.account;
    if (!a) return { gear: 0, library: 0, mobs: 0, total: 0 };
    const gear = a.inv.filter((i) => i.n).length;
    const library = Object.values(a.disc?.items || {}).filter((d) => !d.v).length;
    const mobs = Object.values(a.bestiary || {}).filter((b) => b.v === 0).length;
    const feats = Object.entries(a.disc?.feats || {}).filter(([, d]) => !d.v).length;
    return { gear, library, mobs, feats, total: gear + library + mobs };
  }
}

// Подсказки направления для целей без NPC (координаты мира сервера, px)
const pXY = (k) => { const p = patchOf(k); return p ? { x: p.x, y: p.y } : { x: 24000, y: 24000 }; }; // ближайшее к хабу пятно биома
export const QUEST_WAYPOINTS = {
  p1_swarm: { world: 'hellfire', x: 640, y: 150, label: 'Рой Мошкары' },
  p2_shell: { world: 'hellfire', x: 565, y: 600, label: 'Алтарь перевоплощения' },
  p4_dream: { world: 'hellfire', x: 240, y: 600, label: 'Разлом в Аринар' },
  // карта Аринара 48000×48000: хаб в центре, биомы вокруг (регионы — server/meta/zoneGen.ts)
  l2_moths: { world: 'arinar', x: 24000, y: 27400, label: 'Тихие мотыльки (Луга фиалок)' },
  l3_violets: { world: 'arinar', x: 20600, y: 24000, label: 'Ночные фиалки (Фиалковая лощина)' },
  l4_boss: { world: 'arinar', ...pXY('ridge'), label: 'Безветрие (Восточный кряж, ближнее пятно)' },
  a2_heat: { world: 'arinar', x: 24000, y: 28200, label: 'Глитч-слизь (Луга фиалок, юг)' },
  a3_cool: { world: 'arinar', ...pXY('wastes'), label: 'Звёздное серебро (Пустоши, ближнее пятно)' },
  a4_hall: { world: 'arinar', x: 24300, y: 24000, label: 'Комната «Бездна»' },
  j1_fans: { world: 'arinar', x: 24300, y: 24000, label: 'Комната «Бездна» (вдвоём)' },
};
