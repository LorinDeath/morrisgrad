// Проверка токена Clerk (verifyClerkToken): подпись, издатель, срок, обязательный exp, alg.
// Ключи и JWKS — локальные (fetch подменён), сеть не нужна. Запуск: bun server/meta/auth-security-test.ts
import { verifyClerkToken } from "./auth";
let pass = 0, fail = 0;
const ok = (c: any, m: string) => { if (c) pass++; else { fail++; console.log("FAIL " + m); } };
const ISS = "https://test-issuer.example";
const b64u = (b: ArrayBuffer | Uint8Array) => Buffer.from(b as any).toString("base64").replace(/=+$/, "").replace(/\+/g, "-").replace(/\//g, "_");
const enc = (o: any) => b64u(new TextEncoder().encode(JSON.stringify(o)));
const kp = await crypto.subtle.generateKey({ name: "RSASSA-PKCS1-v1_5", modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: "SHA-256" }, true, ["sign", "verify"]);
const other = await crypto.subtle.generateKey({ name: "RSASSA-PKCS1-v1_5", modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: "SHA-256" }, true, ["sign", "verify"]);
const jwk: any = await crypto.subtle.exportKey("jwk", kp.publicKey); jwk.kid = "k1";
(globalThis as any).fetch = async (u: string) => { if (String(u) === `${ISS}/.well-known/jwks.json`) return new Response(JSON.stringify({ keys: [jwk] })); throw new Error("сеть запрещена в тесте: " + u); };
async function tok(payload: any, header: any = { alg: "RS256", kid: "k1" }, key = kp.privateKey) {
  const h = enc(header), p = enc(payload);
  const sig = await crypto.subtle.sign("RSASSA-PKCS1-v1_5", key, new TextEncoder().encode(`${h}.${p}`));
  return `${h}.${p}.${b64u(sig)}`;
}
const now = Math.floor(Date.now() / 1000);
ok(await verifyClerkToken(await tok({ sub: "user_a", iss: ISS, exp: now + 60 }), ISS) === "user_a", "валидный токен");
ok(await verifyClerkToken(await tok({ sub: "user_a", iss: ISS }), ISS) === null, "без exp — отказ");
ok(await verifyClerkToken(await tok({ sub: "user_a", iss: ISS, exp: now - 60 }), ISS) === null, "истёкший — отказ");
ok(await verifyClerkToken(await tok({ sub: "user_a", iss: ISS, exp: now + 60, nbf: now + 600 }), ISS) === null, "nbf в будущем — отказ");
ok(await verifyClerkToken(await tok({ sub: "user_a", iss: "https://evil.example", exp: now + 60 }), ISS) === null, "чужой издатель — отказ");
ok(await verifyClerkToken(await tok({ sub: "user_a", iss: ISS, exp: now + 60 }, { alg: "RS256", kid: "k1" }, other.privateKey), ISS) === null, "чужая подпись — отказ");
{ const t = await tok({ sub: "user_a", iss: ISS, exp: now + 60 }); const [h, , s] = t.split("."); ok(await verifyClerkToken(`${h}.${enc({ sub: "user_admin", iss: ISS, exp: now + 60 })}.${s}`, ISS) === null, "подмена sub — отказ"); }
ok(await verifyClerkToken(`${enc({ alg: "none" })}.${enc({ sub: "user_a", iss: ISS, exp: now + 60 })}.`, ISS) === null, "alg none — отказ");
ok(await verifyClerkToken(await tok({ sub: "user_a", iss: ISS, exp: now + 60 }, { alg: "HS256", kid: "k1" }), ISS) === null, "alg HS256 — отказ");
ok(await verifyClerkToken("мусор", ISS) === null && await verifyClerkToken("", ISS) === null, "мусор — отказ");
ok(await verifyClerkToken(await tok({ sub: 123, iss: ISS, exp: now + 60 }), ISS) === null, "sub не строка — отказ");
console.log(`auth-security-test: ${pass} PASS, ${fail} FAIL`);
if (fail) process.exit(1);
