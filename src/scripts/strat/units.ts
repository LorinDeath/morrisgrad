// Уровни фигур 1..5: значок уровня, док «Новый уровень» (2 карты, не блокирует игру, можно отложить, автовыбор),
// кнопки активных способностей с кольцом перезарядки. Ульта фигуры (L5) скрыта, пока не достигнута.
import type { Piece, StratCfg } from "../../../server/strat/rules";
import { ic } from "./icons";
import { esc } from "./ui-kit";
import { KIND_NAME, pieceLevel, pendingTalent, talentOptions, talKind, TAL_KIND_NAME, TAL_ICON, cfgOf, type Ctx } from "./econ-ui";
import { regPassive, talentPassive } from "./passives";
import { aimOfUlt, type AimDef } from "./ult-fx";

const deferred = new Set<string>(), autoSent = new Set<string>(); let deferTurn = -1;
/** t1221: подсказка «Доступно → новый уровень» снимает «Позже», чтобы док снова показался */
export function undeferLv() { deferred.clear(); }
export const autoPick = () => false; // t1289: уровень даёт только очко — навык выбирает игрок кликом (автовыбор убран)
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

/** Активные способности и ульта фигуры: умения ур. 2 (таланты), умение ур. 3 (дерево роли, ур. 4 усиливает) и ульта ур. 5.
 *  t1248: ур. 3 и ульта берутся из урезанного дерева сервера (S.tree.units) — в клиентской сборке UNIT_TREE пуст. */
export type Abil = { id: string; name: string; eff: string; kind: "act" | "ult"; cd: number; max: number; r: number; target: boolean; ap: number; aim?: AimDef; how: string; tip: string };
const SHAPE_RU: Record<string, string> = { circle: "круг", square: "квадрат", line: "волна-линия", chain: "одна цель" };
function actEff(a: any, mag: number): string {
  return a.type === "strike" ? `следующий удар этой фигуры +${mag} урона` : a.type === "guard" ? `+${mag} брони на ${a.dur || 2} х.` : a.type === "mend" ? `лечит себя на ${mag} ОЗ`
    : a.type === "volley" ? `выстрел на ${mag} урона по врагу в радиусе ${a.r || 3}` : a.eff || ""; }
function ultEff(u: any): string {
  const sh = u.shape === "square" ? `квадрат ${u.size || 3}×${u.size || 3}` : u.shape === "circle" ? `круг радиусом ${String(u.r ?? 1.5).replace(".", ",")}` : u.shape === "line" ? `волна на ${u.len || 3} клетки шириной 3` : "одна цель";
  const fx = [u.dmg ? `урон ${u.dmg}` : "", u.shield ? `щит ${u.shield} своим на ${u.shieldTurns || 2} х.` : "", u.heal ? `лечение ${u.heal}` : "", u.chill ? "замедление" : "", u.push ? "отброс" : "", u.root ? `оплетает на ${u.root} х.` : ""].filter(Boolean).join(", ");
  return `${sh}${fx ? ": " + fx : ""}; дальность ${u.range ?? 1}`; }
export function abilitiesOf(c: Ctx, P: Piece, pv: any): Abil[] {
  const cfg = cfgOf(c.S), out: Abil[] = [], race = c.G.races?.[P.owner] || "fire", lv = pieceLevel(P, cfg);
  const UT: any = (c.S as any)?.tree?.units?.[P.kind] || (cfg as any).unitTree?.[P.kind], cdOf = (id: string) => +(pv?.cd?.[id] ?? pv?.acd?.[id] ?? 0) || 0;
  for (const id of P.tal || []) {
    const ua = P.kind !== "king" ? UT?.act?.find((x: any) => x.id === id) : null;
    if (ua) { const up = lv >= 4 && UT?.up, mag = up ? Math.ceil(ua.mag * (+UT.up.pow || 1)) : ua.mag, max = up ? Math.max(1, ua.cd - (+UT.up.cd || 0)) : ua.cd, vol = ua.type === "volley", r = vol ? +ua.r || 3 : 0;
      const eff = actEff(ua, mag), how = vol ? `Нажмите, затем выберите врага в радиусе ${r} клеток.` : "Нажмите — сработает сразу, фигура ещё может ходить или бить.";
      out.push({ id, name: ua.name, eff, kind: "act", cd: cdOf(id), max, r, target: vol, ap: +ua.ap || 1, how, ...(vol ? { aim: { s: "chain", hops: 1, hop: 0, rng: r } as AimDef } : {}),
        tip: `Умение «${ua.name}» (ур. 3${up ? ", усилено ур. 4" : ""}): ${eff}. Цена ${+ua.ap || 1} ОД, перезарядка ${max} х. ${vol ? "Цель — враг в радиусе " + r + "." : "Без цели — на себя."} ${how}` }); continue; }
    const d = talDef(cfg, P.kind, id); if (!d) continue; const k = talKind(d); if (k === "pas") continue;
    const max = +(d.cd ?? d.cooldown ?? (k === "ult" ? 6 : 3)) || 1, r = +(d.r ?? d.radius ?? (k === "ult" ? 1 : 0)) || 0, target = d.target !== false && (d.r != null || d.radius != null || d.target === true || k === "ult");
    const how = target ? `Нажмите, затем выберите клетку в радиусе ${r}.` : "Нажмите — сработает сразу.";
    out.push({ id, name: d.name, eff: d.eff || "", kind: k, cd: cdOf(id), max, r, target, ap: 1, how, tip: `${TAL_KIND_NAME[k]} «${d.name}»: ${d.eff || ""}. Перезарядка ${max} х. ${how}` });
  }
  if (P.kind !== "king" && lv >= 5 && UT?.ult) { const u: any = UT.u || (cfg as any).unitUlts?.[UT.ult];
    if (u) { const aim = aimOfUlt(u), eff = ultEff(u), how = u.shape === "line" ? "Нажмите, затем укажите направление — клетку рядом с фигурой." : u.shape === "chain" ? `Нажмите, затем выберите врага в радиусе ${u.range ?? 1}.` : `Нажмите, затем выберите центр области в радиусе ${u.range ?? 1}.`;
      out.push({ id: "ult", name: u.name || "Ульта", eff, kind: "ult", cd: cdOf("ult"), max: +u.cd || 6, r: +u.range || 1, target: true, ap: +u.ap || 1, aim, how,
        tip: `Ульта фигуры «${u.name}» (ур. 5): ${u.eff || eff}. Форма: ${SHAPE_RU[aim.s]}. Цена ${+u.ap || 1} ОД, перезарядка ${+u.cd || 6} х.; после неё фигура в этот ход уже не действует. ${how}` }); } }
  void race; return out;
}
export function abilityBar(c: Ctx, P: Piece, pv: any): string {
  const ab = abilitiesOf(c, P, pv); if (!ab.length) return ""; const my = P.owner === c.me && c.G.cur === c.me;
  return `<div class="abilbar">${ab.map((a) => { const busy = a.cd > 0, noAp = c.G.ap < a.ap, dis = !my || busy || P.acted || noAp;
    const why = !my ? "Сейчас не ваш ход или фигура чужая." : busy ? `Готово через ${a.cd} х.` : P.acted ? "Фигура уже действовала в этот ход." : noAp ? `Нужно ${a.ap} ОД.` : "";
    return `<button class="abil ${a.kind} ${busy ? "cd" : ""}" data-ab="${esc(a.id)}" ${dis ? `aria-disabled="true" data-why="${esc(why || "Сейчас недоступно")}"` : ""} style="--p:${busy ? Math.round((a.cd / a.max) * 100) : 0}"
      data-tip="${esc(a.tip + (why ? " " + why : ""))}" aria-label="${esc(a.name)}">
      <span class="ring"></span><span class="ab-ic">${ic(a.kind === "ult" ? "ult" : "zap")}</span>${busy ? `<b class="ab-cd">${a.cd}</b>` : ""}<small>${esc(a.name)}</small></button>`; }).join("")}</div>`;
}
export function bindAbilityBar(c: Ctx, P: Piece, pv: any, root: HTMLElement, aim: (a: { id: string; r: number; kind: "act" | "ult"; pid: number; aim?: AimDef; name?: string }) => void, why?: (t: string) => void) {
  const ab = abilitiesOf(c, P, pv);
  root.querySelectorAll<HTMLButtonElement>(".abil[data-ab]").forEach((b) => (b.onclick = () => { const a = ab.find((x) => x.id === b.dataset.ab); if (!a) return;
    if (b.getAttribute("aria-disabled") === "true") { why?.(b.dataset.why || "Сейчас недоступно"); return; } // t1248: нажатие на недоступную — объясняем почему
    if (a.target) aim({ id: a.id, r: a.r, kind: a.kind, pid: P.id, aim: a.aim, name: a.name }); else c.send({ type: "act", act: { a: "ability", id: P.id, ab: a.id } }); }));
}

/** Док «Новый уровень»: не модальный, справа в панели. Возвращает true, если показан. */
export function renderLvDock(c: Ctx, root: HTMLElement, onPick?: () => void): boolean {
  const { G, me, S } = c, cfg = cfgOf(S);
  if (G.turn !== deferTurn) { deferred.clear(); deferTurn = G.turn; }
  const mine = G.cur === me && S.phase === "play" ? G.pieces.filter((p) => p.owner === me && pendingTalent(p, cfg) && !deferred.has(p.id + ":" + pendingTalent(p, cfg))) : [];
  if (!mine.length) { root.hidden = true; root.innerHTML = ""; return false; }
  const p = mine[0], lv = pendingTalent(p, cfg), opts = talentOptions(p, cfg, lv), tk = talKind(opts[0]);
  root.classList.remove("picked"); // t1221: «picked» висел навсегда
  if (autoPick() && opts[0]) { if (autoSent.has(p.id + ":" + lv)) { root.hidden = true; return false; } autoSent.add(p.id + ":" + lv); c.send({ type: "act", act: { a: "talent", id: p.id, t: opts[Math.random() < 0.5 ? 0 : Math.min(1, opts.length - 1)].id } }); root.hidden = true; return false; }
  root.hidden = false;
  root.innerHTML = `<div class="lv-h">${ic("xp")}<div><b>${esc(KIND_NAME[p.kind])} · уровень ${lv}</b><small>${tk === "ult" ? "Открыта ульта — выберите одну" : `${TAL_KIND_NAME[tk]}: одна из двух`}${mine.length > 1 ? ` · ещё ${mine.length - 1}` : ""}</small></div></div>
    <div class="lv-cards">${opts.map((o) => `<button class="lvcard k-${talKind(o)}" data-t="${esc(o.id)}" ${p.kind === "king" ? "" : `data-pas="${regPassive(talentPassive(o, p.kind))}"`}><span class="lc-ic">${ic(TAL_ICON(o))}</span><b></b><small></small>${o.cd ? `<em>перезарядка ${+o.cd} х.</em>` : ""}</button>`).join("")}</div>
    <div class="lv-f"><button class="btn ghost sm" data-later>${ic("clock")}<span>Позже</span></button>${p.kind === "king" ? `<button class="btn sm" data-ctree>${ic("crown")}<span>Древо</span></button>` : ""}<button class="btn sm" data-show>${ic("eye")}<span>Где он</span></button></div>`;
  root.querySelector<HTMLButtonElement>("[data-ctree]")?.addEventListener("click", () => (window as any).__stratChiefTree?.());
  root.querySelectorAll<HTMLButtonElement>(".lvcard").forEach((b, i) => { b.querySelector("b")!.textContent = opts[i].name; b.querySelector("small")!.textContent = opts[i].eff || "";
    b.onclick = () => { c.send({ type: "act", act: { a: "talent", id: p.id, t: opts[i].id } }); root.classList.add("picked"); onPick?.(); }; });
  root.querySelector<HTMLButtonElement>("[data-later]")!.onclick = () => { deferred.add(p.id + ":" + lv); renderLvDock(c, root, onPick); };
  root.querySelector<HTMLButtonElement>("[data-show]")!.onclick = () => (window as any).__stratFocus?.(p.id);
  return true;
}
export { pieceLevel, pendingTalent };
