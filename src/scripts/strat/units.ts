// Уровни фигур 1..5: значок уровня, док «Новый уровень» (2 карты, не блокирует игру, можно отложить, автовыбор),
// кнопки активных способностей с кольцом перезарядки. Ульта фигуры (L5) скрыта, пока не достигнута.
import type { Piece, StratCfg } from "../../../server/strat/rules";
import { ic } from "./icons";
import { esc } from "./ui-kit";
import { KIND_NAME, pieceLevel, pendingTalent, talKind, TAL_KIND_NAME, TAL_ICON, cfgOf, type Ctx } from "./econ-ui";
import { regPassive, talentPassive } from "./passives";

const deferred = new Set<string>(), autoSent = new Set<string>(); let deferTurn = -1;
export const autoPick = () => localStorage.getItem("strat.autoPick") === "1";
const talDef = (cfg: StratCfg, k: string, id: string): any => { for (const lv of (cfg.talents as any)[k] || []) for (const o of lv) if (o.id === id) return o; return null; };

/** Значок уровня на фигуре/фишке (ромб с цифрой), рисуется на холсте. */
export function drawLvBadge(ctx: CanvasRenderingContext2D, X: number, Y: number, z: number, lv: number, pend: boolean) {
  if (lv < 2 || z < 16) return; const r = Math.max(6, z * 0.13), cx = X + r + z * 0.04, cy = Y + r + z * 0.04;
  ctx.save(); ctx.beginPath(); ctx.moveTo(cx, cy - r); ctx.lineTo(cx + r, cy); ctx.lineTo(cx, cy + r); ctx.lineTo(cx - r, cy); ctx.closePath();
  ctx.fillStyle = lv >= 5 ? "#c8382b" : lv >= 3 ? "#e0b04a" : "#f4ead2"; ctx.fill(); ctx.lineWidth = Math.max(1.4, z * 0.03); ctx.strokeStyle = "#1a1420"; ctx.stroke();
  ctx.fillStyle = lv >= 5 ? "#f4ead2" : "#1a1420"; ctx.font = `900 ${Math.round(r * 1.15)}px Oswald, sans-serif`; ctx.textAlign = "center"; ctx.textBaseline = "middle"; ctx.fillText(String(lv), cx, cy + 0.5);
  if (pend) { ctx.beginPath(); ctx.arc(cx + r * 0.95, cy - r * 0.95, r * 0.42, 0, 7); ctx.fillStyle = "#c8382b"; ctx.fill(); ctx.stroke(); }
  ctx.restore();
}

/** Активные способности и ульта фигуры (из взятых талантов), с перезарядкой из вида фигуры (p.cd[id]). */
export function abilitiesOf(c: Ctx, P: Piece, pv: any) {
  const cfg = cfgOf(c.S), out: { id: string; name: string; eff: string; kind: "act" | "ult"; cd: number; max: number; r: number; target: boolean }[] = [];
  for (const id of P.tal || []) { const d = talDef(cfg, P.kind, id); if (!d) continue; const k = talKind(d); if (k === "pas") continue;
    const cd = +(pv?.cd?.[id] ?? pv?.acd?.[id] ?? 0) || 0, max = +(d.cd ?? d.cooldown ?? (k === "ult" ? 6 : 3)) || 1;
    out.push({ id, name: d.name, eff: d.eff || "", kind: k, cd, max, r: +(d.r ?? d.radius ?? (k === "ult" ? 1 : 0)) || 0, target: d.target !== false && (d.r != null || d.radius != null || d.target === true || k === "ult") }); }
  return out;
}
export function abilityBar(c: Ctx, P: Piece, pv: any): string {
  const ab = abilitiesOf(c, P, pv); if (!ab.length) return ""; const my = P.owner === c.me && c.G.cur === c.me;
  return `<div class="abilbar">${ab.map((a) => { const busy = a.cd > 0, dis = !my || busy || P.acted || c.G.ap <= 0;
    return `<button class="abil ${a.kind} ${busy ? "cd" : ""}" data-ab="${esc(a.id)}" ${dis ? "disabled" : ""} style="--p:${busy ? Math.round((a.cd / a.max) * 100) : 0}"
      data-tip="${esc(`${TAL_KIND_NAME[a.kind]} «${a.name}»: ${a.eff}. Перезарядка ${a.max} х.${busy ? ` Готово через ${a.cd} х.` : ""}`)}" aria-label="${esc(a.name)}">
      <span class="ring"></span><span class="ab-ic">${ic(a.kind === "ult" ? "ult" : "zap")}</span>${busy ? `<b class="ab-cd">${a.cd}</b>` : ""}<small>${esc(a.name)}</small></button>`; }).join("")}</div>`;
}
export function bindAbilityBar(c: Ctx, P: Piece, pv: any, root: HTMLElement, aim: (a: { id: string; r: number; kind: "act" | "ult"; pid: number }) => void) {
  const ab = abilitiesOf(c, P, pv);
  root.querySelectorAll<HTMLButtonElement>(".abil[data-ab]").forEach((b) => (b.onclick = () => { const a = ab.find((x) => x.id === b.dataset.ab); if (!a) return;
    if (a.target) aim({ id: a.id, r: a.r, kind: a.kind, pid: P.id }); else c.send({ type: "act", act: { a: "ability", id: P.id, ab: a.id } }); }));
}

/** Док «Новый уровень»: не модальный, справа в панели. Возвращает true, если показан. */
export function renderLvDock(c: Ctx, root: HTMLElement, onPick?: () => void): boolean {
  const { G, me, S } = c, cfg = cfgOf(S);
  if (G.turn !== deferTurn) { deferred.clear(); deferTurn = G.turn; }
  const mine = G.cur === me && S.phase === "play" ? G.pieces.filter((p) => p.owner === me && pendingTalent(p, cfg) && !deferred.has(p.id + ":" + pendingTalent(p, cfg))) : [];
  if (!mine.length) { root.hidden = true; root.innerHTML = ""; return false; }
  const p = mine[0], lv = pendingTalent(p, cfg), opts = ((cfg.talents as any)[p.kind]?.[lv - 2] || []) as any[], tk = talKind(opts[0]);
  if (autoPick() && opts[0]) { if (autoSent.has(p.id + ":" + lv)) { root.hidden = true; return false; } autoSent.add(p.id + ":" + lv); c.send({ type: "act", act: { a: "talent", id: p.id, t: opts[Math.random() < 0.5 ? 0 : Math.min(1, opts.length - 1)].id } }); root.hidden = true; return false; }
  root.hidden = false;
  root.innerHTML = `<div class="lv-h">${ic("xp")}<div><b>${esc(KIND_NAME[p.kind])} · уровень ${lv}</b><small>${tk === "ult" ? "Открыта ульта — выберите одну" : `${TAL_KIND_NAME[tk]}: одна из двух`}${mine.length > 1 ? ` · ещё ${mine.length - 1}` : ""}</small></div></div>
    <div class="lv-cards">${opts.map((o) => `<button class="lvcard k-${talKind(o)}" data-t="${esc(o.id)}" data-pas="${regPassive(talentPassive(o, p.kind))}"><span class="lc-ic">${ic(TAL_ICON(o))}</span><b></b><small></small>${o.cd ? `<em>перезарядка ${+o.cd} х.</em>` : ""}</button>`).join("")}</div>
    <div class="lv-f"><button class="btn ghost sm" data-later>${ic("clock")}<span>Позже</span></button><label class="chk sm"><input type="checkbox" data-auto ${autoPick() ? "checked" : ""}/><span>выбирать сам</span></label><button class="btn sm" data-show>${ic("eye")}<span>Где он</span></button></div>`;
  root.querySelectorAll<HTMLButtonElement>(".lvcard").forEach((b, i) => { b.querySelector("b")!.textContent = opts[i].name; b.querySelector("small")!.textContent = opts[i].eff || "";
    b.onclick = () => { c.send({ type: "act", act: { a: "talent", id: p.id, t: opts[i].id } }); root.classList.add("picked"); onPick?.(); }; });
  root.querySelector<HTMLButtonElement>("[data-later]")!.onclick = () => { deferred.add(p.id + ":" + lv); renderLvDock(c, root, onPick); };
  root.querySelector<HTMLInputElement>("[data-auto]")!.onchange = (e) => { localStorage.setItem("strat.autoPick", (e.target as HTMLInputElement).checked ? "1" : "0"); renderLvDock(c, root, onPick); };
  root.querySelector<HTMLButtonElement>("[data-show]")!.onclick = () => (window as any).__stratFocus?.(p.id);
  return true;
}
export { pieceLevel, pendingTalent };
