import { GameRoom } from "./room";
import type { Env } from "./types";

// Обязательный реэкспорт для Cloudflare Durable Objects runtime
export { GameRoom };

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    try {
      const roomId = env.GAME_ROOM.idFromName("alkazak_v3");
      const room = env.GAME_ROOM.get(roomId);
      return await room.fetch(request);
    } catch (err) {
      return new Response("Внутренняя ошибка сервера", { status: 500 });
    }
  },
};