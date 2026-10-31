import { GameRoom } from "./room";
import { StratMatch } from "./strat/match";
import { StratIndex } from "./strat/hub";
import { codexHttp } from "./strat/codex-http";
import type { Env } from "./types";
import { fetchRoom } from "./meta/doRetry";

// Обязательный реэкспорт для Cloudflare Durable Objects runtime
export { GameRoom, StratMatch, StratIndex };

const STRAT_MATCH_PATH = /^\/strat\/m\/([A-HJ-NP-Z2-9]{6})$/;

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    try {
      // «Партия Чёрных королей»: отдельные DO — партия = свой StratMatch, общий реестр = StratIndex. Мир (GameRoom) не затрагивается.
      const path = new URL(request.url).pathname;
      if (path.startsWith("/strat/")) {
        const e: any = env;
        if (!e.STRAT_MATCH || !e.STRAT_INDEX) return new Response("not found", { status: 404 });
        if (path === "/strat/codex") return await codexHttp(request, env); // F: Библиотека — без DO, D1 напрямую
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
