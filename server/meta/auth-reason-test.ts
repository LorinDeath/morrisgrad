// verifyClerkTokenEx: причина отказа (expired / invalid / jwks) — для auth_invalid (MC-A03) вместо молчаливого «гостя»
import { verifyClerkTokenEx } from "./auth";
let fails = 0; const ok = (c: any, m: string) => { console.log((c ? "PASS " : "FAIL ") + m); if (!c) fails++; };
const b64 = (o: any) => btoa(JSON.stringify(o)).replace(/=+$/, "").replace(/\+/g, "-").replace(/\//g, "_");
const ISS = "https://example.clerk.accounts.dev";
const tok = (p: any, h: any = { alg: "RS256", kid: "k" }) => `${b64(h)}.${b64(p)}.c2ln`;
const now = Math.floor(Date.now() / 1000);
(globalThis as any).fetch = async () => { throw new Error("offline"); }; // JWKS недоступен
ok((await verifyClerkTokenEx("garbage", ISS)).reason === "invalid", "мусор — invalid");
ok((await verifyClerkTokenEx(tok({ iss: ISS, sub: "u", exp: now - 120 }), ISS)).reason === "expired", "истёкший — expired");
ok((await verifyClerkTokenEx(tok({ iss: "https://evil", sub: "u", exp: now + 60 }), ISS)).reason === "invalid", "чужой издатель — invalid");
ok((await verifyClerkTokenEx(tok({ iss: ISS, sub: "u", exp: now + 60 }, { alg: "HS256" }), ISS)).reason === "invalid", "не RS256 — invalid");
ok((await verifyClerkTokenEx(tok({ iss: ISS, sub: "u", exp: now + 60 }), ISS)).reason === "jwks", "ключи недоступны — jwks (не вина игрока)");
console.log(fails ? `FAILED ${fails}` : "ALL OK"); if (fails) process.exit(1);
