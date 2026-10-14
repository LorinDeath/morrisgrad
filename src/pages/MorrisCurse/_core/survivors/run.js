// Симуляция забега. Чистая логика (без Three.js), координаты — метры арены (центр 0,0).
// Co-op: хост (назначает сервер — самый ранний участник комнаты) авторитетен для орды, лута, часов
// и командного опыта; каждый клиент сам симулирует своего героя и свои снаряды и шлёт хосту попадания.
import {
  WEAPONS, PASSIVES, ABILITIES, ENEMIES, WAVES, RUN_CLASSES, MAX_WEAPONS, MAX_PASSIVES,
  ELITE_EVERY, BOSS_EVERY, ARENA_RADIUS, xpNeed, classRunStats, armorReduction, ROOM_WAVES, ROOM_BOSS, ROOM_ELITES,
  RUN_ROOMS, TRIAL, TRIAL_WAVES, STATUS,
} from './data.js';
const HEART_T = { x: 0, z: 0, heart: true };
// Общие с сервером определения навыков (Сияние, раскладка): один источник истины
import { ABILITY_BY_ID } from '../../../../../server/meta/shared.ts';

const TYPE_IDS = Object.keys(ENEMIES);
const PICKUP_KINDS = ['heart', 'magnet', 'bomb', 'chest'];
const rand = (a, b) => a + Math.random() * (b - a);
const dist2 = (ax, az, bx, bz) => (ax - bx) * (ax - bx) + (az - bz) * (az - bz);
const r1 = (v) => Math.round(v * 10) / 10;
// Повышение уровня в забеге: БЕЗ паузы (соло и отряд 2–4). Пока открыт выбор — 3 с неуязвимости;
// выбор в эти 3 с → ударная волна от героя (отбрасывает врагов рядом, без урона). Хост проверяет окно и волну.
export const LVL_INVULN = 3;
export const WAVE = { r: 4.5, knock: 2.2 };
// биты статусов (снапшот хоста и попадания гостей)
const ST_BIT = { burn: 1, poison: 2, bleed: 4, freeze: 8 };
// «стоячие» снаряды: у союзников рисуются на месте, без полёта (мины, облака, лучи)
const STATIC_SHOTS = new Set(['glyph_mine', 'plague_cloud', 'sun_beam']);
// спрайт попадания по виду оружия (рендер берёт из fx 'hit')
const HIT_ROW = {
  soul_spark: 'hit_ice', war_axe: 'hit', spear: 'hit', daggers: 'hit_bleed', fire_spark: 'hit_fire', orbit_skulls: 'hit_arcane',
  chain_bolt: 'hit_arcane', ice_fan: 'hit_ice', thorn_bow: 'hit_bleed', moon_orb: 'hit', glyph_mine: 'hit_arcane', sun_beam: 'hit_fire',
  split_shard: 'hit_arcane', plague_flask: 'hit_poison', fly_blades: 'hit_bleed',
  ab_backstab: 'hit_ice', ab_pierce: 'hit', ab_trick: 'hit_acid', ab_fireball: 'hit_fire',
};

// Препятствия арены (колонны склепа) — круговые коллайдеры
export const PILLARS = (() => {
  const out = [];
  for (let ring = 0; ring < 2; ring++) {
    const n = ring === 0 ? 6 : 10;
    const R = ring === 0 ? 18 : 38;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + ring * 0.3;
      out.push({ x: Math.cos(a) * R, z: Math.sin(a) * R, r: ring === 0 ? 1.1 : 1.5 });
    }
  }
  return out;
})();

function resolvePillars(o, radius) {
  for (const p of PILLARS) {
    const dx = o.x - p.x, dz = o.z - p.z;
    const d = Math.hypot(dx, dz);
    const min = p.r + radius;
    if (d < min && d > 0.0001) {
      o.x = p.x + (dx / d) * min;
      o.z = p.z + (dz / d) * min;
    }
  }
  const d = Math.hypot(o.x, o.z);
  const lim = ARENA_RADIUS - radius;
  if (d > lim) { o.x *= lim / d; o.z *= lim / d; }
}

class Grid {
  constructor(cell = 2.5) { this.cell = cell; this.map = new Map(); }
  clear() { this.map.clear(); }
  key(x, z) { return ((Math.floor(x / this.cell) + 512) << 10) | (Math.floor(z / this.cell) + 512); }
  add(e) {
    const k = this.key(e.x, e.z);
    let arr = this.map.get(k);
    if (!arr) { arr = []; this.map.set(k, arr); }
    arr.push(e);
  }
  query(x, z, r, out) {
    out.length = 0;
    const c = this.cell;
    const x0 = Math.floor((x - r) / c), x1 = Math.floor((x + r) / c);
    const z0 = Math.floor((z - r) / c), z1 = Math.floor((z + r) / c);
    for (let gx = x0; gx <= x1; gx++) {
      for (let gz = z0; gz <= z1; gz++) {
        const arr = this.map.get(((gx + 512) << 10) | (gz + 512));
        if (arr) for (const e of arr) out.push(e);
      }
    }
    return out;
  }
}

export class RunSession {
  constructor(opts) {
    this.room = opts.room;
    this.runSkill = opts.runSkill || null; // навык забега из пула аккаунта (сервер: account.runSkillSel)
    this.traits = opts.traits || null; // черты админки {weapon:[...], skill:{id:[...]}} — сервер присылает в meta_state.runTraits
    this.myId = opts.myId || 'local';
    this.username = opts.username || 'Странник';
    this.color = opts.color || '#ffffff';
    this.send = opts.send || (() => {});
    this.events = opts.events || (() => {});
    this.classKey = RUN_CLASSES[opts.classKey] ? opts.classKey : 'soul';
    this.cls = RUN_CLASSES[this.classKey];
    this.serverClass = opts.serverClass || null;
    this.isHost = opts.isHost !== false;
    // Итоговые статы героя с сервера (мета-прогрессия, ОДНОСТОРОННЕ: забег их не меняет)
    this.meta = opts.meta || null;
    // Режим комнаты: обычный забег, «Испытание отражений» (дуэль) или «Испытание Обители» (волны)
    this.mode = RUN_ROOMS[opts.room]?.mode || 'run';
    this.hpCapPct = this.mode === 'duel' ? Math.max(10, Math.min(100, Number(opts.hpCapPct) || 100)) : 100;
    this.members = new Map(); // id → {username,color,classId}
    this.remotes = new Map(); // id → состояние союзника
    this.grid = new Grid();
    this.tmp = [];
    this.reset(opts.seedTime || 0);
  }

  reset(startT = 0) {
    const st = classRunStats(this.classKey, this.serverClass);
    this.t = startT;
    this.ended = false;
    this.endInfo = null;
    this.paused = false;
    this.enemies = new Map();
    this.gems = new Map();
    this.pickups = new Map();
    this.enemyShots = [];
    this.projectiles = [];
    this.outShots = [];
    this.visualShots = [];
    this.fx = [];
    this.zones = []; // мины, облака, лучи (свои)
    this.dots = new Map(); // `${id}:${kind}` → {e, kind, dps, until, acc, src, stacks}
    this.nextId = 1;
    this.spawnAcc = 0;
    this.nextElite = ELITE_EVERY;
    this.nextBoss = BOSS_EVERY;
    this.bossCount = 0;
    this.team = { xp: 0, level: 1, kills: 0 };
    this.killCredit = {}; // id игрока → убийства (авторитет — хост, рассылается в снапшоте)
    this.seenLevel = 1;
    this.pendingChoices = 0;
    this.choiceSource = 'level';
    this.lvlInvUntil = -1; // до какого t героя не бьют (окно выбора после уровня)
    this.lvlEvent = 0; this.waveEvent = 0; // номер события «уровень» и события, за которое волна уже была
    this.hostLvlAt = -99; this.waveBy = {}; // хост: время последнего уровня отряда, кто уже пустил волну за событие
    this.wavesOut = []; this.waveFx = []; // волны для снапшота / для отрисовки [{x,z,t,owner}]
    this.pendingHits = [];
    this.pendingPicks = [];
    this.gemAdds = []; this.gemRems = []; this.pkAdds = []; this.pkRems = [];
    this.snapAcc = 0; this.meAcc = 0;
    this.lastSnapAt = 0;
    const mt = this.classKey !== 'soul' ? this.meta : null;
    const sc = this.serverClass || {};
    const hpBonus = mt ? Math.max(0, (Number(mt.maxHp) || 0) - Number(sc.maxHp || sc.hp || 0)) * 0.55 : 0;
    const armorBonus = mt ? Math.max(0, (Number(mt.armor) || 0) - Number(sc.armor || 0)) : 0;
    const baseHp = Math.round(st.maxHp + hpBonus);
    this.hazards = [];
    this.echoes = [];
    this.me = {
      x: rand(-2, 2), z: rand(-2, 2), dirX: 0, dirZ: 1, aimX: 0, aimZ: 1, moving: false,
      hp: baseHp, baseMaxHp: baseHp, maxHp: baseHp, armor: st.armor + armorBonus, baseSpeed: st.speed, dmgMult: st.dmgMult,
      metaDmg: 1 + (mt?.dmgPct || 0) / 100, metaCrit: (mt?.critPct || 0) / 100, metaLs: (mt?.lifestealPct || 0) / 100,
      metaRegen: mt?.regen || 0, metaSpeed: 1 + (mt?.speedPct || 0) / 100, metaMagnet: 1 + (mt?.magnetPct || 0) / 100,
      metaAtkSpd: 1 + (mt?.atkSpeedPct || 0) / 100, itemMin: mt?.itemDmgMin || 0, itemMax: mt?.itemDmgMax || 0,
      abilities: this.buildAbilities(mt), shieldT: 0, smokeT: 0, swiftT: 0, whirlT: 0, slowT: 0, leapT: 0,
      weapons: {}, passives: {}, abilityCd: 2, iframes: 0, dead: false, reviveProgress: 0,
      choosingInvuln: 0,
      stats: { damage: 0, kills: 0, taken: 0, healed: 0, picked: 0, byWeapon: {}, killsByType: {}, bossKills: 0, usedAbility: false },
    };
    // стартовое оружие класса и навык забега из пула (трофей открытого мира) — «бесплатные»: не занимают 4 слота оружия
    this.addWeapon(this.cls.startWeapon, true);
    const rs = this.runSkill;
    if (rs && WEAPONS[rs] && rs !== this.cls.startWeapon) this.addWeapon(rs, true);
    this.recalc();
    if (this.hpCapPct < 100) {
      // добровольное ограничение здоровья (звёздные задания Кьют): кап на весь бой
      const m = this.me;
      m.baseMaxHp = Math.max(1, Math.round(m.baseMaxHp * this.hpCapPct / 100));
      m.maxHp = m.baseMaxHp; m.hp = m.maxHp;
    }
    this.won = false;
    this.duelSpawned = false;
    this.trialWave = 0;
    this.heart = this.mode === 'trial' ? { hp: TRIAL.heartHp, maxHp: TRIAL.heartHp } : null;
  }

  // Активные навыки (2–3 слота): раскладка героя с сервера, иначе — навык класса
  buildAbilities(mt) {
    const list = [];
    if (mt?.abilities?.length) {
      for (const a of mt.abilities.slice(0, 3)) {
        const def = ABILITY_BY_ID[a.id];
        if (!def) continue;
        list.push({ id: a.id, name: def.name, icon: def.icon, desc: def.desc, power: (a.power || def.power) / def.power, cd: a.cd || def.cd, props: a.props || [], rad: a.rad || 0, cdLeft: 2 });
      }
    } else if (this.cls.ability) {
      const A = ABILITIES[this.cls.ability];
      list.push({ id: A.id, name: A.name, icon: A.icon, desc: A.desc, power: 1, cd: A.runCooldown, props: [], rad: 0, cdLeft: 2 });
    }
    return list;
  }

  // ---------- характеристики ----------
  plv(id) { return this.me.passives[id] || 0; }
  recalc() {
    const m = this.me;
    const vigor = this.plv('vigor');
    const newMax = Math.round(m.baseMaxHp * (1 + 0.15 * vigor));
    if (newMax > m.maxHp) m.hp += newMax - m.maxHp;
    m.maxHp = newMax;
    m.hp = Math.min(m.hp, m.maxHp);
    m.speed = m.baseSpeed * (1 + 0.08 * this.plv('swift')) * (m.metaSpeed || 1);
    m.magnet = 2.4 * (1 + 0.35 * this.plv('magnet')) * (m.metaMagnet || 1);
    m.regen = 0.4 * this.plv('regen') + (m.metaRegen || 0);
    m.might = 1 + 0.1 * this.plv('might');
    m.cdMult = Math.pow(0.93, this.plv('haste')) / (m.metaAtkSpd || 1);
    m.extra = this.plv('amount') >= 4 ? 2 : (this.plv('amount') >= 2 ? 1 : 0);
    m.area = 1 + 0.1 * this.plv('area');
    m.crit = Math.min(0.6, 0.05 + 0.06 * this.plv('luck') + (m.metaCrit || 0));
    m.abilityCdMult = Math.pow(0.88, this.plv('mastery'));
    m.abilityDmg = 1 + 0.2 * this.plv('mastery');
  }

  // R в забеге: навык надетого оружия (выдан бесплатным оружием) — мгновенный двойной залп, перезарядка 8 с
  weaponSkillBurst() {
    const id = this.runSkill, w = id && this.me?.weapons?.[id];
    if (!w || (this.wsCd || 0) > 0 || !this.me.alive && this.me.alive !== undefined) return false;
    const s = this.weaponStats(id);
    this.fireWeapon(id, s); this.fireWeapon(id, s);
    w.cd = Math.min(w.cd, 0.05); this.wsCd = 8;
    return true;
  }
  addWeapon(id, free = false) {
    if (!WEAPONS[id]) return;
    if (this.me.weapons[id]) this.me.weapons[id].lv = Math.min(8, this.me.weapons[id].lv + 1);
    else this.me.weapons[id] = { lv: 1, cd: 0.3, free };
  }

  weaponStats(id) {
    const W = WEAPONS[id];
    const lv = this.me.weapons[id]?.lv || 1;
    const s = { ...W.base };
    let dmgMul = 1;
    for (let i = 0; i < lv - 1; i++) {
      const txt = W.levels[i] || '';
      const num = parseInt((txt.match(/\d+/) || ['1'])[0], 10);
      if (/Урон/.test(txt)) dmgMul += num / 100;
      else if (/Перезарядка/.test(txt)) s.cd *= 1 - num / 100;
      else if (/Пробитие/.test(txt)) s.pierce += num;
      else if (/прыж/.test(txt)) s.chain = (s.chain || 0) + num;
      else if (/Отскок/.test(txt)) s.bounce = (s.bounce || 0) + num;
      else if (/Раскол/.test(txt)) s.split = (s.split || 0) + num;
      else if (/Радиус/.test(txt)) { if (s.explode) s.explode *= 1 + num / 100; if (s.orbit) s.orbit *= 1 + num / 100; if (s.zone) s.zone *= 1 + num / 100; }
      else if (/Размер/.test(txt)) s.size *= 1 + num / 100;
      else if (/Длительность/.test(txt)) { if (s.zoneLife) s.zoneLife += num; else s.life += num; }
      else if (/Замедление/.test(txt)) s.slow = Math.min(0.8, (s.slow || 0) + 0.2);
      else if (/^\+/.test(txt)) s.count += num;
    }
    s.dmg *= dmgMul;
    s.count += this.me.extra;
    s.size *= this.me.area;
    if (s.explode) s.explode *= this.me.area;
    s.cd *= this.me.cdMult;
    return s;
  }

  // ---------- выбор улучшений ----------
  rollChoices(n = 3) {
    const m = this.me;
    const pool = [];
    // лимит MAX_WEAPONS — только на оружие, взятое улучшениями: навыки класса и бесплатное оружие слоты не тратят
    const ownedW = Object.keys(m.weapons).filter((id) => !m.weapons[id].free);
    const ownedP = Object.keys(m.passives);
    Object.keys(WEAPONS).forEach((id) => {
      const have = m.weapons[id];
      if (have && have.lv >= 8) return;
      if (!have && ownedW.length >= MAX_WEAPONS) return;
      const w = this.cls.affinity.includes(id) ? 3 : 1;
      pool.push({ kind: 'weapon', id, w: have ? w * 1.4 : w });
    });
    Object.keys(PASSIVES).forEach((id) => {
      const P = PASSIVES[id];
      if (P.needsAbility && !this.me.abilities.length) return;
      const lv = m.passives[id] || 0;
      if (lv >= P.max) return;
      if (!lv && ownedP.length >= MAX_PASSIVES) return;
      pool.push({ kind: 'passive', id, w: id === 'mastery' ? 1.6 : 1 });
    });
    const out = [];
    while (out.length < n && pool.length) {
      const total = pool.reduce((a, b) => a + b.w, 0);
      let r = Math.random() * total;
      let idx = 0;
      for (; idx < pool.length; idx++) { r -= pool[idx].w; if (r <= 0) break; }
      const pick = pool.splice(Math.min(idx, pool.length - 1), 1)[0];
      out.push(this.describeChoice(pick));
    }
    if (!out.length) out.push({ kind: 'heal', id: 'heal', name: 'Глоток жизни', icon: '🧪', desc: 'Восстановить 40% здоровья', lv: 0 });
    return out;
  }

  describeChoice(c) {
    if (c.kind === 'weapon') {
      const W = WEAPONS[c.id];
      const lv = this.me.weapons[c.id]?.lv || 0;
      return { ...c, name: W.name, icon: W.icon, lv: lv + 1, isNew: !lv, desc: lv ? W.levels[lv - 1] : W.desc };
    }
    const P = PASSIVES[c.id];
    const lv = this.me.passives[c.id] || 0;
    return { ...c, name: P.name, icon: P.icon, lv: lv + 1, isNew: !lv, desc: P.desc };
  }

  applyChoice(c) {
    if (!c) return;
    if (c.kind === 'weapon') this.addWeapon(c.id);
    else if (c.kind === 'passive') this.me.passives[c.id] = (this.me.passives[c.id] || 0) + 1;
    else if (c.kind === 'heal') this.heal(this.me.maxHp * 0.4);
    this.recalc();
    this.pendingChoices = Math.max(0, this.pendingChoices - 1);
    // выбор за 3 с после уровня → ударная волна (одна за событие уровня); неуязвимость сразу заканчивается
    if (this.invulnLeft() > 0 && this.waveEvent !== this.lvlEvent) {
      this.waveEvent = this.lvlEvent;
      this.lvlInvUntil = Math.min(this.lvlInvUntil, this.t + 0.25);
      this.shockwave();
    }
    this.events('choice_applied', c);
  }

  invulnLeft() { return Math.max(0, this.lvlInvUntil - this.t); }

  shockwave() {
    const m = this.me;
    this.waveFx.push({ x: m.x, z: m.z, t: 0, owner: this.myId });
    if (this.isHost) this.applyWave(m.x, m.z, this.myId);
    else this.send({ k: 'wave' }); // гость: волну применяет и проверяет хост
  }

  // Хост: волна союзника — только в окне после уровня отряда и одна за событие; центр — позиция, известная хосту
  hostWave(from) {
    const r = this.remotes.get(from);
    if (!r || r.dead || this.t - this.hostLvlAt > LVL_INVULN + 0.5 || this.waveBy[from]) { this.waveRejected = (this.waveRejected || 0) + 1; return false; }
    this.waveBy[from] = true;
    this.applyWave(r.tx ?? r.x, r.tz ?? r.z, from);
    return true;
  }

  applyWave(x, z, owner) {
    if (owner === this.myId) this.waveBy[owner] = true;
    let n = 0;
    for (const e of this.enemies.values()) {
      if (e.dead) continue;
      const dx = e.x - x, dz = e.z - z, d = Math.hypot(dx, dz);
      if (d > WAVE.r || d < 1e-3) continue;
      const k = WAVE.knock * (1 - (d / WAVE.r) * 0.5) * (e.boss ? 0.15 : e.elite ? 0.5 : 1);
      this.knock(e, (dx / d) * k, (dz / d) * k); n++;
    }
    if (this.remotes.size) this.wavesOut.push([r1(x), r1(z), owner]);
    if (owner !== this.myId) this.waveFx.push({ x, z, t: 0, owner }); // волна союзника — видна и хосту
    this.lastWave = { x, z, owner, n };
    return n;
  }

  heal(v) {
    const m = this.me;
    if (m.dead) return;
    const before = m.hp;
    m.hp = Math.min(m.maxHp, m.hp + v);
    m.stats.healed += m.hp - before;
  }

  // ---------- главный тик ----------
  update(dt, input) {
    if (this.ended) return;
    if (this.paused) return; // выбор улучшения игру НЕ останавливает
    if (this.isHost) this.t += dt;
    else this.t += dt; // гость экстраполирует, снапшот поправит
    this.updateMe(dt, input);
    if (this.isHost) this.hostSimulate(dt);
    else this.guestSimulate(dt);
    this.updateProjectiles(dt);
    this.updateZones(dt);
    this.updateDots(dt);
    this.updateVisualShots(dt);
    this.updatePickupsLocal(dt);
    this.updateFx(dt);
    if (this.delayed?.length) {
      for (let i = this.delayed.length - 1; i >= 0; i--) {
        const d = this.delayed[i];
        d.t -= dt;
        if (d.t <= 0) { this.delayed.splice(i, 1); d.fn(); }
      }
    }
    this.netTick(dt);
    if (this.team.level > this.seenLevel) {
      this.pendingChoices += this.team.level - this.seenLevel;
      this.seenLevel = this.team.level;
      this.choiceSource = 'level';
      this.lvlEvent++;
      this.lvlInvUntil = this.t + LVL_INVULN;
      if (this.isHost) { this.hostLvlAt = this.t; this.waveBy = {}; }
      this.events('levelup', { level: this.team.level });
    }
  }

  updateMe(dt, input) {
    const m = this.me;
    m.iframes = Math.max(0, m.iframes - dt);
    m.choosingInvuln = this.invulnLeft();
    if (m.dead) {
      m.moving = false;
      return;
    }
    let ix = input?.x || 0, iz = input?.z || 0;
    // во время выбора можно двигаться: игра идёт
    const len = Math.hypot(ix, iz);
    if (len > 0.05) {
      const k = Math.min(1, len);
      const spd = m.speed * (m.swiftT > 0 ? 1.25 : 1) * (m.slowT > 0 ? 0.6 : 1);
      m.x += (ix / len) * spd * k * dt;
      m.z += (iz / len) * spd * k * dt;
      m.dirX = ix / len; m.dirZ = iz / len;
      m.moving = true;
    } else m.moving = false;
    if (input?.dash && !m.dashCd) {
      m.dashT = 0.2; m.dashCd = 1.1; m.iframes = Math.max(m.iframes, 0.3);
    }
    if (m.dashT > 0) {
      m.dashT -= dt;
      m.x += m.dirX * 26 * dt; m.z += m.dirZ * 26 * dt;
    }
    if (m.dashCd) m.dashCd = Math.max(0, m.dashCd - dt);
    resolvePillars(m, 0.5);
    // в бою (удар/урон за последние sec с) восстановление ×mul — как в мире, из админки «Спавн» (по умолчанию 0.1 / 5 с)
    const rc = globalThis.__mcRegen || { mul: 0.1, sec: 5 };
    if (m.regen) this.heal(m.regen * dt * (this.t - (m.combatAt ?? -1e9) < rc.sec ? rc.mul : 1));

    this.wsCd = Math.max(0, (this.wsCd || 0) - dt);
    // Оружие
    for (const id of Object.keys(m.weapons)) {
      const w = m.weapons[id];
      w.cd -= dt;
      if (w.cd <= 0) {
        const s = this.weaponStats(id);
        if (this.fireWeapon(id, s)) { w.cd = s.cd; m.fireT = this.t; }
        else w.cd = 0.15;
      }
    }
    // Навыки (до 3 слотов: Q / G / F или кнопки; R — навык оружия, weaponSkillBurst)
    const abs = m.abilities;
    for (let i = 0; i < abs.length; i++) abs[i].cdLeft = Math.max(0, abs[i].cdLeft - dt);
    m.abilityCd = abs[0] ? abs[0].cdLeft : 0;
    const slot = input?.slot >= 0 ? input.slot : (input?.ability ? 0 : -1);
    if (slot >= 0 && abs[slot] && abs[slot].cdLeft <= 0) this.castAbility(slot);
    for (let i = this.echoes.length - 1; i >= 0; i--) {
      const ec = this.echoes[i];
      ec.t -= dt;
      if (ec.t <= 0) { this.echoes.splice(i, 1); this.castAbility(ec.slot, 0.4); }
    }
    m.shieldT = Math.max(0, m.shieldT - dt); m.smokeT = Math.max(0, m.smokeT - dt);
    m.swiftT = Math.max(0, m.swiftT - dt); m.slowT = Math.max(0, m.slowT - dt); m.whirlT = Math.max(0, m.whirlT - dt);
    // лужи гнили (Глитч-слизь) и прочие опасные зоны — каждый клиент считает урон себе сам
    for (let i = this.hazards.length - 1; i >= 0; i--) {
      const hz = this.hazards[i];
      hz.t -= dt;
      if (hz.t <= 0) { this.hazards.splice(i, 1); continue; }
      if (m.iframes <= 0 && m.choosingInvuln <= 0 && dist2(hz.x, hz.z, m.x, m.z) < hz.r * hz.r) this.damageMe(hz.dmg);
    }
    // Контактный урон от орды (каждый клиент считает себя сам)
    if (m.iframes <= 0 && m.choosingInvuln <= 0) {
      this.grid.query(m.x, m.z, 2.2, this.tmp);
      for (const e of this.tmp) {
        if (e.dead) continue;
        const def = ENEMIES[e.type];
        const rr = def.radius * (e.scale || 1) + 0.45;
        if (dist2(e.x, e.z, m.x, m.z) < rr * rr) {
          this.damageMe(def.dmg * this.dmgScale() * (e.elite ? 1.6 : 1) * (e.dashT > 0 ? 1.5 : 1));
          break;
        }
      }
    }
    for (const s of this.enemyShots) {
      if (s.dead) continue;
      if (dist2(s.x, s.z, m.x, m.z) < 0.55 * 0.55 && m.iframes <= 0 && m.choosingInvuln <= 0) {
        s.dead = true;
        this.damageMe(s.dmg);
      }
    }
    // Воскрешение павших союзников (стоять рядом 2.5 с)
    for (const [id, r] of this.remotes) {
      if (!r.dead) { r.reviveProgress = 0; continue; }
      if (dist2(r.x, r.z, m.x, m.z) < 2.6 * 2.6) {
        r.reviveProgress = (r.reviveProgress || 0) + dt;
        if (r.reviveProgress >= 2.5) {
          r.reviveProgress = 0;
          this.send({ k: 'revive', target: id });
          this.events('toast', { text: `Вы подняли союзника: ${r.username}`, color: '#4ade80' });
        }
      } else r.reviveProgress = 0;
    }
  }

  dmgScale() { return 1 + (this.t / 60) * 0.12; }

  damageMe(raw) {
    const m = this.me;
    if (m.smokeT > 0 || m.leapT > 0) return;
    if (m.shieldT > 0) raw *= 0.5;
    const dmg = Math.max(1, raw * (1 - armorReduction(m.armor)));
    m.hp -= dmg;
    m.combatAt = this.t;
    m.iframes = 0.6;
    m.stats.taken += dmg;
    this.events('hurt', { dmg });
    if (m.hp <= 0) {
      m.hp = 0;
      m.dead = true;
      this.events('downed', {});
      if (this.remotes.size === 0 && this.isHost) this.finish('Проклятие поглотило вас');
    }
  }

  nearestEnemy(x, z, range, exclude) {
    let best = null, bd = range * range;
    for (const e of this.enemies.values()) {
      if (e.dead || (exclude && exclude.has(e.id))) continue;
      const d = dist2(e.x, e.z, x, z);
      if (d < bd) { bd = d; best = e; }
    }
    return best;
  }

  aimDir(range = 16) {
    const m = this.me;
    const e = this.nearestEnemy(m.x, m.z, range);
    if (e) {
      const dx = e.x - m.x, dz = e.z - m.z, d = Math.hypot(dx, dz) || 1;
      m.aimX = dx / d; m.aimZ = dz / d;
      return { x: dx / d, z: dz / d, target: e };
    }
    return { x: m.dirX, z: m.dirZ, target: null };
  }

  spawnProjectile(wid, s, x, z, dx, dz, extra = {}) {
    const p = {
      w: wid, x, z, vx: dx * s.speed, vz: dz * s.speed, life: s.life, age: 0,
      dmg: s.dmg, pierce: s.pierce, size: s.size, hit: new Set(),
      burn: s.burn, bleed: s.bleed, poison: s.poison, knock: s.knock, bounce: s.bounce, split: s.split,
      seed: Math.random() * 8, ...extra,
    };
    this.projectiles.push(p);
    if (this.outShots.length < 60) this.outShots.push([wid, r1(x), r1(z), r1(p.vx), r1(p.vz), r1(p.life), extra.orbit ? 1 : 0]);
    return p;
  }

  // Зоны: мины-глифы, ядовитые облака, лучи (симулирует владелец, союзникам уходит визуал)
  addZone(z) {
    if (this.zones.length >= 40) this.zones.shift();
    z.t = 0; z.acc = 0; z.seed = Math.random() * 8;
    this.zones.push(z);
    const vx = z.kind === 'beam' ? z.dx : 0, vz = z.kind === 'beam' ? z.dz : 0;
    const wid = z.kind === 'mine' ? 'glyph_mine' : z.kind === 'cloud' ? 'plague_cloud' : 'sun_beam';
    if (this.outShots.length < 60) this.outShots.push([wid, r1(z.x), r1(z.z), r1(vx), r1(vz), r1(z.life), 0]);
    return z;
  }

  updateZones(dt) {
    const m = this.me;
    for (let i = this.zones.length - 1; i >= 0; i--) {
      const Z = this.zones[i];
      Z.t += dt;
      if (Z.t >= Z.life || Z.dead) { this.zones.splice(i, 1); continue; }
      if (Z.kind === 'mine') {
        if (Z.t < Z.arm) continue;
        this.grid.query(Z.x, Z.z, 2.2, this.tmp);
        let trig = false;
        for (const e of this.tmp) {
          if (e.dead) continue;
          const rr = 0.9 + ENEMIES[e.type].radius * (e.scale || 1);
          if (dist2(e.x, e.z, Z.x, Z.z) < rr * rr) { trig = true; break; }
        }
        if (trig) {
          Z.dead = true;
          this.pushFx({ kind: 'boom', x: Z.x, z: Z.z, r: Z.r, t: 0, life: 0.4, color: 0xa855f7, row: 'hit_arcane' });
          this.areaHit(Z.x, Z.z, Z.r, Z.dmg, 'glyph_mine', 0, 0, { knock: Z.knock, fromX: Z.x, fromZ: Z.z });
        }
      } else if (Z.kind === 'cloud') {
        Z.acc += dt;
        if (Z.acc >= 0.5) {
          Z.acc -= 0.5;
          this.areaHit(Z.x, Z.z, Z.r, Z.dmg, 'plague_flask', 0, 0, { poison: Z.poison });
        }
      } else if (Z.kind === 'beam') {
        // луч держится у героя и бьёт всех на линии каждые tick секунд
        Z.x = m.x; Z.z = m.z;
        Z.acc += dt;
        if (Z.acc >= Z.tick) {
          Z.acc -= Z.tick;
          this.grid.query(Z.x + Z.dx * Z.len / 2, Z.z + Z.dz * Z.len / 2, Z.len / 2 + Z.w + 1.5, this.tmp);
          const list = this.tmp.slice();
          for (const e of list) {
            if (e.dead) continue;
            const ex = e.x - Z.x, ez = e.z - Z.z;
            const along = ex * Z.dx + ez * Z.dz;
            if (along < 0 || along > Z.len) continue;
            const perp = Math.abs(ex * Z.dz - ez * Z.dx);
            if (perp > Z.w + ENEMIES[e.type].radius * (e.scale || 1)) continue;
            this.hitEnemy(e, { w: 'sun_beam', dmg: Z.dmg, burn: Z.burn, noFx: Math.random() < 0.6 });
          }
        }
      }
    }
  }

  // черты админки в забеге (как server/meta/admin.ts applyTraits): поджог/яд/кровь (% урона/с), замедление, отбрасывание, заморозка, вампиризм
  traitsFor(w) {
    const T = this.traits; if (!T) return [];
    const k = String(w || '');
    if (k.startsWith('ab_')) return T.skill?.[k.slice(3)] || [];
    if (this.runSkill && k === this.runSkill) return [...(T.weapon || []), ...(T.skill?.['rs:' + k] || [])];
    return T.weapon || [];
  }
  applyTraits(e, p, dmg) {
    let st = 0;
    for (const t of this.traitsFor(p.w)) {
      if (Math.random() * 100 >= (t.chance ?? 100)) continue;
      if (t.k === 'burn' || t.k === 'bleed' || t.k === 'poison') { this.applyStatus(e, t.k, (dmg * (t.dpsPct || 0)) / 100, p.w); st |= ST_BIT[t.k]; }
      else if (t.k === 'slow') { e.slowUntil = this.t + 1.6; e.slowK = 0.6; }
      else if (t.k === 'freeze') { this.applyStatus(e, 'freeze', 0, p.w); st |= ST_BIT.freeze; }
      else if (t.k === 'knock' && this.isHost) { const dx = e.x - this.me.x, dz = e.z - this.me.z, d = Math.hypot(dx, dz) || 1, k = (t.power || 1) * (e.boss ? 0.15 : e.elite ? 0.5 : 1); this.knock(e, (dx / d) * k, (dz / d) * k); }
      else if (t.k === 'lifesteal') this.heal((dmg * (t.pct || 0)) / 100);
    }
    return st;
  }

  pushFx(f) { if (this.fx.length < 260) this.fx.push(f); }

  // Статусы. Урон по времени считает тот, кто наложил (гость шлёт хосту как попадания);
  // хост ведёт видимые флаги и эффекты (заморозка, отбрасывание) — авторитетно для движения орды.
  applyStatus(e, kind, dps, src) {
    const S = STATUS[kind];
    if (!S) return;
    const now = this.t;
    if (kind === 'freeze') {
      e.frzU = Math.max(e.frzU || 0, now + (e.boss ? 0.25 : S.dur));
      return;
    }
    e[kind + 'U'] = now + S.dur;
    const key = e.id + ':' + kind;
    let d = this.dots.get(key);
    if (!d) {
      if (this.dots.size > 900) return;
      d = { e, kind, dps: 0, until: 0, acc: 0, src, stacks: 0 };
      this.dots.set(key, d);
    }
    d.stacks = Math.min(S.stack, d.stacks + 1);
    d.dps = Math.max(d.dps, dps);
    d.until = now + S.dur;
    d.src = src;
  }

  updateDots(dt) {
    for (const [key, d] of this.dots) {
      if (d.e.dead || this.t >= d.until) { this.dots.delete(key); continue; }
      d.acc += dt;
      if (d.acc >= 0.5) {
        d.acc -= 0.5;
        this.hitEnemy(d.e, { w: d.src, dmg: d.dps * 0.5 * d.stacks, dot: d.kind, noFx: true, ignoreArmor: true });
      }
    }
  }

  fireWeapon(id, s) {
    const m = this.me;
    const a = this.aimDir(id === 'daggers' ? 6 : 16);
    switch (id) {
      case 'soul_spark': {
        for (let i = 0; i < s.count; i++) {
          const ang = Math.atan2(a.z, a.x) + (i - (s.count - 1) / 2) * 0.5;
          this.spawnProjectile(id, s, m.x, m.z, Math.cos(ang), Math.sin(ang), { homing: s.homing });
        }
        return true;
      }
      case 'war_axe': {
        for (let i = 0; i < s.count; i++) {
          const ang = Math.atan2(a.z, a.x) + (i - (s.count - 1) / 2) * 0.6;
          this.spawnProjectile(id, s, m.x, m.z, Math.cos(ang), Math.sin(ang), { boomerang: true, hitCd: new Map() });
        }
        return true;
      }
      case 'spear':
      case 'chain_bolt':
      case 'fire_spark': {
        if (!a.target && id !== 'spear') return false;
        const used = new Set();
        for (let i = 0; i < s.count; i++) {
          let dir = a;
          if (i > 0) {
            const t2 = this.nearestEnemy(m.x, m.z, 16, used);
            if (t2) {
              const dx = t2.x - m.x, dz = t2.z - m.z, d = Math.hypot(dx, dz) || 1;
              dir = { x: dx / d, z: dz / d, target: t2 };
            }
          }
          if (dir.target) used.add(dir.target.id);
          const jitter = i > 0 && dir === a ? (i % 2 ? 0.25 : -0.25) * Math.ceil(i / 2) : 0;
          const ang = Math.atan2(dir.z, dir.x) + jitter;
          this.spawnProjectile(id, s, m.x, m.z, Math.cos(ang), Math.sin(ang), {
            explode: s.explode || 0, chain: s.chain || 0,
          });
        }
        return true;
      }
      case 'daggers': {
        const base = Math.atan2(m.dirZ, m.dirX);
        for (let i = 0; i < s.count; i++) {
          const ang = base + (i - (s.count - 1) / 2) * s.spread;
          this.spawnProjectile(id, s, m.x + Math.cos(ang) * 0.3, m.z + Math.sin(ang) * 0.3, Math.cos(ang), Math.sin(ang));
        }
        return true;
      }
      case 'ice_fan': {
        if (!a.target) return false;
        const base = Math.atan2(a.z, a.x);
        for (let i = 0; i < s.count; i++) {
          const ang = base + (i - (s.count - 1) / 2) * (s.spread / Math.max(1, s.count / 5));
          this.spawnProjectile(id, s, m.x, m.z, Math.cos(ang), Math.sin(ang), { slow: s.slow });
        }
        return true;
      }
      case 'orbit_skulls': {
        for (let i = 0; i < s.count; i++) {
          this.spawnProjectile(id, s, m.x, m.z, 0, 0, { orbit: s.orbit, phase: (i / s.count) * Math.PI * 2, hitCd: new Map() });
        }
        return true;
      }
      case 'thorn_bow':
      case 'split_shard':
      case 'moon_orb': {
        if (!a.target && id !== 'moon_orb') return false;
        const base = Math.atan2(a.z, a.x);
        const gap = id === 'thorn_bow' ? 0.12 : 0.35;
        for (let i = 0; i < s.count; i++) {
          const ang = base + (i - (s.count - 1) / 2) * gap;
          this.spawnProjectile(id, s, m.x, m.z, Math.cos(ang), Math.sin(ang), { wallBounce: id === 'moon_orb' });
        }
        return true;
      }
      case 'fly_blades': {
        const base = Math.atan2(a.z, a.x);
        for (let i = 0; i < s.count; i++) {
          const ang = base + (i - (s.count - 1) / 2) * 0.9;
          this.spawnProjectile(id, s, m.x, m.z, Math.cos(ang), Math.sin(ang), { homing: s.homing });
        }
        return true;
      }
      case 'glyph_mine': {
        for (let i = 0; i < s.count; i++) {
          // глифы ложатся на пути орды: ближе к врагам, иначе вокруг героя
          const t = i === 0 && a.target ? a.target : null;
          const ang = Math.random() * Math.PI * 2, r = 2 + Math.random() * 4;
          const x = t ? m.x + (t.x - m.x) * 0.5 : m.x + Math.cos(ang) * r;
          const z = t ? m.z + (t.z - m.z) * 0.5 : m.z + Math.sin(ang) * r;
          this.addZone({ kind: 'mine', x, z, r: s.explode, dmg: s.dmg, knock: s.knock, arm: s.arm || 0.6, life: s.life });
        }
        return true;
      }
      case 'sun_beam': {
        if (!a.target) return false;
        const base = Math.atan2(a.z, a.x);
        for (let i = 0; i < s.count; i++) {
          const ang = base + (i % 2 ? 1 : -1) * Math.ceil(i / 2) * 0.45;
          this.addZone({ kind: 'beam', x: m.x, z: m.z, dx: Math.cos(ang), dz: Math.sin(ang), len: s.len * m.area, w: s.size, dmg: s.dmg, burn: s.burn, tick: s.tick, life: s.life });
        }
        return true;
      }
      case 'plague_flask': {
        if (!a.target) return false;
        const used = new Set();
        for (let i = 0; i < s.count; i++) {
          const t = i === 0 ? a.target : (this.nearestEnemy(m.x, m.z, 14, used) || a.target);
          used.add(t.id);
          const dx = t.x - m.x, dz = t.z - m.z, d = Math.hypot(dx, dz) || 1;
          const life = Math.max(0.35, Math.min(1.1, d / s.speed));
          this.spawnProjectile(id, s, m.x, m.z, dx / d, dz / d, { lob: true, life, zone: s.zone, zoneLife: s.zoneLife, poison: s.poison });
        }
        return true;
      }
      default: return false;
    }
  }

  castAbility(slot = 0, echoK = 1) {
    const m = this.me;
    const ab = m.abilities[slot];
    if (!ab || m.dead) return;
    const props = ab.props || [];
    const ext = props.includes('extend') ? 1.4 : 1;
    const ls = props.includes('vamp') ? 0.08 : 0;
    const k = ab.power * echoK;
    const avgDmg = 14 * m.dmgMult * m.might * m.abilityDmg * k;
    const big = (wid, dx, dz, extra) => this.spawnProjectile(wid, { speed: extra.speed || 18, life: extra.life || 1.4, dmg: extra.dmg, pierce: extra.pierce || 99, size: extra.size || 0.5 }, extra.x ?? m.x, extra.z ?? m.z, dx, dz, { lifesteal: ls || undefined, ...extra });
    const ring = (wid, n, extra) => { for (let i = 0; i < n; i++) { const ang = (i / n) * Math.PI * 2; big(wid, Math.cos(ang), Math.sin(ang), extra); } };
    switch (ab.id) {
      case 'backstab': {
        let target = null, best = 0;
        for (const e of this.enemies.values()) {
          if (e.dead) continue;
          const d = dist2(e.x, e.z, m.x, m.z);
          if (d > 14 * 14) continue;
          const score = e.maxHp / (1 + Math.sqrt(d));
          if (score > best) { best = score; target = e; }
        }
        if (target && echoK === 1) {
          const dx = target.x - m.x, dz = target.z - m.z, d = Math.hypot(dx, dz) || 1;
          m.x = target.x + (dx / d) * 1.6; m.z = target.z + (dz / d) * 1.6;
          resolvePillars(m, 0.5);
        }
        m.iframes = Math.max(m.iframes, 0.6);
        ring('ab_backstab', props.includes('t_fan') ? 14 : 10, { dmg: avgDmg * 1.5 * 2.2 / 1.5, speed: 16, life: 0.6 * ext, size: 0.55, pierce: 3, bleed: 3 });
        break;
      }
      case 'pierce': {
        const a = this.aimDir(30);
        // талант «Двойной выпад»: два копья веером ±9°
        const angs = props.includes('t_twin') ? [-0.16, 0.16] : [0];
        for (const da of angs) {
          const c = Math.cos(da), s2 = Math.sin(da);
          big('ab_pierce', a.x * c - a.z * s2, a.x * s2 + a.z * c, { dmg: avgDmg * 3, speed: 34, life: 1.6 * ext, size: 0.9, pierce: 999, ignoreArmor: true, knock: 1.5 });
        }
        break;
      }
      case 'trick_strike': {
        // таланты Кавеги: «Ядовитые кинжалы» (яд), «Веер ножей» (24), «Двойной вихрь» (второй вихрь через 0.4 с)
        const tx = { dmg: avgDmg * 1.6, speed: 15, life: 0.9 * ext, size: 0.35, pierce: 2, lifesteal: 0.1 + ls, poison: props.includes('t_poison') ? 5 : undefined };
        const n = props.includes('t_fan24') ? 24 : 16;
        ring('ab_trick', n, tx);
        if (props.includes('t_double') && echoK === 1) { this.delayed = this.delayed || []; this.delayed.push({ t: 0.4, fn: () => { for (let i = 0; i < n; i++) { const ang = (i / n + 0.5 / n) * Math.PI * 2; big('ab_trick', Math.cos(ang), Math.sin(ang), { ...tx, x: m.x, z: m.z }); } } }); }
        break;
      }
      case 'fireball': {
        let sx = 0, sz = 0, n = 0;
        this.grid.query(m.x, m.z, 14, this.tmp);
        for (const e of this.tmp) { if (!e.dead) { sx += e.x; sz += e.z; n++; } }
        let dx = m.dirX, dz = m.dirZ;
        if (n) { dx = sx / n - m.x; dz = sz / n - m.z; const d = Math.hypot(dx, dz) || 1; dx /= d; dz /= d; }
        if (props.includes('t_split3')) {
          // талант «Тройной шар»: три шара веером, каждый — 55% взрыва и поменьше
          for (const da of [-0.32, 0, 0.32]) {
            const c = Math.cos(da), s2 = Math.sin(da);
            big('ab_fireball', dx * c - dz * s2, dx * s2 + dz * c, { dmg: avgDmg * 0.6 * 0.55, speed: 12, life: 1.2, size: 0.75, pierce: 1, explode: 4.2 * m.area * ext, burn: 5 });
          }
        } else big('ab_fireball', dx, dz, { dmg: avgDmg * 0.6, speed: 12, life: 1.2, size: 1.0, pierce: 1, explode: 5.5 * m.area * ext, burn: 5 });
        break;
      }
      case 'shield_wall': {
        const refl = props.includes('t_reflect');
        m.shieldT = (4 + (refl ? 1 : 0)) * ext;
        this.pushFx({ kind: 'boom', x: m.x, z: m.z, r: 4 * ext, t: 0, life: 0.4, color: refl ? 0xfde68a : 0x93c5fd });
        this.areaHit(m.x, m.z, 4 * ext, avgDmg * 0.8 * (refl ? 2 : 1), 'ab_backstab', 6, ls, { knock: 2.5 });
      }
        break;
      case 'whirlwind':
        { const na = props.includes('t_axes6') ? 6 : 4; for (let i = 0; i < na; i++) big('war_axe', 0, 0, { dmg: avgDmg * 0.9, speed: 0, life: 3 * ext, size: 0.75, orbit: 2.6, phase: (i / na) * Math.PI * 2, hitCd: new Map() }); }
        break;
      case 'spear_rain':
        for (let i = 0, nr = props.includes('t_storm') ? 26 : 18; i < nr; i++) {
          const a = Math.random() * Math.PI * 2, r = 1.5 + Math.random() * 7 * ext;
          this.pushFx({ kind: 'boom', x: m.x + Math.cos(a) * r, z: m.z + Math.sin(a) * r, r: 1.4, t: -i * 0.04, life: 0.3, color: 0xfbbf24 });
          this.areaHit(m.x + Math.cos(a) * r, m.z + Math.sin(a) * r, 1.6, avgDmg * 1.1, 'spear', 0, ls);
        }
        break;
      case 'leap_strike': {
        const a = this.aimDir(12);
        const dist = Math.min(9, a.target ? Math.hypot(a.target.x - m.x, a.target.z - m.z) : 7);
        m.x += a.x * dist; m.z += a.z * dist; resolvePillars(m, 0.5);
        m.leapT = 0.35; m.iframes = Math.max(m.iframes, 0.5);
        const qr = 3.5 * ext * (props.includes('t_quake') ? 1.5 : 1);
        this.pushFx({ kind: 'boom', x: m.x, z: m.z, r: qr, t: 0, life: 0.4, color: 0xfde047 });
        this.areaHit(m.x, m.z, qr, avgDmg * 2.2, 'ab_pierce', 0, ls, { knock: 3 });
        if (props.includes('t_quake')) { this.grid.query(m.x, m.z, qr, this.tmp); for (const e of this.tmp) if (!e.dead) { e.slowUntil = this.t + 2.5; e.slowK = 0.5; } }
        break;
      }
      case 'smoke_bomb': {
        const choke = props.includes('t_choke');
        const dur = (2.5 + (choke ? 1.5 : 0)) * ext;
        m.smokeT = 2.5 * ext; // неуязвимость — как раньше; «Чадящая печь» удлиняет только облако
        this.pushFx({ kind: 'boom', x: m.x, z: m.z, r: 4.5 * ext, t: 0, life: dur, color: 0x334155 });
        this.grid.query(m.x, m.z, 4.5 * ext, this.tmp);
        for (const e of this.tmp) if (!e.dead) { e.slowUntil = this.t + 3 + (choke ? 1.5 : 0); e.slowK = 0.6; }
        this.areaHit(m.x, m.z, 4.5 * ext, avgDmg * 0.5, 'ab_trick', 0, ls, choke ? { burn: 4 } : undefined);
        break;
      }
      case 'shadow_step':
      case 'fly_blade_dash': {
        const a = this.aimDir(12);
        const sx = m.x, sz = m.z;
        m.x += a.x * 8; m.z += a.z * 8; resolvePillars(m, 0.5);
        m.iframes = Math.max(m.iframes, 0.45);
        const steps = 6;
        for (let i = 1; i <= steps; i++) {
          const px = sx + (m.x - sx) * (i / steps), pz = sz + (m.z - sz) * (i / steps);
          this.areaHit(px, pz, 1.7 * ext, avgDmg * (ab.id === 'shadow_step' ? 1.4 : 1.3) / 2, ab.id === 'shadow_step' ? 'fire_spark' : 'ab_trick', 0, ls);
          if (ab.id === 'shadow_step') this.pushFx({ kind: 'boom', x: px, z: pz, r: 1.6, t: -0.3, life: 0.4, color: 0xf97316 });
          if (ab.id === 'shadow_step' && props.includes('t_trail')) { this.delayed = this.delayed || []; this.delayed.push({ t: 0.6 + i * 0.05, fn: () => { this.pushFx({ kind: 'boom', x: px, z: pz, r: 1.9, t: 0, life: 0.35, color: 0xfb923c }); this.areaHit(px, pz, 1.9 * ext, avgDmg * 0.7 / 2, 'fire_spark', 0, ls, { burn: 3 }); } }); }
          else this.pushFx({ kind: 'boom', x: px, z: pz, r: 1.2, t: 0, life: 0.25, color: 0xe2e8f0 });
        }
        break;
      }
      case 'frost_nova':
        { const deep = props.includes('t_deep');
          ring('ice_fan', deep ? 28 : 20, { dmg: avgDmg * 1.0, speed: 14, life: 0.55 * ext, size: 0.4, pierce: 6, slow: 0.8 });
          this.grid.query(m.x, m.z, 6 * ext, this.tmp);
          for (const e of this.tmp) if (!e.dead) { e.slowUntil = this.t + (deep ? 3 : 2); e.slowK = 0.85; } }
        break;
      case 'meteor': {
        const a = this.aimDir(16);
        const tx = a.target ? a.target.x : m.x + a.x * 8, tz = a.target ? a.target.z : m.z + a.z * 8;
        this.pushFx({ kind: 'tele', x: tx, z: tz, r: 4.5 * ext, t: 0, life: 1.2, color: 0xf97316 });
        this.delayed = this.delayed || [];
        this.delayed.push({ t: 1.2, fn: () => {
          this.pushFx({ kind: 'boom', x: tx, z: tz, r: 4.5 * ext, t: 0, life: 0.5, color: 0xff5a1f });
          this.areaHit(tx, tz, 4.5 * ext, avgDmg * 6 * 0.5, 'ab_fireball', 0, ls, { burn: 6, knock: 2 });
        } });
        if (props.includes('t_shower')) for (const [k, ox, oz] of [[1, 2.6, 1.2], [2, -2.2, -1.8]]) {
          const sx2 = tx + ox, sz2 = tz + oz;
          this.delayed.push({ t: 1.2 + k * 0.3, fn: () => {
            this.pushFx({ kind: 'boom', x: sx2, z: sz2, r: 2.6 * ext, t: 0, life: 0.4, color: 0xfb923c });
            this.areaHit(sx2, sz2, 2.6 * ext, avgDmg * 6 * 0.2, 'ab_fireball', 0, ls, { burn: 3 });
          } });
        }
        break;
      }
      default: return;
    }
    if (props.includes('nova') && echoK === 1) {
      this.pushFx({ kind: 'boom', x: m.x, z: m.z, r: 4, t: 0, life: 0.35, color: 0xf0abfc });
      this.areaHit(m.x, m.z, 4, avgDmg * 1.2, 'ab_backstab', 0, ls, { knock: 2 });
    }
    if (props.includes('swift')) m.swiftT = 2;
    if (props.includes('echo') && echoK === 1) this.echoes.push({ t: 0.6, slot });
    if (echoK === 1) {
      ab.cdLeft = ab.cd * m.abilityCdMult;
      m.stats.usedAbility = true;
      this.events('ability', { id: ab.id, name: ab.name });
    }
  }

  // Мгновенный урон по площади от навыков (без снаряда)
  areaHit(x, z, r, dmg, w, _n, ls, extra = null) {
    this.grid.query(x, z, r + 1.5, this.tmp);
    const list = this.tmp.slice();
    for (const e of list) {
      if (e.dead) continue;
      const rr = r + ENEMIES[e.type].radius * (e.scale || 1);
      if (dist2(e.x, e.z, x, z) <= rr * rr) this.hitEnemy(e, { w, dmg, noFx: true, lifesteal: ls || 0, fromX: x, fromZ: z, ...(extra || {}) });
    }
  }

  // ---------- снаряды ----------
  updateProjectiles(dt) {
    const m = this.me;
    const list = this.projectiles;
    for (let i = list.length - 1; i >= 0; i--) {
      const p = list[i];
      p.age += dt;
      if (p.age >= p.life || p.dead) {
        if (p.explode && !p.exploded) this.explode(p);
        if (p.lob && !p.dead) {
          // склянка разбилась — ядовитое облако
          this.pushFx({ kind: 'boom', x: p.x, z: p.z, r: p.zone * 0.8, t: 0, life: 0.35, color: 0x84cc16, row: 'hit_poison' });
          this.addZone({ kind: 'cloud', x: p.x, z: p.z, r: p.zone, dmg: p.dmg, poison: p.poison, life: p.zoneLife });
        }
        list.splice(i, 1);
        continue;
      }
      if (p.orbit) {
        const ang = p.phase + p.age * 3.2;
        p.x = m.x + Math.cos(ang) * p.orbit;
        p.z = m.z + Math.sin(ang) * p.orbit;
      } else if (p.boomerang) {
        const half = p.life / 2;
        if (p.age > half) {
          const dx = m.x - p.x, dz = m.z - p.z, d = Math.hypot(dx, dz) || 1;
          const sp = Math.hypot(p.vx, p.vz);
          p.vx = (dx / d) * sp; p.vz = (dz / d) * sp;
          if (d < 0.6) { list.splice(i, 1); continue; }
        }
        p.x += p.vx * dt; p.z += p.vz * dt;
      } else {
        if (p.homing) {
          const t = this.nearestEnemy(p.x, p.z, 10, p.hit);
          if (t) {
            const sp = Math.hypot(p.vx, p.vz);
            const dx = t.x - p.x, dz = t.z - p.z, d = Math.hypot(dx, dz) || 1;
            const k = Math.min(1, p.homing * dt);
            p.vx += ((dx / d) * sp - p.vx) * k;
            p.vz += ((dz / d) * sp - p.vz) * k;
          }
        }
        p.x += p.vx * dt; p.z += p.vz * dt;
        if (p.wallBounce) {
          const d = Math.hypot(p.x, p.z);
          if (d > ARENA_RADIUS - 0.6) {
            const nx = p.x / d, nz = p.z / d, dot = p.vx * nx + p.vz * nz;
            if (dot > 0) { p.vx -= 2 * dot * nx; p.vz -= 2 * dot * nz; }
          }
        }
      }
      if (p.lob) continue; // склянка летит по дуге — бьёт только облаком
      // попадания
      this.grid.query(p.x, p.z, p.size + 1.8, this.tmp);
      for (const e of this.tmp) {
        if (e.dead) continue;
        const rr = ENEMIES[e.type].radius * (e.scale || 1) + p.size;
        if (dist2(e.x, e.z, p.x, p.z) > rr * rr) continue;
        if (p.hitCd) {
          const last = p.hitCd.get(e.id) || -9;
          if (p.age - last < 0.5) continue;
          p.hitCd.set(e.id, p.age);
        } else {
          if (p.hit.has(e.id)) continue;
          p.hit.add(e.id);
        }
        this.hitEnemy(e, p);
        if (p.explode) { this.explode(p); p.exploded = true; p.dead = true; break; }
        if (p.split > 0 && !p.child) {
          // раскол: осколки веером дальше по курсу, не бьют того же врага
          const base = Math.atan2(p.vz, p.vx), sp = Math.hypot(p.vx, p.vz) || 18;
          for (let k = 0; k < p.split; k++) {
            const ang = base + (k - (p.split - 1) / 2) * 0.42;
            const c = { w: p.w, x: p.x, z: p.z, vx: Math.cos(ang) * sp * 0.9, vz: Math.sin(ang) * sp * 0.9, life: 0.6, age: 0, dmg: p.dmg * 0.6, pierce: 1, size: p.size * 0.75, hit: new Set(p.hit), child: true, seed: Math.random() * 8 };
            this.projectiles.push(c);
            if (this.outShots.length < 60) this.outShots.push([p.w, r1(c.x), r1(c.z), r1(c.vx), r1(c.vz), 0.6, 0]);
          }
          p.dead = true;
          break;
        }
        if (p.chain > 0 || p.bounce > 0) {
          const nx = this.nearestEnemy(p.x, p.z, p.chain > 0 ? 8 : 10, p.hit);
          if (nx) {
            const sp = Math.hypot(p.vx, p.vz) || 20;
            const dx = nx.x - p.x, dz = nx.z - p.z, d = Math.hypot(dx, dz) || 1;
            p.vx = (dx / d) * sp; p.vz = (dz / d) * sp;
            p.age = Math.min(p.age, p.life * 0.3);
            if (p.chain > 0) { p.chain--; this.pushFx({ kind: 'zap', x: p.x, z: p.z, x2: nx.x, z2: nx.z, t: 0, life: 0.15 }); }
            else p.bounce--;
            continue;
          }
        }
        if (!p.hitCd) {
          p.pierce--;
          if (p.pierce <= 0) { p.dead = true; break; }
        }
      }
    }
  }

  explode(p) {
    this.pushFx({ kind: 'boom', x: p.x, z: p.z, r: p.explode, t: 0, life: 0.35, color: p.w === 'ab_fireball' ? 0xff7a1a : 0xf97316 });
    this.grid.query(p.x, p.z, p.explode + 1.5, this.tmp);
    const list = this.tmp.slice();
    for (const e of list) {
      if (e.dead) continue;
      if (dist2(e.x, e.z, p.x, p.z) <= p.explode * p.explode) this.hitEnemy(e, { ...p, dmg: p.dmg * 0.75, noFx: true, fromX: p.x, fromZ: p.z });
    }
  }

  hitEnemy(e, p) {
    const m = this.me;
    m.combatAt = this.t;
    const crit = Math.random() < m.crit;
    // фиксированный урон надетого оружия (5–7 и т.п.) добавляется к ударам оружия, не навыков
    const flat = !p.dot && m.itemMax > 0 && p.w && !String(p.w).startsWith('ab_') && WEAPONS[p.w] ? (m.itemMin + Math.random() * (m.itemMax - m.itemMin)) * 0.6 : 0;
    let dmg = (p.dmg + flat) * m.dmgMult * m.might * (m.metaDmg || 1) * (crit && !p.dot ? 2 : 1);
    if (!p.ignoreArmor) dmg *= 1 - armorReduction(ENEMIES[e.type].armor);
    dmg = Math.max(1, Math.round(dmg));
    m.stats.damage += dmg;
    const wkey = p.w;
    m.stats.byWeapon[wkey] = (m.stats.byWeapon[wkey] || 0) + dmg;
    const lsk = Math.min(0.15, (p.lifesteal || 0) + (m.metaLs || 0));
    if (lsk > 0) this.heal(dmg * lsk);
    if (p.slow) e.slowUntil = this.t + 1.6, e.slowK = p.slow;
    // статусы и отбрасывание
    let st = 0, kbx = 0, kbz = 0;
    if (!p.dot) {
      if (p.burn) { this.applyStatus(e, 'burn', p.burn, p.w); st |= ST_BIT.burn; }
      if (p.poison) { this.applyStatus(e, 'poison', p.poison, p.w); st |= ST_BIT.poison; }
      if (p.bleed) { this.applyStatus(e, 'bleed', p.bleed, p.w); st |= ST_BIT.bleed; }
      if (p.freeze || (p.slow && p.slow >= 0.8)) { this.applyStatus(e, 'freeze', 0, p.w); st |= ST_BIT.freeze; }
      if (p.knock) {
        let dx = p.vx || 0, dz = p.vz || 0;
        if (p.fromX !== undefined || (!dx && !dz)) { dx = e.x - (p.fromX ?? p.x ?? m.x); dz = e.z - (p.fromZ ?? p.z ?? m.z); }
        const d = Math.hypot(dx, dz) || 1;
        const k = p.knock * (e.boss ? 0.15 : e.elite ? 0.5 : 1);
        kbx = (dx / d) * k; kbz = (dz / d) * k;
        if (this.isHost) this.knock(e, kbx, kbz);
      }
    }
    if (!p.dot && this.traits) st |= this.applyTraits(e, p, dmg);
    if (!p.noFx && this.fx.length < 220) this.fx.push({ kind: 'hit', x: e.x, z: e.z, row: HIT_ROW[p.w] || 'hit', r: 0.8 + (e.scale || 1) * 0.5, t: 0, life: 0.3 });
    this.events('dmg', { x: e.x, z: e.z, dmg, crit, boss: e.boss, dot: p.dot });
    // мгновенно у себя (предсказание), у хоста — авторитетно
    e.hp -= dmg;
    if (!p.dot) e.flash = 0.12;
    if (this.isHost) {
      if (e.hp <= 0) this.killEnemy(e, this.myId);
    } else {
      if (st || kbx || kbz) this.pendingHits.push([e.id, dmg, p.slow ? Math.round(p.slow * 100) : 0, st, r1(kbx), r1(kbz)]);
      else this.pendingHits.push([e.id, dmg, p.slow ? Math.round(p.slow * 100) : 0]);
      if (e.hp <= 0 && !e.dead) { e.dead = true; e.deadAt = this.t; this.countMyKill(e); }
    }
  }

  // Отбрасывание (хост): короткий импульс, затухает за ~0.2 с
  knock(e, kx, kz) {
    e.kbx = (e.kbx || 0) + kx * 7; e.kbz = (e.kbz || 0) + kz * 7;
    const s = Math.hypot(e.kbx, e.kbz), cap = 30;
    if (s > cap) { e.kbx *= cap / s; e.kbz *= cap / s; }
    e.kbT = 0.2;
  }

  // ---------- хост: орда ----------
  currentWave() {
    const min = this.t / 60;
    const list = ROOM_WAVES[this.room] || WAVES;
    let w = list[0];
    for (const x of list) if (min >= x.from) w = x;
    return w;
  }

  livingPlayers() {
    const out = [];
    if (!this.me.dead) out.push(this.me);
    for (const r of this.remotes.values()) if (!r.dead && !r.stale) out.push(r);
    return out;
  }

  hostSimulate(dt) {
    const players = this.livingPlayers();
    const all = [this.me, ...this.remotes.values()];
    const nPlayers = Math.max(1, 1 + this.remotes.size);
    // спавн
    const wave = this.currentWave();
    const cap = Math.round(wave.cap * (1 + 0.35 * (nPlayers - 1)));
    const alive = this.enemies.size;
    if (players.length && this.mode !== 'run') this.modeSpawn(players, nPlayers);
    else if (players.length) {
      this.spawnAcc += dt * wave.rate * (1 + 0.45 * (nPlayers - 1)) * (1 + this.t / 600);
      while (this.spawnAcc >= 1) {
        this.spawnAcc -= 1;
        if (alive >= cap) break;
        const anchor = players[Math.floor(Math.random() * players.length)];
        this.spawnEnemy(this.pickType(wave.mix), anchor);
      }
      // «Рой»: кольцо нетопырей каждые 90 с
      if (Math.floor((this.t - dt) / 90) !== Math.floor(this.t / 90) && this.t > 30) {
        const anchor = players[0];
        for (let i = 0; i < 18; i++) {
          const a = (i / 18) * Math.PI * 2;
          this.spawnEnemy('bat', anchor, { x: anchor.x + Math.cos(a) * 15, z: anchor.z + Math.sin(a) * 15 });
        }
        this.events('toast', { text: '🦇 Рой нетопырей!', color: '#a78bfa' });
      }
      if (this.t >= this.nextElite) {
        this.nextElite += ELITE_EVERY;
        const anchor = players[0];
        const pool = ROOM_ELITES[this.room] || ['ghoul', 'golem'];
        const type = this.t > 240 ? pool[pool.length - 1 - Math.floor(Math.random() * 2)] || 'golem' : pool[Math.floor(Math.random() * pool.length)];
        this.spawnEnemy(type, anchor, null, { elite: true });
        this.events('toast', { text: `⚠️ Элита: ${ENEMIES[type].name}`, color: '#facc15' });
      }
      if (this.t >= this.nextBoss) {
        this.nextBoss += BOSS_EVERY;
        this.bossCount++;
        const bossType = ROOM_BOSS[this.room] || 'warden';
        this.spawnEnemy(bossType, players[0], null, { bossN: this.bossCount });
        this.events('toast', { text: `👹 ${ENEMIES[bossType].name} пробудился!`, color: '#f43f5e', big: true });
      }
    }
    // ИИ
    this.grid.clear();
    for (const e of this.enemies.values()) if (!e.dead) this.grid.add(e);
    for (const e of this.enemies.values()) {
      if (e.dead) continue;
      const def = ENEMIES[e.type];
      let target = null, bd = Infinity;
      for (const p of all) {
        if (p.dead || p.stale) continue;
        const d = dist2(p.x, p.z, e.x, e.z);
        if (d < bd) { bd = d; target = p; }
      }
      e.flash = Math.max(0, (e.flash || 0) - dt);
      if (e.kbT > 0) {
        e.kbT -= dt;
        e.x += e.kbx * dt; e.z += e.kbz * dt;
        e.kbx *= 0.82; e.kbz *= 0.82;
        if (!def.flying) resolvePillars(e, def.radius * (e.scale || 1));
        if (e.kbT <= 0) { e.kbx = 0; e.kbz = 0; }
        continue;
      }
      if (e.frzU > this.t) continue; // заморожен: ни шага, ни замаха
      // Испытание Обители: твари идут к Сердцу, отвлекаясь лишь на героя вплотную
      if (this.heart && (!target || bd > 16)) {
        const hd = dist2(0, 0, e.x, e.z);
        target = HEART_T; bd = hd;
        const reach = TRIAL.heartR + def.radius * (e.scale || 1) + 0.3;
        if (hd < reach * reach) {
          this.heart.hp -= def.dmg * (e.elite ? 2 : 1) * (def.boss ? 1.5 : 1) * 0.6 * dt;
          if (this.heart.hp <= 0 && !this.ended) { this.heart.hp = 0; this.finish('Сердце Обители угасло'); }
          continue;
        }
      }
      if (!target) continue;
      const dx = target.x - e.x, dz = target.z - e.z, d = Math.sqrt(bd) || 1;
      // Читаемые атаки: замах (телеграф на земле) → удар/рывок
      if (def.atk) {
        const A = def.atk;
        if (e.wind > 0) {
          e.wind -= dt;
          if (e.wind <= 0) this.enemyStrike(e, A);
          continue;
        }
        if (e.dashT > 0) {
          e.dashT -= dt;
          e.x += e.ax * A.speed * dt; e.z += e.az * A.speed * dt;
          if (!def.flying) resolvePillars(e, def.radius * (e.scale || 1));
          continue;
        }
        e.atkCd = (e.atkCd ?? rand(0.8, A.cd)) - dt;
        if (e.atkCd <= 0 && d < A.range * (e.scale || 1)) {
          e.wind = A.wind; e.ax = dx / d; e.az = dz / d; e.face = Math.atan2(dx, dz);
          e.atkCd = A.cd * (e.elite ? 0.8 : 1);
          continue;
        }
      }
      let sp = def.speed * (e.slowUntil > this.t ? 1 - (e.slowK || 0.4) : 1) * (e.elite ? 1.1 : 1);
      if (def.ranged && d < 9) sp *= -0.4; // плевун держит дистанцию
      let mx = (dx / d) * sp, mz = (dz / d) * sp;
      if (def.flying) { mx += Math.cos(this.t * 3 + e.id) * 2.2; mz += Math.sin(this.t * 3 + e.id) * 2.2; }
      // расталкивание
      this.grid.query(e.x, e.z, 1.6, this.tmp);
      for (const o of this.tmp) {
        if (o === e || o.dead) continue;
        const ox = e.x - o.x, oz = e.z - o.z;
        const od = ox * ox + oz * oz;
        const rr = def.radius * (e.scale || 1) + ENEMIES[o.type].radius * (o.scale || 1);
        if (od < rr * rr && od > 0.0001) {
          const f = (rr - Math.sqrt(od)) * 4;
          mx += (ox / Math.sqrt(od)) * f; mz += (oz / Math.sqrt(od)) * f;
        }
      }
      e.x += mx * dt; e.z += mz * dt;
      e.face = Math.atan2(dx, dz);
      if (!def.flying) resolvePillars(e, def.radius * (e.scale || 1));
      // стрельба
      if (def.ranged || def.boss) {
        e.shotCd = (e.shotCd ?? rand(1, 2.5)) - dt;
        if (e.shotCd <= 0) {
          if (def.boss) {
            e.shotCd = 3.6;
            for (let i = 0; i < 14; i++) {
              const a = (i / 14) * Math.PI * 2 + this.t;
              this.enemyShots.push({ x: e.x, z: e.z, vx: Math.cos(a) * 7, vz: Math.sin(a) * 7, life: 3, dmg: 14 * this.dmgScale() });
            }
          } else if (d < 13) {
            e.shotCd = 2.6;
            this.enemyShots.push({ x: e.x, z: e.z, vx: (dx / d) * 8, vz: (dz / d) * 8, life: 2.2, dmg: 8 * this.dmgScale() });
          } else e.shotCd = 0.5;
        }
      }
      // слишком далеко от всех — переносим ближе (как в VS)
      if (bd > 46 * 46 && !def.boss) {
        const a = Math.random() * Math.PI * 2;
        e.x = target.x + Math.cos(a) * 24; e.z = target.z + Math.sin(a) * 24;
        resolvePillars(e, def.radius);
      }
    }
    // вражеские снаряды
    for (let i = this.enemyShots.length - 1; i >= 0; i--) {
      const s = this.enemyShots[i];
      s.life -= dt;
      s.x += s.vx * dt; s.z += s.vz * dt;
      if (s.life <= 0 || s.dead) this.enemyShots.splice(i, 1);
    }
    // попадания гостей
    // (применяются при получении сообщения, см. onRelay)
    // магнит/сбор камней хостом за всех
    this.collectGemsFor(this.me, dt, true);
    for (const r of this.remotes.values()) this.collectGemsFor(r, dt, false);
    // уровень команды
    while (this.team.xp >= xpNeed(this.team.level)) {
      this.team.xp -= xpNeed(this.team.level);
      this.team.level++;
    }
    // конец забега
    if (!players.length && all.length) {
      this.deadTimer = (this.deadTimer || 0) + dt;
      if (this.deadTimer > 1.2) this.finish('Проклятие поглотило отряд');
    } else this.deadTimer = 0;
  }

  // Спавн мини-игр (только хост)
  modeSpawn(players, nPlayers) {
    if (this.ended) return;
    const anchor = players[0];
    if (this.mode === 'duel') {
      if (!this.duelSpawned && this.t > 1.5) {
        this.duelSpawned = true;
        const e = this.spawnEnemy('kyut_mirror', anchor, { x: anchor.x + 10, z: anchor.z });
        e.hp = e.maxHp = ENEMIES.kyut_mirror.hp * (1 + 0.7 * (nPlayers - 1));
        this.events('toast', { text: '🪞 Отражение Кьют вышло на арену', color: '#f472b6', big: true });
      } else if (this.duelSpawned && ![...this.enemies.values()].some((e) => e.type === 'kyut_mirror' && !e.dead)) {
        this.won = true;
        this.finish('Победа! Отражение рассеялось');
      }
      return;
    }
    if (this.mode === 'trial') {
      const due = Math.min(TRIAL.waves, Math.floor((this.t - 3) / TRIAL.every) + 1);
      while (this.trialWave < due) {
        const comp = TRIAL_WAVES[this.trialWave] || TRIAL_WAVES[TRIAL_WAVES.length - 1];
        this.trialWave++;
        for (const [type, n0] of Object.entries(comp)) {
          const n = ENEMIES[type].boss ? n0 : Math.round(n0 * (1 + 0.4 * (nPlayers - 1)));
          for (let i = 0; i < n; i++) {
            const a = Math.random() * Math.PI * 2, r = ARENA_RADIUS - 6 - Math.random() * 6;
            const e = this.spawnEnemy(type, HEART_T, { x: Math.cos(a) * r, z: Math.sin(a) * r }, { bossN: 1 });
            if (e.boss) { e.hp *= 0.4; e.maxHp = e.hp; } // финальный страж Испытания слабее забегового
          }
        }
        this.events('toast', { text: `🛡 Волна ${this.trialWave}/${TRIAL.waves}`, color: '#fbbf24', big: this.trialWave === TRIAL.waves });
      }
      if (this.trialWave >= TRIAL.waves && this.enemies.size === 0 && this.t >= TRIAL.waves * TRIAL.every) {
        this.won = true;
        this.finish('Сердце Обители устояло!');
      }
    }
  }

  // Удар после замаха: рывок/выпад (движение — у хоста), удар по кругу/пыльца — урон считает каждый клиент себе
  enemyStrike(e, A) {
    if (A.kind === 'dash' || A.kind === 'lunge') {
      e.dashT = (A.len || 6) / A.speed;
      return;
    }
    const r = (A.r || 3) * (e.scale || 1);
    this.pushFx({ kind: 'boom', x: e.x, z: e.z, r, t: 0, life: 0.35, color: A.kind === 'dust' ? 0xe9d5ff : 0xf87171 });
    const m = this.me;
    if (!m.dead && m.iframes <= 0 && m.choosingInvuln <= 0 && dist2(e.x, e.z, m.x, m.z) < r * r) {
      const def = ENEMIES[e.type];
      if (A.kind === 'dust') { m.slowT = 2.2; this.damageMe(def.dmg * 0.6 * this.dmgScale()); }
      else this.damageMe(def.dmg * 1.4 * this.dmgScale() * (e.elite ? 1.4 : 1));
    }
  }

  pickType(mix) {
    const keys = Object.keys(mix);
    const total = keys.reduce((a, k) => a + mix[k], 0);
    let r = Math.random() * total;
    for (const k of keys) { r -= mix[k]; if (r <= 0) return k; }
    return keys[0];
  }

  spawnEnemy(type, anchor, at = null, flags = {}) {
    const def = ENEMIES[type];
    const n = Math.max(1, 1 + this.remotes.size);
    let x, z;
    if (at) { x = at.x; z = at.z; } else {
      const a = Math.random() * Math.PI * 2;
      const R = 20 + Math.random() * 6;
      x = anchor.x + Math.cos(a) * R; z = anchor.z + Math.sin(a) * R;
    }
    const tm = this.t / 60;
    let hp = def.hp * (1 + tm * 0.32 + tm * tm * 0.025) * (1 + 0.6 * (n - 1));
    let scale = 1;
    if (flags.elite) { hp *= 12; scale = 1.7; }
    if (def.boss) { hp *= (flags.bossN || 1); scale = 1.25; }
    const e = { id: this.nextId++, type, x, z, hp, maxHp: hp, elite: !!flags.elite, boss: !!def.boss, scale, face: 0, flash: 0 };
    resolvePillars(e, def.radius * scale);
    this.enemies.set(e.id, e);
    return e;
  }

  countMyKill(e) {
    const st = this.me.stats;
    st.killsByType[e.type] = (st.killsByType[e.type] || 0) + 1;
    if (e.boss) st.bossKills++;
  }

  killEnemy(e, killerId) {
    if (e.dead) return;
    e.dead = true;
    this.enemies.delete(e.id);
    this.team.kills++;
    this.killCredit[killerId] = (this.killCredit[killerId] || 0) + 1;
    if (killerId === this.myId) { this.me.stats.kills++; this.countMyKill(e); }
    if (ENEMIES[e.type].puddle) this.hazards.push({ x: e.x, z: e.z, r: 1.6, t: 4, dmg: 4 * this.dmgScale() });
    else { const r = this.remotes.get(killerId); if (r) r.kills = (r.kills || 0) + 1; }
    const def = ENEMIES[e.type];
    this.events('kill', { x: e.x, z: e.z, type: e.type, elite: e.elite, boss: e.boss });
    // опыт
    const xp = def.xp * (e.elite ? 10 : 1);
    if (e.boss) {
      for (let i = 0; i < 12; i++) this.addGem(e.x + rand(-2, 2), e.z + rand(-2, 2), 10);
      this.addPickup('chest', e.x, e.z);
      this.addPickup('heart', e.x + 1.5, e.z);
    } else this.addGem(e.x, e.z, xp);
    if (e.elite) this.addPickup('chest', e.x, e.z);
    else {
      const r = Math.random();
      if (r < 0.012) this.addPickup('heart', e.x, e.z);
      else if (r < 0.016) this.addPickup('magnet', e.x, e.z);
      else if (r < 0.019) this.addPickup('bomb', e.x, e.z);
    }
  }

  addGem(x, z, v) {
    // слияние: если камней слишком много — копим в ближайший
    if (this.gems.size > 380) {
      for (const g of this.gems.values()) { g.v += v; this.gemAdds.push([g.id, r1(g.x), r1(g.z), g.v]); return; }
    }
    const g = { id: this.nextId++, x, z, v };
    this.gems.set(g.id, g);
    this.gemAdds.push([g.id, r1(x), r1(z), v]);
  }

  addPickup(kind, x, z) {
    const p = { id: this.nextId++, kind, x, z };
    this.pickups.set(p.id, p);
    this.pkAdds.push([p.id, PICKUP_KINDS.indexOf(kind), r1(x), r1(z)]);
  }

  collectGemsFor(p, dt, isMe) {
    if (p.dead || p.stale) return;
    const mag = p.magnet || 2.4;
    for (const g of this.gems.values()) {
      const d2 = dist2(g.x, g.z, p.x, p.z);
      if (g.pulled === undefined && d2 > mag * mag && !(isMe && this.magnetAll)) continue;
      if (d2 < 0.6 * 0.6) {
        this.gems.delete(g.id);
        this.gemRems.push(g.id);
        this.team.xp += g.v;
        if (isMe) this.me.stats.picked += g.v;
        continue;
      }
      if (isMe) {
        const d = Math.sqrt(d2) || 1;
        const sp = 14;
        g.x += ((p.x - g.x) / d) * sp * dt;
        g.z += ((p.z - g.z) / d) * sp * dt;
      }
    }
    if (isMe) this.magnetAll = false;
  }

  // Подбор пикапов: сам у себя (хост) или запрос хосту (гость)
  updatePickupsLocal() {
    const m = this.me;
    if (m.dead) return;
    for (const p of this.pickups.values()) {
      if (p.claimed) continue;
      if (dist2(p.x, p.z, m.x, m.z) < 1.1 * 1.1) {
        p.claimed = true;
        if (this.isHost) this.grantPickup(p.id, this.myId);
        else this.send({ k: 'pku', id: p.id });
      }
    }
  }

  grantPickup(id, toId) {
    const p = this.pickups.get(id);
    if (!p) return;
    this.pickups.delete(id);
    this.pkRems.push(id);
    if (p.kind === 'bomb') {
      for (const e of [...this.enemies.values()]) {
        if (!e.boss && !e.dead && dist2(e.x, e.z, p.x, p.z) < 22 * 22) this.killEnemy(e, toId);
      }
      this.pushFx({ kind: 'boom', x: p.x, z: p.z, r: 14, t: 0, life: 0.6, color: 0xfde047 });
    }
    if (toId === this.myId) this.applyPickup(p.kind);
    else this.send({ k: 'grant', kind: p.kind, to: toId, x: r1(p.x), z: r1(p.z) }, toId);
  }

  applyPickup(kind) {
    if (kind === 'heart') { this.heal(this.me.maxHp * 0.3); this.events('toast', { text: '❤️ +30% здоровья', color: '#f87171' }); }
    else if (kind === 'magnet') {
      this.magnetAll = true;
      for (const g of this.gems.values()) g.pulled = true;
      if (!this.isHost) this.send({ k: 'magnet' });
      this.events('toast', { text: '🧲 Весь опыт притянут!', color: '#93c5fd' });
    } else if (kind === 'bomb') this.events('toast', { text: '💣 Взрыв проклятия!', color: '#fde047' });
    else if (kind === 'chest') {
      this.pendingChoices++;
      this.choiceSource = 'chest';
      this.events('levelup', { chest: true });
      this.events('toast', { text: '🎁 Сундук: бесплатное улучшение', color: '#facc15' });
    }
  }

  // ---------- гость ----------
  guestSimulate(dt) {
    // плавно двигаем орду к позициям снапшота
    this.grid.clear();
    for (const e of this.enemies.values()) {
      if (e.dead) {
        if (this.t - (e.deadAt || 0) > 1.2) this.enemies.delete(e.id); // хост не подтвердил — оживёт снапшотом
        continue;
      }
      if (e.tx !== undefined) {
        const k = Math.min(1, dt * 10);
        e.x += (e.tx - e.x) * k; e.z += (e.tz - e.z) * k;
      }
      e.flash = Math.max(0, (e.flash || 0) - dt);
      if (e.wind > 0) {
        e.wind -= dt;
        const A = ENEMIES[e.type].atk;
        if (e.wind <= 0 && A && A.kind !== 'dash' && A.kind !== 'lunge') this.enemyStrike(e, A);
      }
      this.grid.add(e);
    }
    for (let i = this.enemyShots.length - 1; i >= 0; i--) {
      const s = this.enemyShots[i];
      s.life -= dt; s.x += s.vx * dt; s.z += s.vz * dt;
      if (s.life <= 0 || s.dead) this.enemyShots.splice(i, 1);
    }
    // локально подтягиваем камни (визуально), хост засчитает
    const m = this.me;
    if (!m.dead) {
      for (const g of this.gems.values()) {
        const d2 = dist2(g.x, g.z, m.x, m.z);
        if (d2 < m.magnet * m.magnet || this.magnetAll || g.pulled) {
          const d = Math.sqrt(d2) || 1;
          g.x += ((m.x - g.x) / d) * 14 * dt; g.z += ((m.z - g.z) / d) * 14 * dt;
          if (d2 < 0.6 * 0.6 && !g.sent) { g.sent = true; this.pendingPicks.push(g.id); }
        }
      }
      this.magnetAll = false;
    }
    if (this.t - this.lastSnapAt > 6 && this.lastSnapAt > 0) this.events('host_lost', {});
  }

  updateVisualShots(dt) {
    for (let i = this.visualShots.length - 1; i >= 0; i--) {
      const s = this.visualShots[i];
      s.age += dt;
      if (s.age >= s.life) { this.visualShots.splice(i, 1); continue; }
      if (s.orbit) {
        const r = this.remotes.get(s.owner);
        if (r) { const a = s.phase + s.age * 3.2; s.x = r.x + Math.cos(a) * s.orbit; s.z = r.z + Math.sin(a) * s.orbit; }
      } else if (s.w === 'sun_beam') {
        const r = this.remotes.get(s.owner);
        if (r) { s.x = r.x; s.z = r.z; }
      } else if (!STATIC_SHOTS.has(s.w)) { s.x += s.vx * dt; s.z += s.vz * dt; }
    }
  }

  updateFx(dt) {
    for (let i = this.fx.length - 1; i >= 0; i--) {
      const f = this.fx[i];
      f.t += dt;
      if (f.t >= f.life) this.fx.splice(i, 1);
    }
    for (const r of this.remotes.values()) {
      if (r.tx !== undefined) {
        const k = Math.min(1, dt * 12);
        r.x += (r.tx - r.x) * k; r.z += (r.tz - r.z) * k;
      }
      r.age = (r.age || 0) + dt;
      r.stale = r.age > 5;
    }
  }

  finish(reason) {
    if (this.ended) return;
    this.ended = true;
    const players = [{ id: this.myId, username: this.username, kills: this.me.stats.kills, damage: Math.round(this.me.stats.damage), classKey: this.classKey }];
    for (const [id, r] of this.remotes) players.push({ id, username: r.username, kills: r.kills || 0, damage: Math.round(r.damage || 0), classKey: r.classKey });
    this.endInfo = { reason, time: this.t, level: this.team.level, kills: this.team.kills, players, mode: this.mode, won: this.won, wave: this.trialWave, hpCapPct: this.hpCapPct };
    if (this.isHost && this.remotes.size) this.send({ k: 'end', info: this.endInfo });
    this.events('end', this.endInfo);
  }

  // ---------- сеть ----------
  netTick(dt) {
    this.outShots = this.outShots || [];
    this.meAcc += dt;
    if (this.meAcc >= 0.1) {
      this.meAcc = 0;
      const m = this.me;
      if (this.remotes.size || !this.isHost) {
        this.send({
          k: 'me', iv: this.invulnLeft() > 0 ? 1 : undefined, x: r1(m.x), z: r1(m.z), dx: r1(m.dirX), dz: r1(m.dirZ), mv: m.moving ? 1 : 0,
          hp: Math.round(m.hp), mh: Math.round(m.maxHp), dead: m.dead ? 1 : 0, mag: r1(m.magnet),
          cls: this.classKey, lk: this.meta?.look || undefined, kills: m.stats.kills, dmg: Math.round(m.stats.damage), shots: this.outShots.slice(0, 40),
        });
      }
      this.outShots.length = 0;
      if (!this.isHost) {
        if (this.pendingHits.length) { this.send({ k: 'hits', h: this.pendingHits.splice(0, 300) }); }
        if (this.pendingPicks.length) { this.send({ k: 'pick', g: this.pendingPicks.splice(0, 200) }); }
      }
    }
    if (this.isHost) {
      this.snapAcc += dt;
      if (this.snapAcc >= 0.125) {
        this.snapAcc = 0;
        if (this.remotes.size) this.send(this.buildSnapshot());
        this.gemAdds.length = 0; this.gemRems.length = 0; this.pkAdds.length = 0; this.pkRems.length = 0;
      }
    }
  }

  buildSnapshot() {
    const e = [];
    for (const en of this.enemies.values()) {
      if (en.dead) continue;
      e.push(en.id, TYPE_IDS.indexOf(en.type), r1(en.x), r1(en.z), Math.max(0, Math.round((en.hp / en.maxHp) * 100)), (en.elite ? 1 : 0) | (en.boss ? 2 : 0) | (en.slowUntil > this.t ? 4 : 0) | (en.wind > 0 ? 8 : 0) | (en.dashT > 0 ? 16 : 0) | (en.burnU > this.t ? 32 : 0) | (en.poisonU > this.t ? 64 : 0) | (en.bleedU > this.t ? 128 : 0) | (en.frzU > this.t ? 256 : 0), Math.round(en.maxHp));
    }
    const es = this.enemyShots.slice(0, 80).map((s) => [r1(s.x), r1(s.z), r1(s.vx), r1(s.vz), r1(s.life), Math.round(s.dmg)]);
    return {
      k: 'snap', t: r1(this.t), e, es, ga: this.gemAdds.slice(0, 300), gr: this.gemRems.slice(0, 400), pa: this.pkAdds, pr: this.pkRems,
      xp: this.team.xp, lv: this.team.level, kills: this.team.kills, kc: this.killCredit, nb: r1(this.nextBoss), ne: r1(this.nextElite),
      hh: this.heart ? Math.round(this.heart.hp) : undefined, tw: this.trialWave,
      iv: [...(this.invulnLeft() > 0 ? [this.myId] : []), ...[...this.remotes].filter(([, r]) => r.inv).map(([id]) => id)],
      wv: this.wavesOut.splice(0, 8),
    };
  }

  buildFull() {
    const snap = this.buildSnapshot();
    snap.k = 'full';
    snap.ga = [...this.gems.values()].slice(0, 380).map((g) => [g.id, r1(g.x), r1(g.z), g.v]);
    snap.gr = [];
    snap.pa = [...this.pickups.values()].map((p) => [p.id, PICKUP_KINDS.indexOf(p.kind), r1(p.x), r1(p.z)]);
    snap.pr = [];
    return snap;
  }

  applySnapshot(s, full) {
    this.lastSnapAt = this.t;
    if (full || Math.abs(this.t - s.t) > 1) this.t = s.t;
    else this.t += (s.t - this.t) * 0.2;
    const seen = new Set();
    const e = s.e || [];
    for (let i = 0; i + 6 < e.length + 0; i += 7) {
      const id = e[i];
      seen.add(id);
      let en = this.enemies.get(id);
      const type = TYPE_IDS[e[i + 1]] || 'imp';
      const flags = e[i + 5];
      const maxHp = e[i + 6] || 1;
      if (!en) {
        en = { id, type, x: e[i + 2], z: e[i + 3], maxHp, elite: !!(flags & 1), boss: !!(flags & 2), scale: flags & 1 ? 1.7 : (flags & 2 ? 1.25 : 1), face: 0 };
        this.enemies.set(id, en);
      }
      if (en.dead) continue;
      const nx = e[i + 2], nz = e[i + 3];
      if (en.tx !== undefined) en.face = Math.atan2(nx - en.tx, nz - en.tz) || en.face;
      en.tx = nx; en.tz = nz;
      en.maxHp = maxHp;
      en.hp = (e[i + 4] / 100) * maxHp;
      en.slowUntil = flags & 4 ? this.t + 0.3 : 0;
      // замах на хосте → у гостя свой таймер удара (урон себе считает гость)
      const A = ENEMIES[type].atk;
      if (flags & 8) { if (!en.windSeen && A) { en.windSeen = true; en.wind = A.wind * 0.85; en.windMax = A.wind; } }
      else en.windSeen = false;
      en.dashT = flags & 16 ? 0.1 : 0;
      // видимые статусы от хоста (свои наложенные гость ведёт сам)
      if (flags & 32) en.burnU = Math.max(en.burnU || 0, this.t + 0.3);
      if (flags & 64) en.poisonU = Math.max(en.poisonU || 0, this.t + 0.3);
      if (flags & 128) en.bleedU = Math.max(en.bleedU || 0, this.t + 0.3);
      if (flags & 256) en.frzU = Math.max(en.frzU || 0, this.t + 0.3);
    }
    for (const [id, en] of this.enemies) {
      if (!seen.has(id) && ENEMIES[en.type]?.puddle) this.hazards.push({ x: en.x, z: en.z, r: 1.6, t: 4, dmg: 4 * this.dmgScale() });
      if (!seen.has(id) && !en.dead) this.enemies.delete(id);
      else if (!seen.has(id) && en.dead) this.enemies.delete(id);
    }
    this.enemyShots = (s.es || []).map((a) => ({ x: a[0], z: a[1], vx: a[2], vz: a[3], life: a[4], dmg: a[5] }));
    if (full) this.gems.clear();
    (s.ga || []).forEach(([id, x, z, v]) => {
      const g = this.gems.get(id);
      if (g) g.v = v; else this.gems.set(id, { id, x, z, v });
    });
    (s.gr || []).forEach((id) => this.gems.delete(id));
    if (full) this.pickups.clear();
    (s.pa || []).forEach(([id, k, x, z]) => this.pickups.set(id, { id, kind: PICKUP_KINDS[k] || 'heart', x, z }));
    (s.pr || []).forEach((id) => this.pickups.delete(id));
    this.team.xp = s.xp; this.team.kills = s.kills;
    if (s.kc) {
      this.killCredit = { ...s.kc };
      this.me.stats.kills = s.kc[this.myId] || 0;
      for (const [id, r] of this.remotes) r.kills = s.kc[id] || 0;
    }
    if (full) { this.seenLevel = Math.max(1, this.seenLevel); }
    this.team.level = s.lv;
    this.nextBoss = s.nb; this.nextElite = s.ne;
    if (this.heart && s.hh != null) this.heart.hp = s.hh;
    if (s.tw != null) this.trialWave = s.tw;
    if (Array.isArray(s.iv)) for (const [id, r] of this.remotes) r.inv = s.iv.includes(id);
    if (Array.isArray(s.wv)) for (const [x, z, owner] of s.wv) if (owner !== this.myId) this.waveFx.push({ x, z, t: 0, owner });
  }

  // Входящие сообщения комнаты (от сервера run_relay)
  onRelay(from, d) {
    if (!d || typeof d !== 'object') return;
    const member = this.members.get(from);
    if (d.k === 'me') {
      let r = this.remotes.get(from);
      if (!r) {
        r = { x: d.x, z: d.z, username: member?.username || 'Союзник', color: member?.color || '#38bdf8' };
        this.remotes.set(from, r);
        this.events('remote_join', { id: from });
      }
      r.tx = d.x; r.tz = d.z; r.dirX = d.dx; r.dirZ = d.dz; r.moving = !!d.mv;
      if (r.x === undefined) { r.x = d.x; r.z = d.z; }
      r.hp = d.hp; r.maxHp = d.mh; r.dead = !!d.dead; r.magnet = d.mag || 2.4; r.classKey = d.cls; r.look = d.lk || null;
      r.damage = d.dmg; r.age = 0; // убийства считает хост (killCredit)
      // неуязвимость союзника хост признаёт только в окне LVL_INVULN после уровня отряда (гостям — список iv в снапшоте)
      if (this.isHost) r.inv = !!d.iv && this.t - this.hostLvlAt <= LVL_INVULN + 0.5;
      if (member) { r.username = member.username; r.color = member.color; }
      (d.shots || []).forEach((sh) => {
        if (this.visualShots.length > 300) return;
        const [w, x, z, vx, vz, life, orbit] = sh;
        const ws = WEAPONS[w];
        this.visualShots.push({ w, x, z, vx, vz, life, age: 0, owner: from, orbit: orbit ? (ws?.base.orbit || 2.6) : 0, phase: Math.random() * 6 });
      });
      return;
    }
    if (this.isHost && d.k === 'wave') { this.hostWave(from); return; }
    if (this.isHost) {
      if (d.k === 'hits') {
        (d.h || []).forEach(([id, dmg, slow, st, kx, kz]) => {
          const e = this.enemies.get(id);
          if (!e || e.dead) return;
          e.hp -= Math.min(dmg, 1e6);
          e.flash = 0.12;
          if (slow) { e.slowUntil = this.t + 1.6; e.slowK = slow / 100; }
          if (st) {
            if (st & ST_BIT.burn) e.burnU = this.t + STATUS.burn.dur;
            if (st & ST_BIT.poison) e.poisonU = this.t + STATUS.poison.dur;
            if (st & ST_BIT.bleed) e.bleedU = this.t + STATUS.bleed.dur;
            if (st & ST_BIT.freeze) e.frzU = Math.max(e.frzU || 0, this.t + (e.boss ? 0.25 : STATUS.freeze.dur));
          }
          if (kx || kz) this.knock(e, Math.max(-5, Math.min(5, kx || 0)), Math.max(-5, Math.min(5, kz || 0)));
          if (e.hp <= 0) this.killEnemy(e, from);
        });
      } else if (d.k === 'pick') {
        (d.g || []).forEach((id) => {
          const g = this.gems.get(id);
          if (!g) return;
          this.gems.delete(id); this.gemRems.push(id); this.team.xp += g.v;
        });
      } else if (d.k === 'pku') {
        this.grantPickup(d.id, from);
      } else if (d.k === 'magnet') {
        const r = this.remotes.get(from);
        if (r) for (const g of this.gems.values()) { g.x = r.x; g.z = r.z; }
      } else if (d.k === 'hello') {
        this.send(this.buildFull(), from);
      }
    } else {
      if (d.k === 'snap' || d.k === 'full') this.applySnapshot(d, d.k === 'full');
      else if (d.k === 'end') { this.ended = true; this.endInfo = d.info; this.events('end', d.info); }
    }
    if (d.k === 'grant' && d.to === this.myId) {
      if (d.kind === 'bomb') this.pushFx({ kind: 'boom', x: d.x, z: d.z, r: 14, t: 0, life: 0.6, color: 0xfde047 });
      this.applyPickup(d.kind);
    }
    if (d.k === 'revive' && d.target === this.myId && this.me.dead) {
      this.me.dead = false;
      this.me.hp = Math.round(this.me.maxHp * 0.4);
      this.me.iframes = 2;
      this.events('revived', {});
    }
    if (d.k === 'restart') this.events('restart_req', {});
  }

  // Смена хоста (сервер прислал новый run_members)
  setMembers(members, hostId) {
    this.members = new Map(members.map((m) => [m.id, m]));
    for (const id of [...this.remotes.keys()]) if (!this.members.has(id)) this.remotes.delete(id);
    const wasHost = this.isHost;
    this.isHost = hostId ? hostId === this.myId : true;
    if (!wasHost && this.isHost) {
      // перехват авторитета: продолжаем с последнего снапшота
      this.nextId = Math.max(this.nextId, ...[...this.enemies.keys(), ...this.gems.keys(), ...this.pickups.keys()].map((n) => n + 1), 1) + 100000;
      for (const e of this.enemies.values()) { if (e.tx !== undefined) { e.x = e.tx; e.z = e.tz; } if (e.hp === undefined) e.hp = e.maxHp; }
      this.events('toast', { text: '👑 Вы теперь ведущий забега', color: '#facc15' });
    }
    return this.isHost;
  }
}
