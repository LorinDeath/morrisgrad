// «Проклятые»: отряды (группы) — до 4 игроков (как «Бездна»). Только память DO: отряд живёт, пока участники в сети.
// Приглашение → принять/отклонить; лидер — первый; уход лидера передаёт лидерство; выход/кик; один отряд на игрока.
// Правила, которые используют другие части сервера:
//   ally(a, b)        — союзники не наносят друг другу урон (дуэли/PvP);
//   near(sid, ...)    — члены отряда рядом с местом убийства (делёж опыта и добычи в духе Albion);
//   leaderOf(sid)     — лидер стоит у портала, остальные входят в забег/данж отряда без похода к порталу.
export const PARTY_MAX = 4;
export const PARTY_SHARE_RANGE = 1500; // px: «рядом с мобом» для дележа (≈ экран и ещё половина)
export const PARTY_INVITE_TTL = 60_000;
export interface Party { id: string; leader: string; members: string[] }

export class Parties {
  parties = new Map<string, Party>();
  of = new Map<string, string>(); // sid → party id
  invites = new Map<string, { from: string; at: number }[]>(); // кому → от кого
  private seq = 0;
  get(sid: string) { const id = this.of.get(sid); return id ? this.parties.get(id) || null : null; }
  ally(a: string, b: string) { if (a === b) return false; const p = this.of.get(a); return !!p && p === this.of.get(b); }
  leaderOf(sid: string) { return this.get(sid)?.leader || null; }
  invite(from: string, to: string, now = Date.now()): string | null {
    if (from === to) return "Нельзя пригласить себя";
    const pf = this.get(from), pt = this.get(to);
    if (pt && pt === pf) return "Уже в вашем отряде";
    if (pt) return "Игрок уже в отряде";
    if (pf && pf.leader !== from) return "Приглашать может только лидер";
    if (pf && pf.members.length >= PARTY_MAX) return `В отряде максимум ${PARTY_MAX}`;
    const l = (this.invites.get(to) || []).filter((i) => now - i.at < PARTY_INVITE_TTL && i.from !== from);
    l.push({ from, at: now }); this.invites.set(to, l.slice(-5));
    return null;
  }
  accept(sid: string, from: string, now = Date.now()): Party | string {
    const l = this.invites.get(sid) || [], inv = l.find((i) => i.from === from && now - i.at < PARTY_INVITE_TTL);
    if (!inv) return "Приглашение истекло";
    this.invites.set(sid, l.filter((i) => i !== inv));
    if (this.get(sid)) return "Вы уже в отряде — сначала выйдите";
    let p = this.get(from);
    if (p && p.leader !== from) return "Пригласивший больше не лидер";
    if (!p) { p = { id: "p" + ++this.seq, leader: from, members: [from] }; this.parties.set(p.id, p); this.of.set(from, p.id); }
    if (p.members.length >= PARTY_MAX) return `В отряде максимум ${PARTY_MAX}`;
    p.members.push(sid); this.of.set(sid, p.id);
    return p;
  }
  decline(sid: string, from: string) { this.invites.set(sid, (this.invites.get(sid) || []).filter((i) => i.from !== from)); }
  /** выход (или отключение): лидер передаётся следующему; один в отряде — отряд распускается. Возвращает затронутый отряд. */
  leave(sid: string): Party | null {
    const p = this.get(sid); this.invites.delete(sid);
    if (!p) return null;
    p.members = p.members.filter((m) => m !== sid); this.of.delete(sid);
    if (p.leader === sid) p.leader = p.members[0] || "";
    if (p.members.length <= 1) { for (const m of p.members) this.of.delete(m); this.parties.delete(p.id); return { ...p, members: [...p.members] }; }
    return p;
  }
  kick(leader: string, sid: string): string | Party {
    const p = this.get(leader); if (!p || p.leader !== leader) return "Исключать может только лидер";
    if (!p.members.includes(sid) || sid === leader) return "Нет такого участника";
    return this.leave(sid) || "—";
  }
  promote(leader: string, sid: string): string | Party {
    const p = this.get(leader); if (!p || p.leader !== leader || !p.members.includes(sid)) return "Нельзя";
    p.leader = sid; return p;
  }
  /** члены отряда sid рядом с точкой (тот же мир) — для дележа; pos(sid) → {world,x,y,alive} или null (не в сети) */
  near(sid: string, world: string, x: number, y: number, pos: (s: string) => { world: string; x: number; y: number; alive?: boolean } | null, range = PARTY_SHARE_RANGE): string[] {
    const p = this.get(sid); if (!p) return [sid];
    return p.members.filter((m) => { const q = pos(m); return !!q && q.world === world && q.alive !== false && Math.hypot(q.x - x, q.y - y) <= range; });
  }
}

/** Делёж в духе Albion: опыт делится поровну между членами отряда рядом, с бонусом за отряд (+10% за каждого сверх первого). */
export function partyXpShare(n: number) { return n <= 1 ? 1 : (1 + 0.1 * (n - 1)) / n; }
/** Добыча мешка: предметы по кругу (начиная со случайного), ресурсы поровну, остаток — по кругу. Сумма = исходной (ничего не теряется). */
export function splitLoot(loot: { items: string[]; res: Record<string, number> }, members: string[], rnd: () => number) {
  const out = new Map<string, { items: string[]; res: Record<string, number> }>(members.map((m) => [m, { items: [], res: {} }]));
  if (!members.length) return out;
  let k = Math.floor(rnd() * members.length);
  for (const it of loot.items) { out.get(members[k % members.length])!.items.push(it); k++; }
  for (const [r, n] of Object.entries(loot.res)) {
    const each = Math.floor(n / members.length); let rest = n - each * members.length;
    for (const m of members) { const v = each + (rest > 0 ? 1 : 0); if (rest > 0) rest--; if (v) out.get(m)!.res[r] = (out.get(m)!.res[r] || 0) + v; }
  }
  return out;
}
