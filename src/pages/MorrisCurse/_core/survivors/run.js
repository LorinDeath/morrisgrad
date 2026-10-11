// Симуляция забега. Чистая логика (без Three.js), координаты — метры арены (центр 0,0).
// Co-op: хост (назначает сервер — самый ранний участник комнаты) авторитетен для орды, лута, часов
// и командного опыта; каждый клиент сам симулирует своего героя и свои снаряды и шлёт хосту попадания.
import {
  WEAPONS, PASSIVES, ABILITIES, ENEMIES, WAVES, RUN_CLASSES, MAX_WEAPONS, MAX_PASSIVES,
  ELITE_EVERY, BOSS_EVERY, ARENA_RADIUS, xpNeed, classRunStats, armorReduction,
} from './data.js';

const TYPE_IDS = Object.keys(ENEMIES);
const PICKUP_KINDS = ['heart', 'magnet', 'bomb', 'chest'];
const rand = (a, b) => a + Math.random() * (b - a);
const dist2 = (ax, az, bx, bz) => (ax - bx) * (ax - bx) + (az - bz) * (az - bz);
const r1 = (v) => Math.round(v * 10) / 10;

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
    this.myId = opts.myId || 'local';
    this.username = opts.username || 'Странник';
    this.color = opts.color || '#ffffff';
    this.send = opts.send || (() => {});
    this.events = opts.events || (() => {});
    this.classKey = RUN_CLASSES[opts.classKey] ? opts.classKey : 'soul';
    this.cls = RUN_CLASSES[this.classKey];
    this.serverClass = opts.serverClass || null;
    this.isHost = opts.isHost !== false;
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
    this.pendingHits = [];
    this.pendingPicks = [];
    this.gemAdds = []; this.gemRems = []; this.pkAdds = []; this.pkRems = [];
    this.snapAcc = 0; this.meAcc = 0;
    this.lastSnapAt = 0;
    const baseHp = st.maxHp;
    this.me = {
      x: rand(-2, 2), z: rand(-2, 2), dirX: 0, dirZ: 1, aimX: 0, aimZ: 1, moving: false,
      hp: baseHp, baseMaxHp: baseHp, maxHp: baseHp, armor: st.armor, baseSpeed: st.speed, dmgMult: st.dmgMult,
      weapons: {}, passives: {}, abilityCd: 2, iframes: 0, dead: false, reviveProgress: 0,
      choosingInvuln: 0,
      stats: { damage: 0, kills: 0, taken: 0, healed: 0, picked: 0, byWeapon: {} },
    };
    this.addWeapon(this.cls.startWeapon);
    this.recalc();
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
    m.speed = m.baseSpeed * (1 + 0.08 * this.plv('swift'));
    m.magnet = 2.4 * (1 + 0.35 * this.plv('magnet'));
    m.regen = 0.4 * this.plv('regen');
    m.might = 1 + 0.1 * this.plv('might');
    m.cdMult = Math.pow(0.93, this.plv('haste'));
    m.extra = this.plv('amount') >= 4 ? 2 : (this.plv('amount') >= 2 ? 1 : 0);
    m.area = 1 + 0.1 * this.plv('area');
    m.crit = 0.05 + 0.06 * this.plv('luck');
    m.abilityCdMult = Math.pow(0.88, this.plv('mastery'));
    m.abilityDmg = 1 + 0.2 * this.plv('mastery');
  }

  addWeapon(id) {
    if (!WEAPONS[id]) return;
    if (this.me.weapons[id]) this.me.weapons[id].lv = Math.min(8, this.me.weapons[id].lv + 1);
    else this.me.weapons[id] = { lv: 1, cd: 0.3 };
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
      else if (/Радиус/.test(txt)) { if (s.explode) s.explode *= 1 + num / 100; if (s.orbit) s.orbit *= 1 + num / 100; }
      else if (/Размер/.test(txt)) s.size *= 1 + num / 100;
      else if (/Длительность/.test(txt)) s.life += num;
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
    const ownedW = Object.keys(m.weapons);
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
      if (P.needsAbility && !this.cls.ability) return;
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
    this.events('choice_applied', c);
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
    const soloPause = this.paused || (this.pendingChoices > 0 && this.remotes.size === 0);
    if (soloPause) return;
    if (this.isHost) this.t += dt;
    else this.t += dt; // гость экстраполирует, снапшот поправит
    this.updateMe(dt, input);
    if (this.isHost) this.hostSimulate(dt);
    else this.guestSimulate(dt);
    this.updateProjectiles(dt);
    this.updateVisualShots(dt);
    this.updatePickupsLocal(dt);
    this.updateFx(dt);
    this.netTick(dt);
    if (this.team.level > this.seenLevel) {
      this.pendingChoices += this.team.level - this.seenLevel;
      this.seenLevel = this.team.level;
      this.choiceSource = 'level';
      this.events('levelup', { level: this.team.level });
    }
  }

  updateMe(dt, input) {
    const m = this.me;
    m.iframes = Math.max(0, m.iframes - dt);
    m.choosingInvuln = this.pendingChoices > 0 ? 0.6 : Math.max(0, m.choosingInvuln - dt);
    if (m.dead) {
      m.moving = false;
      return;
    }
    let ix = input?.x || 0, iz = input?.z || 0;
    if (this.pendingChoices > 0) { ix = 0; iz = 0; }
    const len = Math.hypot(ix, iz);
    if (len > 0.05) {
      const k = Math.min(1, len);
      m.x += (ix / len) * m.speed * k * dt;
      m.z += (iz / len) * m.speed * k * dt;
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
    if (m.regen) this.heal(m.regen * dt);

    // Оружие
    for (const id of Object.keys(m.weapons)) {
      const w = m.weapons[id];
      w.cd -= dt;
      if (w.cd <= 0) {
        const s = this.weaponStats(id);
        if (this.fireWeapon(id, s)) w.cd = s.cd;
        else w.cd = 0.15;
      }
    }
    // Навык класса
    if (this.cls.ability) {
      m.abilityCd = Math.max(0, m.abilityCd - dt);
      if (input?.ability && m.abilityCd <= 0) this.castAbility();
    }
    // Контактный урон от орды (каждый клиент считает себя сам)
    if (m.iframes <= 0 && m.choosingInvuln <= 0) {
      this.grid.query(m.x, m.z, 2.2, this.tmp);
      for (const e of this.tmp) {
        if (e.dead) continue;
        const def = ENEMIES[e.type];
        const rr = def.radius * (e.scale || 1) + 0.45;
        if (dist2(e.x, e.z, m.x, m.z) < rr * rr) {
          this.damageMe(def.dmg * this.dmgScale() * (e.elite ? 1.6 : 1));
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
    const dmg = Math.max(1, raw * (1 - armorReduction(m.armor)));
    m.hp -= dmg;
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
      dmg: s.dmg, pierce: s.pierce, size: s.size, hit: new Set(), ...extra,
    };
    this.projectiles.push(p);
    this.outShots.push([wid, r1(x), r1(z), r1(p.vx), r1(p.vz), r1(s.life), extra.orbit ? 1 : 0]);
    return p;
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
      default: return false;
    }
  }

  castAbility() {
    const m = this.me;
    const A = ABILITIES[this.cls.ability];
    if (!A || m.dead) return;
    const avgDmg = 14 * m.dmgMult * m.might * m.abilityDmg;
    const big = (wid, dx, dz, extra) => this.spawnProjectile(wid, { speed: extra.speed || 18, life: extra.life || 1.4, dmg: extra.dmg, pierce: extra.pierce || 99, size: extra.size || 0.5 }, extra.x ?? m.x, extra.z ?? m.z, dx, dz, extra);
    if (A.id === 'backstab') {
      let target = null, best = 0;
      for (const e of this.enemies.values()) {
        if (e.dead) continue;
        const d = dist2(e.x, e.z, m.x, m.z);
        if (d > 14 * 14) continue;
        const score = e.maxHp / (1 + Math.sqrt(d));
        if (score > best) { best = score; target = e; }
      }
      if (target) {
        const dx = target.x - m.x, dz = target.z - m.z, d = Math.hypot(dx, dz) || 1;
        m.x = target.x + (dx / d) * 1.6; m.z = target.z + (dz / d) * 1.6;
        resolvePillars(m, 0.5);
      }
      m.iframes = 0.6;
      for (let i = 0; i < 10; i++) {
        const ang = (i / 10) * Math.PI * 2;
        big('ab_backstab', Math.cos(ang), Math.sin(ang), { dmg: avgDmg * 1.5 * 2.2, speed: 16, life: 0.6, size: 0.55, pierce: 3 });
      }
    } else if (A.id === 'pierce') {
      const a = this.aimDir(30);
      big('ab_pierce', a.x, a.z, { dmg: avgDmg * 1.2 * 3, speed: 34, life: 1.6, size: 0.9, pierce: 999, ignoreArmor: true });
    } else if (A.id === 'trick_strike') {
      for (let i = 0; i < 16; i++) {
        const ang = (i / 16) * Math.PI * 2;
        big('ab_trick', Math.cos(ang), Math.sin(ang), { dmg: avgDmg * 1.1 * 1.6, speed: 15, life: 0.9, size: 0.35, pierce: 2, lifesteal: 0.1 });
      }
    } else if (A.id === 'fireball') {
      // в гущу: центр масс ближайших врагов
      let sx = 0, sz = 0, n = 0;
      this.grid.query(m.x, m.z, 14, this.tmp);
      for (const e of this.tmp) { if (!e.dead) { sx += e.x; sz += e.z; n++; } }
      let dx = m.dirX, dz = m.dirZ;
      if (n) { dx = sx / n - m.x; dz = sz / n - m.z; const d = Math.hypot(dx, dz) || 1; dx /= d; dz /= d; }
      big('ab_fireball', dx, dz, { dmg: avgDmg * 10 * 0.6, speed: 12, life: 1.2, size: 1.0, pierce: 1, explode: 5.5 * m.area });
    }
    m.abilityCd = A.runCooldown * m.abilityCdMult;
    this.events('ability', { id: A.id, name: A.name });
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
      }
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
        if (p.chain > 0) {
          const nx = this.nearestEnemy(p.x, p.z, 8, p.hit);
          if (nx) {
            const sp = Math.hypot(p.vx, p.vz) || 20;
            const dx = nx.x - p.x, dz = nx.z - p.z, d = Math.hypot(dx, dz) || 1;
            p.vx = (dx / d) * sp; p.vz = (dz / d) * sp;
            p.chain--; p.age = Math.min(p.age, p.life * 0.3);
            this.fx.push({ kind: 'zap', x: p.x, z: p.z, x2: nx.x, z2: nx.z, t: 0, life: 0.15 });
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
    this.fx.push({ kind: 'boom', x: p.x, z: p.z, r: p.explode, t: 0, life: 0.35, color: p.w === 'ab_fireball' ? 0xff7a1a : 0xf97316 });
    this.grid.query(p.x, p.z, p.explode + 1.5, this.tmp);
    for (const e of this.tmp) {
      if (e.dead) continue;
      if (dist2(e.x, e.z, p.x, p.z) <= p.explode * p.explode) this.hitEnemy(e, { ...p, dmg: p.dmg * 0.75, noFx: true });
    }
  }

  hitEnemy(e, p) {
    const m = this.me;
    const crit = Math.random() < m.crit;
    let dmg = p.dmg * m.dmgMult * m.might * (crit ? 2 : 1);
    if (!p.ignoreArmor) dmg *= 1 - armorReduction(ENEMIES[e.type].armor);
    dmg = Math.max(1, Math.round(dmg));
    m.stats.damage += dmg;
    const wkey = p.w;
    m.stats.byWeapon[wkey] = (m.stats.byWeapon[wkey] || 0) + dmg;
    if (p.lifesteal) this.heal(dmg * p.lifesteal);
    if (p.slow) e.slowUntil = this.t + 1.6, e.slowK = p.slow;
    this.events('dmg', { x: e.x, z: e.z, dmg, crit, boss: e.boss });
    // мгновенно у себя (предсказание), у хоста — авторитетно
    e.hp -= dmg;
    e.flash = 0.12;
    if (this.isHost) {
      if (e.hp <= 0) this.killEnemy(e, this.myId);
    } else {
      this.pendingHits.push([e.id, dmg, p.slow ? Math.round(p.slow * 100) : 0]);
      if (e.hp <= 0) { e.dead = true; e.deadAt = this.t; }
    }
  }

  // ---------- хост: орда ----------
  currentWave() {
    const min = this.t / 60;
    let w = WAVES[0];
    for (const x of WAVES) if (min >= x.from) w = x;
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
    if (players.length) {
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
        const type = this.t > 240 ? 'golem' : (Math.random() < 0.5 ? 'ghoul' : 'golem');
        this.spawnEnemy(type, anchor, null, { elite: true });
        this.events('toast', { text: `⚠️ Элита: ${ENEMIES[type].name}`, color: '#facc15' });
      }
      if (this.t >= this.nextBoss) {
        this.nextBoss += BOSS_EVERY;
        this.bossCount++;
        this.spawnEnemy('warden', players[0], null, { bossN: this.bossCount });
        this.events('toast', { text: '👹 Страж Проклятия пробудился!', color: '#f43f5e', big: true });
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
      if (!target) continue;
      const dx = target.x - e.x, dz = target.z - e.z, d = Math.sqrt(bd) || 1;
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

  killEnemy(e, killerId) {
    if (e.dead) return;
    e.dead = true;
    this.enemies.delete(e.id);
    this.team.kills++;
    this.killCredit[killerId] = (this.killCredit[killerId] || 0) + 1;
    if (killerId === this.myId) this.me.stats.kills++;
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
      this.fx.push({ kind: 'boom', x: p.x, z: p.z, r: 14, t: 0, life: 0.6, color: 0xfde047 });
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
      } else { s.x += s.vx * dt; s.z += s.vz * dt; }
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
    this.endInfo = { reason, time: this.t, level: this.team.level, kills: this.team.kills, players };
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
          k: 'me', x: r1(m.x), z: r1(m.z), dx: r1(m.dirX), dz: r1(m.dirZ), mv: m.moving ? 1 : 0,
          hp: Math.round(m.hp), mh: Math.round(m.maxHp), dead: m.dead ? 1 : 0, mag: r1(m.magnet),
          cls: this.classKey, kills: m.stats.kills, dmg: Math.round(m.stats.damage), shots: this.outShots.slice(0, 40),
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
      e.push(en.id, TYPE_IDS.indexOf(en.type), r1(en.x), r1(en.z), Math.max(0, Math.round((en.hp / en.maxHp) * 100)), (en.elite ? 1 : 0) | (en.boss ? 2 : 0) | (en.slowUntil > this.t ? 4 : 0), Math.round(en.maxHp));
    }
    const es = this.enemyShots.slice(0, 80).map((s) => [r1(s.x), r1(s.z), r1(s.vx), r1(s.vz), r1(s.life), Math.round(s.dmg)]);
    return {
      k: 'snap', t: r1(this.t), e, es, ga: this.gemAdds.slice(0, 300), gr: this.gemRems.slice(0, 400), pa: this.pkAdds, pr: this.pkRems,
      xp: this.team.xp, lv: this.team.level, kills: this.team.kills, kc: this.killCredit, nb: r1(this.nextBoss), ne: r1(this.nextElite),
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
    }
    for (const [id, en] of this.enemies) {
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
      r.hp = d.hp; r.maxHp = d.mh; r.dead = !!d.dead; r.magnet = d.mag || 2.4; r.classKey = d.cls;
      r.damage = d.dmg; r.age = 0; // убийства считает хост (killCredit)
      if (member) { r.username = member.username; r.color = member.color; }
      (d.shots || []).forEach((sh) => {
        if (this.visualShots.length > 300) return;
        const [w, x, z, vx, vz, life, orbit] = sh;
        const ws = WEAPONS[w];
        this.visualShots.push({ w, x, z, vx, vz, life, age: 0, owner: from, orbit: orbit ? (ws?.base.orbit || 2.6) : 0, phase: Math.random() * 6 });
      });
      return;
    }
    if (this.isHost) {
      if (d.k === 'hits') {
        (d.h || []).forEach(([id, dmg, slow]) => {
          const e = this.enemies.get(id);
          if (!e || e.dead) return;
          e.hp -= Math.min(dmg, 1e6);
          e.flash = 0.12;
          if (slow) { e.slowUntil = this.t + 1.6; e.slowK = slow / 100; }
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
      if (d.kind === 'bomb') this.fx.push({ kind: 'boom', x: d.x, z: d.z, r: 14, t: 0, life: 0.6, color: 0xfde047 });
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
