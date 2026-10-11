// Клиент мета-прогрессии: хранит последний снимок профиля с сервера (meta_state) и шлёт запросы.
// Всё решает сервер (server/meta/*): клиент лишь показывает и просит.
import { QUEST_BY_ID } from '../../../../../server/meta/quests.ts';
import { NPCS, HERO_NAMES } from '../../../../../server/meta/defs.ts';

export class MetaClient {
  constructor(send) {
    this.send = send;
    this.state = null; // { verified, account, hero, heroes, available, complete, zone }
    this.listeners = new Set();
    this.version = 0;
  }
  on(fn) { this.listeners.add(fn); return () => this.listeners.delete(fn); }
  apply(st) {
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
    if (complete || q.objectives.some((o) => o.type === 'talk')) {
      const n = NPCS[q.npc];
      if (n) return { world: n.world, x: n.x, y: n.y, label: n.name };
    }
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
  craft(recipe) { this.send({ type: 'craft', recipe }); }
  talk(npc) { this.send({ type: 'npc_talk', npc }); }
  accept(id) { this.send({ type: 'quest_accept', id }); }
  turnIn(id) { this.send({ type: 'quest_turnin', id }); }
  refresh() { this.send({ type: 'meta_get' }); }
}

// Подсказки направления для целей без NPC (координаты мира сервера, px)
export const QUEST_WAYPOINTS = {
  p1_swarm: { world: 'hellfire', x: 640, y: 150, label: 'Рой Мошкары' },
  p2_shell: { world: 'hellfire', x: 565, y: 600, label: 'Алтарь перевоплощения' },
  p4_dream: { world: 'hellfire', x: 240, y: 600, label: 'Разлом в Аринар' },
  l2_moths: { world: 'arinar', x: 320, y: 920, label: 'Тихие мотыльки' },
  l3_violets: { world: 'arinar', x: 520, y: 760, label: 'Ночные фиалки' },
  l4_boss: { world: 'arinar', x: 720, y: 1040, label: 'Безветрие' },
  a2_heat: { world: 'arinar', x: 1010, y: 880, label: 'Глитч-слизь' },
  a3_cool: { world: 'arinar', x: 1100, y: 620, label: 'Звёздное серебро' },
  a4_hall: { world: 'arinar', x: 900, y: 600, label: 'Комната «Бездна»' },
  j1_fans: { world: 'arinar', x: 900, y: 600, label: 'Комната «Бездна» (вдвоём)' },
};
