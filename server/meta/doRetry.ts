const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Перезапуск DO при выкладке/откате даёт разовые «internal error»/«code was updated»: такие ошибки помечены
 *  e.retryable — запрос без тела (GET, апгрейд WS) повторяем на свежем stub, а не отдаём игроку 500 (MC-N01). */
export async function fetchRoom(getStub: () => { fetch: (r: Request) => Promise<Response> }, request: Request, tries = 3): Promise<Response> {
  const idempotent = request.method === "GET" || request.method === "HEAD";
  for (let i = 0; ; i++) {
    try {
      return await getStub().fetch(request);
    } catch (err: any) {
      if (!idempotent || !err?.retryable || err?.overloaded || i >= tries - 1) throw err;
      console.error("[mc] DO retry", i + 1, err?.message || err);
      await sleep(100 * (i + 1));
    }
  }
}
