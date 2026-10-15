// «Проклятые»: роли игроков (админ / модератор). Хранятся в D1 (player_roles, миграция 0008), кэш в памяти.
// Плашка показывается только у серверно проверенных аккаунтов (uid:), права (выдать/снять модератора) — только у
// проверенного админа. Админов назначает лишь D1/миграция — из игры админа не выдать и не снять.
// Модератор может открывать админ-панель только для бестиария / оружия / предметов (сервер проверяет каждый запрос).
export type Role = "admin" | "moderator";
export const ROLE_LABEL: Record<Role, string> = { admin: "Админ", moderator: "Модератор" };

/** виды сущностей, которые модератор может читать и править (admin_save / admin_reset) */
export const MOD_ADMIN_KINDS = ["mob", "weapon", "item"] as const;
export type ModAdminKind = (typeof MOD_ADMIN_KINDS)[number];
const MOD_KIND_SET = new Set<string>(MOD_ADMIN_KINDS);

export type MsRole = { pkey: string; verified?: boolean } | null | undefined;

export class Roles {
  db: any;
  map = new Map<string, Role>();
  loaded = false;
  loadedAt = 0; // кэш ролей перечитывается раз в минуту (роль, выданная/снятая в D1 вручную, доходит без перезапуска)
  loading: Promise<void> | null = null;
  constructor(db: any) { this.db = db; }

  async ensure() {
    if (!this.db || (this.loaded && Date.now() - this.loadedAt < 60000)) return;
    this.loading = this.loading || (async () => {
      try {
        const r = await this.db.prepare("SELECT pkey, role FROM player_roles").all();
        this.map.clear();
        for (const row of r.results || []) if (row.role === "admin" || row.role === "moderator") this.map.set(String(row.pkey), row.role);
        this.loaded = true; this.loadedAt = Date.now();
      } catch (e: any) { console.error("[mc] roles load", e?.message || e); }
      finally { this.loading = null; }
    })();
    await this.loading;
  }
  // роль для показа: только зарегистрированные аккаунты
  of(pkey: string | null | undefined): Role | undefined { return pkey && pkey.startsWith("uid:") ? this.map.get(pkey) : undefined; }
  // право управлять ролями: проверенный вход + роль admin
  isAdmin(ms: MsRole) { return !!ms && !!ms.verified && this.of(ms.pkey) === "admin"; }
  isModerator(ms: MsRole) { return !!ms && !!ms.verified && this.of(ms.pkey) === "moderator"; }
  /** открыть панель (кнопка / admin_open): админ или модератор */
  canOpenAdmin(ms: MsRole) { return this.isAdmin(ms) || this.isModerator(ms); }
  /** сохранить/сбросить сущность: админ — любой kind; модератор — только mob/weapon/item */
  canAdminWrite(ms: MsRole, kind: string) {
    if (this.isAdmin(ms)) return true;
    return this.isModerator(ms) && MOD_KIND_SET.has(kind);
  }
  /** журнал / квесты / диалоги — только админ */
  canAdminFull(ms: MsRole) { return this.isAdmin(ms); }

  /** поля my_role для клиента (кнопка панели + список вкладок); роль из сообщения клиента НЕ используется */
  panelFlags(ms: MsRole): { admin: boolean; modAdmin: boolean; kinds: string[] | null } {
    if (this.isAdmin(ms)) return { admin: true, modAdmin: false, kinds: null };
    if (this.isModerator(ms)) return { admin: false, modAdmin: true, kinds: [...MOD_ADMIN_KINDS] };
    return { admin: false, modAdmin: false, kinds: null };
  }

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
