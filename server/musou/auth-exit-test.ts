// bun server/musou/auth-exit-test.ts
import { DEFAULT_CLERK_ISSUER } from "../meta/auth";
import { identify } from "../strat/ident";
import { EXIT_MS, armExitAt, exitDue, exitLeft } from "../../src/scripts/musou/exit";
import { eventCode, moveAxes, skillOfCode, typingTarget } from "../../src/scripts/musou/keys";
import { authText, jwtExp, planAuthRetry, tokenStale } from "../../src/scripts/musou/session";

let fails = 0;
const ok = (c: unknown, m: string) => { console.log((c ? "PASS " : "FAIL ") + m); if (!c) fails++; };
const b64 = (o: unknown) => btoa(JSON.stringify(o)).replace(/=+$/, "").replace(/\+/g, "-").replace(/\//g, "_");
const tok = (payload: Record<string, unknown>) => `${b64({ alg: "RS256", kid: "k" })}.${b64(payload)}.c2ln`;
const now = Math.floor(Date.now() / 1000);
const guest = "orda-auth-exit-guest1";

const expired = tok({
  alg: "RS256", iss: DEFAULT_CLERK_ISSUER, sub: "user_orda", exp: now - 120,
  azp: "http://127.0.0.1:4321",
});
const expiredId = await identify({}, "http://127.0.0.1:8787/musou/act", { token: expired, guest, nick: "Лорин" });
ok("err" in expiredId && expiredId.err === "auth_expired", "истёкший JWT на finish — auth_expired");
ok(!("pkey" in expiredId), "истёкший токен не становится гостевым ключом");

const guestId = await identify({}, "http://127.0.0.1:8787/musou/act", { guest, nick: "Лорин" });
ok("pkey" in guestId && guestId.verified === false && String(guestId.pkey).startsWith("guest:"), "без токена гость остаётся гостем");

const live = tok({ iss: DEFAULT_CLERK_ISSUER, sub: "user_orda", exp: now + 50, azp: "http://127.0.0.1:4321" });
ok(jwtExp(live) === now + 50, "срок токена читается без проверки подписи");
ok(tokenStale(expired, now), "протухший токен пора обновить");
ok(!tokenStale(live, now, 20), "токен с запасом больше 20 с ещё свежий");
ok(tokenStale(live, now, 60), "токен, которому осталось меньше минуты, обновляется заранее");
ok(planAuthRetry("auth_expired", 0, true) === "retry", "первая auth_expired повторяет запрос со свежим токеном");
ok(planAuthRetry("auth_expired", 1, true) === "ok", "вторая auth_expired уже не крутит запрос");
ok(planAuthRetry("auth_expired", 0, false) === "logout", "нет нового токена — это выход, не гость");
ok(planAuthRetry("auth_jwks", 0, true) === "retry", "сбой ключей повторяется один раз и не считается выходом");
ok(planAuthRetry("logged_out", 0, false) === "logout", "настоящий выход остаётся выходом");
ok(planAuthRetry("Чужой забег", 0, true) === "ok", "обычная ошибка забега не трогает вход");
ok(authText("auth_expired").includes("аккаунте") && !authText("auth_expired").includes("auth_expired"), "игроку не показывается сырой код auth_expired");
ok(authText("Сумка полна") === "Сумка полна", "прочие ошибки остаются своими словами");

ok(eventCode({ code: "KeyW", key: "ц" }) === "KeyW", "русская ц на физической W остаётся KeyW");
ok(eventCode({ code: "KeyA", key: "ф" }) === "KeyA" && eventCode({ key: "w" }) === "KeyW", "код клавиши важнее буквы, латиница без кода тоже шаг");
ok(skillOfCode("KeyQ") === 1 && skillOfCode("KeyE") === 2 && skillOfCode("KeyR") === 3 && skillOfCode("KeyF") === 4, "Q E R F остаются навыками на любой раскладке");
ok(eventCode({ key: "й" }) === "" && skillOfCode("й") === 0, "буква й без кода не жмёт чужой навык");
const diag = moveAxes(new Set(["KeyW", "KeyD"]), 0, 0);
ok(Math.abs(Math.hypot(diag.x, diag.y) - 1) < 1e-9, "WASD по диагонали не быстрее прямого шага");
ok(Math.abs(moveAxes(new Set<string>(), 0.5, 0).x - 0.5) < 1e-9, "половина стика остаётся половиной");
ok(Math.abs(moveAxes(new Set(["KeyD"]), 0.2, 0).x - 1) < 1e-9, "клавиша и стик по одной оси не быстрее прямого шага");
const capped = moveAxes(new Set(["KeyW", "KeyD"]), 0.4, -0.2);
ok(Math.abs(Math.hypot(capped.x, capped.y) - 1) < 1e-9, "клавиша вместе со стиком не длиннее 1");
ok(typingTarget({ tagName: "INPUT", isContentEditable: false } as unknown as EventTarget), "поле ввода не отдаёт клавиши бою");
ok(typingTarget({ tagName: "TEXTAREA", isContentEditable: false } as unknown as EventTarget), "многострочное поле тоже не перехватывается");
ok(!typingTarget({ tagName: "BUTTON", isContentEditable: false } as unknown as EventTarget), "кнопка навыка не считается полем ввода");

const armed = armExitAt(1_000, 0, true);
ok(armed === 1_000 + EXIT_MS && EXIT_MS === 10_000, "отсчёт выхода — десять секунд");
ok(armExitAt(1_500, armed, true) === armed, "повтор победы не сдвигает отсчёт");
ok(exitLeft(armed, 1_000) === 10 && exitLeft(armed, armed - 1) === 1 && exitLeft(armed, armed) === 0, "на экране видны 10, затем 1, затем 0");
ok(!exitDue(armed, armed - 1) && exitDue(armed, armed), "переход только когда десять секунд вышли");
ok(armExitAt(1_000, 0, false) === 0, "пока босс жив, отсчёт не начинается");

console.log(fails ? `FAILED ${fails}` : "OK");
process.exit(fails ? 1 : 0);
