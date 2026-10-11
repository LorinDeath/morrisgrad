// Лобби и экземпляры забегов «Проклятых» (сервер — авторитет состава, состояния и «эпохи» забега).
//
// Раньше портал вёл в одну общую комнату на тему («crypt»/«abyss»). Если отряд погибал, хост-клиент
// продолжал хранить свою симуляцию (уровень 10–15, мобы), и новые игроки получали её снапшот.
// Теперь:
//  • у каждого забега свой экземпляр (уникальный id), тема — лишь пункт назначения портала;
//  • состояние экземпляра: «lobby» (ожидание, готовность) → «running» (идёт забег);
//  • каждый старт/сброс увеличивает epoch; ретрансляция пакетов с чужой эпохой отбрасывается,
//    так что «застрявший» хост не может прислать старый снапшот новому составу;
//  • гибель всего отряда, завершение забега или опустевший экземпляр → полный сброс (новая эпоха,
//    лобби; пустой экземпляр удаляется целиком).
//  • вход: только в лобби в состоянии ожидания (без drop-in в идущий забег).
import type { Session } from "./types";

export type RunState = "lobby" | "running";
export interface RunInstance {
  id: string;
  room: string; // тема/режим: crypt | abyss | duel | trial
  name: string;
  leaderId: string;
  isPublic: boolean;
  max: number;
  state: RunState;
  epoch: number;
  members: string[]; // session id в порядке входа
  ready: Set<string>;
  dead: Set<string>;
  out: Set<string>; // «сдались»: ждут в лобби до конца забега (для сброса считаются павшими)
  createdAt: number;
  startedAt: number;
  runs: number; // сколько раз стартовали
}

export interface RunRoomInfo { id: string; name: string; maxPlayers: number }

let counter = 0;
const newId = () => `r${Date.now().toString(36)}${(++counter).toString(36)}${Math.floor(Math.random() * 1296).toString(36)}`;

export class RunLobbies {
  runs = new Map<string, RunInstance>();
  constructor(private rooms: Record<string, RunRoomInfo>) {}

  get(id: string | undefined | null) { return id ? this.runs.get(id) || null : null; }

  create(room: string, leader: Session, opts: { name?: string; isPublic?: boolean }): RunInstance {
    const def = this.rooms[room];
    const name = String(opts.name || "").replace(/[<>]/g, "").trim().slice(0, 24) || `${def.name} · ${leader.username || "отряд"}`;
    const inst: RunInstance = {
      id: newId(), room, name, leaderId: leader.id, isPublic: opts.isPublic !== false, max: def.maxPlayers,
      state: "lobby", epoch: 0, members: [], ready: new Set(), dead: new Set(), out: new Set(), createdAt: Date.now(), startedAt: 0, runs: 0,
    };
    this.runs.set(inst.id, inst);
    return inst;
  }

  // Возвращает текст ошибки или null
  canJoin(inst: RunInstance | null, sid: string): string | null {
    if (!inst) return "Лобби не найдено (возможно, уже распущено)";
    if (inst.members.includes(sid)) return null;
    if (inst.state !== "lobby") return "Забег уже идёт — дождитесь, пока отряд вернётся в лобби";
    if (inst.members.length >= inst.max) return `Лобби заполнено (${inst.members.length}/${inst.max})`;
    return null;
  }

  join(inst: RunInstance, sid: string) {
    if (!inst.members.includes(sid)) inst.members.push(sid);
    if (!inst.leaderId || !inst.members.includes(inst.leaderId)) inst.leaderId = inst.members[0];
  }

  // Выход участника. Возвращает «что случилось» для рассылки.
  leave(inst: RunInstance, sid: string): "deleted" | "wipe" | "left" {
    inst.members = inst.members.filter((x) => x !== sid);
    inst.ready.delete(sid); inst.dead.delete(sid); inst.out.delete(sid);
    if (!inst.members.length) { this.runs.delete(inst.id); return "deleted"; } // пустой экземпляр — сброс целиком
    if (inst.leaderId === sid) inst.leaderId = inst.members[0];
    if (inst.state === "running" && inst.members.every((m) => inst.dead.has(m))) { this.reset(inst); return "wipe"; }
    return "left";
  }

  setReady(inst: RunInstance, sid: string, ready: boolean) {
    if (inst.state !== "lobby" || !inst.members.includes(sid)) return;
    if (ready) inst.ready.add(sid); else inst.ready.delete(sid);
  }

  // Старт: только лидер, только из лобби, все остальные «готовы»
  start(inst: RunInstance, sid: string, force = false): string | null {
    if (inst.leaderId !== sid) return "Начать забег может только лидер лобби";
    if (inst.state !== "lobby") return "Забег уже идёт";
    const notReady = inst.members.filter((m) => m !== inst.leaderId && !inst.ready.has(m));
    if (notReady.length && !force) return `Не все готовы (${inst.members.length - notReady.length}/${inst.members.length})`;
    inst.state = "running";
    inst.epoch++;
    inst.dead.clear();
    inst.out.clear();
    inst.startedAt = Date.now();
    inst.runs++;
    return null;
  }

  // Гибель/воскрешение участника. true — отряд погиб целиком (экземпляр уже сброшен)
  setDead(inst: RunInstance, sid: string, dead: boolean, epoch: number): boolean {
    if (inst.state !== "running" || epoch !== inst.epoch || !inst.members.includes(sid)) return false;
    if (dead) inst.dead.add(sid); else inst.dead.delete(sid);
    if (inst.members.every((m) => inst.dead.has(m))) { this.reset(inst); return true; }
    return false;
  }

  // «Сдаться» после гибели: игрок выходит из идущего забега в лобби экземпляра.
  // true — он был последним живым → отряд погиб, экземпляр сброшен.
  giveUp(inst: RunInstance, sid: string, epoch: number): boolean {
    if (inst.state !== "running" || epoch !== inst.epoch || !inst.members.includes(sid)) return false;
    inst.dead.add(sid);
    inst.out.add(sid);
    if (inst.members.every((m) => inst.dead.has(m))) { this.reset(inst); return true; }
    return false;
  }

  // Хост симуляции: лидер, если он ещё в забеге, иначе первый оставшийся
  hostId(inst: RunInstance): string {
    if (inst.state !== "running") return inst.leaderId;
    if (!inst.out.has(inst.leaderId)) return inst.leaderId;
    return inst.members.find((m) => !inst.out.has(m)) || inst.leaderId;
  }
  active(inst: RunInstance): string[] { return inst.state === "running" ? inst.members.filter((m) => !inst.out.has(m)) : [...inst.members]; }

  // Полный сброс в лобби: новая эпоха (старые пакеты больше не принимаются), готовность снимается
  reset(inst: RunInstance) {
    inst.state = "lobby";
    inst.epoch++;
    inst.dead.clear();
    inst.out.clear();
    inst.ready.clear();
    inst.startedAt = 0;
  }

  relayAllowed(inst: RunInstance | null, sid: string, epoch: unknown): boolean {
    return !!inst && inst.state === "running" && inst.members.includes(sid) && !inst.out.has(sid) && Number(epoch) === inst.epoch;
  }

  list(room: string, sessions: Map<string, Session>) {
    return [...this.runs.values()]
      .filter((r) => r.room === room && r.isPublic)
      .sort((a, b) => (a.state === b.state ? b.createdAt - a.createdAt : a.state === "lobby" ? -1 : 1))
      .slice(0, 30)
      .map((r) => this.info(r, sessions));
  }

  info(r: RunInstance, sessions: Map<string, Session>) {
    return {
      id: r.id, room: r.room, name: r.name, state: r.state, epoch: r.epoch, max: r.max, isPublic: r.isPublic,
      leaderId: r.leaderId, hostId: this.hostId(r), count: r.members.length,
      members: r.members.map((id) => {
        const s = sessions.get(id);
        return { id, username: s?.username || "?", classId: s?.stats?.classId || null, color: s?.color || "#ffffff", ready: r.ready.has(id) || id === r.leaderId, dead: r.dead.has(id), leader: id === r.leaderId, out: r.out.has(id) };
      }),
    };
  }
}
