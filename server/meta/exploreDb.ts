// Туман войны на сервере: маски героев в памяти, открытие по позициям из такта (session.x/y — уже проверены сервером),
// отложенное сохранение в D1 (hero_explore + сводка account_explore), раздача клиенту: полная маска при входе, далее дельты.
import { FOG_N, FOG_WORLDS, newMask, reveal, encodeMask, decodeMask, countBits } from "./explore";

export const EXPLORE_SAVE_MS = 30_000;
interface Ent { mask: Uint8Array; cells: number; dirty: boolean; savedAt: number; loaded: Promise<void> | null; pend: number[] }
export class ExploreStore {
  db: any; map = new Map<string, Ent>(); mem = new Map<string, string>(); // mem — без D1 (тесты)
  constructor(db: any) { this.db = db; }
  key(pkey: string, hero: string, world: string) { return `${pkey}|${hero}|${world}`; }
  get(pkey: string, hero: string, world: string): Ent {
    const k = this.key(pkey, hero, world);
    let e = this.map.get(k);
    if (!e) {
      e = { mask: newMask(), cells: 0, dirty: false, savedAt: Date.now(), loaded: null, pend: [] };
      const E = e;
      e.loaded = (async () => {
        let s: string | null = this.mem.get(k) || null;
        if (this.db) try { const r = await this.db.prepare("SELECT mask FROM hero_explore WHERE pkey=? AND hero=? AND world=?").bind(pkey, hero, world).first(); s = r?.mask || null; } catch (err: any) { console.error("[mc] explore load", err?.message || err); }
        const m = decodeMask(s);
        for (let i = 0; i < E.mask.length; i++) E.mask[i] |= m[i]; // открытое до загрузки не теряем
        E.cells = countBits(E.mask);
      })().finally(() => { E.loaded = null; });
      this.map.set(k, e);
    }
    return e;
  }
  /** Открыть вокруг позиции; новые ячейки копятся в pend для отправки клиенту. */
  visit(pkey: string, hero: string, world: string, x: number, y: number) {
    if (!FOG_WORLDS.includes(world) || !hero) return;
    const e = this.get(pkey, hero, world);
    const add = reveal(e.mask, x, y);
    if (add.length) { e.cells += add.length; e.dirty = true; e.pend.push(...add); }
  }
  takePending(pkey: string, hero: string, world: string): number[] { const e = this.map.get(this.key(pkey, hero, world)); if (!e || !e.pend.length) return []; const p = e.pend; e.pend = []; return p; }
  async full(pkey: string, hero: string, world: string) { const e = this.get(pkey, hero, world); if (e.loaded) await e.loaded; e.pend = []; return { world, n: FOG_N, mask: encodeMask(e.mask), cells: e.cells }; }
  async save(pkey: string, hero: string, world: string, force = false) {
    const k = this.key(pkey, hero, world), e = this.map.get(k);
    if (!e || !e.dirty || e.loaded || (!force && Date.now() - e.savedAt < EXPLORE_SAVE_MS)) return false;
    e.dirty = false; e.savedAt = Date.now();
    const enc = encodeMask(e.mask);
    if (!this.db) { this.mem.set(k, enc); return true; }
    try {
      await this.db.prepare("INSERT INTO hero_explore (pkey, hero, world, mask, cells, updated_at) VALUES (?, ?, ?, ?, ?, ?) ON CONFLICT(pkey, hero, world) DO UPDATE SET mask=excluded.mask, cells=excluded.cells, updated_at=excluded.updated_at").bind(pkey, hero, world, enc, e.cells, e.savedAt).run();
      await this.db.prepare(`INSERT INTO account_explore (pkey, world, best_cells, best_hero, total_cells, heroes, updated_at)
        SELECT pkey, world, MAX(cells), (SELECT hero FROM hero_explore h2 WHERE h2.pkey=h.pkey AND h2.world=h.world ORDER BY cells DESC LIMIT 1), SUM(cells), COUNT(*), ? FROM hero_explore h WHERE pkey=? AND world=? GROUP BY pkey, world
        ON CONFLICT(pkey, world) DO UPDATE SET best_cells=excluded.best_cells, best_hero=excluded.best_hero, total_cells=excluded.total_cells, heroes=excluded.heroes, updated_at=excluded.updated_at`).bind(e.savedAt, pkey, world).run();
    } catch (err: any) { e.dirty = true; console.error("[mc] explore save", err?.message || err); }
    return true;
  }
  async flushKey(pkey: string) { for (const k of [...this.map.keys()]) if (k.startsWith(pkey + "|")) { const [p, h, w] = k.split("|"); await this.save(p, h, w, true); this.map.delete(k); } }
}
