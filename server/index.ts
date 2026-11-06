import { GameRoom } from "./room";
import { StratMatch } from "./strat/match";
import { StratIndex } from "./strat/hub";
import { ChessMatch } from "./chess/match";
import { ChessIndex } from "./chess/hub";
import { codexHttp } from "./strat/codex-http";
import { adminGoalsHttp } from "./strat/admin-http";
import { adminCfgHttp } from "./strat/admin-cfg-http";
import { chessAdminGateHttp } from "./chess/admin-gate";
import { chessHttp } from "./chess/http";
import { MusouRoom } from "./musou/room";
import { MusouIndex } from "./musou/hub";
import { musouHttp } from "./musou/http";
import { musouAdminHttp } from "./musou/admin";
import type { Env } from "./types";
import { fetchRoom } from "./meta/doRetry";

// Обязательный реэкспорт для Cloudflare Durable Objects runtime
export { GameRoom, StratMatch, StratIndex, ChessMatch, ChessIndex, MusouRoom, MusouIndex };

const STRAT_MATCH_PATH = /^\/strat\/m\/([A-HJ-NP-Z2-9]{6})$/;
const CHESS_MATCH_PATH = /^\/chess\/m\/([A-HJ-NP-Z2-9]{6})$/;
const MUSOU_ROOM_PATH = /^\/musou\/m\/([A-HJ-NP-Z2-9]{6})$/;
const MUSOU_PLAZA_PATH = /^\/musou\/p\/(plaza-[0-7])$/;

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    try {
      const path = new URL(request.url).pathname;
      // «Боевые шахматы»: отдельные DO ChessMatch / ChessIndex. Strat и GameRoom не затрагиваются.
      if (path.startsWith("/musou/")) {
        const e: any = env;
        if (path === "/musou/tune" || path === "/musou/admin/tune" || path === "/musou/admin/rollback") return await musouAdminHttp(request, env);
        if (path === "/musou/hello" || path === "/musou/act" || path === "/musou/friends" || path === "/musou/invite") return await musouHttp(request, env, path);
        if (!e.MUSOU_ROOM || !e.MUSOU_INDEX) return new Response("not found", { status: 404 });
        const orda = MUSOU_ROOM_PATH.exec(path);
        if (orda) return await fetchRoom(() => e.MUSOU_ROOM.get(e.MUSOU_ROOM.idFromName(orda[1])), request);
        const plaza = MUSOU_PLAZA_PATH.exec(path);
        if (plaza) return await fetchRoom(() => e.MUSOU_INDEX.get(e.MUSOU_INDEX.idFromName(plaza[1])), request);
        return await fetchRoom(() => e.MUSOU_INDEX.get(e.MUSOU_INDEX.idFromName("index")), request);
      }
      if (path.startsWith("/chess/")) {
        const e: any = env;
        if (path === "/chess/admin/gate") return await chessAdminGateHttp(request, env);
        if (path === "/chess/me" || path === "/chess/top") return await chessHttp(request, env, path);
        if (!e.CHESS_MATCH || !e.CHESS_INDEX) return new Response("not found", { status: 404 });
        const cm = CHESS_MATCH_PATH.exec(path);
        if (cm) return await fetchRoom(() => e.CHESS_MATCH.get(e.CHESS_MATCH.idFromName(cm[1])), request);
        return await fetchRoom(() => e.CHESS_INDEX.get(e.CHESS_INDEX.idFromName("index")), request);
      }
      // «Партия Чёрных королей»: отдельные DO — партия = свой StratMatch, общий реестр = StratIndex. Мир (GameRoom) не затрагивается.
      if (path.startsWith("/strat/")) {
        const e: any = env;
        if (!e.STRAT_MATCH || !e.STRAT_INDEX) return new Response("not found", { status: 404 });
        if (path === "/strat/codex") return await codexHttp(request, env);
        if (path === "/strat/admin/goals") return await adminGoalsHttp(request, env);
        if (path === "/strat/admin/cfg") return await adminCfgHttp(request, env);
        const m = STRAT_MATCH_PATH.exec(path);
        if (m) return await fetchRoom(() => e.STRAT_MATCH.get(e.STRAT_MATCH.idFromName(m[1])), request);
        return await fetchRoom(() => e.STRAT_INDEX.get(e.STRAT_INDEX.idFromName("index")), request);
      }
      const roomId = env.GAME_ROOM.idFromName("alkazak_v3");
      return await fetchRoom(() => env.GAME_ROOM.get(roomId), request);
    } catch (err) {
      return new Response("Внутренняя ошибка сервера", { status: 500 });
    }
  },
};
