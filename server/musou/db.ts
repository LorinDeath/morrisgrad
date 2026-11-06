// Сумка «Орды» лежит в той же D1, что и остальной сайт (GAME_DB, morrisgrad_db).
import { bestFloor, newProfile, normalize, seal, type Profile } from "../../src/scripts/musou/rules";

export async function loadProfile(db: any, pkey: string): Promise<Profile> {
  if (!db) return newProfile(1);
  const row: any = await db.prepare("SELECT data FROM orda_saves WHERE pkey = ?").bind(pkey).first();
  if (!row?.data) return newProfile(((Date.now() / 1000) | 0) + 1);
  try { return normalize(JSON.parse(row.data)); } catch { return newProfile(1); }
}

export async function saveProfile(db: any, pkey: string, p: Profile) {
  if (!db) return;
  seal(p);
  await db.prepare(`INSERT INTO orda_saves (pkey, hero, lvl, best_floor, data, updated_at)
    VALUES (?, ?, ?, ?, ?, ?)
    ON CONFLICT(pkey) DO UPDATE SET
      hero = excluded.hero, lvl = excluded.lvl, best_floor = excluded.best_floor,
      data = excluded.data, updated_at = excluded.updated_at`)
    .bind(pkey, p.hero, p.lvl, bestFloor(p), JSON.stringify(p), Date.now()).run();
}
