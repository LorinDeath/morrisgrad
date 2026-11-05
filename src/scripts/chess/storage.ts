// Общее хранилище кампаний / карт / меню главного экрана (localStorage).
// Схемы = ТЗ §6 + кнопки главного экрана (title/bg/buttons → bot|campaign|map|url).
export type Kind = "P" | "R" | "N" | "B" | "Q" | "K";
export type Side = "w" | "b";
export type Unit = { id: string; side: Side; type: Kind; x: number; y: number; hp?: number | null; fixed?: boolean };
export type Cond =
  | { type: "kill_king"; side: Side }
  | { type: "destroy_n"; side: Side; n: number }
  | { type: "survive_turns"; n: number }
  | { type: "reach_cell"; side: Side; x: number; y: number; unit?: Kind };
export type MapPayload = {
  w: number; h: number;
  boardSkin: string;
  bg?: "hall" | "terrace";
  units: Unit[];
  win: Cond[];
  lose: Cond[];
  props?: { prop: string; x: number; y: number }[];
  special?: { kind: "danger" | "boost"; x: number; y: number }[];
};
export type VnBeat = { speaker: string; portrait: string | null; text: string; side: "left" | "right" | "center" };
export type ScenePayload = { bg: string; beats: VnBeat[] };
export type ChessMap = {
  id: string; title: string; payload: MapPayload;
  sceneBefore?: ScenePayload | null; sceneAfter?: ScenePayload | null;
};
export type Chapter = { id: string; title: string; maps: ChessMap[] };
export type Campaign = { id: string; title: string; cover?: string; chapters: Chapter[]; updated: number };

export type MenuAction = "bot" | "host" | "join" | "find" | "campaign" | "map" | "url" | "none";
export type MenuBtn = { id: string; label: string; style: "gold" | "normal" | "ghost"; action: MenuAction; targetId: string };
export type HomeMenu = { title: string; tag: string; bg: "hall" | "terrace"; buttons: MenuBtn[] };

export const CAMP_KEY = "chess_campaigns_v2";
export const MENU_KEY = "chess_home_menu_v1";

export const emptyMap = (): MapPayload => ({
  w: 8, h: 8, boardSkin: "B_artdeco", bg: "hall",
  units: [],
  win: [{ type: "kill_king", side: "b" }],
  lose: [{ type: "kill_king", side: "w" }],
  props: [], special: [],
});

export const classicUnits = (): Unit[] => {
  const u: Unit[] = [];
  const back = "RNBQKBNR".split("") as Kind[];
  back.forEach((t, x) => {
    u.push({ id: `b${t}${x}`, side: "b", type: t, x, y: 0, fixed: true });
    u.push({ id: `bp${x}`, side: "b", type: "P", x, y: 1, fixed: true });
    u.push({ id: `wp${x}`, side: "w", type: "P", x, y: 6, fixed: true });
    u.push({ id: `w${t}${x}`, side: "w", type: t, x, y: 7, fixed: true });
  });
  return u;
};

export const DEFAULT_HOME: HomeMenu = {
  title: "Боевые шахматы",
  tag: "Убей короля — это мат. ОД растут каждые 15 твоих ходов.",
  bg: "hall",
  buttons: [
    { id: "find", label: "Найти соперника", style: "gold", action: "find", targetId: "" },
    { id: "bot", label: "С ботом", style: "normal", action: "bot", targetId: "" },
    { id: "join", label: "Войти по коду", style: "normal", action: "join", targetId: "" },
    { id: "host", label: "Комната для друга", style: "ghost", action: "host", targetId: "" },
  ],
};

export const loadCampaigns = (): Campaign[] => {
  try {
    const a = JSON.parse(localStorage.getItem(CAMP_KEY) || "[]");
    return Array.isArray(a) ? a : [];
  } catch { return []; }
};
export const saveCampaigns = (a: Campaign[]) => {
  try { localStorage.setItem(CAMP_KEY, JSON.stringify(a)); } catch {}
};

export const loadHomeMenu = (): HomeMenu => {
  try {
    const m = JSON.parse(localStorage.getItem(MENU_KEY) || "null");
    if (!m || typeof m !== "object") return { ...DEFAULT_HOME, buttons: DEFAULT_HOME.buttons.map((b) => ({ ...b })) };
    const buttons: MenuBtn[] = Array.isArray(m.buttons)
      ? m.buttons.slice(0, 12).map((b: any, i: number) => ({
          id: String(b.id || "b" + i).slice(0, 24),
          label: String(b.label || "Кнопка").slice(0, 40),
          style: b.style === "gold" || b.style === "ghost" ? b.style : "normal",
          action: (["bot", "host", "join", "find", "campaign", "map", "url", "none"] as MenuAction[]).includes(b.action) ? b.action : "none",
          targetId: String(b.targetId || "").slice(0, 200),
        }))
      : DEFAULT_HOME.buttons.map((b) => ({ ...b }));
    // миграция: старые меню без очереди — вставляем «Найти соперника»
    if (!buttons.some((b) => b.action === "find")) {
      for (const b of buttons) if (b.style === "gold" && b.action === "bot") b.style = "normal";
      buttons.unshift({ id: "find", label: "Найти соперника", style: "gold", action: "find", targetId: "" });
    }
    return {
      title: String(m.title || DEFAULT_HOME.title).slice(0, 64),
      tag: String(m.tag || DEFAULT_HOME.tag).slice(0, 200),
      bg: m.bg === "terrace" ? "terrace" : "hall",
      buttons,
    };
  } catch {
    return { ...DEFAULT_HOME, buttons: DEFAULT_HOME.buttons.map((b) => ({ ...b })) };
  }
};
export const saveHomeMenu = (m: HomeMenu) => {
  try { localStorage.setItem(MENU_KEY, JSON.stringify(m)); } catch {}
};

export const uid = () => crypto.randomUUID().replace(/-/g, "").slice(0, 10);
export const KIND_LABEL: Record<Kind, string> = {
  P: "Пешка", R: "Ладья", N: "Конь", B: "Слон", Q: "Ферзь", K: "Король",
};
