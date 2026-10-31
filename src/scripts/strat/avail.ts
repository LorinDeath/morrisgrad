// t1221 · «Доступно» в духе Civilization: короткий список того, что игрок может сделать прямо сейчас.
// Каждый пункт кликабелен и ведёт в нужное место; пункт исчезает сам, когда действие выполнено (список считается заново на каждый render).
// Только свои данные (казна, города, фигуры текущей стороны) — ничего из-под тумана.
import type { GameState, Kind, StratCfg } from "../../../server/strat/rules";
import { TECHS, type BuildId } from "../../../server/strat/econ-cfg";
import { canResearch, canEra, canBuild, canRecruit, recruitCells, chiefBuildSite, claimCost } from "../../../server/strat/econ";
import { pendingTalent, KIND_NAME, bName } from "./econ-ui";
import { ic } from "./icons";
import { esc } from "./ui-kit";

export type AvailKind = "lvl" | "tech" | "era" | "build" | "recruit" | "claim" | "ap" | "trade";
export type AvailItem = { k: AvailKind; icon: string; title: string; sub?: string; ref?: number };
export type AvailNav = { lvl(pid: number): void; tech(): void; build(): void; city(id: number): void; ap(pid: number): void; trade?(): void };

const RECRUIT: Kind[] = ["pawn", "knight", "mage", "rook", "hero"];

/** Что доступно стороне me сейчас. Пусто, если не её ход / нет экономики / партия не идёт. */
export function availItems(G: GameState, S: any, me: number, cfg: StratCfg, extra: AvailItem[] = []): AvailItem[] {
  if (me < 0 || S?.phase !== "play" || G.cur !== me || !G.ec) return [];
  const out: AvailItem[] = [], ec = G.ec, gold = ec.res?.[me]?.gold ?? 0;
  const lv = G.pieces.filter((p) => p.owner === me && pendingTalent(p, cfg));
  if (lv.length) out.push({ k: "lvl", icon: "xp", title: lv.length > 1 ? `Новый уровень · ${lv.length} фигуры` : `Новый уровень: ${KIND_NAME[lv[0].kind] || lv[0].kind}`, sub: "выберите навык", ref: lv[0].id });
  if (!canEra(G, me, cfg)) out.push({ k: "era", icon: "glory", title: "Можно перейти в новую эпоху", sub: "древо технологий" });
  { const ok = TECHS.filter((t) => !canResearch(G, me, t, cfg)); if (ok.length) out.push({ k: "tech", icon: "know", title: ok.length > 1 ? `Можно изучить технологию · ${ok.length}` : "Можно изучить технологию", sub: ok.slice(0, 2).map((t) => t.name).join(", ") + (ok.length > 2 ? "…" : "") }); }
  { const s = chiefBuildSite(G, me, cfg); if (s) { const bs = (Object.keys(cfg.build) as BuildId[]).filter((b) => !canBuild(G, me, s.c, b, cfg, "rook"));
    if (bs.length) out.push({ k: "build", icon: "build", title: "Вождь может строить", sub: bs.slice(0, 2).map((b) => bName(b, G.races[me] || "")).join(", ") + (bs.length > 2 ? "…" : ""), ref: s.k.id }); } }
  for (const c of ec.cities) if (c.owner === me && !c.acted) {
    const ks = RECRUIT.filter((k) => !canRecruit(G, me, c, k, cfg) && recruitCells(G, c, k, cfg).length);
    if (ks.length) { out.push({ k: "recruit", icon: "pawn", title: `Нанять в «${c.name || "город"}»`, sub: ks.map((k) => KIND_NAME[k]).join(", "), ref: c.id }); }
  }
  for (const c of ec.cities) if (c.owner === me && (c.claims || 0) > 0 && gold >= claimCost(G, c, cfg)) out.push({ k: "claim", icon: "gold", title: `«${c.name || "Город"}» может расшириться`, sub: claimCost(G, c, cfg) ? `${claimCost(G, c, cfg)} з` : "бесплатно", ref: c.id });
  out.push(...extra);
  if (G.ap > 0) { const idle = G.pieces.find((p) => p.owner === me && !p.acted && p.kind !== "king") || G.pieces.find((p) => p.owner === me && !p.acted);
    out.push({ k: "ap", icon: "ap", title: `Свободно ОД: ${G.ap}`, sub: idle ? `ход фигурой: ${KIND_NAME[idle.kind] || idle.kind}` : "все фигуры уже ходили", ref: idle?.id ?? -1 }); }
  return out;
}

/** Рисует список в root и счётчик на вкладке телефона; клики → nav. */
export function renderAvail(root: HTMLElement | null, items: AvailItem[], nav: AvailNav) {
  if (!root) return;
  const tab = document.querySelector<HTMLElement>('#mtabs [data-ms="avail"]');
  if (tab) { tab.hidden = false; tab.classList.toggle("has", items.length > 0); const b = tab.querySelector<HTMLElement>(".mt-n"); if (b) { b.textContent = String(items.length); b.hidden = !items.length; } }
  root.hidden = !items.length;
  const key = items.map((i) => i.k + i.title + (i.sub || "")).join("|"); if (root.dataset.key === key) return; root.dataset.key = key;
  root.innerHTML = `<div class="av-h">${ic("star")}<span>Доступно</span><small>${items.length}</small></div><div class="av-list">` + items.map((it, i) =>
    `<button type="button" class="av-it k-${it.k}" data-i="${i}" title="${esc(it.title + (it.sub ? " — " + it.sub : ""))}">${ic(it.icon)}<span><b>${esc(it.title)}</b>${it.sub ? `<small>${esc(it.sub)}</small>` : ""}</span></button>`).join("") + "</div>";
  root.querySelectorAll<HTMLButtonElement>(".av-it").forEach((b) => (b.onclick = () => { const it = items[+b.dataset.i!]; if (!it) return;
    if (document.body.dataset.msheet === "avail") (window as any).__stratMSheet?.("");
    switch (it.k) { case "lvl": nav.lvl(it.ref!); break; case "tech": case "era": nav.tech(); break; case "build": nav.build(); break;
      case "recruit": case "claim": nav.city(it.ref!); break; case "ap": nav.ap(it.ref!); break; case "trade": nav.trade?.(); break; } }));
}
