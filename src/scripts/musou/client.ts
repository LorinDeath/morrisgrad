// Хаб, лавка, отряд и бой «Орды Обители».
import {
  BAG_MAX, ENCH_NAME, FLOORS, HEROES, OATHS, PAPER_NAME, RARITY_COLOR, RARITY_NAME,
  affixText, bagFree, bagPrice, beginRun, buyOffer, chestChoices, claimChest, claimQuest, equipItem,
  finishRun, floorLock, floorNeed, floorOpen, goldFind, heroById, itemBlurb, itemPrice, mulberry32, newProfile,
  normalize, questViews, readyQuests, refreshCost, refreshShop, salvage, setBonus, setHero, setOath, takeInbox,
  sheet, shopOffers, spendStat, unequip, xpNeed,
  type ChestPick, type HeroId, type Item, type Paper, type Profile, type RunReport, type Stat,
} from "./rules";
import { Battle, type Btn } from "./sim";
import { drawBattle, drawPortrait, type Cam } from "./draw";
import { floorMut, getTune, setTune, validateTune } from "./tune";

const LOCAL = location.hostname === "localhost" || location.hostname === "127.0.0.1";
const SITE = location.hostname === "morrisgrad.com" || location.hostname === "www.morrisgrad.com";
const HTTP = (import.meta as any).env?.PUBLIC_MP_HTTP
  || (LOCAL ? "http://127.0.0.1:8787" : "https://morris-multiplayer.alexseylyou.workers.dev");
const WS = HTTP.replace(/^http/, "ws");
const SAVE = "orda.profile.v1";
const GUEST = "orda.guest";

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
let profile: Profile = newProfile(1);
let online = false;
let nick = "Гость";
let verified = false;
let view = "boot";
let floorPick = 1;
let selected: Item | null = null;
let battle: Battle | null = null;
let nonce = "";
let ended = false;
let cam: Cam = { x: 1200, y: 780 };
const keys = new Set<string>();
let pointerAim = 0;
let holding = false;
let dodgeQ = false;
let stick = { x: 0, y: 0, on: false };
let guest = localStorage.getItem(GUEST) || "";
if (guest.length < 16) {
  guest = crypto.randomUUID().replace(/-/g, "");
  localStorage.setItem(GUEST, guest);
}
let token = "";
let ws: WebSocket | null = null;
let room: { code: string; host: boolean; seats: { id: string; nick: string; hero: string }[] } | null = null;
let youId = "you";
let mirror = false;
let snapAcc = 0;
let toastT = 0;
let pingAt = 0;
let seenInv = "";

function show(name: string) {
  view = name;
  for (const id of ["v-boot", "v-pick", "v-hub", "v-fight", "v-result"]) {
    $("orda").querySelector("#" + id)?.classList.toggle("on", id === "v-" + name);
  }
  $<HTMLElement>("top").style.display = name === "fight" ? "none" : "";
  document.body.classList.toggle("in-fight", name === "fight");
}
function toast(t: string) {
  const el = $<HTMLElement>("toast");
  el.hidden = false;
  el.textContent = t;
  toastT = 3.2;
}
function saveLocal() { localStorage.setItem(SAVE, JSON.stringify(profile)); }
function loadLocal() {
  try { return normalize(JSON.parse(localStorage.getItem(SAVE) || "null")); } catch { return newProfile(1); }
}

async function clerkToken() {
  const C = await new Promise<any>((res) => {
    const t0 = Date.now();
    const tick = () => {
      const c = (window as any).Clerk;
      if (c?.loaded) return res(c);
      if (Date.now() - t0 > 2500) return res(null);
      setTimeout(tick, 50);
    };
    tick();
  });
  try {
    token = (await Promise.race([
      Promise.resolve(C?.session?.getToken?.() || ""),
      new Promise((r) => setTimeout(() => r(""), 2500)),
    ])) || "";
  } catch { token = ""; }
  const u = C?.user;
  if (u) nick = u.username || u.fullName || u.firstName || nick;
  verified = !!token;
}

async function api(path: string, body: any) {
  try {
    const res = await fetch(HTTP + path, {
      method: "POST",
      headers: { "content-type": "application/json", ...(token ? { authorization: "Bearer " + token } : {}) },
      body: JSON.stringify({ ...body, token, guest: token ? undefined : guest, nick }),
    });
    const data = await res.json().catch(() => null);
    return data;
  } catch { return null; }
}

async function act(body: any) {
  if (!online) return null;
  const data = await api("/musou/act", body);
  if (data?.profile) profile = normalize(data.profile);
  if (data?.err) toast(String(data.err));
  return data;
}

function fitCanvas(c: HTMLCanvasElement, minH: number) {
  const r = c.getBoundingClientRect();
  const w = Math.max(2, Math.round(r.width * devicePixelRatio));
  const h = Math.max(minH, Math.round(r.height * devicePixelRatio));
  if (c.width !== w || c.height !== h) { c.width = w; c.height = h; }
}
function paintPicks() {
  document.querySelectorAll<HTMLCanvasElement>("#pick-grid canvas").forEach((c) => {
    fitCanvas(c, 180);
    drawPortrait(c.getContext("2d")!, c.dataset.hero || "lorin", c.width, c.height, performance.now() / 1000);
  });
  const doll = $<HTMLCanvasElement>("doll");
  if (doll && profile.hero && view === "hub") {
    fitCanvas(doll, 200);
    drawPortrait(doll.getContext("2d")!, profile.hero, doll.width, doll.height, performance.now() / 1000);
  }
}

function renderPick() {
  const root = $<HTMLElement>("v-pick");
  root.innerHTML = `<p class="tag">Класс</p><h1>Кто сойдёт в подвал</h1><p class="lead">Восемь героев МоррисГрада. Класс выбирается здесь, до данжа. Уровень и очки растут в хабе, на этаже только бой.</p><div class="pick-grid" id="pick-grid"></div><div class="row" style="margin-top:14px"><button class="btn gold" id="pick-go" type="button" disabled>Войти в Обитель</button></div>`;
  const grid = $<HTMLElement>("pick-grid");
  let chosen: HeroId | null = profile.hero;
  for (const h of HEROES) {
    const card = document.createElement("button");
    card.type = "button";
    card.className = "hero-card" + (chosen === h.id ? " on" : "");
    card.innerHTML = `<canvas data-hero="${h.id}"></canvas><div class="tag">${h.faction}</div><h3>${h.name}</h3><div class="tag">${h.title}</div><p>${h.blurb}</p>`;
    card.onclick = () => {
      chosen = h.id;
      grid.querySelectorAll(".hero-card").forEach((el) => el.classList.remove("on"));
      card.classList.add("on");
      $<HTMLButtonElement>("pick-go").disabled = false;
    };
    grid.appendChild(card);
  }
  $<HTMLButtonElement>("pick-go").disabled = !chosen;
  $<HTMLButtonElement>("pick-go").onclick = async () => {
    if (!chosen) return;
    const err = setHero(profile, chosen);
    if (err) return toast(err);
    if (online) await act({ op: "hero", hero: chosen });
    else saveLocal();
    renderHub();
    show("hub");
  };
  requestAnimationFrame(paintPicks);
}

function slotHtml(it: Item | null, empty: string) {
  if (!it) return `<span>${empty}</span>`;
  const col = RARITY_COLOR[it.rarity];
  const mark = it.cursed ? " · проклята" : it.ench ? " · " + ENCH_NAME[it.ench - 1] : "";
  return `<i style="color:${col}">${RARITY_NAME[it.rarity]}${mark}</i><b style="color:${col}">${it.name}</b>`;
}

function renderHub() {
  const s = sheet(profile);
  const hero = heroById(profile.hero);
  const openF = floorPick;
  const quests = questViews(profile, openF);
  const ready = readyQuests(profile);
  const set = setBonus(profile);
  const root = $<HTMLElement>("v-hub");
  root.innerHTML = `
  <div class="hub">
    <section class="panel">
      <h2>${hero.name}</h2>
      <div class="tag">${hero.title} · ${hero.faction}</div>
      <div class="doll-wrap"><canvas id="doll"></canvas></div>
      <div class="stat"><span>Уровень</span><b>${profile.lvl}</b></div>
      <div class="bar" title="опыт"><i style="width:${Math.min(100, profile.xp / xpNeed(profile.lvl) * 100)}%"></i></div>
      <div class="stat"><span>Золото</span><b>${profile.gold}</b></div>
      <div class="stat"><span>Сумка</span><b class="${bagFree(profile) ? "" : "full"}">${profile.bag.length}/${profile.bagSize}</b></div>
      ${profile.inbox.length ? `<div class="stat"><span>У входа</span><b>${profile.inbox[0].name}</b></div><div class="row"><button class="btn" id="in-bag" type="button">В сумку</button><button class="btn" id="in-sell" type="button">Продать</button><button class="btn" id="in-drop" type="button">Оставить</button></div>` : ""}
      ${(["str", "dex", "vit", "ene"] as Stat[]).map((k) => {
        const name = { str: "Сила", dex: "Ловкость", vit: "Живучесть", ene: "Энергия" }[k];
        const base = hero.base[k] + profile.alloc[k];
        return `<div class="stat"><span>${name}</span><span><b>${base}</b> ${profile.unspent ? `<button class="plus" data-stat="${k}" type="button">+</button>` : ""}</span></div>`;
      }).join("")}
      <p class="derived">Свободно очков: ${profile.unspent}. Урон ${s.dmg} · здоровье ${s.hp} · крит ${Math.round(s.crit * 100)}% · атака ×${s.aspd.toFixed(2)} · броня ${s.armor} · вампиризм ${Math.round(s.ls * 100)}% · золото с этажа +${Math.round(s.gold * 100)}%${set.got.map((g) => `<br>${g.name}: ${g.text}`).join("")}</p>
      <div class="row"><button class="btn" id="open-shop" type="button">Лавка</button><button class="btn" id="open-party" type="button">Отряд</button><button class="btn" id="open-friends" type="button">Друзья</button></div>
    </section>
    <section class="panel">
      <h2>Кампания подвала</h2>
      <p class="derived">Данж открывает уровень героя, не галочка прошлого этажа. Сейчас уровень ${profile.lvl}.</p>
      <div class="campaign">${FLOORS.map((f) => {
        const why = floorLock(profile, f.n);
        const clr = (profile.clears[f.n - 1] || 0) > 0;
        return `<button type="button" class="dungeon${f.n === openF ? " on" : ""}${why ? " lock" : ""}${clr ? " clear" : ""}" data-floor="${f.n}"><span class="n">${f.n}</span><span class="dn"><b>${f.name}</b><small>ур. ${floorNeed(f.n)} · ${f.place}${why ? " · закрыт" : clr ? " · зачищен" : " · открыт"}</small></span></button>`;
      }).join("")}</div>
      <p class="dungeon-lead"><b>${FLOORS[openF - 1].name}</b> — ${FLOORS[openF - 1].desc}</p>
      <p>Ярусы: ${FLOORS[openF - 1].stages.join(" → ")}. Толпа «${FLOORS[openF - 1].mob}». Генерал ${FLOORS[openF - 1].general}. Босс: ${FLOORS[openF - 1].boss}, ${FLOORS[openF - 1].bossTitle}.${floorMut(openF) ? ` Мутация «${floorMut(openF)!.name}» ×${floorMut(openF)!.mult}.` : ""}</p>
      ${floorLock(profile, openF) ? `<p class="lock-why">${floorLock(profile, openF)}</p>` : ""}
      <p class="derived">Режим на этот заход. Клятва меняет бой. Кубок списывает ${getTune().oath.stake} зл до старта.</p>
      <div class="row modes">${OATHS.map((o) => `<button type="button" class="btn${profile.oath === o.id ? " gold" : ""}" data-oath="${o.id}" title="${o.note}">${o.name}</button>`).join("")}</div>
      <p class="derived" id="oath-note">${OATHS.find((o) => o.id === profile.oath)?.note || ""}</p>
      <div class="row" style="margin-bottom:12px"><button class="btn gold" id="go-floor" type="button" ${floorOpen(profile, openF) ? "" : "disabled"}>${floorOpen(profile, openF) ? `В бой · ${FLOORS[openF - 1].name}` : `Закрыто до уровня ${floorNeed(openF)}`}</button></div>
      ${quests.map((q) => `<div class="quest${q.ready ? " ready" : ""}"><b>${q.name}</b><span>${q.desc}</span><div class="bar"><i style="width:${Math.min(100, q.p / q.need * 100)}%"></i></div><span>${q.p}/${q.need}${q.ready ? " · награда готова" : ""}</span>${q.ready ? `<div class="row"><button class="btn gold" data-claim="${q.id}" type="button">Забрать</button></div>` : ""}</div>`).join("")}
      ${ready.filter((q) => q.floor !== openF && q.floor !== 0).map((q) => `<div class="quest ready"><b>${q.name}</b><button class="btn gold" data-claim="${q.id}" type="button">Забрать награду</button></div>`).join("")}
    </section>
    <section class="panel">
      <div class="bag-head"><h2>Сумка</h2><span>${bagFree(profile) ? "есть место" : "полна"}</span></div>
      <div class="paper">${(["weapon", "helm", "chest", "gloves", "boots", "amulet", "ring1", "ring2"] as Paper[]).map((sl) => `<button type="button" class="pslot" data-paper="${sl}" style="border-color:${profile.equip[sl] ? RARITY_COLOR[profile.equip[sl]!.rarity] : ""}">${slotHtml(profile.equip[sl], PAPER_NAME[sl])}</button>`).join("")}</div>
      <div class="grid">${Array.from({ length: profile.bagSize }, (_, i) => {
        const it = profile.bag[i];
        return `<button type="button" class="slot${it && selected?.id === it.id ? " sel" : ""}${it ? "" : " empty"}" data-item="${it?.id || ""}" style="border-color:${it ? RARITY_COLOR[it.rarity] : ""}">${it ? slotHtml(it, "") : ""}</button>`;
      }).join("")}</div>
      <div class="tip" id="tip">${tipHtml(selected)}</div>
      <div class="row">
        <button class="btn" id="equip" type="button">Надеть</button>
        <button class="btn" id="sell" type="button">Продать</button>
        <button class="btn" id="unequip" type="button">Снять</button>
      </div>
      <p class="derived">Предел сумки — ${BAG_MAX}. Расширение продаётся в лавке, не в бою.</p>
    </section>
  </div>`;
  root.querySelectorAll<HTMLButtonElement>("[data-floor]").forEach((b) => b.onclick = () => { floorPick = Number(b.dataset.floor); renderHub(); });
  root.querySelectorAll<HTMLButtonElement>("[data-oath]").forEach((b) => b.onclick = async () => {
    const id = b.dataset.oath || "none";
    if (online) {
      const r = await act({ op: "oath", oath: id });
      if (r?.err) return;
      renderHub();
    } else {
      const err = setOath(profile, id);
      if (err) toast(err); else { saveLocal(); renderHub(); }
    }
  });
  root.querySelectorAll<HTMLButtonElement>("[data-stat]").forEach((b) => b.onclick = async () => {
    const stat = b.dataset.stat as Stat;
    if (online) { const r = await act({ op: "stat", stat }); if (!r?.err) renderHub(); }
    else { const err = spendStat(profile, stat); if (err) toast(err); else { saveLocal(); renderHub(); } }
  });
  root.querySelectorAll<HTMLButtonElement>("[data-claim]").forEach((b) => b.onclick = async () => {
    const id = b.dataset.claim!;
    if (online) {
      const r = await act({ op: "claim", id });
      if (r?.report) toast(rewardLine(r.report));
      renderHub();
    } else {
      const r = claimQuest(profile, id, mulberry32((Date.now() ^ profile.nextId) >>> 0));
      if ("err" in r) toast(r.err);
      else { saveLocal(); toast(rewardLine(r)); renderHub(); }
    }
  });
  root.querySelectorAll<HTMLButtonElement>("[data-item]").forEach((b) => b.onclick = () => {
    selected = profile.bag.find((it) => it.id === b.dataset.item) || null;
    renderHub();
  });
  let paper: Paper | null = null;
  root.querySelectorAll<HTMLButtonElement>("[data-paper]").forEach((b) => b.onclick = () => {
    paper = b.dataset.paper as Paper;
    selected = null;
    const it = profile.equip[paper];
    $<HTMLElement>("tip").innerHTML = it ? tipHtml(it) + `<div class="tag">Надето · ${PAPER_NAME[paper!]}</div>` : "Пустой слот";
  });
  $<HTMLButtonElement>("equip").onclick = async () => {
    if (!selected) return;
    if (online) { await act({ op: "equip", id: selected.id }); selected = null; renderHub(); }
    else { const err = equipItem(profile, selected.id); if (err) toast(err); else { selected = null; saveLocal(); renderHub(); } }
  };
  $<HTMLButtonElement>("sell").onclick = async () => {
    if (!selected) return toast("Выбери вещь в сумке");
    if ((selected.rarity === "rare" || selected.rarity === "legendary" || selected.rarity === "set") && !confirm("Продать редкую вещь? Это нельзя отменить.")) return;
    if (online) { const r = await act({ op: "salvage", id: selected.id }); selected = null; if (r?.gold) toast("+" + r.gold + " золота"); renderHub(); }
    else {
      const r = salvage(profile, selected.id);
      selected = null;
      if ("err" in r) toast(r.err); else { saveLocal(); toast("+" + r.gold + " золота"); }
      renderHub();
    }
  };
  $<HTMLButtonElement>("unequip").onclick = async () => {
    if (!paper) return toast("Выбери слот на кукле");
    if (online) { await act({ op: "unequip", slot: paper }); renderHub(); }
    else { const err = unequip(profile, paper); if (err) toast(err); else { saveLocal(); renderHub(); } }
  };
  $<HTMLButtonElement>("open-shop").onclick = () => openShop();
  const inbox = async (mode: "bag" | "sell" | "drop") => {
    if (mode === "sell" && profile.inbox[0] && !confirm("Продать редкую вещь у входа?")) return;
    if (online) { const r = await act({ op: "inbox", mode }); if (r?.err) toast(r.err); renderHub(); }
    else {
      const r = takeInbox(profile, mode);
      if ("err" in r) toast(r.err); else saveLocal();
      renderHub();
    }
  };
  $<HTMLButtonElement>("in-bag") && ($<HTMLButtonElement>("in-bag").onclick = () => inbox("bag"));
  $<HTMLButtonElement>("in-sell") && ($<HTMLButtonElement>("in-sell").onclick = () => inbox("sell"));
  $<HTMLButtonElement>("in-drop") && ($<HTMLButtonElement>("in-drop").onclick = () => inbox("drop"));
  $<HTMLButtonElement>("open-party").onclick = () => openParty();
  $<HTMLButtonElement>("open-friends").onclick = () => openFriends();
  $<HTMLButtonElement>("go-floor").onclick = () => startSolo(openF);
  paintPills();
  $<HTMLElement>("net-pill").classList.toggle("warn", !online);
  requestAnimationFrame(paintPicks);
}

function tipHtml(it: Item | null) {
  if (!it) return "Выбери вещь. Редкость видна рамкой, как в Диабло: серое, синее, жёлтое, оранжевое, зелёный комплект.";
  const tune = getTune();
  const curse = it.cursed ? `<div class="tag">Проклята: статы вещи ×${tune.curse.statMult}, шаг ×${tune.curse.speed}. Надетая вещь режет скорость всего героя.</div>` : "";
  const tier = it.ench ? ENCH_NAME[it.ench - 1] : "";
  const ench = it.ench ? `<div class="tag">${tier}: статы вещи ×${tune.ench.stat[it.ench - 1]}, шаг ×${tune.ench.speed[it.ench - 1]}. Чем выше ярус, тем тяжелее шаг.</div>` : "";
  return `<b style="color:${RARITY_COLOR[it.rarity]}">${it.name}</b><div>${itemBlurb(it)} · ${itemPrice(it)} зл если продать за ${Math.round(itemPrice(it) * 0.4)}</div>${it.affixes.map((a) => `<div class="aff">${affixText(a)}</div>`).join("")}${it.set ? `<div class="tag">комплект</div>` : ""}${curse}${ench}`;
}
function rewardLine(r: any) {
  const item = r.item;
  const bit = item ? (item.sold ? `${item.item.name} не влезла и ушла в золото (+${item.gold})` : item.item.name) : "";
  return `+${r.gold} зл, +${r.xp} опыта${r.levels ? ", уровень вырос" : ""}${bit ? ". " + bit : ""}`;
}

function openModal(html: string) {
  const m = $<HTMLElement>("modal");
  m.hidden = false;
  m.innerHTML = `<div class="modal-card">${html}</div>`;
  m.onclick = (e) => {
    const t = e.target as HTMLElement;
    if (t === m || t.closest("[data-close]")) closeModal();
  };
}
function closeModal() { $<HTMLElement>("modal").hidden = true; }

function openShop() {
  const offers = shopOffers(profile);
  openModal(`<div class="row" style="justify-content:space-between"><h2 style="font-family:Cinzel,serif;color:var(--gold-2);margin:0">Лавка у порога</h2><button class="btn" id="shop-x" data-close type="button">Закрыть</button></div>
  <p>Золото ${profile.gold}. Сумка ${profile.bag.length}/${profile.bagSize}. Обновить витрину — ${refreshCost(profile)} зл. Ранг сумки даёт +3% золота с этажей (сейчас +${Math.round(goldFind(profile) * 100)}%).</p>
  <div class="shop-grid">${offers.map((o) => o.kind === "bag"
    ? `<article class="offer bag"><h3>${o.name}</h3><p>${o.detail}</p><button class="btn gold" data-buy="${o.id}" type="button" ${profile.gold < o.price ? "disabled" : ""}>Купить · ${o.price} зл</button></article>`
    : `<article class="offer"><h3 style="color:${RARITY_COLOR[o.item.rarity]}">${o.item.name}</h3><p>${itemBlurb(o.item)}</p>${o.item.affixes.map((a) => `<div class="aff">${affixText(a)}</div>`).join("")}<button class="btn gold" data-buy="${o.id}" type="button" ${profile.gold < o.price || bagFree(profile) < 1 ? "disabled" : ""}>${o.price} зл</button></article>`).join("")}</div>
  <div class="row" style="margin-top:10px"><button class="btn" id="shop-refresh" type="button">Обновить витрину</button></div>`);
  $<HTMLButtonElement>("shop-x").onclick = closeModal;
  $<HTMLButtonElement>("shop-refresh").onclick = async () => {
    if (online) { await act({ op: "refresh" }); openShop(); }
    else { const err = refreshShop(profile); if (err) toast(err); else { saveLocal(); openShop(); } }
  };
  document.querySelectorAll<HTMLButtonElement>("[data-buy]").forEach((b) => b.onclick = async () => {
    const id = b.dataset.buy!;
    if (online) { await act({ op: "buy", id }); openShop(); renderHub(); }
    else {
      const err = buyOffer(profile, id);
      if (err) toast(err); else { saveLocal(); toast("Куплено"); openShop(); renderHub(); }
    }
  });
}

function openParty() {
  openModal(`<div class="row" style="justify-content:space-between"><h2 style="font-family:Cinzel,serif;color:var(--gold-2);margin:0">Отряд</h2><button class="btn" id="room-x" data-close type="button">Закрыть</button></div>
  <p>До четырёх героев в одной комнате. Хост ведёт толпу, остальные бьют вместе с ним. Друзей зови из списка — он с аккаунта сайта.</p>
  <div class="row"><button class="btn gold" id="room-new" type="button">Создать комнату</button><input id="room-code" placeholder="код" maxlength="6" style="background:#10080c;border:1px solid var(--line);padding:8px;width:120px"><button class="btn" id="room-join" type="button">Войти</button></div>
  <div id="room-box"></div>`);
  $<HTMLButtonElement>("room-x").onclick = closeModal;
  $<HTMLButtonElement>("room-new").onclick = async () => {
    const r = await api("/musou/new", { pub: true });
    if (!r?.code) return toast(online ? "Сервер комнат не отвечает" : "Комнаты откроются, когда игровой сервер на связи");
    connect(r.code);
  };
  $<HTMLButtonElement>("room-join").onclick = () => {
    const code = $<HTMLInputElement>("room-code").value.trim().toUpperCase();
    if (code.length < 4) return toast("Нужен код комнаты");
    connect(code);
  };
}

function openFriends() {
  openModal(`<div class="row" style="justify-content:space-between"><h2 style="font-family:Cinzel,serif;color:var(--gold-2);margin:0">Друзья</h2><button class="btn" id="fr-x" data-close type="button">Закрыть</button></div><div id="fr-box">Загрузка…</div>`);
  $<HTMLButtonElement>("fr-x").onclick = closeModal;
  if (!verified) {
    $<HTMLElement>("fr-box").innerHTML = `<p>Список берётся из входа на сайте. <button class="btn gold" id="signin" type="button">Войти</button></p>`;
    $<HTMLButtonElement>("signin").onclick = () => {
      const C = (window as any).Clerk;
      if (C?.openSignIn) C.openSignIn();
      else location.href = "/";
    };
    return;
  }
  api("/musou/friends", {}).then((r) => {
    const list = r?.friends || [];
    $<HTMLElement>("fr-box").innerHTML = list.length ? list.map((f: any) => `<div class="stat"><span>${f.nick}${f.online ? " · в Орде" : ""}</span>${room ? `<button class="btn" data-inv="${f.key}" type="button">Позвать</button>` : ""}</div>`).join("") : "<p>Пока никого. Друзья те же, что в «Проклятых».</p>";
    document.querySelectorAll<HTMLButtonElement>("[data-inv]").forEach((b) => b.onclick = async () => {
      const res = await api("/musou/invite", { to: b.dataset.inv, code: room?.code });
      toast(res?.err ? String(res.err) : "Приглашение отправлено");
    });
  });
}

let dropTry = 0;
async function connect(code: string, fromDrop = false) {
  if (!fromDrop) dropTry = 0;
  if (ws) { try { ws.close(); } catch { /* */ } }
  const sock = new WebSocket(WS + "/musou/m/" + code);
  ws = sock;
  sock.onopen = () => sock.send(JSON.stringify({ type: "hello", token, guest: token ? undefined : guest, nick }));
  sock.onclose = () => {
    if (ws !== sock || view !== "fight" || !room) return;
    if (dropTry >= 2) return;
    dropTry++;
    setTimeout(() => connect(code, true), 400);
  };
  ws.onmessage = (ev) => {
    const m = JSON.parse(ev.data);
    if (m.type === "you") { youId = m.id; room = { code, host: !!m.host, seats: [] }; }
    if (m.type === "lobby") {
      room = { code: m.code, host: m.hostId === youId, seats: m.seats };
      const box = $<HTMLElement>("room-box");
      const need = m.need | 0;
      const low = (m.seats as { nick: string; lvl?: number }[]).filter((s) => (s.lvl | 0) < need);
      if (box) box.innerHTML = `<p>Код <b>${m.code}</b>. ${FLOORS[(m.floor | 0) - 1]?.name || "Данж"} · нужен уровень ${need} у каждого.</p><ul class="seat-list">${m.seats.map((s: any) => `<li>${s.nick} · ур. ${s.lvl | 0}${(s.lvl | 0) < need ? " · не дотягивает" : ""}</li>`).join("")}</ul>${room.host ? `<div class="row"><button class="btn gold" id="room-start" type="button" ${low.length ? "disabled" : ""}>Начать данж</button></div>${low.length ? `<p class="lock-why">В группе не хватает уровня: ${low.map((s) => s.nick).join(", ")}.</p>` : ""}` : "<p>Ждём хоста. Уровень группы проверяет сервер.</p>"}`;
      $<HTMLButtonElement>("room-start") && ($<HTMLButtonElement>("room-start").onclick = () => ws?.send(JSON.stringify({ type: "start" })));
    }
    if (m.type === "err") toast(m.err || "Ошибка комнаты");
    if (m.type === "go") {
      if (!(battle && nonce === m.nonce && view === "fight")) {
        closeModal();
        mirror = false;
        nonce = m.nonce;
        const members = m.party.map((p: any) => ({ id: p.id, name: p.nick, hero: p.hero, sheet: p.sheet }));
        beginBattle(m.floor, members, m.seed || 1, true);
      }
    }
    if (m.type === "who" && battle) battle.applyWho(m.id, m.x, m.y, m.aim);
    if (m.type === "elite" && battle) battle.applyElites(m.elites || []);
    if (m.type === "boom" && battle) {
      const me = battle.party.find((p) => p.id === youId);
      if (me && inBoom(me.x, me.y, m) && me.iframe <= 0) {
        me.hp = Math.max(0, me.hp - 14);
        me.hurt = 0.3;
        me.iframe = 0.45;
      }
    }
    if (m.type === "loot") {
      if (m.profile) profile = normalize(m.profile);
      showResult(m.report, battle?.phase || "won");
    }
  };
  ws.onerror = () => toast("Комната не открылась");
}

function applyPublished(raw: unknown) {
  const v = validateTune(raw);
  if (v.ok) setTune(v.tune);
}

async function pullTune() {
  if (!(LOCAL || SITE)) return;
  try {
    const r = await fetch(HTTP + "/musou/tune", { method: "GET" });
    if (!r.ok) return;
    const j = await r.json();
    applyPublished(j?.tune);
  } catch { /* воркер молчит — остаются числа по умолчанию, без повторных ошибок */ }
}

async function startSolo(floor: number) {
  const lock = floorLock(profile, floor);
  if (lock) return toast(lock);
  await pullTune();
  mirror = false;
  youId = "you";
  if (online) {
    const r = await act({ op: "start", floor });
    if (r?.nonce) {
      nonce = r.nonce;
      beginBattle(floor, [{ id: "you", name: nick, hero: profile.hero || "lorin", sheet: sheet(profile) }], (Date.now() % 99991) + 1, false);
      return;
    }
    if (r?.err) return;
    online = false;
    toast("Сервер не ответил. Этот забег сохранится на устройстве.");
    $<HTMLElement>("net-pill").textContent = "сеть молчит";
    $<HTMLElement>("net-pill").classList.add("warn");
  }
  {
    const b = beginRun(profile, floor, Date.now());
    if ("err" in b) return toast(b.err);
    nonce = b.nonce;
    saveLocal();
    beginBattle(floor, [{ id: "you", name: nick, hero: profile.hero || "lorin", sheet: sheet(profile) }], (Date.now() % 99991) + 1, false);
  }
}

function beginBattle(floor: number, members: { id: string; name: string; hero: HeroId; sheet: any }[], seed: number, remote: boolean) {
  battle = new Battle(floor, members, seed);
  battle.mirror = false;
  battle.remote = remote;
  battle.localId = youId || members[0].id;
  ended = false;
  const me = members.find((m) => m.id === youId) || members[0];
  cam = { x: 1200, y: 780 };
  youId = me.id;
  buildSkills(me.hero);
  show("fight");
  requestAnimationFrame(() => { resize(); resize(); });
}

function buildSkills(heroId: HeroId) {
  const hero = heroById(heroId);
  $<HTMLElement>("skills").innerHTML = hero.skills.map((sk, i) => `<button type="button" class="skill" data-sk="${i + 1}"><small>${sk.key}</small><b>${sk.name}</b><i class="cd" hidden></i></button>`).join("");
  document.querySelectorAll<HTMLButtonElement>(".skill").forEach((b) => {
    b.onclick = () => { holding = false; queueSkill(Number(b.dataset.sk)); };
  });
  hero.skills.forEach((sk, i) => {
    const b = document.getElementById("m-sk" + (i + 1));
    if (b) b.textContent = sk.key + " " + sk.name;
  });
}

let queued = 0;
let heavyQ = false;
let chestQ = false;

function inBoom(x: number, y: number, m: any) {
  const dx = x - m.x, dy = y - m.y;
  const r = m.r || 100;
  if (m.sig === "line") {
    const along = dx * Math.cos(m.facing || 0) + dy * Math.sin(m.facing || 0);
    const side = Math.abs(-dx * Math.sin(m.facing || 0) + dy * Math.cos(m.facing || 0));
    return along > 0 && along < r && side < 34;
  }
  if (m.sig === "cone") {
    if (dx * dx + dy * dy > r * r) return false;
    let d = Math.atan2(dy, dx) - (m.facing || 0);
    while (d > Math.PI) d -= Math.PI * 2;
    while (d < -Math.PI) d += Math.PI * 2;
    return Math.abs(d) <= 1.05;
  }
  return Math.hypot(dx, dy) < r;
}
function queueSkill(n: number) { queued = n; }

function readBtn(): Partial<Btn> {
  const mx = (keys.has("a") || keys.has("arrowleft") ? -1 : 0) + (keys.has("d") || keys.has("arrowright") ? 1 : 0) + stick.x;
  const my = (keys.has("w") || keys.has("arrowup") ? -1 : 0) + (keys.has("s") || keys.has("arrowdown") ? 1 : 0) + stick.y;
  const skill = queued;
  const heavy = heavyQ || keys.has("k");
  queued = 0;
  heavyQ = false;
  const dodge = dodgeQ || keys.has(" ");
  dodgeQ = false;
  const chest = chestQ || keys.has("g");
  chestQ = false;
  return { mx, my, aim: pointerAim, light: holding || keys.has("j"), heavy, skill, dodge, chest };
}

function resize() {
  const c = $<HTMLCanvasElement>("field");
  if (!c) return;
  const dpr = Math.min(1.75, devicePixelRatio || 1);
  c.width = Math.max(2, c.clientWidth * dpr);
  c.height = Math.max(2, c.clientHeight * dpr);
}

function hud() {
  if (!battle) return;
  const me = battle.party.find((p) => p.id === youId) || battle.party[0];
  const hpNow = Math.max(0, Math.ceil(me.hp));
  $<HTMLElement>("hp").style.width = (me.maxHp > 0 ? hpNow / me.maxHp * 100 : 0) + "%";
  $<HTMLElement>("hp-num").textContent = hpNow + " / " + me.maxHp;
  $<HTMLElement>("ms").style.width = me.musou + "%";
  const f = battle.floor;
  const wave = battle.wave < 3 ? (f.stages[battle.wave] || `Волна ${battle.wave + 1}`) : "Босс";
  $<HTMLElement>("obj").innerHTML = `<b>${f.name}</b><div>${wave} · тварей ${battle.kills} · генералов ${battle.genKills}${battle.bossDown ? " · босс пал" : ""}</div>`;
  $<HTMLButtonElement>("pause-btn").hidden = !!battle.remote;
  const chest = $<HTMLElement>("chest-hint");
  if (chest) chest.hidden = !battle.nearChest;
  $<HTMLElement>("party").innerHTML = battle.party.map((p) => `<div><b>${p.name.split(" ")[0]}</b><div class="bar"><i style="width:${Math.max(0, p.hp / p.maxHp * 100)}%"></i></div></div>`).join("");
  const hero = heroById(me.hero);
  document.querySelectorAll<HTMLButtonElement>(".skill, .skill-touch").forEach((b) => {
    const i = Number(b.dataset.sk) - 1;
    const cd = me.cd[i] || 0;
    const musouLock = !!hero.skills[i]?.musou && me.musou < 100;
    const veil = b.querySelector(".cd") as HTMLElement | null;
    if (veil) veil.hidden = cd <= 0 && !musouLock;
    b.disabled = cd > 0 || musouLock;
    b.classList.toggle("cooling", cd > 0 || musouLock);
  });
}

function showResult(report: RunReport | null, phase: string, reason?: RunReport["reason"], err?: string) {
  battle = null;
  $<HTMLElement>("pause").hidden = true;
  show("result");
  const why = report?.reason || reason || (phase === "won" ? "win" : "dead");
  const title = why === "win" ? "Этаж зачищен" : why === "surrender" ? "Сдача" : "Поражение";
  const items = report && "items" in report ? report.items : [];
  const pay = report && "gold" in report ? (report.gold > 0 ? `+${report.gold} золота. ` : "Золота за этот исход нет. ") + (report.note || "") : (err ? `Награда не засчитана: ${err}.` : "Награда не засчитана.");
  paintPills();
  const xpLine = report && "xp" in report ? `Уровень ${profile.lvl}${report.levels ? ` · новых ${report.levels}` : ""}. Опыт хода: ${report.xp}.` : `Уровень ${profile.lvl}.`;
  $<HTMLElement>("v-result").innerHTML = `<article class="result-card"><p class="tag">${why === "win" ? "Победа" : why === "surrender" ? "Выход" : "Падение"}</p><h2>${title}</h2>
  <p class="lvl-line">${xpLine}</p>
  <p>${pay} Квесты, которые уже выполнены, сдаются в хабе и тоже дают уровень.</p>
  <div class="result-grid">${items.map((n) => `<article class="loot${n.sold ? " sold" : ""}" style="border-color:${RARITY_COLOR[n.item.rarity]}"><b style="color:${RARITY_COLOR[n.item.rarity]}">${n.item.name}</b><div>${itemBlurb(n.item)}</div>${n.held ? "<div>Редкая вещь ждёт у входа в хаб — сумка была полна.</div>" : n.sold ? `<div>Обычная вещь не влезла и ушла за ${n.gold} золота.</div>` : n.item.affixes.map((a) => `<div class="aff">${affixText(a)}</div>`).join("")}</article>`).join("") || "<p>Трофеев нет. Генералы и босс оставляют вещь, если сумка пускает.</p>"}</div>
  <div class="row" style="margin-top:14px"><button class="btn gold" id="back-hub" type="button">В хаб</button></div></article>`;
  $<HTMLButtonElement>("back-hub").onclick = () => { renderHub(); show("hub"); };
}

async function endFight() {
  if (ended || !battle) return;
  ended = true;
  const b = battle;
  const reason = b.reason === "surrender" ? "surrender" : b.phase === "won" && b.bossDown ? "win" : "dead";
  if (mirror) return;
  if (ws && ws.readyState === 1 && room) {
    ws.send(JSON.stringify({ type: "end", nonce, reason }));
    return;
  }
  if (online) {
    const r = await act({ op: "finish", nonce, kills: b.kills, generals: b.genKills, boss: reason === "win", reason, party: b.party.length });
    showResult(r?.report || null, b.phase, reason, r?.err);
  } else {
    const r = finishRun(profile, { nonce, kills: b.kills, generals: b.genKills, boss: reason === "win", reason, party: 1 }, Date.now(), mulberry32((Date.now() ^ b.kills) >>> 0));
    if (!("err" in r)) saveLocal();
    showResult("err" in r ? null : r, b.phase, reason);
    if ("err" in r) toast(r.err);
  }
}

function loop(now: number) {
  const prev = (loop as any).last as number | undefined;
  const dt = Math.min(0.05, ((prev == null ? 16 : now - prev) || 16) / 1000);
  (loop as any).last = now;
  try { frame(now, dt); }
  catch (err) { console.error(err); }
  requestAnimationFrame(loop);
}
function frame(now: number, dt: number) {
  if (toastT > 0) { toastT -= dt; if (toastT <= 0) $<HTMLElement>("toast").hidden = true; }
  if (online && view !== "fight" && now - pingAt > 8000) {
    pingAt = now;
    api("/musou/ping", {}).then((r) => {
      const code = r?.invite?.code;
      if (code && code !== seenInv) { seenInv = code; toast("Друг зовёт в комнату " + code + ". Открой «Отряд» и введи код."); }
    });
  }
  if (view === "fight" && battle) {
    const me = battle.party.find((p) => p.id === youId) || battle.party[0];
    battle.press(youId, readBtn());
    battle.step(dt);
    for (const id of battle.takeChests()) grantChest(id);
    cam.x += (me.x - cam.x) * 0.12;
    cam.y += (me.y - cam.y) * 0.12;
    if (battle.remote && ws && ws.readyState === 1 && room) {
      snapAcc += dt;
      if (snapAcc > 0.1) {
        snapAcc = 0;
        ws.send(JSON.stringify({ type: "pos", x: me.x, y: me.y, aim: me.aim }));
        for (const h of battle.takeHits()) ws.send(JSON.stringify({ type: "hit", id: h.id, kind: h.kind }));
      }
    }
    const c = $<HTMLCanvasElement>("field");
    const ctx = c.getContext("2d");
    if (ctx) drawBattle(ctx, battle, c.width, c.height, cam, now);
    hud();
    if (!ended && (battle.phase === "won" || battle.phase === "lost")) endFight();
  } else if (view === "hub" || view === "pick") {
    if ((now / 50 | 0) % 2 === 0) paintPicks();
  }
}

function aimFrom(ev: { clientX: number; clientY: number }) {
  const c = $<HTMLCanvasElement>("field");
  const r = c.getBoundingClientRect();
  const sx = (ev.clientX - r.left) * (c.width / r.width);
  const sy = (ev.clientY - r.top) * (c.height / r.height);
  const zoom = Math.min(c.width, c.height) / 820;
  const x = (sx - c.width / 2) / zoom + cam.x;
  const y = (sy - c.height * 0.58) / (zoom * 0.78) + cam.y;
  const me = battle?.party.find((p) => p.id === youId);
  if (!me) return;
  pointerAim = Math.atan2(y - me.y, x - me.x);
}

const chestWait: number[] = [];

function chestSeed(index: number) {
  return mulberry32((profile.nextId * 997 + index * 13) >>> 0);
}

function grantChest(index: number) {
  if (document.getElementById("chest-card")) { chestWait.push(index); return; }
  if (!profile.pending) return;
  const view = chestChoices(profile, index, chestSeed(index));
  if ("err" in view) { toast(view.err); return; }
  if (battle && !battle.remote) battle.paused = true;
  const it = view.item;
  const line = (stat: number, speed: number) => `статы ×${stat}, шаг ×${speed}`;
  openModal(`<div id="chest-card"><h2 style="font-family:Cinzel,serif;color:var(--gold-2);margin:0 0 8px">Сундук этажа</h2>
  <p>Внутри ${it.name}. Забрать как есть, проклясть или выбрать ярус чар. Проклятие и чары меняют надетую вещь сразу: сила растёт, шаг тяжелеет. Это не тост — без выбора вещь не попадает в сумку.</p>
  <div class="shop-grid">
    <article class="offer"><h3>${it.name}</h3><p>Как есть. Скорость героя не режется этой вещью.</p><button class="btn gold" type="button" data-pick="plain">Забрать как есть</button></article>
    <article class="offer"><h3>Проклясть</h3><p>${line(view.curse.stat, view.curse.speed)}. Вещь станет сильнее и будет тормозить героя, пока надета.</p><button class="btn" type="button" data-pick="curse">Проклясть и взять</button></article>
    ${view.tiers.map((t) => `<article class="offer"><h3>${t.name}</h3><p>Ярус ${t.n}. ${line(t.stat, t.speed)}. ${t.n === 6 ? "Чёрный ярус Проклятых: статы ×10, шаг едва тянется." : "Чем выше ярус, тем дороже шаг."}</p><button class="btn" type="button" data-pick="${t.n}">Взять «${t.name}»</button></article>`).join("")}
  </div></div>`);
  document.querySelectorAll<HTMLButtonElement>("#chest-card [data-pick]").forEach((b) => b.onclick = () => {
    const pick = (b.dataset.pick === "plain" || b.dataset.pick === "curse" ? b.dataset.pick : Number(b.dataset.pick)) as ChestPick;
    void takeChest(index, pick);
  });
}

async function takeChest(index: number, pick: ChestPick) {
  let note: { item: Item } | { err: string } | null = null;
  if (online) {
    const data = await act({ op: "chest", index, pick });
    if (!data) {
      toast("Сервер не принял выбор. Сундук ещё закрыт.");
      return;
    }
    if (data.err) return;
    note = data.report || null;
  } else {
    const got = claimChest(profile, index, chestSeed(index), pick);
    saveLocal();
    if ("err" in got) { toast(got.err); return; }
    note = got;
  }
  closeModal();
  if (battle && !battle.remote) battle.paused = false;
  const item = note && "item" in note ? note.item : null;
  if (item?.name) toast("В сумке: " + item.name);
  const next = chestWait.shift();
  if (next != null) grantChest(next);
}

function openFloor() {
  let n = 1;
  for (const f of FLOORS) if (floorOpen(profile, f.n)) n = f.n;
  return n;
}

function paintPills() {
  $<HTMLElement>("gold-pill").textContent = profile.gold + " зл";
  $<HTMLElement>("bag-pill").textContent = profile.bag.length + "/" + profile.bagSize;
  $<HTMLElement>("lvl-pill").textContent = "ур. " + profile.lvl;
  $<HTMLElement>("net-pill").textContent = online ? (verified ? "аккаунт" : "гость на сервере") : "это устройство";
}

function togglePause() {
  if (!battle || battle.remote) return;
  battle.paused = !battle.paused;
  const box = $<HTMLElement>("pause");
  box.hidden = !battle.paused;
}

function bind() {
  const shake = $<HTMLInputElement>("opt-shake");
  shake.checked = localStorage.getItem("orda.shake") !== "0";
  shake.onchange = () => localStorage.setItem("orda.shake", shake.checked ? "1" : "0");
  $<HTMLButtonElement>("pause-go").onclick = () => { if (battle) { battle.paused = false; $<HTMLElement>("pause").hidden = true; } };
  $<HTMLButtonElement>("pause-btn").onclick = () => togglePause();
  $<HTMLButtonElement>("pause-leave").onclick = () => { $<HTMLElement>("pause").hidden = true; $<HTMLButtonElement>("flee").click(); };
  $<HTMLButtonElement>("flee").onclick = () => {
    if (!battle) return;
    battle.reason = "surrender";
    battle.phase = "lost";
    endFight();
  };
  window.addEventListener("keydown", (e) => {
    const key = e.key.toLowerCase();
    const fresh = !keys.has(key);
    keys.add(key);
    if (view !== "fight") return;
    if (key === " " || key === "spacebar") { e.preventDefault(); if (fresh) dodgeQ = true; }
    if (fresh && key === "p" && !room && battle) togglePause();
    if (key === "j") holding = true;
    if (fresh && key === "k") heavyQ = true;
    if (fresh && key === "g") chestQ = true;
    const map: Record<string, number> = { q: 1, e: 2, r: 3, f: 4 };
    if (fresh && map[key]) queueSkill(map[key]);
  });
  window.addEventListener("keyup", (e) => {
    keys.delete(e.key.toLowerCase());
    if (e.key.toLowerCase() === "j") holding = false;
  });
  const field = $<HTMLCanvasElement>("field");
  field.addEventListener("pointerdown", (e) => { if (e.button === 0) holding = true; if (e.button === 2) heavyQ = true; aimFrom(e); });
  field.addEventListener("pointerup", () => { holding = false; });
  field.addEventListener("pointermove", aimFrom);
  field.addEventListener("contextmenu", (e) => { e.preventDefault(); heavyQ = true; });
  const st = $<HTMLElement>("stick");
  const knob = st.querySelector("i") as HTMLElement;
  const moveStick = (e: PointerEvent) => {
    const r = st.getBoundingClientRect();
    const dx = e.clientX - (r.left + r.width / 2);
    const dy = e.clientY - (r.top + r.height / 2);
    const L = Math.hypot(dx, dy) || 1;
    const k = Math.min(1, L / 46);
    stick.x = dx / L * k;
    stick.y = dy / L * k;
    knob.style.transform = `translate(${stick.x * 28}px, ${stick.y * 28}px)`;
  };
  st.addEventListener("pointerdown", (e) => { stick.on = true; st.setPointerCapture(e.pointerId); moveStick(e); });
  st.addEventListener("pointermove", (e) => { if (stick.on) moveStick(e); });
  st.addEventListener("pointerup", () => { stick.on = false; stick.x = 0; stick.y = 0; knob.style.transform = ""; });
  window.addEventListener("resize", resize);
  const holdBtn = (id: string, down: () => void, up?: () => void) => {
    const el = $<HTMLButtonElement>(id);
    if (!el) return;
    el.addEventListener("pointerdown", (e) => { e.preventDefault(); e.stopPropagation(); down(); });
    if (up) el.addEventListener("pointerup", up);
    el.addEventListener("pointerleave", () => up?.());
  };
  holdBtn("m-light", () => { holding = true; }, () => { holding = false; });
  holdBtn("m-heavy", () => { heavyQ = true; });
  holdBtn("m-dodge", () => { dodgeQ = true; });
  holdBtn("m-chest", () => { chestQ = true; });
  for (let i = 1; i <= 4; i++) holdBtn("m-sk" + i, () => { holding = false; queueSkill(i); });
}

async function boot() {
  bind();
  show("boot");
  await clerkToken();
  const hello = (LOCAL || SITE) && !(window as any).__ordaHelloOnce ? ((window as any).__ordaHelloOnce = true, await api("/musou/hello", {})) : null;
  if (hello?.tune) applyPublished(hello.tune);
  if (hello?.profile) {
    online = true;
    profile = normalize(hello.profile);
    if (hello.nick) nick = hello.nick;
    verified = !!hello.verified;
  } else {
    online = false;
    profile = loadLocal();
  }
  if (!profile.hero) { renderPick(); show("pick"); }
  else { floorPick = openFloor(); renderHub(); show("hub"); }
  (window as any).__orda = { get battle() { return battle; }, get profile() { return profile; } };
  requestAnimationFrame(loop);
}

boot();
