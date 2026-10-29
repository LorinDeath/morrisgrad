import { GameRoom } from "./room";
import type { Env } from "./types";
import { fetchRoom } from "./meta/doRetry";

// Обязательный реэкспорт для Cloudflare Durable Objects runtime
export { GameRoom };

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    try {
      const roomId = env.GAME_ROOM.idFromName("alkazak_v3");
      return await fetchRoom(() => env.GAME_ROOM.get(roomId), request);
    } catch (err) {
      return new Response("Внутренняя ошибка сервера", { status: 500 });
    }
  },
};
