// «Последние смерти» (t1053u): кто бил героя перед гибелью, чем, сколько и какой % макс. ОЗ.
// Только память воркера (D1 не трогаем, миграций нет): на сессию — кольцо последних DL_HITS ударов,
// на ключ игрока — DL_DEATHS последних смертей. Запись удара — O(1) (push + shift массива из ≤12), без аллокаций сверх объекта.
//   удар: { t: мс (Date.now), k: "m" моб | "p" игрок | "e" окружение/маг, w: кто (тип моба / имя игрока / "black_mage"),
//           h: чем (melee|dash|swing|shot|aux|cast:<fx>|proj:<тип>|pvp|duel|dot:<вид>|arrow|expl), d: всего,
//           el?: стихия, p?: из них чистого урона, c?: 1 крит, b?: 1 чёрная магия, z?: 1 «0 урона» (защита), n?: имя моба }
export const DL_HITS = 12, DL_DEATHS = 5, DL_WINDOW_MS = 30_000, DL_KEYS_MAX = 5000;
export interface DHit { t: number; k: "m" | "p" | "e"; w: string; h: string; d: number; el?: string; p?: number; c?: 1; b?: 1; z?: 1; n?: string }
export interface DDeath { at: number; mx: number; world: string; duel?: 1; hits: (Omit<DHit, "t"> & { ago: number })[] }

const DEATHS = new Map<string, DDeath[]>(); // pkey → последние смерти (новые первыми)

/** записать удар по герою (ms — MetaSess; d ≤ 0 не пишем, кроме «0 урона» от защиты) */
export function dlHit(ms: any, now: number, k: DHit["k"], w: string, h: string, d: number, x?: { el?: string; p?: number; c?: any; b?: any; z?: any; n?: string }) {
  if (!ms || !(d > 0 || x?.z)) return;
  const e: DHit = { t: now, k, w: String(w || "?").slice(0, 32), h, d: Math.round(d) };
  if (x) { if (x.el) e.el = x.el; if (x.p) e.p = Math.round(x.p); if (x.c) e.c = 1; if (x.b) e.b = 1; if (x.z) e.z = 1; if (x.n) e.n = String(x.n).slice(0, 40); }
  const L: DHit[] = ms.dlog || (ms.dlog = []);
  L.push(e); if (L.length > DL_HITS) L.shift();
}

/** смерть: снимок ударов за последние DL_WINDOW_MS → список смертей игрока; кольцо очищается */
export function dlDeath(ms: any, now: number, world: string, duel = false): DDeath | null {
  if (!ms?.pkey) return null;
  const L: DHit[] = ms.dlog || [];
  const rec: DDeath = { at: now, mx: Math.round(ms.zp?.maxHp || 0), world: world || "", hits: L.filter((e) => now - e.t <= DL_WINDOW_MS).map(({ t, ...r }) => ({ ...r, ago: now - t })) };
  if (duel) rec.duel = 1;
  ms.dlog = [];
  let D = DEATHS.get(ms.pkey);
  if (!D) { if (DEATHS.size >= DL_KEYS_MAX) DEATHS.delete(DEATHS.keys().next().value as string); D = []; DEATHS.set(ms.pkey, D); }
  D.unshift(rec); if (D.length > DL_DEATHS) D.length = DL_DEATHS;
  return rec;
}
export const dlList = (pkey: string): DDeath[] => DEATHS.get(pkey) || [];
export const dlReset = () => DEATHS.clear(); // тесты
