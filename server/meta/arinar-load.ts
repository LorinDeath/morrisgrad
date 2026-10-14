// Нагрузочный тест Аринара 24000: N игроков (группы и одиночки по миру, движутся и бьют), ~850 мобов лагерей.
// Меряет: время такта zone.update (мс, p50/p95/max), долю спящих мобов, байты zone_state на игрока за отправку (5 Гц),
// players_state c интересом по чанкам vs. без него. Запуск: esbuild … --bundle --platform=node --format=esm && node
import { Zone, type ZPlayer } from "./zone";
import { WORLD_CHUNK } from "../worlds/sizes";

const R = (() => { let a = 12345; return () => { a = (a * 1103515245 + 12345) & 0x7fffffff; return a / 0x7fffffff; }; })();
function run(N: number, secs = 30) {
  const z = new Zone("arinar", [], [], { proc: true });
  const pl = new Map<string, ZPlayer & { vx: number; vy: number }>();
  for (let i = 0; i < N; i++) {
    // 60% — в 12 «точках сбора» (группы), 40% — одиночки по всей карте
    const g = i % 12, grp = R() < 0.6;
    const x = grp ? 3000 + (g % 4) * 6000 + R() * 300 : 1500 + R() * 21000, y = grp ? 4000 + Math.floor(g / 4) * 7000 + R() * 300 : 1500 + R() * 21000;
    pl.set("p" + i, { sid: "p" + i, x, y, hp: 1e9, maxHp: 1e9, armorRed: 0.3, alive: true, respawnAt: 0, vx: (R() - 0.5) * 140, vy: (R() - 0.5) * 140 });
  }
  const times: number[] = []; let bytes = 0, sends = 0, now = 10_000_000, kills = 0;
  const dt = 0.05; // такт 20 Гц (как у DO)
  for (let t = 0; t < secs / dt; t++) {
    now += dt * 1000;
    for (const p of pl.values()) { p.x = Math.max(50, Math.min(23950, p.x + p.vx * dt)); p.y = Math.max(50, Math.min(23950, p.y + p.vy * dt)); if (R() < 0.01) { p.vx = (R() - 0.5) * 140; p.vy = (R() - 0.5) * 140; } }
    const t0 = performance.now();
    z.update(dt, now, pl, () => {}, () => { kills++; });
    // атаки игроков: ближайший моб в радиусе
    for (const p of pl.values()) if (R() < 0.15) { const m = z.near(p.x, p.y, 120)[0]; if (m) z.damage(m, p.sid, 40, () => kills++); }
    times.push(performance.now() - t0);
    if (t % 4 === 0) { // отправка 5 Гц
      const ev = z.takeEvents();
      for (const p of pl.values()) { bytes += JSON.stringify({ type: "zone_state", ...z.state(p.x, p.y, ev) }).length; sends++; }
    }
  }
  times.sort((a, b) => a - b);
  // players_state: всё на всех (старое) vs. чанки ±1 (новое)
  const rows = [...pl.values()].map((p) => ({ id: p.sid, world: "arinar", username: p.sid, x: Math.round(p.x), y: Math.round(p.y), color: "#fff", stats: { classId: "mage", hp: 1, maxHp: 1 } }));
  const all = JSON.stringify({ type: "players_state", players: rows }).length;
  let aoi = 0;
  for (const p of pl.values()) { const cx = Math.floor(p.x / WORLD_CHUNK), cy = Math.floor(p.y / WORLD_CHUNK); aoi += JSON.stringify({ type: "players_state", players: rows.filter((o) => Math.abs(Math.floor(o.x / WORLD_CHUNK) - cx) <= 1 && Math.abs(Math.floor(o.y / WORLD_CHUNK) - cy) <= 1) }).length; }
  return { players: N, mobs: z.mobs.length, awake: z.stats.awake, asleep: z.stats.asleep, resets: z.stats.resets, kills,
    tickMs: { p50: +times[Math.floor(times.length * 0.5)].toFixed(3), p95: +times[Math.floor(times.length * 0.95)].toFixed(3), max: +times[times.length - 1].toFixed(2) },
    zoneStateB: Math.round(bytes / sends), zoneKBs: +((bytes / sends) * 5 / 1024).toFixed(1),
    playersStateAllB: all, playersStateAoiB: Math.round(aoi / N) };
}
for (const N of [1, 10, 50, 100, 200]) console.log(JSON.stringify(run(N)));
