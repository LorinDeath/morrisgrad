// Разбор действия игрока из WebSocket (вынесено из match.ts, t1225: тестируется без DO — ult-net-test.ts).
import type { Action, Kind } from "./rules";
import { ECON_ACTS } from "./econ";

export function parseAct(a: any): Action | null {
  if (!a || typeof a !== "object") return null;
  if (a.a === "end") return { a: "end" };
  const int = (v: any) => Number.isInteger(v) && v >= 0 && v < 128; // до 100×100
  if ((a.a === "move" || a.a === "attack") && Number.isInteger(a.id) && int(a.x) && int(a.y)) {
    const o: any = { a: a.a, id: a.id, x: a.x, y: a.y };
    if (a.a === "move" && ["knight", "mage", "rook"].includes(a.promo)) o.promo = a.promo as Kind;
    return o;
  }
  if (a.a === "ult") return Number.isInteger(a.id) && int(a.x) && int(a.y) ? { a: "ult", id: a.id, x: a.x, y: a.y } as any : null; // t1223: ульты Вождя и фигур — раньше не проходили разбор → bad_action
  if (a.a === "raze") return Number.isInteger(a.id) && Number.isInteger(a.city) && a.city >= 0 && typeof a.b === "string" && /^[a-z0-9_]{1,16}$/.test(a.b) ? { a: "raze", id: a.id, city: a.city, b: a.b } as any : null; // t1136
  return parseEcon(a);
}
/** Экономика (этап 2): только целые id/координаты и строки из белого списка; остальное проверяет движок. */
function parseEcon(a: any): Action | null {
  if (!ECON_ACTS.includes(a.a)) return null;
  const id = (v: any) => Number.isInteger(v) && v >= 0 && v < 1e6, int = (v: any) => Number.isInteger(v) && v >= 0 && v < 64;
  const word = (v: any) => typeof v === "string" && /^[a-z0-9_]{1,16}$/.test(v);
  const KINDS = ["pawn", "knight", "mage", "rook", "hero"];
  switch (a.a) {
    case "recruit": return id(a.city) && KINDS.includes(a.kind) && int(a.x) && int(a.y) ? { a: "recruit", city: a.city, kind: a.kind, x: a.x, y: a.y } : null;
    case "build": return word(a.b) && (a.city == null || id(a.city)) && (a.id == null || id(a.id)) && (a.x == null || int(a.x)) && (a.y == null || int(a.y)) ? { a: "build", b: a.b, ...(a.x != null && a.y != null ? { x: a.x, y: a.y } : {}), ...(a.city != null ? { city: a.city } : {}), ...(a.id != null ? { id: a.id } : {}), ...(KINDS.includes(a.kind) ? { kind: a.kind } : {}) } as any : null;
    case "repair": return id(a.city) && word(a.b) ? { a: "repair", city: a.city, b: a.b } as any : null;
    case "research": return word(a.t) ? { a: "research", t: a.t } : null;
    case "era": return { a: "era" };
    case "claim": return id(a.city) && int(a.x) && int(a.y) ? { a: "claim", city: a.city, x: a.x, y: a.y } as any : null; // t1140: покупка клетки
    case "found_cancel": return { a: "found_cancel" } as any;
    case "talent": return id(a.id) && word(a.t) ? { a: "talent", id: a.id, t: a.t } : null;
    case "ability": return id(a.id) && word(a.ab) && (a.x == null) === (a.y == null) && (a.x == null || (int(a.x) && int(a.y))) ? { a: "ability", id: a.id, ab: a.ab, ...(a.x != null ? { x: a.x, y: a.y } : {}) } as any : null; // t1225: умения были в ECON_ACTS, но не разбирались → bad_action
    case "found": return id(a.id) ? { a: "found", id: a.id } : null;
    case "swap": return id(a.city) && Number.isInteger(a.n) && a.n >= 0 && a.n < 8 ? { a: "swap", city: a.city, n: a.n } : null;
    case "trade": { // 2×2: союзный обмен (крюк; в 1×1 движок ответит no_ally)
      const res = (o: any) => { const r: any = {}; if (!o || typeof o !== "object") return r; for (const k of ["gold", "know"]) if (Number.isInteger(o[k]) && o[k] > 0 && o[k] < 1000) r[k] = o[k]; return r; };
      return Number.isInteger(a.to) && a.to >= 0 && a.to < 4 ? { a: "trade", to: a.to, give: res(a.give), get: res(a.get) } : null;
    }
  }
  return null;
}

