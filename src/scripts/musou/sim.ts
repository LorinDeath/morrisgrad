// Бой «Орды»: толпа из бестиария бродит, именные генералы и босс бьют своим приёмом.
// Удары ищут цели по клеткам, а не по всему полю — так живёт большая волна.

import {
  floorByN, heroById, mulberry32, spawnBudget,
  type FloorDef, type HeroId, type Rng, type Sheet, type Sig, type SkillDef,
} from "./rules";
import { HARD_CAP, mitigate, rateChance } from "./caps";
import { DEATH_SEC } from "./anim";
import { chestTotal, diffRow, eliteDmg, eliteHp, eliteName, floorKit, getTune, mobDmg, mobHp } from "./tune";
import { markAnchor, markColor, markMul, markTitle, rollMark } from "./mark";
import { swarmName } from "./stagecraft";
import { castOf, type Move } from "./scripts";
import { skillGlow } from "./rules";
import { LIGHT, HEAVY, castTiming, paceOf, type ActKind } from "./strike";

export const ARENA_W = 2400;
export const ARENA_H = 1560;
const MAX_MOBS = 180;
const CELL = 96;

export type Anim = "idle" | "run" | "swing" | "hurt" | "down";
export type Btn = { mx: number; my: number; aim: number; hold?: boolean; light?: boolean; heavy?: boolean; skill?: number; dodge?: boolean; chest?: boolean };

export type Actor = {
  id: string;
  name: string;
  hero: HeroId;
  sheet: Sheet;
  x: number;
  y: number;
  facing: number;
  hp: number;
  maxHp: number;
  musou: number;
  anim: Anim;
  swing: number;
  lock: number;
  step: number;
  stepT: number;
  cd: number[];
  iframe: number;
  downT: number;
  revives: number;
  hurt: number;
  bufSkill: number;
  bufLight: boolean;
  bufHeavy: boolean;
  bufDodge: boolean;
  hold: boolean;
  holdLight: boolean;
  dodgeCd: number;
  pose: number;
  atk: null | { kind: "light" | "heavy" | "skill" | "dodge"; step: number; phase: "startup" | "active" | "recovery"; left: number; hit: boolean; idx?: number };
  mx: number;
  my: number;
  aim: number;
  curse: number;
  slow: number;
  haste: number;
  downAge: number;
  echo: null | { left: number; idx: number; mul: number };
};

export type Elite = {
  id?: string;
  kind: "general" | "boss";
  name: string;
  title: string;
  x: number;
  y: number;
  hp: number;
  maxHp: number;
  facing: number;
  alive: boolean;
  wind: number;
  windMax: number;
  cd: number;
  pattern: number;
  swing: number;
  stun: number;
  die: number;
  phase: number;
  tint: string;
  r: number;
  sig: Sig;
  row: number;
  tier: number;
  up: number;
  cursed: 0 | 1;
  pow: number;
  move: Move;
  tell: string;
};

export type Chest = { id: number; x: number; y: number; open: boolean };

export type Fx = {
  k: "slash" | "ring" | "spark" | "beam" | "nova" | "zone" | "text" | "ghost" | "flash";
  x: number;
  y: number;
  a: number;
  r: number;
  ang: number;
  life: number;
  max: number;
  col: string;
  col2: string;
  txt?: string;
  hero?: HeroId;
  facing?: number;
  swing?: number;
  thick?: number;
};

export type Member = { id: string; name: string; hero: HeroId; sheet: Sheet };
export type Act = { kind: ActKind; skill: number; echo: number; ids: string[]; gauge: number };

function angDiff(a: number, b: number) {
  let d = a - b;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return d;
}
function clamp(v: number, a: number, b: number) { return Math.max(a, Math.min(b, v)); }
function len(x: number, y: number) { return Math.hypot(x, y) || 1; }

export class Battle {
  floor: FloorDef;
  diff = 1;
  kit = "none";
  blinks = 0;
  mended = 0;
  novas = 0;
  lastMobHp = 0;
  party: Actor[];
  elites: Elite[] = [];
  chests: Chest[] = [];
  nearChest = false;
  fx: Fx[] = [];
  fxOut: Fx[] = [];
  phase: "intro" | "fight" | "won" | "lost" = "intro";
  introT = 1.35;
  banner = "";
  bannerSub = "";
  bannerT = 0;
  shake = 0;
  flash = 0;
  flashCol = "#fff";
  hitstop = 0;
  combo = 0;
  comboT = 0;
  bestCombo = 0;
  kills = 0;
  genKills = 0;
  bossDown = false;
  reason: "win" | "dead" | "surrender" | "none" = "none";
  private corpse = 0;
  wave = 0;
  t = 0;
  frame = 0;
  mirror = false;
  remote = false;
  /** Сокет комнаты открыт. Пока связи нет, навык не стартует и не ставит откат. */
  linked = true;
  paused = false;
  localId = "";
  acts: Act[] = [];
  private curAct: Act | null = null;
  rng: Rng;
  seed = 1;
  private mobX = new Float32Array(MAX_MOBS);
  private mobY = new Float32Array(MAX_MOBS);
  private mobHp = new Float32Array(MAX_MOBS);
  private mobAlive = new Uint8Array(MAX_MOBS);
  private mobKind = new Uint8Array(MAX_MOBS);
  private mobFace = new Float32Array(MAX_MOBS);
  private mobTx = new Float32Array(MAX_MOBS);
  private mobTy = new Float32Array(MAX_MOBS);
  private mobCool = new Float32Array(MAX_MOBS);
  private mobDie = new Float32Array(MAX_MOBS);
  private mobHurt = new Float32Array(MAX_MOBS);
  private mobAtk = new Float32Array(MAX_MOBS);
  private mobHitCd = new Float32Array(MAX_MOBS);
  private mobN = 0;
  private spawned = 0;
  private waveNeed = 0;
  private spawnAcc = 0;
  private generalOut = false;
  private budgets: number[] = [];
  private hash = new Map<number, number[]>();
  private hashed = -1;
  private chestDwell = 0;
  private wantChest = false;
  private opened: number[] = [];

  constructor(floor: number | FloorDef, members: Member[], seed = 1, diff = 1) {
    this.floor = typeof floor === "number" ? floorByN(floor) : floor;
    this.diff = diffRow(diff).id;
    this.kit = diffRow(this.diff).act;
    this.seed = seed || 1;
    this.rng = mulberry32(this.seed);
    const f = this.floor;
    this.party = members.slice(0, 4).map((m, i) => {
      const ang = (i / Math.max(1, members.length)) * Math.PI * 2;
      return {
        id: m.id, name: m.name, hero: m.hero, sheet: m.sheet,
        x: ARENA_W / 2 + Math.cos(ang) * 36,
        y: ARENA_H / 2 + Math.sin(ang) * 36,
        facing: 0, hp: m.sheet.hp, maxHp: m.sheet.hp, musou: 0,
        anim: "idle" as Anim, swing: 0, lock: 0, step: 0, stepT: 0,
        cd: [0, 0, 0, 0], iframe: 0, downT: 0, revives: 1, hurt: 0,
        bufSkill: 0, bufLight: false, bufHeavy: false, bufDodge: false, hold: false, holdLight: false, dodgeCd: 0, pose: 0, atk: null, mx: 0, my: 0, aim: 0, curse: 0,
        slow: 0, haste: 0, downAge: 0, echo: null,
      };
    });
    this.localId = this.party[0]?.id || "";
    const b = spawnBudget(f.n);
    const a = Math.round(b.spawns * 0.3);
    const c = Math.round(b.spawns * 0.34);
    this.budgets = [a, c, b.spawns - a - c, 14];
    if (f.play?.soloBoss) {
      this.wave = 3;
      this.budgets = [0, 0, 0, 0];
    } else if (f.play?.kind === "horde") {
      this.budgets = this.budgets.map((n) => Math.round(n * 1.45));
    } else if (f.play?.kind === "arena") {
      this.budgets = this.budgets.map((n) => Math.round(n * 1.15));
    } else if (swarmName(f.name)) {
      this.budgets = this.budgets.map((n) => Math.round(n * 1.5));
    }
    this.banner = f.name;
    const spots: [number, number][] = [[ARENA_W / 2 - 320, ARENA_H / 2 - 140], [ARENA_W / 2 + 300, ARENA_H / 2 + 160], [ARENA_W / 2 - 80, ARENA_H / 2 + 280], [ARENA_W / 2 + 40, ARENA_H / 2 - 300]];
    const chests = Math.min(spots.length, chestTotal(this.diff));
    for (let i = 0; i < chests; i++) this.chests.push({ id: i, x: spots[i][0], y: spots[i][1], open: false });
    this.bannerSub = f.place;
    this.bannerT = 1.35;
    this.beginWave();
  }

  living() { return this.party.filter((p) => p.hp > 0 && p.downT <= 0); }

  press(id: string, btn: Partial<Btn>) {
    const a = this.party.find((p) => p.id === id);
    if (!a) return;
    if (btn.mx != null) a.mx = btn.mx;
    if (btn.my != null) a.my = btn.my;
    if (btn.aim != null) a.aim = btn.aim;
    if (btn.hold != null) a.holdLight = btn.hold;
    if (btn.light != null) a.holdLight = btn.light;
    if (btn.light || btn.hold) a.bufLight = true;
    if (btn.heavy) a.bufHeavy = true;
    if (btn.dodge) a.bufDodge = true;
    if (btn.skill) a.bufSkill = btn.skill;
    if (btn.chest) this.wantChest = true;
  }

  takeChests() {
    const list = this.opened;
    this.opened = [];
    return list;
  }

  mobs() {
    const out: { x: number; y: number; kind: number; alive: boolean; die: number; facing: number; hurt: number; atk: number }[] = [];
    for (let i = 0; i < this.mobN; i++) {
      if (!this.mobAlive[i] && this.mobDie[i] <= 0) continue;
      out.push({
        x: this.mobX[i], y: this.mobY[i], kind: this.mobKind[i],
        alive: !!this.mobAlive[i], die: this.mobDie[i], facing: this.mobFace[i],
        hurt: this.mobHurt[i], atk: this.mobAtk[i],
      });
    }
    return out;
  }

  step(dt: number) {
    dt = Math.min(0.05, Math.max(0, dt));
    if (this.mirror) { this.decay(dt); return; }
    this.t += dt;
    this.frame++;
    if (this.bannerT > 0) this.bannerT -= dt;
    if (this.phase === "intro") {
      this.introT -= dt;
      this.wander(dt);
      this.decay(dt);
      if (this.introT <= 0) this.phase = "fight";
      return;
    }
    if (this.phase !== "fight") { this.decay(dt); return; }
    const play = this.floor.play;
    if ((play?.kind === "arena" || play?.kind === "horde") && !this.generalOut && this.t >= 8 && !this.remote) {
      this.generalOut = true;
      this.spawnElite("general");
      this.say(play.kind === "horde" ? "Подкрепление орды" : "Подкрепление арены", "Зачарованный генерал вышел на круг", 1.2);
    }
    if (play?.enrageSec && this.t >= play.enrageSec) {
      this.phase = "lost";
      this.reason = "dead";
      this.say("Ярость", "Время рейда вышло", 2);
      this.decay(dt);
      return;
    }
    if (play?.winSec && this.t >= play.winSec) {
      this.bossDown = true;
      this.phase = "won";
      this.reason = "win";
      this.say("Круг выстоял", this.floor.name, 2);
      this.decay(dt);
      return;
    }
    if (this.paused && !this.remote) { this.decay(dt); return; }
    if (this.hitstop > 0) { this.hitstop -= dt; this.decay(dt); return; }

    for (const a of this.party) if (!this.localId || a.id === this.localId) this.actor(a, dt);
    this.tickChests(dt);
    this.spawn(dt);
    this.wander(dt);
    this.tone(dt);
    this.touchPlayers(dt);
    if (this.remote) this.watchRemote();
    else this.eliteAI(dt);
    this.decay(dt);
    this.separate();

    if (this.comboT > 0) { this.comboT -= dt; if (this.comboT <= 0) this.combo = 0; }
    const up = this.living();
    if (up.length) this.corpse = 0;
    else {
      const waiting = this.party.some((p) => p.hp <= 0 && p.revives > 0 && p.downT > 0);
      const dead = this.party.every((p) => p.hp <= 0 && p.revives <= 0);
      if (!waiting && dead) {
        if (this.corpse <= 0) {
          this.corpse = 1.3;
          this.say("Герой пал", "Здоровье на нуле, подъёмов не осталось", 1.3);
        } else {
          this.corpse -= dt;
          if (this.corpse <= 0) {
            this.phase = "lost";
            this.reason = "dead";
            this.say("Поражение", "Герой пал. Этаж не зачищен", 2);
          }
        }
      }
    }
  }

  private say(title: string, sub: string, time: number) {
    this.banner = title;
    this.bannerSub = sub;
    this.bannerT = time;
  }

  private beginWave() {
    this.spawned = 0;
    this.spawnAcc = 0;
    this.generalOut = false;
    this.waveNeed = this.budgets[this.wave] || 0;
    if (this.wave < 3 || (this.wave === 3 && this.floor.goal === "pack")) {
      const stage = this.floor.stages[Math.min(2, this.wave)] || this.floor.name;
      this.say(stage, this.floor.goal === "pack" && this.wave === 3 ? "На этапе нет босса: зачистка — сбить именную толпу" : this.floor.desc, 1.15);
      const burst = Math.min(10, this.waveNeed);
      for (let i = 0; i < burst; i++) this.spawnMob();
      this.spawned = burst;
    } else {
      this.say(this.floor.boss, this.floor.bossTitle, 1.6);
      if (!this.remote) this.spawnElite("boss");
    }
  }

  private spawn(dt: number) {
    if (this.wave > 3) return;
    if (this.wave < 3 || (this.wave === 3 && this.floor.goal === "pack")) {
      this.spawnAcc = Math.min(6, this.spawnAcc + dt * (14 + this.floor.stage));
      const alive = this.countAlive();
      while (this.spawnAcc >= 1 && this.spawned < this.waveNeed && alive + (this.spawned % 3) < 150) {
        this.spawnAcc -= 1;
        this.spawnMob();
        this.spawned++;
      }
      if (!this.generalOut && this.floor.spawnGeneral && this.spawned > this.waveNeed * 0.45 && !this.remote) {
        this.generalOut = true;
        this.spawnElite("general");
        this.say(this.floor.general, `Генерал волны ${this.wave + 1}`, 1.35);
        this.flash = Math.max(this.flash, 0.18);
        this.flashCol = "#ffb0a0";
      }
      if (this.spawned >= this.waveNeed && this.countAlive() === 0 && this.waveClear()) {
        if (this.wave === 3 && this.floor.play?.winSec) {
          this.wave = 0;
          this.beginWave();
          this.say("Подкрепление", this.floor.play.kind === "horde" ? "Орда не кончается, пока герой стоит" : "Новая волна арены", 1.1);
        } else if (this.wave === 3) {
          this.bossDown = true;
          this.phase = "won";
          this.reason = "win";
          this.say("Этаж зачищен", this.floor.name, 2.4);
        } else {
          this.wave++;
          this.beginWave();
        }
      }
    } else if (this.bossDown) {
      this.killAllPretty();
      this.phase = "won";
      this.reason = "win";
      this.say("Этаж зачищен", this.floor.name, 2.4);
      this.shake = Math.max(this.shake, 10);
    }
  }

  private countAlive() {
    let n = 0;
    for (let i = 0; i < this.mobN; i++) if (this.mobAlive[i]) n++;
    return n;
  }

  private spawnMob(x?: number, y?: number) {
    let slot = -1;
    for (let i = 0; i < this.mobN; i++) if (!this.mobAlive[i] && this.mobDie[i] <= 0) { slot = i; break; }
    if (slot < 0) {
      if (this.mobN >= MAX_MOBS) return;
      slot = this.mobN++;
    }
    const lead = this.living()[0] || this.party[0];
    const ang = this.rng() * Math.PI * 2;
    const dist = 300 + this.rng() * 180;
    const px = x ?? clamp((lead?.x ?? ARENA_W / 2) + Math.cos(ang) * dist, 90, ARENA_W - 90);
    const py = y ?? clamp((lead?.y ?? ARENA_H / 2) + Math.sin(ang) * dist, 90, ARENA_H - 90);
    this.mobX[slot] = px;
    this.mobY[slot] = py;
    const kind = Math.floor(this.rng() * 3);
    this.mobKind[slot] = kind;
    const swarm = swarmName(this.floor.name) ? 0.75 : 1;
    const foe = this.floor.play?.foeHp || 1;
    this.mobHp[slot] = Math.max(1, Math.round(mobHp(kind, this.floor.n, getTune(), this.diff) * swarm * foe));
    this.lastMobHp = this.mobHp[slot];
    this.mobAlive[slot] = 1;
    this.mobFace[slot] = this.rng() * Math.PI * 2;
    this.mobTx[slot] = px;
    this.mobTy[slot] = py;
    this.mobCool[slot] = this.rng() * 1.5;
    this.mobDie[slot] = 0;
    this.mobHurt[slot] = 0;
    this.mobAtk[slot] = 0;
  }

  private spawnElite(kind: "general" | "boss") {
    const lead = this.living()[0] || this.party[0];
    const ang = this.rng() * Math.PI * 2;
    const dist = kind === "boss" ? 280 : 240;
    const n = this.floor.n;
    const boss = kind === "boss";
    const kit = floorKit(n);
    const sig = boss ? kit.bSig : kit.gSig;
    let hp = eliteHp(kind, n, this.party.length, getTune(), this.diff);
    if (boss && this.floor.play?.mirror) hp = Math.max(40, this.party[0]?.maxHp || hp);
    if (this.floor.play?.foeHp) hp = Math.max(40, Math.round(hp * this.floor.play.foeHp));
    const id = boss ? "boss" : "g" + this.wave;
    const mark = rollMark(this.seed, id, this.diff, this.floor.play?.kind, this.floor.play?.step || 0);
    const mul = markMul(mark, markAnchor(this.diff, this.floor.play?.kind, this.floor.play?.step || 0));
    hp = Math.max(40, Math.round(hp * mul.hp));
    const named = this.floor.play ? (boss ? this.floor.boss : this.floor.general) : eliteName(kind, n);
    const ink = diffRow(this.diff).color === "#0a0a0a" ? "#f4f4f5" : diffRow(this.diff).color;
    this.elites.push({
      kind, name: markTitle(named, mark),
      title: boss ? this.floor.bossTitle : "генерал волны",
      x: clamp((lead?.x ?? ARENA_W / 2) + Math.cos(ang) * dist, 120, ARENA_W - 120),
      y: clamp((lead?.y ?? ARENA_H / 2) + Math.sin(ang) * dist, 120, ARENA_H - 120),
      id, hp, maxHp: hp, facing: ang + Math.PI, alive: true,
      wind: 0, windMax: 0.5, cd: 0.8, pattern: 0, swing: 0, stun: 0, die: 0, phase: 1,
      tint: markColor(mark, ink),
      r: boss ? 46 : 30,
      sig,
      row: boss ? this.floor.bRow : this.floor.gRow,
      tier: mark.tier, up: mark.up, cursed: mark.cursed, pow: mul.dmg,
      move: "circle", tell: "",
    });
    this.fxPush({ k: "ring", x: this.elites[this.elites.length - 1].x, y: this.elites[this.elites.length - 1].y, a: 0, r: boss ? 120 : 70, ang: 0, life: 0.45, max: 0.45, col: boss ? "#ffd76a" : "#ff6a4a", col2: "#fff" });
  }

  private waveClear() {
    if (!this.remote) return this.elites.every((e) => e.kind !== "general" || !e.alive);
    if (!this.floor.spawnGeneral) return true;
    const g = this.elites.find((e) => e.id === "g" + this.wave);
    return !!g && !g.alive;
  }

  private watchRemote() {
    const b = this.elites.find((e) => e.id === "boss");
    if (!b || b.alive || this.phase !== "fight") return;
    this.bossDown = true;
    this.killAllPretty();
    this.phase = "won";
    this.reason = "win";
    this.say("Этаж зачищен", this.floor.name, 2.4);
  }

  takeActs() {
    const list = this.acts;
    this.acts = [];
    return list;
  }

  private openAct(kind: ActKind, skill: number, echo = 0, gauge = 0) {
    if (!this.remote) return;
    this.curAct = { kind, skill, echo, ids: [], gauge };
  }

  private closeAct() {
    if (!this.curAct) return;
    this.acts.push(this.curAct);
    this.curAct = null;
  }

  applyWho(id: string, x: number, y: number, aim: number) {
    const a = this.party.find((p) => p.id === id);
    if (!a || a.id === this.localId) return;
    a.x = x; a.y = y; a.facing = aim; a.aim = aim;
  }

  applyElites(list: { id: string; kind: "general" | "boss"; name: string; x: number; y: number; hp: number; maxHp: number; facing: number; wind: number; alive: boolean; tint: string; sig?: Sig; row?: number; tier?: number; up?: number; cursed?: number; pow?: number; move?: Move; tell?: string; phase?: number }[]) {
    const prev = new Map(this.elites.map((e) => [e.id || "", e]));
    this.elites = list.map((e) => {
      const old = prev.get(e.id);
      const phase = e.phase || old?.phase || 1;
      if (e.kind === "boss" && old && phase > old.phase && phase >= 2) {
        this.say(e.name, phase === 2 ? "Вторая фаза: шире замах" : "Последняя фаза: окно перед ударом", 1.4);
        for (let i = 0; i < 4; i++) this.spawnMob(e.x + Math.cos(i * 1.6) * 96, e.y + Math.sin(i * 1.6) * 96);
      }
      return {
        id: e.id, kind: e.kind, name: e.name, title: e.kind === "boss" ? "босс" : "генерал",
        x: e.x, y: e.y, hp: e.hp, maxHp: e.maxHp, facing: e.facing, alive: e.alive,
        wind: e.wind, windMax: old?.windMax || 0.5, cd: old?.cd || 0, pattern: old?.pattern || 0, swing: e.wind > 0 ? 1 - Math.min(1, e.wind / 0.7) : 0, stun: old?.stun || 0,
        die: e.alive ? 0 : (old && !old.alive ? old.die : DEATH_SEC), phase,
        tint: e.tint, r: e.kind === "boss" ? 46 : 30,
        sig: e.sig || (e.kind === "boss" ? "cone" : "circle"),
        row: e.row || (e.kind === "boss" ? 37 : 36),
        tier: e.tier | 0, up: e.up | 0, cursed: e.cursed ? 1 : 0, pow: e.pow || 1,
        move: (e.move as Move) || old?.move || "circle", tell: e.tell || "",
      };
    });
  }

  applyHand(cd: number[], musou: number, haste: number, snap: boolean, spentMusou: boolean, down: number, final: number) {
    const me = this.party.find((p) => p.id === this.localId);
    if (!me || !Array.isArray(cd) || cd.length < 4) return;
    me.cd = [cd[0] || 0, cd[1] || 0, cd[2] || 0, cd[3] || 0];
    if (me.atk?.kind === "skill" && me.atk.idx != null && !me.atk.hit && (me.cd[me.atk.idx] || 0) > 0.02) {
      me.atk = null;
      me.bufSkill = 0;
    }
    if (snap) me.haste = haste || 0;
    else if (haste > me.haste) me.haste = haste;
    if (snap || spentMusou) me.musou = Math.max(0, Math.min(100, musou || 0));
    if (snap && final) {
      me.hp = 0;
      me.revives = 0;
      me.downT = 99;
      me.anim = "down";
    } else if (snap && down && me.hp > 0) {
      me.hp = 0;
      me.downT = 4;
      me.anim = "down";
    }
  }

  noteBlow(who: string, name: string, dmg: number, crit: boolean, x: number, y: number, heal: number) {
    this.text(x, y - 18, (crit ? "★" : "") + Math.max(1, Math.round(dmg)), crit ? "#ffe08a" : "#fff");
    if (name) this.text(x, y - 40, name, "#ffe7c2");
    const me = this.party.find((p) => p.id === this.localId);
    if (who === this.localId && me && heal > 0 && me.hp > 0) me.hp = Math.min(me.maxHp, me.hp + heal);
  }

  noteBoom(m: { x: number; y: number; facing?: number; sig?: string; r?: number; tell?: string; hurts?: { id: string; dmg: number; dodge?: number; curse?: number; slow?: number }[] }) {
    const sig = m.sig || "circle";
    const radius = m.r || 100;
    this.fxPush({ k: sig === "line" || sig === "cone" ? "slash" : "ring", x: m.x, y: m.y, a: m.facing || 0, r: radius, ang: sig === "line" ? 0.18 : sig === "cone" ? 1.05 : Math.PI, life: 0.28, max: 0.28, col: "#ffb0a0", col2: "#fff", thick: 18 });
    if (sig === "summon") {
      for (let i = 0; i < 5; i++) this.spawnMob(m.x + Math.cos(i) * 80, m.y + Math.sin(i * 1.7) * 80);
    }
    for (const h of m.hurts || []) this.noteHurt(h);
    if (m.tell) this.text(m.x, m.y - 72, m.tell, "#ffd0c2");
  }

  private noteHurt(h: { id: string; dmg: number; dodge?: number; curse?: number; slow?: number }) {
    const p = this.party.find((a) => a.id === h.id);
    if (!p || p.hp <= 0) return;
    if (h.dodge) {
      this.text(p.x, p.y - 28, "уклон", "#d7ecff");
      p.iframe = Math.max(p.iframe, 0.16);
      return;
    }
    if (p.id === this.localId && p.iframe > 0) return;
    p.hp -= h.dmg;
    p.hurt = 0.28;
    p.iframe = Math.max(p.iframe, 0.45);
    if (h.curse) {
      p.curse = 4;
      this.text(p.x, p.y - 46, "проклятие", "#f4f4f5");
    }
    if (h.slow) {
      p.slow = Math.max(p.slow, 2.2);
      this.text(p.x, p.y - 58, "медленно", "#c7dcff");
    }
    this.text(p.x, p.y - 30, "−" + Math.max(1, Math.round(h.dmg)), "#ff8d7a");
    if (p.hp <= 0) {
      p.hp = 0;
      p.downT = p.revives > 0 ? 6 : 99;
      p.downAge = 0;
      p.anim = "down";
      this.text(p.x, p.y - 48, p.revives > 0 ? "подъём через мгновение" : p.name + " пал", "#ffd0c8");
    }
  }

  private touchPlayers(dt: number) {
    const prey = this.living();
    if (!prey.length) return;
    for (let i = 0; i < this.mobN; i++) {
      if (!this.mobAlive[i]) continue;
      if (this.mobHitCd[i] > 0) { this.mobHitCd[i] -= dt; continue; }
      let best = prey[0], bd = 1e12;
      for (const p of prey) {
        const d = (p.x - this.mobX[i]) ** 2 + (p.y - this.mobY[i]) ** 2;
        if (d < bd) { bd = d; best = p; }
      }
      const kind = this.mobKind[i];
      const ranged = kind === 1;
      const reach = ranged ? 200 : kind === 2 ? 42 : 36;
      if (ranged && bd < 130 * 130) continue;
      if (bd > reach * reach || best.iframe > 0) continue;
      if (this.rng() < rateChance(best.sheet.dodgeRaw, "dodge")) {
        this.text(best.x, best.y - 22, "уклон", "#d7ecff");
        best.iframe = Math.max(best.iframe, 0.18);
        this.mobHitCd[i] = 0.7;
        this.mobAtk[i] = 0.32;
        continue;
      }
      const near = this.crowdBoost(this.mobX[i], this.mobY[i]);
      const dmg = mitigate(mobDmg(kind, getTune(), this.diff) * (best.curse > 0 ? 1.25 : 1) * near, best.sheet.armor);
      if (diffRow(this.diff).act === "killer") best.curse = Math.max(best.curse, 3);
      best.hp -= dmg;
      best.hurt = 0.22;
      best.iframe = Math.max(best.iframe, getTune().combat.contactIframe);
      this.mobHitCd[i] = kind === 1 ? 1.3 : 0.9;
      this.mobAtk[i] = 0.32;
      this.text(best.x, best.y - 20, "−" + Math.max(1, Math.round(dmg)), "#ff8d7a");
      if (best.hp <= 0) {
        best.hp = 0;
        best.downT = best.revives > 0 ? 6 : 99;
        best.downAge = 0;
        best.anim = "down";
      }
    }
  }

  private wander(dt: number) {
    const act = diffRow(this.diff).act;
    const prey = this.living();
    const spd = (118 + Math.min(36, this.floor.n * 0.15)) * (act === "killer" ? 1.2 : 1);
    for (let i = 0; i < this.mobN; i++) {
      if (!this.mobAlive[i]) {
        if (this.mobDie[i] > 0) this.mobDie[i] -= dt;
        continue;
      }
      let tx = this.mobX[i], ty = this.mobY[i], best = 1e12;
      const who = prey.length ? prey : this.party;
      for (const p of who) {
        const d = (p.x - this.mobX[i]) ** 2 + (p.y - this.mobY[i]) ** 2;
        if (d < best) { best = d; tx = p.x; ty = p.y; }
      }
      const dx = tx - this.mobX[i];
      const dy = ty - this.mobY[i];
      const d = Math.sqrt(best);
      const kind = this.mobKind[i];
      const ranged = kind === 1;
      let dir = 1;
      if (ranged && d < 150) dir = -1;
      else if (!ranged && d <= (kind === 2 ? 40 : 34)) dir = 0;
      else if (ranged && d <= 220) dir = 0;
      const side = ranged && dir === 0 ? 1 : 0;
      const mx = side ? -dy : dx;
      const my = side ? dx : dy;
      const L = Math.hypot(mx, my) || 1;
      const kindSpd = ranged ? spd * 0.92 : kind === 2 ? spd * 0.78 : spd;
      if (dir !== 0 || side) {
        this.mobX[i] = clamp(this.mobX[i] + (mx / L) * kindSpd * dt * (dir || 1), 70, ARENA_W - 70);
        this.mobY[i] = clamp(this.mobY[i] + (my / L) * kindSpd * dt * (dir || 1), 70, ARENA_H - 70);
      }
      this.mobFace[i] = Math.atan2(dy, dx);
      this.mobTx[i] = tx;
      this.mobTy[i] = ty;
    }
  }

  private tone(dt: number) {
    const row = diffRow(this.diff);
    if (row.regen > 0) {
      for (let i = 0; i < this.mobN; i++) {
        if (!this.mobAlive[i]) continue;
        const cap = mobHp(this.mobKind[i], this.floor.n, getTune(), this.diff);
        const next = Math.min(cap, this.mobHp[i] + cap * row.regen * dt);
        if (next > this.mobHp[i]) this.mended++;
        this.mobHp[i] = next;
      }
      for (const e of this.elites) {
        if (!e.alive) continue;
        const extra = e.tier > row.tier ? 0.004 : 0;
        e.hp = Math.min(e.maxHp, e.hp + e.maxHp * (row.regen + extra) * dt);
      }
    }
    if ((row.act === "nova" || row.act === "killer") && this.frame % 100 === 0) {
      for (const e of this.elites) {
        if (!e.alive) continue;
        this.novas++;
        const bite = eliteDmg(e.kind, this.floor.n, getTune(), this.diff) * 0.35 * (e.pow || 1);
        for (const p of this.living()) {
          const dx = p.x - e.x, dy = p.y - e.y;
          if (dx * dx + dy * dy > 140 * 140 || p.iframe > 0) continue;
          p.hp -= mitigate(bite, p.sheet.armor);
          if (row.act === "killer") p.curse = Math.max(p.curse, 4);
          this.text(p.x, p.y - 36, row.act === "killer" ? "чёрное кольцо" : "волна", row.color);
        }
      }
    }
    if (row.act !== "blink" || (this.frame % 45) !== 0) return;
    const lead = this.living()[0];
    if (!lead) return;
    let far = -1;
    let best = 110 * 110;
    for (let i = 0; i < this.mobN; i++) {
      if (!this.mobAlive[i]) continue;
      const dx = lead.x - this.mobX[i];
      const dy = lead.y - this.mobY[i];
      const d2 = dx * dx + dy * dy;
      if (d2 > best) { best = d2; far = i; }
    }
    if (far < 0) return;
    const dx = lead.x - this.mobX[far];
    const dy = lead.y - this.mobY[far];
    const L = Math.hypot(dx, dy) || 1;
    this.mobX[far] = clamp(lead.x - (dx / L) * 64, 70, ARENA_W - 70);
    this.mobY[far] = clamp(lead.y - (dy / L) * 64, 70, ARENA_H - 70);
    this.blinks++;
    this.spark(this.mobX[far], this.mobY[far], row.color);
  }

  private separate() {
    if ((this.frame & 3) !== 0) return;
    this.rebuild();
    for (let i = 0; i < this.mobN; i++) {
      if (!this.mobAlive[i]) continue;
      const key = this.key(this.mobX[i], this.mobY[i]);
      const bucket = this.hash.get(key);
      if (!bucket) continue;
      for (const j of bucket) {
        if (j <= i || !this.mobAlive[j]) continue;
        const dx = this.mobX[j] - this.mobX[i];
        const dy = this.mobY[j] - this.mobY[i];
        const d2 = dx * dx + dy * dy;
        if (d2 > 1 && d2 < 18 * 18) {
          const d = Math.sqrt(d2);
          const p = (18 - d) * 0.25;
          this.mobX[i] -= (dx / d) * p;
          this.mobY[i] -= (dy / d) * p;
          this.mobX[j] += (dx / d) * p;
          this.mobY[j] += (dy / d) * p;
        }
      }
    }
  }

  private key(x: number, y: number) {
    return (Math.floor(x / CELL) + 80) + (Math.floor(y / CELL) + 80) * 512;
  }
  private rebuild() {
    if (this.hashed === this.frame) return;
    this.hashed = this.frame;
    this.hash.clear();
    for (let i = 0; i < this.mobN; i++) {
      if (!this.mobAlive[i]) continue;
      const k = this.key(this.mobX[i], this.mobY[i]);
      let b = this.hash.get(k);
      if (!b) this.hash.set(k, b = []);
      b.push(i);
    }
  }

  private actor(a: Actor, dt: number) {
    const rate = a.haste > 0 ? 1.25 : 1;
    if (a.cd[0] > 0) a.cd[0] -= dt * rate;
    if (a.cd[1] > 0) a.cd[1] -= dt * rate;
    if (a.cd[2] > 0) a.cd[2] -= dt * rate;
    if (a.cd[3] > 0) a.cd[3] -= dt * rate;
    if (a.iframe > 0) a.iframe -= dt;
    if (a.hurt > 0) a.hurt -= dt;
    if (a.hp <= 0) {
      a.anim = "down";
      a.downAge += dt;
      a.downT -= dt;
      if (a.downT <= 0 && a.revives > 0) {
        a.revives--;
        a.hp = Math.round(a.maxHp * 0.45);
        a.iframe = 1.1;
        a.downAge = 0;
        a.anim = "idle";
        this.text(a.x, a.y - 40, "снова в строю", "#d8ffe8");
      }
      return;
    }
    if (this.remote && !this.linked && a.atk?.kind === "skill" && !a.atk.hit) {
      a.atk = null;
      a.bufSkill = 0;
    }
    if (a.dodgeCd > 0) a.dodgeCd -= dt;
    if (a.stepT > 0) a.stepT -= dt;
    else if (a.step !== 0 && !a.atk) a.step = 0;
    this.tickAtk(a, dt);
    if (a.atk?.phase === "recovery") {
      if (a.bufDodge && a.dodgeCd <= 0) { a.atk = null; this.beginDodge(a); }
      else if (a.bufHeavy) { a.atk = null; this.beginHeavy(a); }
      else if (a.bufSkill) { const sk = a.bufSkill; a.bufSkill = 0; a.atk = null; this.beginSkill(a, sk - 1); }
    }
    if (!a.atk) {
      if (a.bufDodge && a.dodgeCd <= 0) this.beginDodge(a);
      else if (a.bufHeavy) this.beginHeavy(a);
      else if (a.bufSkill) { const sk = a.bufSkill; a.bufSkill = 0; this.beginSkill(a, sk - 1); }
      else if (a.holdLight || a.bufLight) this.beginLight(a);
    }
    a.bufHeavy = false;
    a.bufDodge = false;
    a.bufLight = false;
    a.bufSkill = 0;
    const committed = a.atk && a.atk.phase !== "recovery" && a.atk.kind !== "dodge";
    if (a.curse > 0) a.curse = Math.max(0, a.curse - dt);
    if (a.slow > 0) a.slow = Math.max(0, a.slow - dt);
    if (a.haste > 0) a.haste = Math.max(0, a.haste - dt);
    if (a.echo) {
      a.echo.left -= dt;
      if (a.echo.left <= 0) {
        if (this.remote && !this.linked) a.echo.left = 0.05;
        else {
          const echo = a.echo;
          a.echo = null;
          this.echoStrike(a, echo.idx, echo.mul);
        }
      }
    }
    const sp = Math.hypot(a.mx, a.my);
    if (sp > 0.18 && !committed) {
      const nx = a.mx / sp, ny = a.my / sp;
      const spd = a.sheet.speed * (a.atk ? 0.62 : 1) * (a.curse > 0 ? 0.75 : 1) * (a.slow > 0 ? 0.62 : 1) * (a.haste > 0 ? 1.25 : 1);
      a.x = clamp(a.x + nx * spd * dt, 48, ARENA_W - 48);
      a.y = clamp(a.y + ny * spd * dt, 48, ARENA_H - 48);
      if (!a.atk) a.anim = "run";
    } else if (!a.atk && a.anim === "run") a.anim = "idle";
    a.facing = a.aim;
  }

  private phaseOf(a: Actor) {
    const atk = a.atk;
    if (!atk) return HEAVY;
    if (atk.kind === "light") return LIGHT[atk.step] || LIGHT[0];
    if (atk.kind === "dodge") return { r: 0, ang: 0, mul: 0, startup: 0.02, active: 0.16, recovery: 0.1 };
    if (atk.kind === "skill") return { r: 0, ang: 0, mul: 0, startup: 0.08, active: 0.06, recovery: 0.18 };
    return HEAVY;
  }

  private tickAtk(a: Actor, dt: number) {
    const atk = a.atk;
    if (!atk) return;
    const spec = this.phaseOf(a);
    atk.left -= dt;
    a.anim = atk.kind === "dodge" ? "run" : "swing";
    a.swing = atk.phase === "startup" ? 0.25 : atk.phase === "active" ? 0.72 : 1;
    if (atk.kind === "dodge") {
      const nx = Math.cos(a.aim), ny = Math.sin(a.aim);
      a.x = clamp(a.x + nx * 280 * dt, 48, ARENA_W - 48);
      a.y = clamp(a.y + ny * 280 * dt, 48, ARENA_H - 48);
    }
    if (atk.left > 0) return;
    const pace = atk.kind === "light" || atk.kind === "heavy" ? paceOf(a.sheet) : 1;
    if (atk.phase === "startup") {
      atk.phase = "active";
      atk.left = spec.active / pace;
      this.fire(a, atk);
      return;
    }
    if (atk.phase === "active") {
      atk.phase = "recovery";
      atk.left = spec.recovery / pace;
      return;
    }
    a.atk = null;
    if (a.anim === "swing" || a.pose === 12) a.anim = "idle";
  }

  private fire(a: Actor, atk: NonNullable<Actor["atk"]>) {
    if (atk.hit || atk.kind === "dodge") return;
    atk.hit = true;
    if (atk.kind === "light") {
      const s = LIGHT[atk.step] || LIGHT[0];
      const fin = atk.step === 3;
      this.openAct("light", -1, 0, a.musou);
      this.strike(a, { shape: "arc", r: s.r, ang: s.ang, mul: s.mul, skill: false, finisher: fin, kind: "light", col: heroById(a.hero).accent, col2: "#fff4e0" });
      this.closeAct();
      if (fin) { this.hitstop = 0.04; this.shake = Math.max(this.shake, 5); }
    } else if (atk.kind === "heavy") {
      this.openAct("heavy", -1, 0, a.musou);
      this.strike(a, { shape: "arc", r: HEAVY.r, ang: HEAVY.ang, mul: HEAVY.mul, skill: false, finisher: true, kind: "heavy", col: "#fff", col2: heroById(a.hero).accent });
      this.closeAct();
      this.hitstop = 0.05;
      this.shake = Math.max(this.shake, 6);
    } else if (atk.kind === "skill" && atk.idx != null) {
      this.cast(a, atk.idx);
    }
  }

  private beginLight(a: Actor) {
    if (a.stepT <= 0) a.step = 0;
    const step = a.step;
    const s = LIGHT[step];
    a.atk = { kind: "light", step, phase: "startup", left: s.startup / paceOf(a.sheet), hit: false };
    a.pose = 4 + step;
    a.anim = "swing";
    a.swing = 0;
    a.step = (step + 1) % 4;
    a.stepT = 0.72;
    a.bufLight = false;
  }

  private beginHeavy(a: Actor) {
    a.step = 0;
    a.atk = { kind: "heavy", step: 0, phase: "startup", left: HEAVY.startup / paceOf(a.sheet), hit: false };
    a.pose = 8;
    a.anim = "swing";
    a.swing = 0;
    a.bufHeavy = false;
  }

  private beginDodge(a: Actor) {
    a.atk = { kind: "dodge", step: 0, phase: "startup", left: 0.02, hit: true };
    a.pose = 12;
    a.anim = "run";
    a.iframe = 0.28;
    a.dodgeCd = 1.15;
    a.bufDodge = false;
  }

  private beginSkill(a: Actor, idx: number) {
    const hero = heroById(a.hero);
    const sk = hero.skills[idx];
    if (!sk) return;
    if (this.remote && !this.linked) return;
    if (sk.musou) {
      if (a.musou < 100 || a.cd[idx] > 0) return;
    } else if (a.cd[idx] > 0) return;
    a.atk = { kind: "skill", step: 0, phase: "startup", left: 0.08, hit: false, idx };
    a.pose = 11;
    a.anim = "swing";
    a.swing = 0;
  }

  private cast(a: Actor, idx: number) {
    const hero = heroById(a.hero);
    const sk = hero.skills[idx];
    if (!sk) return;
    const glow = skillGlow(a.hero, idx, a.sheet.radiance | 0);
    const reach = (a.sheet.radiusMul || 1) * (glow === "extend" ? 1.4 : 1);
    const gauge = a.musou;
    if (sk.musou) {
      if (a.musou < 100 || a.cd[idx] > 0) return;
      a.musou = 0;
      a.cd[idx] = 1.2;
    } else if (a.cd[idx] > 0) return;
    else a.cd[idx] = sk.cd * (a.sheet.cdMul || 1);
    a.lock = 0.28;
    a.swing = 0;
    a.anim = "swing";
    this.openAct(sk.musou ? "musou" : "skill", idx, 0, gauge);
    if (sk.dash) {
      const nx = Math.cos(a.aim), ny = Math.sin(a.aim);
      for (let g = 0; g < 3; g++) {
        this.fxPush({
          k: "ghost", x: a.x - nx * sk.dash * (0.25 + g * 0.2), y: a.y - ny * sk.dash * (0.25 + g * 0.2),
          a: a.aim, r: 0, ang: 0, life: 0.18 + g * 0.04, max: 0.28, col: sk.fx, col2: sk.fx2,
          hero: a.hero, facing: a.facing, swing: 0.6,
        });
      }
      a.x = clamp(a.x + nx * sk.dash, 48, ARENA_W - 48);
      a.y = clamp(a.y + ny * sk.dash, 48, ARENA_H - 48);
    }
    this.strike(a, { shape: sk.shape, r: sk.r * reach, ang: sk.ang || 0.5, mul: sk.dmg, skill: true, finisher: !!sk.musou, col: sk.fx, col2: sk.fx2, heal: sk.heal, stun: sk.stun, def: sk, vamp: glow === "vamp" });
    this.text(a.x, a.y - 78, sk.name, sk.fx);
    if (glow === "echo") a.echo = { left: 0.6, idx, mul: 0.4 };
    if (glow === "swift") a.haste = Math.max(a.haste, 2);
    if (glow === "nova") this.strike(a, { shape: "circle", r: 96, ang: 0, mul: sk.dmg * 0.45, skill: true, finisher: false, col: sk.fx, col2: sk.fx2 });
    if (sk.musou) {
      this.flash = 0.45;
      this.flashCol = sk.fx;
      this.shake = 14;
      this.hitstop = 0.07;
      this.fxPush({ k: "nova", x: a.x, y: a.y, a: 0, r: sk.r, ang: 0, life: 0.55, max: 0.55, col: sk.fx, col2: sk.fx2 });
    }
    this.closeAct();
  }

  private echoStrike(a: Actor, idx: number, mul: number) {
    const sk = heroById(a.hero).skills[idx];
    if (!sk || a.hp <= 0) return;
    const glow = skillGlow(a.hero, idx, a.sheet.radiance | 0);
    const reach = (a.sheet.radiusMul || 1) * (glow === "extend" ? 1.4 : 1);
    this.openAct("skill", idx, 1, a.musou);
    this.strike(a, { shape: sk.shape, r: sk.r * reach, ang: sk.ang || 0.5, mul: sk.dmg * mul, skill: true, finisher: false, col: sk.fx, col2: sk.fx2, stun: sk.stun, def: sk, vamp: glow === "vamp" });
    this.closeAct();
    this.text(a.x, a.y - 64, "эхо", sk.fx);
  }

  private strike(a: Actor, o: { shape: SkillDef["shape"]; r: number; ang: number; mul: number; skill: boolean; finisher: boolean; kind?: "light" | "heavy" | "skill" | "musou"; col: string; col2: string; heal?: number; stun?: number; def?: SkillDef; vamp?: boolean }) {
    this.rebuild();
    const power = a.sheet.dmg * o.mul * (o.skill ? a.sheet.skill : 1) * (this.floor.play?.playerDmg ?? 1);
    let hits = 0;
    let shown = 0;
    const touch = (x: number, y: number) => {
      if (o.shape === "circle") return (x - a.x) ** 2 + (y - a.y) ** 2 <= o.r * o.r;
      if (o.shape === "line") return this.onSegment(a.x, a.y, a.x + Math.cos(a.aim) * o.r, a.y + Math.sin(a.aim) * o.r, x, y, 36 + (o.ang || 0) * 40);
      if (o.shape === "dash") return this.onSegment(a.x - Math.cos(a.aim) * (o.def?.dash || 160), a.y - Math.sin(a.aim) * (o.def?.dash || 160), a.x, a.y, x, y, o.r);
      const dx = x - a.x, dy = y - a.y;
      if (dx * dx + dy * dy > o.r * o.r) return false;
      return Math.abs(angDiff(Math.atan2(dy, dx), a.aim)) <= o.ang;
    };
    const hurtOne = (x: number, y: number, hp: number, armorK: number) => {
      const crit = this.rng() < rateChance(a.sheet.critRaw + (a.musou >= 100 ? 36 : 0), "crit");
      let dmg = power * (crit ? 1.75 : 1) * armorK * (1 - Math.min(0.45, diffRow(this.diff).soak));
      if (o.finisher) dmg *= 1.08;
      hp -= dmg;
      hits++;
      if (shown < 4) {
        this.text(x, y - 16, (crit ? "★" : "") + Math.round(dmg), crit ? "#ffe08a" : "#fff");
        shown++;
      }
      if (a.sheet.ls > 0) a.hp = Math.min(a.maxHp, a.hp + dmg * a.sheet.ls);
      if (o.vamp) {
        const room = Math.max(0, HARD_CAP.ls - a.sheet.ls);
        const bite = Math.min(0.08, room);
        if (bite > 0) a.hp = Math.min(a.maxHp, a.hp + dmg * bite);
      }
      return hp;
    };
    const x0 = Math.floor((a.x - o.r) / CELL), x1 = Math.floor((a.x + o.r) / CELL);
    const y0 = Math.floor((a.y - o.r) / CELL), y1 = Math.floor((a.y + o.r) / CELL);
    const span = o.shape === "line" ? o.r : o.r;
    const X0 = Math.floor((a.x - span) / CELL), X1 = Math.floor((a.x + span) / CELL);
    const Y0 = Math.floor((a.y - span) / CELL), Y1 = Math.floor((a.y + span) / CELL);
    const seen = new Set<number>();
    for (let cy = Math.min(y0, Y0); cy <= Math.max(y1, Y1); cy++) {
      for (let cx = Math.min(x0, X0); cx <= Math.max(x1, X1); cx++) {
        const bucket = this.hash.get((cx + 80) + (cy + 80) * 512);
        if (!bucket) continue;
        for (const i of bucket) {
          if (seen.has(i) || !this.mobAlive[i]) continue;
          seen.add(i);
          if (!touch(this.mobX[i], this.mobY[i])) continue;
          this.mobHp[i] = hurtOne(this.mobX[i], this.mobY[i], this.mobHp[i], 1);
          const kb = o.finisher ? 52 : 28;
          this.mobHurt[i] = 0.16;
          const kx = this.mobX[i] - a.x, ky = this.mobY[i] - a.y;
          const kl = Math.hypot(kx, ky) || 1;
          this.mobX[i] = clamp(this.mobX[i] + (kx / kl) * kb, 48, ARENA_W - 48);
          this.mobY[i] = clamp(this.mobY[i] + (ky / kl) * kb, 48, ARENA_H - 48);
          this.spark(this.mobX[i], this.mobY[i], o.col);
          if (this.mobHp[i] <= 0) this.slay(i);
        }
      }
    }
    for (const e of this.elites) {
      if (!e.alive || !touch(e.x, e.y)) continue;
      if (this.remote && e.id) {
        if (this.curAct && !this.curAct.ids.includes(e.id)) this.curAct.ids.push(e.id);
        this.spark(e.x, e.y, o.col);
        continue;
      }
      const k = (100 / (100 + (e.kind === "boss" ? 18 : 8))) * (1 - (this.floor.play?.armor || 0));
      e.hp = hurtOne(e.x, e.y, e.hp, k);
      if (o.stun) e.stun = Math.max(e.stun, o.stun);
      if (e.hp <= 0) this.slayElite(e);
    }
    if (o.heal) {
      for (const p of this.party) {
        if (p.hp <= 0) continue;
        if ((p.x - a.x) ** 2 + (p.y - a.y) ** 2 <= (o.r + 20) ** 2) {
          const g = Math.round(p.maxHp * o.heal * a.sheet.heal);
          p.hp = Math.min(p.maxHp, p.hp + g);
          this.text(p.x, p.y - 28, "+" + g, "#b8ffd2");
        }
      }
    }
    if (hits) {
      this.combo += hits > 6 ? Math.min(8, hits) : 1;
      this.comboT = 0.85;
      this.bestCombo = Math.max(this.bestCombo, this.combo);
      a.musou = Math.min(100, a.musou + Math.min(24, hits * 2.2));
    }
    if (o.shape === "arc" || o.shape === "dash") {
      this.fxPush({ k: "slash", x: a.x, y: a.y, a: a.aim, r: o.r, ang: o.ang, life: o.finisher ? 0.28 : 0.16, max: o.finisher ? 0.28 : 0.16, col: o.col, col2: o.col2, thick: o.finisher ? 16 : 9 });
    }
    if (o.shape === "circle") {
      this.fxPush({ k: "ring", x: a.x, y: a.y, a: 0, r: o.r, ang: 0, life: 0.32, max: 0.32, col: o.col, col2: o.col2 });
      this.fxPush({ k: "zone", x: a.x, y: a.y, a: 0, r: o.r * 0.85, ang: 0, life: 0.28, max: 0.28, col: o.col, col2: o.col2 });
    }
    if (o.shape === "line") {
      this.fxPush({ k: "beam", x: a.x, y: a.y, a: a.aim, r: o.r, ang: 0, life: 0.22, max: 0.22, col: o.col, col2: o.col2, thick: 14 });
    }
    if (o.finisher) this.fxPush({ k: "ring", x: a.x, y: a.y, a: 0, r: o.r * 0.85, ang: 0, life: 0.34, max: 0.34, col: o.col2, col2: "#fff" });
    if (hits > 8) this.text(a.x, a.y - 52, hits + " разом", o.col);
  }

  private onSegment(x1: number, y1: number, x2: number, y2: number, px: number, py: number, width: number) {
    const dx = x2 - x1, dy = y2 - y1;
    const l2 = dx * dx + dy * dy || 1;
    let t = ((px - x1) * dx + (py - y1) * dy) / l2;
    t = clamp(t, 0, 1);
    const x = x1 + dx * t, y = y1 + dy * t;
    return (px - x) ** 2 + (py - y) ** 2 <= width * width;
  }

  private slay(i: number) {
    this.mobAlive[i] = 0;
    this.mobDie[i] = DEATH_SEC;
    this.mobHurt[i] = 0;
    this.kills++;
    this.hitstop = Math.min(0.05, this.hitstop + 0.02);
    this.shake = Math.max(this.shake, 2);
    this.spark(this.mobX[i], this.mobY[i], this.floor.ember);
  }

  private markPhase(e: Elite) {
    if (!e.alive || e.kind !== "boss") return;
    const ratio = e.maxHp > 0 ? e.hp / e.maxHp : 1;
    const phase = ratio <= 0.33 ? 3 : ratio <= 0.66 ? 2 : 1;
    if (phase === e.phase) return;
    e.phase = phase;
    if (phase < 2) return;
    this.say(e.name, phase === 2 ? "Вторая фаза: шире замах" : "Последняя фаза: окно перед ударом", 1.4);
    for (let i = 0; i < 4; i++) this.spawnMob(e.x + Math.cos(i * 1.6) * 96, e.y + Math.sin(i * 1.6) * 96);
  }

  private crowdBoost(x: number, y: number) {
    for (const e of this.elites) {
      if (!e.alive || e.kind !== "general" || e.sig !== "circle") continue;
      if ((e.x - x) ** 2 + (e.y - y) ** 2 < 220 * 220) return 1.2;
    }
    return 1;
  }

  private slayElite(e: Elite) {
    if (!e.alive) return;
    e.alive = false;
    e.hp = 0;
    e.die = DEATH_SEC;
    this.fxPush({ k: "nova", x: e.x, y: e.y, a: 0, r: e.r * 4, ang: 0, life: 0.5, max: 0.5, col: e.tint, col2: "#fff" });
    this.shake = Math.max(this.shake, e.kind === "boss" ? 16 : 8);
    if (e.kind === "general") {
      this.genKills++;
      this.say(e.name + " пал", "Генерал волны сбит", 1.1);
    } else {
      this.bossDown = true;
      this.flash = 0.55;
      this.flashCol = "#fff6d4";
    }
  }

  private eliteAI(dt: number) {
    const prey = this.living();
    for (const e of this.elites) {
      if (!e.alive) continue;
      if (e.stun > 0) { e.stun -= dt; e.swing = 0; continue; }
      let tx = e.x, ty = e.y, best = 1e12;
      for (const p of prey) {
        const d = (p.x - e.x) ** 2 + (p.y - e.y) ** 2;
        if (d < best) { best = d; tx = p.x; ty = p.y; }
      }
      const dx = tx - e.x, dy = ty - e.y;
      const d = Math.sqrt(best);
      e.facing = Math.atan2(dy, dx);
      this.markPhase(e);
      const act = diffRow(this.diff).act;
      const spd = (e.kind === "boss" ? 92 : 118) * (act === "killer" || e.tier >= 6 || e.cursed ? 1.28 : 1) * (e.sig === "cone" ? 1.12 : 1) * (1 + Math.min(3, e.up) * 0.04);
      const retreat = e.sig === "line" && d < 210;
      if (e.wind <= 0 && (retreat || d > e.r + 24)) {
        const dir = retreat ? -1 : 1;
        e.x += (dx / (d || 1)) * spd * dt * dir;
        e.y += (dy / (d || 1)) * spd * dt * dir;
        e.swing = 0;
      }
      if (e.wind > 0) {
        e.wind -= dt;
        e.swing = 1 - e.wind / e.windMax;
        if (e.move === "pull") {
          for (const p of prey) {
            if (p.iframe > 0) continue;
            const px = e.x - p.x, py = e.y - p.y;
            const pd = Math.hypot(px, py) || 1;
            if (pd < 70 || pd > 420) continue;
            p.x = clamp(p.x + (px / pd) * 78 * dt, 48, ARENA_W - 48);
            p.y = clamp(p.y + (py / pd) * 78 * dt, 48, ARENA_H - 48);
          }
        }
        if (e.wind <= 0) this.resolveSlam(e);
      } else {
        e.cd -= dt;
        if (e.cd <= 0 && prey.length) {
          const cast = castOf(this.floor.dungeon, e.kind, e.pattern, e.tier);
          e.move = cast.move;
          e.sig = cast.shape;
          e.tell = cast.tell;
          if (e.tier >= 3 && d > 260 && e.move !== "line" && e.move !== "pull") {
            e.x = clamp(tx - (dx / (d || 1)) * 110, 80, ARENA_W - 80);
            e.y = clamp(ty - (dy / (d || 1)) * 110, 80, ARENA_H - 80);
          }
          const timing = castTiming(e.kind, e.move, e.sig, e.phase);
          e.windMax = timing.wind;
          e.wind = e.windMax;
          e.cd = timing.cd;
          e.pattern++;
          this.text(e.x, e.y - 72, cast.tell, e.tint);
        }
      }
    }
  }

  private tickChests(dt: number) {
    const me = this.party.find((p) => p.id === this.localId) || this.party[0];
    if (!me || me.hp <= 0) { this.nearChest = false; this.chestDwell = 0; return; }
    let near: Chest | null = null;
    for (const c of this.chests) {
      if (c.open) continue;
      if ((c.x - me.x) ** 2 + (c.y - me.y) ** 2 < 78 * 78) { near = c; break; }
    }
    this.nearChest = !!near;
    if (!near) { this.chestDwell = 0; this.wantChest = false; return; }
    this.chestDwell += dt;
    if (this.wantChest || this.chestDwell >= 0.45) {
      near.open = true;
      this.opened.push(near.id);
      this.chestDwell = 0;
      this.wantChest = false;
      this.nearChest = false;
      this.text(near.x, near.y - 40, "сундук", "#ffd76a");
      this.fxPush({ k: "ring", x: near.x, y: near.y, a: 0, r: 54, ang: 0, life: 0.4, max: 0.4, col: "#ffd76a", col2: "#fff" });
    }
  }

  private resolveSlam(e: Elite) {
    const boss = e.kind === "boss";
    const sig = e.sig || "circle";
    if (sig === "summon") {
      for (let i = 0; i < (boss ? 8 : 5); i++) this.spawnMob(e.x + Math.cos(i) * 80, e.y + Math.sin(i * 1.7) * 80);
      this.text(e.x, e.y - 60, "призыв", e.tint);
    }
    const line = sig === "line";
    const cone = sig === "cone";
    const radius = e.move === "pull" ? 78 : e.move === "bite" ? 112 : e.move === "slow" ? 150 : cone || line ? 168 : boss ? 118 : 96;
    const ang = cone ? 1.05 : Math.PI;
    const dmg = eliteDmg(boss ? "boss" : "general", this.floor.n, getTune(), this.diff) * (e.phase >= 3 ? 1.3 : 1) * (e.pow || 1);
    this.fxPush({ k: cone || line ? "slash" : "ring", x: e.x, y: e.y, a: e.facing, r: radius, ang: line ? 0.18 : ang, life: 0.28, max: 0.28, col: e.tint, col2: "#fff", thick: 18 });
    this.shake = Math.max(this.shake, boss ? 7 : 4);
    for (const p of this.party) {
      if (p.hp <= 0 || p.iframe > 0) continue;
      const dx = p.x - e.x, dy = p.y - e.y;
      const along = dx * Math.cos(e.facing) + dy * Math.sin(e.facing);
      const side = Math.abs(-dx * Math.sin(e.facing) + dy * Math.cos(e.facing));
      const inside = line
        ? along > 0 && along < radius && side < 34
        : cone
          ? dx * dx + dy * dy <= radius * radius && Math.abs(angDiff(Math.atan2(dy, dx), e.facing)) <= ang
          : dx * dx + dy * dy <= radius * radius;
      if (!inside) continue;
      if (this.rng() < rateChance(p.sheet.dodgeRaw, "dodge")) {
        this.text(p.x, p.y - 28, "уклон", "#d7ecff");
        p.iframe = Math.max(p.iframe, 0.16);
        continue;
      }
      const taken = mitigate(dmg * (p.curse > 0 ? 1.25 : 1), p.sheet.armor);
      p.hp -= taken;
      p.hurt = 0.28;
      p.iframe = 0.55;
      if (sig === "curse" || e.move === "curse" || diffRow(this.diff).act === "killer") {
        p.curse = 4;
        this.text(p.x, p.y - 46, "проклятие", "#f4f4f5");
      }
      if (e.move === "slow") {
        p.slow = Math.max(p.slow, 2.2);
        this.text(p.x, p.y - 58, "медленно", "#c7dcff");
      }
      if (e.move === "bite") {
        e.hp = Math.min(e.maxHp, e.hp + taken * 0.12);
        this.text(e.x, e.y - 52, "кровь", "#ff8aa8");
      }
      if (diffRow(this.diff).act === "killer" && boss) {
        for (let i = 0; i < 3; i++) this.spawnMob(e.x + Math.cos(i) * 70, e.y + Math.sin(i) * 70);
      }
      this.text(p.x, p.y - 30, "−" + Math.round(taken), "#ff8d7a");
      if (p.hp <= 0) {
        p.hp = 0;
        p.downT = p.revives > 0 ? 6 : 99;
        p.downAge = 0;
        p.anim = "down";
        this.text(p.x, p.y - 48, p.revives > 0 ? "подъём через мгновение" : p.name + " пал", "#ffd0c8");
      }
    }
  }

  private killAllPretty() {
    for (let i = 0; i < this.mobN; i++) if (this.mobAlive[i]) this.slay(i);
  }

  private spark(x: number, y: number, col: string) {
    this.fxPush({ k: "spark", x, y, a: this.rng() * 6, r: 10 + this.rng() * 16, ang: 0, life: 0.22, max: 0.22, col, col2: "#fff" });
  }
  private text(x: number, y: number, txt: string, col: string) {
    this.fxPush({ k: "text", x, y, a: 0, r: 0, ang: 0, life: 0.6, max: 0.6, col, col2: "#fff", txt });
  }
  private fxPush(f: Fx) {
    this.fx.push(f);
    this.fxOut.push(f);
    if (this.fx.length > 96) this.fx.splice(0, this.fx.length - 96);
    if (this.fxOut.length > 32) this.fxOut.splice(0, this.fxOut.length - 32);
  }

  private decay(dt: number) {
    this.shake = Math.max(0, this.shake - dt * 28);
    this.flash = Math.max(0, this.flash - dt);
    for (let i = this.fx.length - 1; i >= 0; i--) {
      this.fx[i].life -= dt;
      if (this.fx[i].life <= 0) this.fx.splice(i, 1);
    }
    for (let i = 0; i < this.mobN; i++) {
      if (!this.mobAlive[i] && this.mobDie[i] > 0) this.mobDie[i] -= dt;
      if (this.mobHurt[i] > 0) this.mobHurt[i] -= dt;
      if (this.mobAtk[i] > 0) this.mobAtk[i] -= dt;
    }
    for (const e of this.elites) if (!e.alive && e.die > 0) e.die -= dt;
  }

  takeFx() {
    const list = this.fxOut;
    this.fxOut = [];
    return list;
  }

  exportSnap() {
    const m: number[] = [];
    for (let i = 0; i < this.mobN; i++) {
      if (!this.mobAlive[i] && this.mobDie[i] <= 0) continue;
      m.push(this.mobX[i] | 0, this.mobY[i] | 0, this.mobKind[i], this.mobAlive[i] ? 1 : 0);
    }
    return {
      phase: this.phase, wave: this.wave, kills: this.kills, genKills: this.genKills, boss: this.bossDown,
      banner: this.banner, bannerSub: this.bannerSub, bannerT: this.bannerT, combo: this.combo,
      shake: this.shake, flash: this.flash,
      p: this.party.map((a) => ({ id: a.id, x: a.x | 0, y: a.y | 0, facing: a.facing, hp: Math.round(a.hp), musou: Math.round(a.musou), anim: a.anim, swing: a.swing, down: a.hp <= 0 })),
      e: this.elites.filter((e) => e.alive || e.hp <= 0).slice(-6).map((e) => ({ kind: e.kind, name: e.name, x: e.x | 0, y: e.y | 0, hp: Math.ceil(e.hp), maxHp: e.maxHp, facing: e.facing, wind: e.wind, swing: e.swing, alive: e.alive, tint: e.tint, r: e.r, title: e.title })),
      m, fx: this.takeFx().map((f) => ({ k: f.k, x: f.x | 0, y: f.y | 0, a: f.a, r: f.r | 0, ang: f.ang, max: f.max, col: f.col, col2: f.col2, txt: f.txt, hero: f.hero, facing: f.facing, swing: f.swing, thick: f.thick })),
    };
  }

  ingest(s: ReturnType<Battle["exportSnap"]>) {
    this.phase = (s.phase as Battle["phase"]) || this.phase;
    this.wave = s.wave;
    this.kills = s.kills;
    this.genKills = s.genKills;
    this.bossDown = s.boss;
    this.banner = s.banner;
    this.bannerSub = s.bannerSub;
    this.bannerT = s.bannerT;
    this.combo = s.combo;
    this.shake = Math.max(this.shake, s.shake || 0);
    this.flash = Math.max(this.flash, s.flash || 0);
    for (const p of s.p) {
      const a = this.party.find((x) => x.id === p.id);
      if (!a) continue;
      a.x = p.x; a.y = p.y; a.facing = p.facing; a.hp = p.hp; a.musou = p.musou;
      a.anim = p.anim as Anim; a.swing = p.swing;
    }
    this.elites = s.e.map((e) => ({
      kind: e.kind as Elite["kind"], name: e.name, title: e.title, x: e.x, y: e.y, hp: e.hp, maxHp: e.maxHp,
      facing: e.facing, alive: e.alive, wind: e.wind, windMax: 0.5, cd: 0, pattern: 0, swing: e.swing, stun: 0, die: e.alive ? 0 : DEATH_SEC, phase: 1, tint: e.tint, r: e.r,
      sig: "circle", row: 36, tier: 0, up: 0, cursed: 0, pow: 1, move: "circle", tell: "",
    }));
    this.mobN = 0;
    for (let i = 0; i < s.m.length; i += 4) {
      const slot = this.mobN++;
      if (slot >= MAX_MOBS) break;
      this.mobX[slot] = s.m[i];
      this.mobY[slot] = s.m[i + 1];
      this.mobKind[slot] = s.m[i + 2];
      this.mobAlive[slot] = s.m[i + 3] ? 1 : 0;
      this.mobDie[slot] = s.m[i + 3] ? 0 : 0.2;
    }
    for (const f of s.fx) {
      this.fx.push({ ...f, life: f.max, k: f.k as Fx["k"] });
    }
  }
}
