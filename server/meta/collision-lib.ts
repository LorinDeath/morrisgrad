// helper for collision-test.mjs (bundled with esbuild): layout queries
import { blockedWorld, worldGrid } from './propCollision.ts';
import { layoutWorld } from './worldLayout.ts';
import { propColliders } from './propsV2.ts';
import { ZONE_RESPAWN, STATIC_NPCS as NPCS } from './shared.ts';
import { WORLD_PORTALS } from '../worlds/portals.ts';
export { blockedWorld };
export const PORTALS = WORLD_PORTALS;
export const ZONE_SPAWN_HUB = { x: 600, y: 640 };
export function nearestProp(world: string, x: number, y: number, keys: string[], passable = false, avoid: any = null) {
  let best: any = null, bd = 1e9;
  for (const p of layoutWorld(world).props) {
    if (!keys.includes(p.k)) continue;
    if (avoid && Math.hypot(p.x - avoid.x, p.y - avoid.y) < 380) continue; // босс Кейт затягивает в бой-дуэль рядом
    if (Math.hypot(p.x - x, p.y - y) > 420) continue;
    const cs = propColliders(p.k, p.x, p.y, p.s);
    if (passable ? (cs.length || blockedWorld(world, p.x, p.y, 10)) : !cs.length) continue;
    // свободный подход с юга
    if (!passable && blockedWorld(world, p.x, p.y + cs[0].ry + 60, 10)) continue;
    const d = Math.hypot(p.x - x, p.y - y); if (d < bd) { bd = d; best = { ...p, ...(cs[0] ? { rx: cs[0].rx, ry: cs[0].ry, x: cs[0].x, y: cs[0].y } : {}) }; }
  }
  return best;
}
export const nearestSolid = (w: string, x: number, y: number, keys: string[], avoid: any = null) => nearestProp(w, x, y, keys, false, avoid);
export function portalLegs(p: any) { return propColliders('portal', p.x, p.y, 0.75); }
export function keyPointsFree() {
  const bad: any[] = [];
  if (blockedWorld('arinar', ZONE_RESPAWN.x, ZONE_RESPAWN.y)) bad.push('respawn');
  for (const p of WORLD_PORTALS) if (p.targetWorld && blockedWorld(p.targetWorld, p.targetX || 300, p.targetY || 600)) bad.push(p.id);
  for (const n of Object.values(NPCS as any) as any[]) if (blockedWorld(n.world || 'hellfire', n.x, n.y + 30)) bad.push(n.id);
  void worldGrid; return bad;
}
