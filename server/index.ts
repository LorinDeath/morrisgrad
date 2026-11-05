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
import type { Env } from "./types";
import { fetchRoom } from "./meta/doRetry";

// Обязательный реэкспорт для Cloudflare Durable Objects runtime
export { GameRoom, StratMatch, StratIndex, ChessMatch, ChessIndex };

const STRAT_MATCH_PATH = /^\/strat\/m\/([A-HJ-NP-Z2-9]{6})$/;
const CHESS_MATCH_PATH = /^\/chess\/m\/([A-HJ-NP-Z2-9]{6})$/;

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    try {
      const path = new URL(request.url).pathname;
      // «Боевые шахматы»: отдельные DO ChessMatch / ChessIndex. Strat и GameRoom не затрагиваются.
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
