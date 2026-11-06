// HTTP хаба: герой, статы, лавка, сумка, квесты, зачёт этажа. Комнаты — отдельные DO.
import { isLocalRequest, originAllowed } from "../limits";
import { identify } from "../strat/ident";
import { FriendStore } from "../meta/friends";
import { loadProfile, saveProfile } from "./db";
import { readPublishedTune } from "./admin";
import {
  beginRun, buyOffer, claimChest, claimQuest, equipItem, finishRun, forgeItem, mulberry32, parseChestPick, refreshShop, salvage, setHero, setOath, spendStat, takeInbox, unequip,
  type HeroId, type Paper, type Stat,
} from "../../src/scripts/musou/rules";

function corsOf(origin: string | null) {
  return { ...(origin ? { "Access-Control-Allow-Origin": origin, Vary: "Origin" } : {}), "Cache-Control": "no-store" };
}

export function ordaKey(pkey: string, verified: boolean) {
  if (!verified) return pkey;
  return pkey.startsWith("uid:") ? pkey : "uid:" + pkey;
}

async function who(env: any, request: Request, body: any) {
  const header = /^Bearer\s+(\S+)$/i.exec(request.headers.get("Authorization") || "");
  const token = typeof body?.token === "string" && body.token ? body.token : header?.[1];
  const id = await identify(env, request.url, { token, guest: body?.guest, nick: body?.nick, userId: body?.userId });
  if ("err" in id) return id;
  return { key: ordaKey(id.pkey, id.verified), nick: id.nick, verified: id.verified, uid: id.verified ? id.pkey.replace(/^uid:/, "") : "" };
}

export async function musouHttp(request: Request, env: any, path: string): Promise<Response> {
  const local = isLocalRequest(request);
  const origin = request.headers.get("Origin");
  if (origin && !originAllowed(env, origin, local)) return new Response("forbidden", { status: 403 });
  const cors = corsOf(origin);
  if (request.method === "OPTIONS") {
    return new Response(null, { headers: { ...cors, "Access-Control-Allow-Methods": "POST", "Access-Control-Allow-Headers": "authorization, content-type", "Access-Control-Max-Age": "600" } });
  }
  if (request.method !== "POST") return new Response("method", { status: 405, headers: cors });
  if (!env.GAME_DB) return Response.json({ err: "no_db" }, { status: 503, headers: cors });
  const body: any = await request.json().catch(() => ({}));
  const id = await who(env, request, body);
  if ("err" in id) return Response.json({ err: id.err }, { status: 401, headers: cors });
  try {
    if (path === "/musou/hello") {
      const profile = await loadProfile(env.GAME_DB, id.key);
      if (!profile.hero) await saveProfile(env.GAME_DB, id.key, profile);
      return Response.json({ profile, nick: id.nick, verified: id.verified, tune: await readPublishedTune(env) }, { headers: cors });
    }
    if (path === "/musou/friends") return Response.json({ friends: await friendsOf(env, id.key) }, { headers: cors });
    if (path === "/musou/invite") return await invite(env, request, id.key, body, cors);
    if (path === "/musou/act") return await act(env, id.key, body, cors);
    return new Response("not found", { status: 404, headers: cors });
  } catch (e: any) {
    console.error("[orda]", e?.message || e);
    return Response.json({ err: "db" }, { status: 503, headers: cors });
  }
}

async function act(env: any, key: string, body: any, cors: Record<string, string>) {
  const p = await loadProfile(env.GAME_DB, key);
  const op = String(body.op || "");
  const rng = mulberry32((Date.now() ^ (p.nextId * 17)) >>> 0);
  let report: any = null;
  let gold = 0;
  if (op === "hero") {
    const err = setHero(p, body.hero as HeroId);
    if (err) return Response.json({ err, profile: p }, { headers: cors });
  } else if (op === "stat") {
    const err = spendStat(p, body.stat as Stat);
    if (err) return Response.json({ err, profile: p }, { headers: cors });
  } else if (op === "equip") {
    const err = equipItem(p, String(body.id || ""));
    if (err) return Response.json({ err, profile: p }, { headers: cors });
  } else if (op === "unequip") {
    const err = unequip(p, body.slot as Paper);
    if (err) return Response.json({ err, profile: p }, { headers: cors });
  } else if (op === "inbox") {
    const mode = body.mode === "sell" || body.mode === "drop" ? body.mode : "bag";
    const r = takeInbox(p, mode);
    if ("err" in r) return Response.json({ err: r.err, profile: p }, { headers: cors });
    gold = r.gold || 0;
  } else if (op === "salvage") {
    const r = salvage(p, String(body.id || ""));
    if ("err" in r) return Response.json({ err: r.err, profile: p }, { headers: cors });
    gold = r.gold;
  } else if (op === "buy") {
    const err = buyOffer(p, String(body.id || ""));
    if (err) return Response.json({ err, profile: p }, { headers: cors });
  } else if (op === "refresh") {
    const err = refreshShop(p);
    if (err) return Response.json({ err, profile: p }, { headers: cors });
  } else if (op === "oath") {
    const err = setOath(p, String(body.oath || "none"));
    if (err) return Response.json({ err, profile: p }, { headers: cors });
  } else if (op === "chest") {
    const index = body.index | 0;
    const pick = parseChestPick(body.pick);
    if (!pick) return Response.json({ err: "Выбери, что забрать из сундука", profile: p }, { headers: cors });
    const r = claimChest(p, index, mulberry32((p.nextId * 997 + index * 13) >>> 0), pick);
    if ("err" in r) return Response.json({ err: r.err, profile: p }, { headers: cors });
    report = r;
  } else if (op === "claim") {
    const r = claimQuest(p, String(body.id || ""), rng);
    if ("err" in r) return Response.json({ err: r.err, profile: p }, { headers: cors });
    report = r;
  } else if (op === "upgrade") {
    const r = forgeItem(p, String(body.id || ""), body.at == null ? undefined : body.at | 0);
    if ("err" in r) return Response.json({ err: r.err, profile: p }, { headers: cors });
  } else if (op === "start") {
    const r = beginRun(p, body.floor | 0, Date.now(), undefined, false, body.diff | 0 || 1);
    if ("err" in r) return Response.json({ err: r.err, profile: p }, { headers: cors });
    await saveProfile(env.GAME_DB, key, p);
    return Response.json({ nonce: r.nonce, profile: p }, { headers: cors });
  } else if (op === "finish") {
    const r = finishRun(p, body, Date.now(), rng);
    if ("err" in r) return Response.json({ err: r.err, profile: p }, { headers: cors });
    report = r;
  } else return Response.json({ err: "bad_op" }, { status: 400, headers: cors });
  await saveProfile(env.GAME_DB, key, p);
  return Response.json({ profile: p, report, gold }, { headers: cors });
}

async function friendsOf(env: any, key: string) {
  const store = new FriendStore(env.GAME_DB);
  const ids: string[] = await store.friends(key);
  const out: { key: string; nick: string; hero: string | null; lvl: number; online: boolean }[] = [];
  for (const fk of ids.slice(0, 80)) {
    const uid = fk.startsWith("uid:") ? fk.slice(4) : "";
    let nick = uid ? "Игрок-" + uid.slice(-4) : fk.slice(0, 12);
    if (uid) {
      try {
        const row: any = await env.GAME_DB.prepare("SELECT username FROM users WHERE id = ?").bind(uid).first();
        if (row?.username) nick = String(row.username).slice(0, 24);
      } catch { /* нет таблицы users в локальной D1 */ }
    }
    let hero: string | null = null, lvl = 1;
    try {
      const row: any = await env.GAME_DB.prepare("SELECT hero, lvl FROM orda_saves WHERE pkey = ?").bind(fk).first();
      if (row) { hero = row.hero || null; lvl = row.lvl | 0 || 1; }
    } catch { /* миграция ещё не применена */ }
    out.push({ key: fk, nick, hero, lvl, online: false });
  }
  if (env.MUSOU_INDEX && out.length) {
    try {
      const stub = env.MUSOU_INDEX.get(env.MUSOU_INDEX.idFromName("index"));
      const res = await stub.fetch("https://internal/presence", { method: "POST", body: JSON.stringify({ keys: out.map((f) => f.key) }) });
      const body: any = await res.json().catch(() => ({}));
      const on = new Set<string>(body?.online || []);
      for (const f of out) f.online = on.has(f.key);
    } catch { /* индекс комнат недоступен */ }
  }
  return out;
}

async function invite(env: any, request: Request, key: string, body: any, cors: Record<string, string>) {
  const to = String(body.to || "");
  const code = String(body.code || "");
  if (!/^[\w:-]{4,80}$/.test(to) || !/^[A-HJ-NP-Z2-9]{6}$/.test(code)) return Response.json({ err: "bad" }, { status: 400, headers: cors });
  const store = new FriendStore(env.GAME_DB);
  const ids: string[] = await store.friends(key);
  if (!ids.includes(to)) return Response.json({ err: "Это не друг" }, { headers: cors });
  if (!env.MUSOU_INDEX) return Response.json({ err: "no_index" }, { status: 503, headers: cors });
  const stub = env.MUSOU_INDEX.get(env.MUSOU_INDEX.idFromName("index"));
  await stub.fetch("https://internal/invite", { method: "POST", body: JSON.stringify({ to, from: key, code }) });
  return Response.json({ ok: true }, { headers: cors });
}

