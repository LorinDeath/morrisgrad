// «Проклятые»: социальные функции на сервере — список «Онлайн», друзья (заявки/дружба), настройки аккаунта
// (кто может вызывать на дуэль, заявки в друзья, «Не беспокоить 5 минут»). Всё по ключу профиля (аккаунт целиком,
// для всех героев); наружу — только непрозрачные id (opaqueId) и sid сессий онлайн.
import { FriendStore, MAX_FRIENDS, MAX_OUTGOING, REQ_GAP_MS, REQ_PER_MIN, DND_MS, type Prefs } from "./friends";
import { opaqueId, guestName } from "./rating";

export class Social {
  svc: any;
  fr: FriendStore;
  ids = new Map<string, string>(); // opaque id → pkey (выданные клиенту)
  rl = new Map<string, number[]>();
  constructor(svc: any, db: any) { this.svc = svc; this.fr = new FriendStore(db); }

  oid(pkey: string) { const id = opaqueId(pkey); this.ids.set(id, pkey); return id; }

  // при входе: прогреть кэш настроек и друзей (проверки дуэлей синхронные)
  async warm(pkey: string) {
    try { await Promise.all([this.fr.prefs(pkey), this.fr.friends(pkey)]); } catch (e: any) { console.error("[mc] social warm", e?.message || e); }
  }

  // онлайн-сессии: по одной на аккаунт
  online(): { sid: string; pkey: string; s: any }[] {
    const out: { sid: string; pkey: string; s: any }[] = [];
    const seen = new Set<string>();
    for (const [sid, ms] of this.svc.ms as Map<string, any>) {
      const e = this.svc.sessionLookup?.(sid);
      if (!e || seen.has(ms.pkey)) continue;
      seen.add(ms.pkey);
      out.push({ sid, pkey: ms.pkey, s: e[1] });
    }
    return out;
  }
  onlineSid(pkey: string): string | null { for (const o of this.online()) if (o.pkey === pkey) return o.sid; return null; }

  nameOf(pkey: string, s?: any): string {
    if (s) return this.svc.displayName(s);
    if (pkey.startsWith("uid:")) return this.svc.rating.names.get(pkey) || "Игрок";
    return guestName(pkey, this.svc.rating.gnames.get(pkey));
  }

  // Синхронная проверка: можно ли вызвать на дуэль аккаунт `to` (настройки цели, «не беспокоить»)
  duelBlock(from: string, to: string, now = Date.now()): string | null {
    const p = this.fr.prefsCached(to);
    if (p.dnd > now) return "игрок попросил не беспокоить";
    if (p.duel === "none") return "игрок не принимает вызовы на дуэль";
    if (p.duel === "friends" && !this.fr.isFriendCached(to, from)) return "игрок принимает вызовы только от друзей";
    return null;
  }

  async setDnd(pkey: string, on: boolean) {
    const p = { ...(await this.fr.prefs(pkey)) };
    p.dnd = on ? Date.now() + DND_MS : 0;
    await this.fr.setPrefs(pkey, p);
    return p;
  }

  settingsView(p: Prefs) { const now = Date.now(); return { duel: p.duel, freq: p.freq, dnd: p.dnd > now ? p.dnd - now : 0 }; }

  onlineView(me: string) {
    const list = this.online().map(({ sid, pkey, s }) => {
      const ms = this.svc.ms.get(sid);
      const pub = ms?.pub;
      return { sid, id: this.oid(pkey), name: this.nameOf(pkey, s), role: this.svc.roleOfSid(sid), cls: s.stats?.classId || null, lvl: pub?.lvl || 0, world: s.world || "hellfire",
        friend: this.fr.isFriendCached(me, pkey) || undefined, me: pkey === me || undefined, busy: !!(s.pvp || s.runRoom) || undefined };
    });
    list.sort((a, b) => (b.me ? 1 : 0) - (a.me ? 1 : 0) || (b.friend ? 1 : 0) - (a.friend ? 1 : 0) || b.lvl - a.lvl || a.name.localeCompare(b.name));
    return { type: "online", n: list.length, list: list.slice(0, 200) };
  }

  async friendsView(me: string) {
    const [fl, rin, rout, prefs] = await Promise.all([this.fr.friends(me), this.fr.reqIn(me), this.fr.reqOut(me), this.fr.prefs(me)]);
    const all = [...fl, ...rin.map((r) => r.pkey), ...rout.map((r) => r.pkey)];
    const off = all.filter((p) => !this.onlineSid(p));
    const profs = await this.fr.profiles(off).catch(() => new Map());
    if (this.svc.rating.db) await this.svc.rating.loadNames(all).catch(() => {});
    const row = (pkey: string) => {
      const sid = this.onlineSid(pkey);
      const e = sid ? this.svc.sessionLookup?.(sid) : null;
      const pr = profs.get(pkey);
      const name = e ? this.nameOf(pkey, e[1]) : pr?.gname && pkey.startsWith("guest:") ? guestName(pkey, pr.gname) : this.nameOf(pkey);
      return { id: this.oid(pkey), name, role: this.svc.roles?.of(pkey), sid: sid || undefined, online: !!sid, cls: e ? e[1].stats?.classId || null : pr?.hero || null, lvl: e ? this.svc.ms.get(sid!)?.pub?.lvl || 0 : pr?.lvl || 0 };
    };
    return { type: "friends", friends: fl.map(row), incoming: rin.map((r) => row(r.pkey)), outgoing: rout.map((r) => row(r.pkey)), settings: this.settingsView(prefs), max: MAX_FRIENDS };
  }

  private target(msg: any): string | null {
    if (msg.sid) { const ms = this.svc.ms.get(String(msg.sid)); return ms?.pkey || null; }
    if (msg.id) return this.ids.get(String(msg.id)) || null;
    return null;
  }

  private notify(pkey: string, obj: any) {
    for (const [sid, ms] of this.svc.ms as Map<string, any>) if (ms.pkey === pkey) { const e = this.svc.sessionLookup?.(sid); if (e) this.svc.send(e[0], obj); }
  }
  private async refresh(pkey: string) { if (this.onlineSid(pkey)) this.notify(pkey, await this.friendsView(pkey)); }

  async handle(ws: WebSocket, session: any, ms: any, msg: any): Promise<void> {
    const me = ms.pkey;
    const err = (message: string) => this.svc.send(ws, { type: "social_err", message });
    const ok = (message: string) => this.svc.send(ws, { type: "toast", message });
    switch (msg.type) {
      case "online_get": this.svc.send(ws, this.onlineView(me)); return;
      case "friends_get": this.svc.send(ws, await this.friendsView(me)); return;
      case "settings_set": {
        const p = { ...(await this.fr.prefs(me)) };
        if (msg.duel !== undefined) { if (!["all", "friends", "none"].includes(msg.duel)) return err("Неверная настройка"); p.duel = msg.duel; }
        if (msg.freq !== undefined) p.freq = !!msg.freq;
        if (msg.dnd !== undefined) p.dnd = msg.dnd ? Date.now() + DND_MS : 0;
        await this.fr.setPrefs(me, p);
        this.svc.send(ws, { type: "settings", settings: this.settingsView(p) });
        return;
      }
      case "friend_add": {
        const to = this.target(msg);
        if (!to) return err("Игрок не найден");
        if (to === me) return err("Нельзя добавить себя");
        const now = Date.now();
        const t = (this.rl.get(me) || []).filter((x) => now - x < 60_000);
        if ((t.length && now - t[t.length - 1] < REQ_GAP_MS) || t.length >= REQ_PER_MIN) return err("Слишком часто — подождите немного");
        t.push(now); this.rl.set(me, t);
        await this.fr.friends(me);
        if (this.fr.isFriendCached(me, to)) return err("Уже в друзьях");
        const c = await this.fr.count(me);
        if (c.friends >= MAX_FRIENDS) return err(`Друзей не больше ${MAX_FRIENDS}`);
        if (await this.fr.hasReq(to, me)) { await this.fr.addFriend(me, to); ok("Теперь вы друзья!"); await this.refresh(me); await this.refresh(to); return; }
        if (c.out >= MAX_OUTGOING) return err("Слишком много неотвеченных заявок");
        const tp = await this.fr.prefs(to);
        if (!tp.freq) return err("Игрок не принимает заявки в друзья");
        await this.fr.addReq(me, to);
        ok("Заявка в друзья отправлена");
        this.notify(to, { type: "friend_request", id: this.oid(me), name: this.nameOf(me, session) });
        await this.refresh(me); await this.refresh(to);
        return;
      }
      case "friend_respond": {
        const from = this.target(msg);
        if (!from || !(await this.fr.hasReq(from, me))) return err("Заявка уже недействительна");
        if (msg.accept) {
          const c = await this.fr.count(me);
          if (c.friends >= MAX_FRIENDS) return err(`Друзей не больше ${MAX_FRIENDS}`);
          await this.fr.addFriend(me, from); ok("Теперь вы друзья!"); try { (this as any).onFriend?.(me, from); } catch (_) {}
        } else await this.fr.delReq(from, me);
        await this.refresh(me); await this.refresh(from);
        return;
      }
      case "friend_cancel": { const to = this.target(msg); if (to) await this.fr.delReq(me, to); await this.refresh(me); if (to) await this.refresh(to); return; }
      case "friend_remove": {
        const o = this.target(msg);
        if (!o) return err("Игрок не найден");
        await this.fr.delFriend(me, o); ok("Удалён из друзей");
        await this.refresh(me); await this.refresh(o);
        return;
      }
    }
  }
}
