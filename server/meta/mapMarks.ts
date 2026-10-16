// Картография игрока: метки на карте M. Видит только владелец; хранятся на героя (pkey + класс героя) и мир
// в D1 hero_map_marks (миграция 0016). Сервер проверяет всё: мир, координаты, имя (≤ 32, без управляющих и <>), лимит.
import { WORLD_SIZES } from "../worlds/sizes";
export const MARKS_MAX = 200, MARK_NAME_MAX = 32;
export interface Mark { id: number; x: number; y: number; n: string }
export const cleanMarkName = (s: any) => { const t = String(s ?? "").replace(/[\u0000-\u001f\u007f<>]/g, "").replace(/\s+/g, " ").trim(); return [...t].slice(0, MARK_NAME_MAX).join("") || "Метка"; };
export class MarkStore {
  db: any; map = new Map<string, Promise<Mark[]>>(); mem = new Map<string, string>();
  constructor(db: any) { this.db = db; }
  key(p: string, h: string, w: string) { return `${p}|${h}|${w}`; }
  list(p: string, h: string, w: string): Promise<Mark[]> {
    const k = this.key(p, h, w); let e = this.map.get(k);
    if (!e) { e = (async () => { let s: string | null = this.mem.get(k) || null;
      if (this.db) try { const r = await this.db.prepare("SELECT data FROM hero_map_marks WHERE pkey=? AND hero=? AND world=?").bind(p, h, w).first(); s = r?.data || null; } catch (err: any) { console.error("[mc] marks load", err?.message || err); }
      try { const a = JSON.parse(s || "[]"); return Array.isArray(a) ? a.filter((m) => m && Number.isFinite(m.id) && Number.isFinite(m.x) && Number.isFinite(m.y)).slice(0, MARKS_MAX).map((m) => ({ id: m.id | 0, x: Math.round(m.x), y: Math.round(m.y), n: cleanMarkName(m.n) })) : []; } catch { return []; } })();
      this.map.set(k, e); }
    return e;
  }
  private async save(p: string, h: string, w: string, a: Mark[]) {
    const k = this.key(p, h, w), s = JSON.stringify(a);
    if (!this.db) { this.mem.set(k, s); return; }
    await this.db.prepare("INSERT INTO hero_map_marks (pkey, hero, world, data, updated_at) VALUES (?, ?, ?, ?, ?) ON CONFLICT(pkey, hero, world) DO UPDATE SET data=excluded.data, updated_at=excluded.updated_at").bind(p, h, w, s, Date.now()).run();
  }
  async add(p: string, h: string, w: string, x: any, y: any, n: any): Promise<{ ok: boolean; err?: string; mark?: Mark }> {
    const S = (WORLD_SIZES as any)[w]; if (!S) return { ok: false, err: "Здесь нельзя ставить метки" };
    const X = Number(x), Y = Number(y); if (!Number.isFinite(X) || !Number.isFinite(Y) || X < 0 || Y < 0 || X > S || Y > S) return { ok: false, err: "Метка вне карты" };
    const a = await this.list(p, h, w); if (a.length >= MARKS_MAX) return { ok: false, err: `Не больше ${MARKS_MAX} меток` };
    const m: Mark = { id: a.reduce((mx, q) => Math.max(mx, q.id), 0) + 1, x: Math.round(X), y: Math.round(Y), n: cleanMarkName(n) };
    a.push(m); await this.save(p, h, w, a); return { ok: true, mark: m };
  }
  async rename(p: string, h: string, w: string, id: any, n: any) { const a = await this.list(p, h, w), m = a.find((q) => q.id === Number(id)); if (!m) return { ok: false, err: "Метка не найдена" }; m.n = cleanMarkName(n); await this.save(p, h, w, a); return { ok: true, mark: m }; }
  async del(p: string, h: string, w: string, id: any) { const a = await this.list(p, h, w), i = a.findIndex((q) => q.id === Number(id)); if (i < 0) return { ok: false, err: "Метка не найдена" }; a.splice(i, 1); await this.save(p, h, w, a); return { ok: true }; }
}
