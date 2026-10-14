// «Проклятые»: роли игроков (админ / модератор). Хранятся в D1 (player_roles, миграция 0008), кэш в памяти.
// Плашка показывается только у серверно проверенных аккаунтов (uid:), права (выдать/снять модератора) — только у
// проверенного админа. Админов назначает лишь D1/миграция — из игры админа не выдать и не снять.
export type Role = "admin" | "moderator";
export const ROLE_LABEL: Record<Role, string> = { admin: "Админ", moderator: "Модератор" };

export class Roles {
  db: any;
  map = new Map<string, Role>();
  loaded = false;
  loading: Promise<void> | null = null;
  constructor(db: any) { this.db = db; }

  async ensure() {
    if (this.loaded || !this.db) return;
    this.loading = this.loading || (async () => {
      try {
        const r = await this.db.prepare("SELECT pkey, role FROM player_roles").all();
        this.map.clear();
        for (const row of r.results || []) if (row.role === "admin" || row.role === "moderator") this.map.set(String(row.pkey), row.role);
        this.loaded = true;
      } catch (e: any) { console.error("[mc] roles load", e?.message || e); }
      finally { this.loading = null; }
    })();
    await this.loading;
  }
  // роль для показа: только зарегистрированные аккаунты
  of(pkey: string | null | undefined): Role | undefined { return pkey && pkey.startsWith("uid:") ? this.map.get(pkey) : undefined; }
  // право управлять ролями: проверенный вход + роль admin
  isAdmin(ms: { pkey: string; verified?: boolean } | null | undefined) { return !!ms && !!ms.verified && this.of(ms.pkey) === "admin"; }

  async setModerator(by: string, target: string, on: boolean): Promise<{ ok: boolean; err?: string; role?: Role | null }> {
    if (!this.db) return { ok: false, err: "База недоступна" };
    if (!target.startsWith("uid:")) return { ok: false, err: "Гостю роль не выдать — нужен вход в аккаунт" };
    const cur = this.map.get(target);
    if (cur === "admin") return { ok: false, err: "Это администратор" };
    if (on) {
      if (cur === "moderator") return { ok: true, role: "moderator" };
      await this.db.prepare("INSERT INTO player_roles (pkey, role, granted_by, granted_at) VALUES (?, 'moderator', ?, ?) ON CONFLICT(pkey) DO UPDATE SET role='moderator', granted_by=excluded.granted_by, granted_at=excluded.granted_at WHERE player_roles.role <> 'admin'").bind(target, by, Date.now()).run();
      this.map.set(target, "moderator");
      return { ok: true, role: "moderator" };
    }
    await this.db.prepare("DELETE FROM player_roles WHERE pkey = ? AND role = 'moderator'").bind(target).run();
    this.map.delete(target);
    return { ok: true, role: null };
  }
}
