// t1221: журнал «мои действия за ход» — только владельцу, сброс на новом ходу (проверка исходника: match.ts не импортируется без workerd)
import { readFileSync } from "fs";
const m = readFileSync(new URL("./match.ts", import.meta.url), "utf8"), c = readFileSync(new URL("../../src/scripts/strat/client.ts", import.meta.url), "utf8");
let n = 0; const ok = (b: any, s: string) => { if (!b) { console.error("FAIL", s); process.exit(1); } n++; };
ok(/T\[seat\]\.turn !== t0\) T\[seat\] = \{ turn: t0, items: \[\] \}/.test(m), "сброс на новом ходу");
ok(/const T = \(L as any\)\.tlog\?\.\[seat\]; if \(T\) out\.tlog = T;/.test(m), "отдаётся только своему месту");
ok(/\(seat === 0 \|\| seat === 1\) && L\.phase === "play"\) \{[^\n]*\n\s*\{ const T = \(L as any\)\.tlog/.test(m), "внутри блока своего места и фазы play");
ok(/ap: g\.cur === prevCur && g\.turn === t0 \? Math\.max\(0, ap0 - g\.ap\) : null/.test(m), "ОД = разница до/после");
ok(/S\.tlog/.test(c) && /tArrow\(ctx, it\.fx/.test(c), "клиент рисует путь");
ok(/e\.key === "Escape" && pendAct/.test(c), "Esc отменяет запланированное");
console.log(`tlog-test: ${n} ok`);
