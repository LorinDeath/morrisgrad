// DO retry: retryable-ошибка при перезапуске DO → повтор GET; не-retryable / overloaded / POST → сразу ошибка
import { fetchRoom } from "./doRetry";
let pass = 0, fail = 0; const ok = (c: any, m: string) => { c ? pass++ : fail++; console.log((c ? "PASS " : "FAIL ") + m); };
const mk = (errs: any[]) => { let n = 0; return { calls: () => n, get: () => ({ fetch: async () => { const e = errs[n++]; if (e) throw e; return new Response("ok", { status: 200 }); } }) }; };
const R = (e: any) => Object.assign(new Error("internal error; reference = x"), e);
(async () => {
  let s = mk([R({ retryable: true })]); let r = await fetchRoom(s.get, new Request("http://x/")); ok(r.status === 200 && s.calls() === 2, "retryable → повтор и успех");
  s = mk([R({ retryable: true }), R({ retryable: true }), R({ retryable: true })]); let t: any = null; try { await fetchRoom(s.get, new Request("http://x/")); } catch (e) { t = e; } ok(t && s.calls() === 3, "не больше 3 попыток");
  s = mk([R({})]); t = null; try { await fetchRoom(s.get, new Request("http://x/")); } catch (e) { t = e; } ok(t && s.calls() === 1, "не-retryable — без повтора");
  s = mk([R({ retryable: true, overloaded: true })]); t = null; try { await fetchRoom(s.get, new Request("http://x/")); } catch (e) { t = e; } ok(t && s.calls() === 1, "overloaded — без повтора");
  s = mk([R({ retryable: true })]); t = null; try { await fetchRoom(s.get, new Request("http://x/", { method: "POST", body: "a" })); } catch (e) { t = e; } ok(t && s.calls() === 1, "POST — без повтора");
  console.log(`\n${pass} passed, ${fail} failed`); if (fail) process.exit(1);
})();
