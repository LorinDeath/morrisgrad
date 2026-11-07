// Хаб, лавка, отряд и бой «Орды Обители».
import {
  BAG_MAX, ENCH_NAME, FLOORS, HEROES, OATHS, PAPER_NAME, RARITY_COLOR, RARITY_NAME,
  affixText, bagFree, bagPrice, beginRun, buyOffer, chestCompare, claimQuest, equipItem,
  beginMode, buyRune, capLabel, compareGear, finishRun, chainAt, diffLock, dungeonIlvl, floorLock, floorNeed, floorOpen, forgeItem, forgePreview, glowLine, goldFind, heroById, itemBlurb, itemPrice, listDrops, memberDiffLock, modeFloor, modeLock, mulberry32, newProfile, noteDrop, raiseRadiance, RUNES, runOffer, seal, socketRune, statGlance,
  normalize, questViews, readyQuests, refreshCost, refreshShop, salvage, setBonus, setHero, setOath, takeDrop, takeInbox,
  sheet, shopOffers, skillBook, spendStat, unequip, xpNeed,
  type FloorDef, type HeroId, type Item, type Paper, type PersonalChest, type Profile, type RunReport, type Stat,
} from "./rules";
import { Battle, type Btn } from "./sim";
import { drawBattle, drawPortrait, type Cam } from "./draw";
import { DIFF_CHAIN, DIFF_NAME, floorMut, getTune, setTune, validateTune } from "./tune";
import { MODE_LIST, type ModeId } from "./modes";
import { craftFor } from "./stagecraft";
import itemsUrl from "../../assets/mc/items_atlas.png?url";
import iconsUrl from "../../assets/mc/skill_icons.png?url";
import ICONS from "../../assets/mc/skill_icons.json";
import { skillSeconds } from "./strike";
import { clampMove, stickVector, travelAim } from "./input";

const GEAR_ICON: Record<string, number> = { weapon: 85, helm: 86, chest: 87, gloves: 89, boots: 88, amulet: 196, ring: 185, ring1: 185, ring2: 195 };
document.documentElement.style.setProperty("--items", `url("${itemsUrl}")`);

function iconStyle(slot: string, px = 40) {
  const ic = GEAR_ICON[slot] ?? 85;
  const k = px / 20;
  const col = ic % 20;
  const row = Math.floor(ic / 20);
  return `width:${px}px;height:${px}px;background-size:${400 * k}px auto;background-position:-${col * 20 * k}px -${row * 20 * k}px`;
}

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
let diffPick = 1;
let modePick: ModeId | "" = "";
let hubTab: "sheet" | "skills" = "sheet";
let downSent = false;
let selected: Item | null = null;
let hovered: Item | null = null;
let battle: Battle | null = null;
let nonce = "";
let ended = false;
let cam: Cam = { x: 1200, y: 780 };
const keys = new Set<string>();
let pointerAim = 0;
let mouseAim = false;
let aimHeld = false;
let aimPointer = -1;
let stickId = -1;
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
let yardSock: WebSocket | null = null;
let yardSnap: { shard?: string; cap: number; you: string; people: { tag: string; nick: string; lvl: number; say: string }[] } | null = null;
let room: { code: string; host: boolean; seats: { id: string; nick: string; hero: string }[] } | null = null;
let youId = "you";
let mirror = false;
let snapAcc = 0;
let toastT = 0;
let pingAt = 0;
let seenInv = "";

function show(name: string) {
  view = name;
  for (const id of ["v-boot", "v-menu", "v-pick", "v-hub", "v-fight", "v-result"]) {
    $("orda").querySelector("#" + id)?.classList.toggle("on", id === "v-" + name);
  }
  $<HTMLElement>("top").style.display = name === "fight" ? "none" : "";
  document.body.classList.toggle("in-fight", name === "fight");
  window.scrollTo(0, 0);
  document.documentElement.scrollTop = 0;
  document.body.scrollTop = 0;
}
function toast(t: string) {
  const el = $<HTMLElement>("toast");
  el.hidden = false;
  el.textContent = t;
  toastT = 3.2;
}
function saveLocal() { seal(profile); localStorage.setItem(SAVE, JSON.stringify(profile)); }
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
    fitCanvas(doll, 96);
    drawPortrait(doll.getContext("2d")!, profile.hero, doll.width, doll.height, performance.now() / 1000);
  }
}

function renderPick() {
  const root = $<HTMLElement>("v-pick");
  root.innerHTML = `<p class="tag">Герои</p><h1>Кто сойдёт в подвал</h1><p class="lead">На одном аккаунте несколько героев. У каждого свой уровень, очки, этажи, цвета и надетое. Сумка, золото и материалы общие. Новый герой начинается с нуля, старый ничего не теряет.</p><div class="pick-grid" id="pick-grid"></div><div class="row" style="margin-top:14px"><button class="btn gold" id="pick-go" type="button" disabled>Войти этим героем</button></div>`;
  const grid = $<HTMLElement>("pick-grid");
  let chosen: HeroId | null = profile.hero;
  for (const h of HEROES) {
    const card = document.createElement("button");
    card.type = "button";
    card.className = "hero-card" + (chosen === h.id ? " on" : "");
    const cardSave = profile.roster.find((r) => r.id === h.id);
    const worn = cardSave ? (Object.values(cardSave.equip).filter(Boolean) as Item[]).map((it) => it.name).slice(0, 3).join(", ") : "";
    const line = cardSave ? `ур. ${cardSave.lvl} · сила ${h.base.str + cardSave.alloc.str} · ${worn || "без брони"}` : "новый, с нуля";
    card.innerHTML = `<canvas data-hero="${h.id}"></canvas><div class="tag">${h.faction}</div><h3>${h.name}</h3><div class="tag">${h.title}</div><p>${line}</p>`;
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
    renderMenu();
    show("menu");
  };
  requestAnimationFrame(paintPicks);
}

function slotHtml(it: Item | null, empty: string, slot?: string) {
  if (!it) return slot ? `<i class="ic dim" style="${iconStyle(slot)}"></i>` : `<em>${empty}</em>`;
  return `<i class="ic" style="${iconStyle(it.slot)};box-shadow:inset 0 0 0 2px ${RARITY_COLOR[it.rarity]}"></i>`;
}

function pct(n: number) { return `${Math.round(n * 100)}%`; }
function offerText(floor: number, diff: number) {
  const o = runOffer(profile, floor, diff, 1);
  const act = { none: "без особого приёма", mend: "раны затягиваются", plate: "удар вязнет", blink: "скачок", brand: "линия", nova: "кольцо", killer: "рывок и призыв" }[o.act] || o.act;
  return `${o.name}. ${o.lore} ${act}. Опыт ${o.xpFirst}, золото ${o.goldFirst}.`;
}
function offerFine(floor: number, diff: number) {
  const o = runOffer(profile, floor, diff, 1);
  return `Сейчас в наборе: здоровье ×${o.hp}, урон ×${o.dmg}. Босс около ${o.bossHp} здоровья. Добыча своего цвета или младше (${pct(o.lower)}). Сундук генерала ${pct(o.generalChest)}, босса ${pct(o.bossChest)} — это числа набора, не обещание каждого убийства. Вещь сундука около ${dungeonIlvl(floor, diff)} уровня этого данжа. Опыт и золото приходят в конце забега. Повтор — ${o.xpReplay} опыта.`;
}
function compareHtml(floor: number) {
  const board = chainAt(profile, floor);
  const done = board > 0 ? `Доска этого героя: пройдено до «${DIFF_NAME[board - 1]}».` : "Доска этого героя: на этом данже ещё нет пройденного цвета.";
  return `<p class="derived">${done} Следующий цвет открывает прохождение предыдущего.</p><div class="chain">${DIFF_CHAIN.map((step, i) => {
    const id = i + 1;
    const o = runOffer(profile, floor, id);
    const ink = step.color === "#0a0a0a" ? "#f4f4f5" : step.color;
    return `<button type="button" class="dcard${diffPick === id ? " on" : ""}${o.why ? " lock" : ""}" data-diff="${id}" style="--sw:${ink}" title="×${o.hp} здоровья, ×${o.dmg} урона, сундук ур. ${dungeonIlvl(floor, id)}, генерал ${pct(o.generalChest)}, босс ${pct(o.bossChest)}, младший ${pct(o.lower)}"><b style="color:${ink}">${step.icon} ${step.name}</b><span>${o.why ? "закрыта" : "открыта"}</span></button>`;
  }).join("")}</div>`;
}

function paintYard() {
  const meta = document.getElementById("yard-meta");
  const box = document.getElementById("yard-people");
  if (!meta || !box || !yardSnap) return;
  meta.textContent = yardSnap.people.length ? `${yardSnap.people.length} рядом` : "На дворе тихо";
  box.innerHTML = yardSnap.people.length
    ? yardSnap.people.map((p) => `<div class="who${p.tag === yardSnap!.you ? " me" : ""}"><b>${p.nick}</b><span>ур. ${p.lvl}</span>${p.say ? `<em>${p.say}</em>` : ""}</div>`).join("")
    : "<p>На этом осколке пока тихо.</p>";
}

function bindYard() {
  const form = document.getElementById("yard-say") as HTMLFormElement | null;
  if (!form) return;
  form.onsubmit = (e) => {
    e.preventDefault();
    const input = document.getElementById("yard-text") as HTMLInputElement;
    const text = input.value.trim();
    if (!text || yardSock?.readyState !== WebSocket.OPEN) return;
    yardSock.send(JSON.stringify({ type: "say", text }));
    input.value = "";
  };
}

async function ensureYard() {
  if (yardSock && (yardSock.readyState === WebSocket.OPEN || yardSock.readyState === WebSocket.CONNECTING)) return;
  const info = await api("/musou/plaza", {});
  if (!info?.shard) {
    const meta = document.getElementById("yard-meta");
    if (meta && info?.err) meta.textContent = "Двор сейчас недоступен";
    return;
  }
  const sock = new WebSocket(WS + "/musou/p/" + info.shard);
  yardSock = sock;
  sock.onopen = () => sock.send(JSON.stringify({ type: "hello", token, guest: token ? undefined : guest, nick }));
  sock.onmessage = (ev) => {
    const m = JSON.parse(String(ev.data));
    if (m.type === "you" && yardSnap) yardSnap.you = m.tag;
    if (m.type === "yard") yardSnap = { ...m, shard: info.shard, you: m.you || yardSnap?.you || "" };
    if (m.type === "yard" || m.type === "you") paintYard();
    if (m.type === "err") {
      toast(m.err || "Двор не пустил");
      if (/полон/.test(String(m.err || ""))) { yardSock = null; try { sock.close(); } catch { /* */ } setTimeout(() => { void ensureYard(); }, 400); }
    }
  };
  sock.onclose = () => { if (yardSock === sock) yardSock = null; };
}

function goLabel(floor: number, diff: number) {
  const why = diffLock(profile, floor, diff);
  const name = FLOORS[floor - 1]?.name || "Данж";
  const mode = DIFF_NAME[(diff | 0) - 1] || DIFF_NAME[0];
  if (why) return floorLock(profile, floor) ? `Закрыто до уровня ${floorNeed(floor)}` : `«${mode}» после предыдущего цвета`;
  return `${(profile.clears[floor - 1] || 0) > 0 ? "Ещё раз" : "В бой"} · ${name} · ${mode}`;
}

function dungeonHeads(profile: Profile, current: number) {
  const heads: typeof FLOORS = [];
  for (const f of FLOORS) if (!heads.some((d) => d.dungeon === f.dungeon)) heads.push(f);
  return heads.map((d) => {
    const rows = FLOORS.filter((f) => f.dungeon === d.dungeon);
    const done = rows.filter((f) => (profile.clears[f.n - 1] || 0) > 0).length;
    const open = rows.some((f) => !floorLock(profile, f.n));
    return `<button type="button" class="dungeon${d.dungeon === current ? " on" : ""}${open ? "" : " lock"}" data-dungeon="${d.dungeon}"><span class="n">${d.dungeon}</span><span class="dn"><b>${d.dungeonName}</b><small>ур. ${floorNeed(d.n)} · ${done}/${rows.length}</small></span></button>`;
  }).join("");
}

function stageChips(profile: Profile, dungeon: number, current: number) {
  return FLOORS.filter((f) => f.dungeon === dungeon).map((f) => {
    const why = floorLock(profile, f.n);
    const clr = (profile.clears[f.n - 1] || 0) > 0;
    return `<button type="button" class="pip${f.n === current ? " on" : ""}${why ? " lock" : ""}${clr ? " clear" : ""}" data-floor="${f.n}" title="${f.stage}. ${f.name}${clr ? " · пройден" : why ? " · закрыт" : ""}">${f.stage}</button>`;
  }).join("");
}

function renderMenu() {
  const root = $<HTMLElement>("v-menu");
  const hero = profile.hero ? heroById(profile.hero) : null;
  root.innerHTML = `
    <div class="menu-card">
      <p class="tag">Обитель</p>
      <h1>Орда Обители</h1>
      <p class="lead">${hero ? `${hero.name}, ${hero.title}. Уровень ${profile.lvl}.` : "Сначала выбери героя."} Семнадцать данжей, своя сумка на всех.</p>
      <div class="menu-actions">
        ${hero ? `<button class="btn gold" id="menu-go" type="button">Продолжить</button>` : ""}
        <button class="btn" id="menu-heroes" type="button">Герои</button>
      </div>
    </div>`;
  $<HTMLButtonElement>("menu-heroes").onclick = () => { renderPick(); show("pick"); };
  const go = $<HTMLButtonElement>("menu-go");
  if (go) go.onclick = () => { floorPick = openFloor(); renderHub(); show("hub"); };
}

function iconCell(id: string, px = 40) {
  const n = (ICONS.index as Record<string, number>)[id] ?? (ICONS.index as Record<string, number>).empty ?? 52;
  const k = px / ICONS.cell;
  const col = n % ICONS.cols;
  const row = Math.floor(n / ICONS.cols);
  return `<i class="sic" style="width:${px}px;height:${px}px;background-image:url('${iconsUrl}');background-size:${ICONS.cols * ICONS.cell * k}px auto;background-position:-${col * ICONS.cell * k}px -${row * ICONS.cell * k}px"></i>`;
}

function skillsPane() {
  const book = skillBook(profile);
  const row = (r: { name: string; key: string; icon: string; text: string; meta: string; level: string; lock: string; effect: string }) =>
    `<article class="skill-row${r.lock ? " lock" : ""}">${iconCell(r.icon, 44)}<div><b>${r.key ? r.key + " · " : ""}${r.name}</b><p>${r.text}</p><p class="meta">${r.meta} · ${r.level}${r.lock ? " · " + r.lock : ""}</p>${r.effect ? `<p class="effect">${r.effect}</p>` : ""}</div></article>`;
  return `<div class="skill-book">
    <p class="preview">${book.preview}</p>
    <div class="row"><button class="btn gold" id="glow" type="button" ${book.can ? "" : "disabled"}>Поднять сияние · ${book.cost} зл</button></div>
    <h3>Активные</h3>
    ${book.cards.map(row).join("")}
    <h3>Пассивные</h3>
    ${book.passives.map(row).join("")}
  </div>`;
}

function hubPane(hero: ReturnType<typeof heroById>, s: ReturnType<typeof sheet>, set: ReturnType<typeof setBonus>, glance: (k: Stat) => string) {
  if (hubTab === "skills") return `<p class="lvl">${hero.name}. Сияние ${profile.radiance}.</p>`;
  const stats = (["str", "dex", "vit", "ene"] as Stat[]).map((k) => {
    const name = { str: "Сила", dex: "Ловкость", vit: "Живучесть", ene: "Энергия" }[k];
    const base = hero.base[k] + profile.alloc[k];
    return `<div class="stat"><span>${name}</span><span class="glance">${glance(k)}</span><span><b>${base}</b> ${profile.unspent ? `<button class="plus" data-stat="${k}" type="button" title="${glance(k)}">+</button>` : ""}</span></div>`;
  }).join("");
  const inbox = profile.inbox.length ? `<div class="stat"><span>У входа</span><b>${profile.inbox[0].name}</b></div><div class="row"><button class="btn" id="in-bag" type="button">В сумку</button><button class="btn" id="in-sell" type="button">Продать</button><button class="btn" id="in-drop" type="button">Оставить</button></div>` : "";
  return `<p class="lvl">Уровень ${profile.lvl} · опыт ${profile.xp} / ${xpNeed(profile.lvl)} · <b>${profile.gold} зл</b></p>
    <div class="sheet-top"><div class="doll-wrap"><canvas id="doll"></canvas></div><div class="sheet-meta"><div class="bar" title="опыт"><i style="width:${Math.min(100, profile.xp / xpNeed(profile.lvl) * 100)}%"></i></div>
    <p class="derived">Свободно ${profile.unspent}. Урон ${s.dmg} · жизнь ${s.hp} · крит ${capLabel("crit", s.critRaw)} · уклон ${capLabel("dodge", s.dodgeRaw)} · вампир ${capLabel("ls", s.lsRaw)} · шаг ${s.speed}${set.got.map((g) => ` · ${g.name}`).join("")}</p></div></div>
    ${stats}${inbox}`;
}

function renderHub() {
  const s = sheet(profile);
  const hero = heroById(profile.hero);
  const openF = floorPick;
  const open = FLOORS[openF - 1] || FLOORS[0];
  const quests = questViews(profile, openF);
  const ready = readyQuests(profile);
  const set = setBonus(profile);
  const root = $<HTMLElement>("v-hub");
  const mode = modePick ? MODE_LIST.find((m) => m.id === modePick) : null;
  const picked = mode ? modeFloor(profile, mode.id) : open;
  const craft = craftFor(picked.dungeon, picked.sw);
  const goWhy = mode ? modeLock(profile, mode.id) : diffLock(profile, openF, diffPick);
  const glance = (k: Stat) => {
    const g = statGlance(profile, k);
    const bit = k === "str" ? `урон ${g.before.dmg}→${g.after.dmg}` : k === "dex" ? `крит ${Math.round(g.before.crit * 100)}→${Math.round(g.after.crit * 100)}%` : k === "vit" ? `жизнь ${g.before.hp}→${g.after.hp}` : `навык ×${g.before.skill.toFixed(2)}→${g.after.skill.toFixed(2)}`;
    return bit;
  };
  root.innerHTML = `
  <div class="hub">
    <section class="yard" id="yard">
      <b>Двор</b>
      <span class="derived" id="yard-meta">Ищем осколок. Забег на 2–4.</span>
      <div id="yard-people" class="yard-people"></div>
      <form id="yard-say" class="row"><input id="yard-text" maxlength="80" placeholder="Реплика" autocomplete="off"><button class="btn" type="submit">Сказать</button></form>
    </section>
    <section class="panel sheet">
      <div class="who-line"><h2>${hero.name}</h2><span class="tag">${hero.title}</span></div>
      <div class="tabs"><button type="button" class="btn${hubTab === "sheet" ? " gold" : ""}" data-htab="sheet">Лист</button><button type="button" class="btn${hubTab === "skills" ? " gold" : ""}" data-htab="skills">Навыки</button></div>
      ${hubPane(hero, s, set, glance)}
      <div class="row"><button class="btn" id="open-menu" type="button">Меню</button><button class="btn" id="open-heroes" type="button">Герои</button><button class="btn" id="open-shop" type="button">Лавка</button><button class="btn" id="open-party" type="button">Отряд</button><button class="btn" id="open-friends" type="button">Друзья</button></div>
    </section>
    <section class="panel board">
      ${hubTab === "skills" ? `<div class="board-head"><h2>Навыки</h2><span class="tag">${hero.name}</span></div><div class="skill-stage">${skillsPane()}</div>` : `<div class="board-head"><h2>${mode ? mode.name : "Кампания"}</h2><span class="tag">ур. ${profile.lvl}</span></div>`}
      <div class="campaign-rest"${hubTab === "skills" ? " hidden" : ""}>
      <div class="mode-row">${MODE_LIST.map((m) => {
        const why = modeLock(profile, m.id);
        const on = modePick === m.id;
        return `<button type="button" class="mode${on ? " on" : ""}${why ? " lock" : ""}" data-mode="${m.id}" title="${why || m.rule}">${m.name}</button>`;
      }).join("")}</div>
      <div class="campaign">${dungeonHeads(profile, mode ? 0 : open.dungeon)}</div>
      <article class="pick-card" style="--sw:${mode ? "#38bdf8" : (DIFF_CHAIN[diffPick - 1].color === "#0a0a0a" ? "#f4f4f5" : DIFF_CHAIN[diffPick - 1].color)}">
        ${mode ? "" : `<div class="stage-row">${stageChips(profile, open.dungeon, openF)}</div>`}
        <div class="swatches">${DIFF_CHAIN.map((step, i) => {
          const id = i + 1;
          const why = mode ? "цвет чар у режима не крутится" : diffLock(profile, openF, id);
          const ink = step.color === "#0a0a0a" ? "#f4f4f5" : step.color;
          return `<button type="button" class="swatch${diffPick === id && !mode ? " on" : ""}${why ? " lock" : ""}" data-diff="${id}" style="--sw:${ink}" title="${step.name}${why ? " · " + why : ""}"></button>`;
        }).join("")}</div>
        <h3>${mode ? mode.name : picked.dungeonName}</h3>
        <p class="pick-name">${mode ? `ур. ${getTune().modes[mode.id]} · побед ${profile.book.wins[MODE_LIST.findIndex((m) => m.id === mode.id)] || 0}` : `этаж ${open.stage}/${open.stagesInDungeon} · ${open.name}`}</p>
        <p class="pick-rule">${mode ? mode.orda : `${craft.env}. ${craft.rule}`}</p>
        <p class="offer">${mode ? (mode.id === "abyss" ? `Этаж ${profile.book.abyss}. Рекорд ${profile.book.best}. Ярус растёт с этажом, не выше Чёрного.` : mode.id === "bossrush" ? `Босс ${profile.book.rush + 1} из ${FLOORS.filter((f) => f.goal === "boss").length}: ${picked.boss}.` : picked.bossTitle) : offerText(openF, diffPick)}</p>
        ${mode ? "" : `<details class="fine"><summary>Числа этого цвета</summary><p>${offerFine(openF, diffPick)}</p></details>`}
        ${goWhy ? `<p class="lock-why">${goWhy}</p>` : ""}
        <button class="btn gold" id="go-floor" type="button" ${goWhy ? "disabled" : ""}>${mode ? `В бой · ${mode.name}` : goLabel(openF, diffPick)}</button>
      </article>
      <div class="row modes">${OATHS.map((o) => `<button type="button" class="btn${profile.oath === o.id ? " gold" : ""}" data-oath="${o.id}" title="${o.note}">${o.name}</button>`).join("")}</div>
      ${quests.filter((q) => q.ready || q.p > 0).slice(0, 3).map((q) => `<div class="quest${q.ready ? " ready" : ""}"><b>${q.name}</b><span>${q.p}/${q.need}</span>${q.ready ? `<button class="btn gold" data-claim="${q.id}" type="button">Забрать</button>` : ""}</div>`).join("")}
      ${ready.filter((q) => q.floor !== openF && q.floor !== 0).map((q) => `<div class="quest ready"><b>${q.name}</b><button class="btn gold" data-claim="${q.id}" type="button">Забрать</button></div>`).join("")}
      </div>
    </section>
    <section class="panel bag">
      <div class="bag-head"><h2>Сумка</h2><span class="${bagFree(profile) ? "" : "full"}">${profile.bag.length}/${profile.bagSize}</span></div>
      <div class="paper">${(["weapon", "helm", "chest", "gloves", "boots", "amulet", "ring1", "ring2"] as Paper[]).map((sl) => `<button type="button" class="pslot" data-paper="${sl}" title="${profile.equip[sl] ? profile.equip[sl]!.name : PAPER_NAME[sl]}" style="border-color:${profile.equip[sl] ? RARITY_COLOR[profile.equip[sl]!.rarity] : ""}">${slotHtml(profile.equip[sl], PAPER_NAME[sl], sl)}</button>`).join("")}</div>
      <div class="grid">${Array.from({ length: profile.bagSize }, (_, i) => {
        const it = profile.bag[i];
        return `<button type="button" class="slot${it && selected?.id === it.id ? " sel" : ""}${it ? "" : " empty"}" data-item="${it?.id || ""}" style="border-color:${it ? RARITY_COLOR[it.rarity] : ""}" ${it ? `title="${it.name}" aria-label="${it.name}"` : "aria-label=\"пустая ячейка\""}>${it ? slotHtml(it, "") : ""}</button>`;
      }).join("")}</div>
      <div class="tip" id="tip">${tipHtml(selected)}</div>
      <div class="row">
        <button class="btn" id="equip" type="button">Надеть</button>
        <button class="btn" id="sell" type="button">Продать</button>
        <button class="btn" id="unequip" type="button">Снять</button>
        <button class="btn" id="forge" type="button">Шлифовка</button>
        ${listDrops(profile).length ? `<button class="btn gold" id="open-holds" type="button">Сундуки (${listDrops(profile).length})</button>` : ""}
      </div>
      <details class="fine">
        <summary>Сияние и гнёзда</summary>
        <p>Сияние ${profile.radiance}/${getTune().craft.radianceMax}. ${glowLine(profile)}. Поднять шаг и посмотреть откат — вкладка «Навыки».</p>
        <p>Руна садится в оружие, две разные, одну и ту же второй раз нельзя. Шлифовка точит вещь у Петра и не ломает её.</p>
        <div class="row">${RUNES.map((r) => `<button type="button" class="btn" data-rune="${r.id}" title="${r.note}">${r.name} · ${profile.res[r.id] || 0}</button>`).join("")}</div>
      </details>
    </section>
  </div>`;
  root.querySelectorAll<HTMLButtonElement>("[data-htab]").forEach((b) => b.onclick = () => { hubTab = b.dataset.htab === "skills" ? "skills" : "sheet"; renderHub(); });
  root.querySelectorAll<HTMLButtonElement>("[data-floor]").forEach((b) => b.onclick = () => { floorPick = Number(b.dataset.floor); renderHub(); });
  root.querySelectorAll<HTMLButtonElement>("[data-mode]").forEach((b) => b.onclick = () => {
    const id = (b.dataset.mode || "") as ModeId;
    modePick = modePick === id ? "" : id;
    renderHub();
  });
  root.querySelectorAll<HTMLButtonElement>("[data-dungeon]").forEach((b) => b.onclick = () => {
    modePick = "";
    const d = Number(b.dataset.dungeon);
    const rows = FLOORS.filter((f) => f.dungeon === d);
    const next = rows.find((f) => !floorLock(profile, f.n) && !(profile.clears[f.n - 1])) || rows.find((f) => !floorLock(profile, f.n)) || rows[0];
    floorPick = next?.n || 1;
    renderHub();
  });
  root.querySelectorAll<HTMLButtonElement>("[data-diff]").forEach((b) => b.onclick = () => { diffPick = Number(b.dataset.diff) || 1; renderHub(); });
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
  root.querySelectorAll<HTMLButtonElement>("[data-item]").forEach((b) => {
    const pick = () => profile.bag.find((it) => it.id === b.dataset.item) || null;
    b.onclick = () => { selected = pick(); hovered = null; renderHub(); };
    b.onpointerenter = (e) => {
      if (e.pointerType === "touch") return;
      if (e.pointerType !== "mouse" && !window.matchMedia("(hover: hover)").matches) return;
      hovered = pick();
      paintTip();
    };
    b.onpointerleave = () => { hovered = null; paintTip(); };
    b.onfocus = () => { hovered = pick(); paintTip(); };
    b.onblur = () => { if (hovered?.id === b.dataset.item) hovered = null; paintTip(); };
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
  $<HTMLButtonElement>("open-heroes").onclick = () => { renderPick(); show("pick"); };
  $<HTMLButtonElement>("forge").onclick = async () => {
    const it = selected || (paper ? profile.equip[paper] : null);
    if (!it) return toast("Выбери вещь в сумке или слот на герое");
    if (online) {
      const r = await act({ op: "upgrade", id: it.id, at: it.up | 0 });
      if (!r?.err) toast("Шлифовка прошла. Вещь не ломается.");
      renderHub();
    } else {
      const r = forgeItem(profile, it.id, it.up | 0);
      if ("err" in r) toast(r.err);
      else { saveLocal(); toast("Шлифовка +" + r.up + ". Вещь не ломается."); }
      renderHub();
    }
  };
  const holdsBtn = document.getElementById("open-holds");
  if (holdsBtn) holdsBtn.onclick = () => {
    const first = listDrops(profile)[0];
    if (first) showLoot(first.id);
  };
  const glowBtn = document.getElementById("glow");
  if (glowBtn) glowBtn.onclick = async () => {
    if (online) {
      const r = await act({ op: "radiance" });
      if (!r?.err) toast("Сияние " + profile.radiance);
      renderHub();
    } else {
      const r = raiseRadiance(profile);
      if ("err" in r) toast(r.err);
      else { saveLocal(); toast("Сияние " + r.step); renderHub(); }
    }
  };
  root.querySelectorAll<HTMLButtonElement>("[data-rune]").forEach((b) => b.onclick = async () => {
    const id = b.dataset.rune || "";
    const weapon = selected?.slot === "weapon" ? selected : null;
    const owned = profile.res[id] || 0;
    if (!weapon || owned < 1) {
      if (online) {
        const r = await act({ op: "rune", id });
        if (!r?.err) toast("Руна в запасе");
        renderHub();
      } else {
        const r = buyRune(profile, id);
        if ("err" in r) toast(r.err);
        else { saveLocal(); toast("Руна в запасе"); renderHub(); }
      }
      return;
    }
    if (online) {
      const r = await act({ op: "socket", id: weapon.id, rune: id });
      if (!r?.err) toast("Руна в оружии");
      renderHub();
    } else {
      const r = socketRune(profile, weapon.id, id);
      if ("err" in r) toast(r.err);
      else { saveLocal(); toast("Руна в оружии"); renderHub(); }
    }
  });
  $<HTMLButtonElement>("open-menu").onclick = () => { renderMenu(); show("menu"); };
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
  $<HTMLButtonElement>("go-floor").onclick = () => modePick ? startMode(modePick) : startSolo(openF);
  bindYard();
  paintYard();
  void ensureYard();
  paintPills();
  $<HTMLElement>("net-pill").classList.toggle("warn", !online);
  requestAnimationFrame(paintPicks);
}

function paintTip() {
  const el = document.getElementById("tip");
  if (!el) return;
  el.innerHTML = tipHtml(hovered || selected);
}
function cmpRows(before: number, after: number, label: string, pct = false, cap = 0) {
  const d = after - before;
  const cls = d > 0.0001 ? "up" : d < -0.0001 ? "down" : "flat";
  const show = pct ? `${Math.round(before * 1000) / 10}% → ${Math.round(after * 1000) / 10}%` : `${Math.round(before)} → ${Math.round(after)}`;
  const mark = d > 0.0001 ? `+${pct ? Math.round(d * 1000) / 10 : Math.round(d)}` : d < -0.0001 ? `${pct ? Math.round(d * 1000) / 10 : Math.round(d)}` : "0";
  const roof = pct && cap ? ` · предел ${Math.round(cap * 100)}%` : "";
  return `<div class="${cls}"><span>${label}</span><b>${show}</b><em>${mark}${roof}</em></div>`;
}
function tipHtml(it: Item | null) {
  if (!it) return `<p class="muted">Наведи на вещь — здесь будет сравнение с надетым.</p>`;
  const cmp = compareGear(profile, it.id);
  const mark = [it.cursed ? "проклята" : "", it.ench ? ENCH_NAME[it.ench - 1] : "", it.up ? `+${it.up}` : ""].filter(Boolean).join(" · ");
  const rows = cmp.blocked || cmp.worn ? "" : `<div class="cmp">${cmpRows(cmp.before.dmg, cmp.after.dmg, "урон")}${cmpRows(cmp.before.hp, cmp.after.hp, "жизнь")}${cmpRows(cmp.before.armor, cmp.after.armor, "броня")}${cmpRows(cmp.before.crit, cmp.after.crit, "крит", true, 0.4)}${cmpRows(cmp.before.dodge, cmp.after.dodge, "уклон", true, 0.4)}${cmpRows(cmp.before.ls, cmp.after.ls, "вампир", true, 0.1)}</div>`;
  const why = cmp.blocked || (profile.lvl < it.req ? `Нужен уровень ${it.req}` : cmp.worn ? "Уже надето" : "");
  return `<div class="tip-head"><i class="ic" style="${iconStyle(it.slot)};box-shadow:inset 0 0 0 2px ${RARITY_COLOR[it.rarity]}"></i><div><b style="color:${RARITY_COLOR[it.rarity]}">${it.name}</b><div>${RARITY_NAME[it.rarity]}${mark ? " · " + mark : ""} · ${itemPrice(it)} зл</div></div></div>${it.affixes.slice(0, 3).map((a) => `<div class="aff">${affixText(a)}</div>`).join("")}${why ? `<div class="tag">${why}</div>` : ""}${rows}`;
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
    : `<article class="offer"><i class="ic" style="${iconStyle(o.item.slot, 48)};box-shadow:inset 0 0 0 2px ${RARITY_COLOR[o.item.rarity]}"></i><h3 style="color:${RARITY_COLOR[o.item.rarity]}">${o.item.name}</h3><p>${RARITY_NAME[o.item.rarity]} · ур. ${o.item.req}</p>${o.item.affixes.slice(0, 2).map((a) => `<div class="aff">${affixText(a)}</div>`).join("")}<button class="btn gold" data-buy="${o.id}" type="button" ${profile.gold < o.price || bagFree(profile) < 1 ? "disabled" : ""}>${o.price} зл</button></article>`).join("")}</div>
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
let linkGap = 0;
let reconnecting = false;
function queueReconnect() {
  if (reconnecting || view !== "fight" || !room || dropTry >= 8) return;
  reconnecting = true;
  dropTry++;
  const dead = ws;
  const code = room.code;
  if (dead) {
    dead.onclose = null;
    try { dead.close(); } catch { /* */ }
  }
  setTimeout(() => {
    reconnecting = false;
    if (view !== "fight" || !room) return;
    connect(code, true);
  }, 300);
}
async function connect(code: string, fromDrop = false) {
  if (!fromDrop) dropTry = 0;
  if (ws) {
    ws.onclose = null;
    try { ws.close(); } catch { /* */ }
  }
  const sock = new WebSocket(WS + "/musou/m/" + code);
  ws = sock;
  sock.onopen = () => sock.send(JSON.stringify({ type: "hello", token, guest: token ? undefined : guest, nick }));
  sock.onclose = () => {
    if (ws !== sock) return;
    queueReconnect();
  };
  ws.onmessage = (ev) => {
    let m: any;
    try { m = JSON.parse(ev.data); }
    catch { return; }
    if (m.type === "you") {
      youId = m.id;
      room = { code, host: !!m.host, seats: [] };
      if (battle && view === "fight") battle.localId = youId;
    }
    if (m.type === "lobby") {
      room = { code: m.code, host: m.hostId === youId, seats: m.seats };
      const box = $<HTMLElement>("room-box");
      const mode = m.diff | 0 || 1;
      const low = (m.seats as { nick: string; lvl?: number; passed?: boolean; chain?: number }[]).filter((s) => memberDiffLock(s.lvl | 0, !!s.passed, m.floor | 0, mode, s.chain | 0));
      const here = FLOORS[Math.max(0, (m.floor | 0) - 1)] || FLOORS[0];
      const chips = room.host ? FLOORS.filter((f) => f.dungeon === here.dungeon && floorOpen(profile, f.n)).map((f) => {
        const passed = (profile.clears[f.n - 1] || 0) > 0;
        const on = (m.floor | 0) === f.n;
        return `<button type="button" class="btn${on ? " gold" : ""}" data-room-floor="${f.n}">${f.stage}. ${f.name}${passed ? " · пройден" : ""}</button>`;
      }).join("") : "";
      const modes = room.host ? DIFF_NAME.map((name, i) => {
        const id = i + 1;
        const why = diffLock(profile, m.floor | 0, id);
        return `<button type="button" class="btn${mode === id ? " gold" : ""}" data-room-diff="${id}" ${why ? "disabled" : ""}>${name}</button>`;
      }).join("") : "";
      const offer = runOffer(profile, m.floor | 0 || 1, mode, Math.max(1, m.seats.length));
      if (box) box.innerHTML = `<p>Код <b>${m.code}</b>. ${FLOORS[(m.floor | 0) - 1]?.name || "Данж"} · ${DIFF_NAME[mode - 1] || "Базовая"}.</p>${chips ? `<div class="row room-floors">${chips}</div>` : ""}${modes ? `<div class="diffs">${modes}</div>` : ""}<p class="offer">${offer.lore} Опыт ${offer.xpFirst}, золото ${offer.goldFirst}. Сундук генерала ${pct(offer.generalChest)}, босса ${pct(offer.bossChest)} — каждому свой.</p><ul class="seat-list">${m.seats.map((s: any) => `<li>${s.nick} · ур. ${s.lvl | 0}${memberDiffLock(s.lvl | 0, !!s.passed, m.floor | 0, mode, s.chain | 0) ? " · цвет закрыт" : ""}</li>`).join("")}</ul>${room.host ? `<div class="row"><button class="btn gold" id="room-start" type="button" ${low.length ? "disabled" : ""}>Начать данж</button></div>${low.length ? `<p class="lock-why">Цвет закрыт у: ${low.map((s) => s.nick).join(", ")}.</p>` : ""}` : "<p>Ждём, пока хост начнёт.</p>"}`;
      $<HTMLButtonElement>("room-start") && ($<HTMLButtonElement>("room-start").onclick = () => ws?.send(JSON.stringify({ type: "start" })));
      document.querySelectorAll<HTMLButtonElement>("[data-room-floor]").forEach((b) => b.onclick = () => ws?.send(JSON.stringify({ type: "floor", floor: Number(b.dataset.roomFloor) })));
      document.querySelectorAll<HTMLButtonElement>("[data-room-diff]").forEach((b) => b.onclick = () => ws?.send(JSON.stringify({ type: "diff", diff: Number(b.dataset.roomDiff) })));
    }
    if (m.type === "err") toast(m.err || "Ошибка комнаты");
    if (m.type === "go") {
      if (!(battle && nonce === m.nonce && view === "fight")) {
        closeModal();
        mirror = false;
        nonce = m.nonce;
        const members = m.party.map((p: any) => ({ id: p.id, name: p.nick, hero: p.hero, sheet: p.sheet }));
        beginBattle(m.floor, members, m.seed || 1, true, m.diff | 0 || 1);
      }
    }
    if (m.type === "who" && battle) battle.applyWho(m.id, m.x, m.y, m.aim);
    if (m.type === "elite" && battle) battle.applyElites(m.elites || []);
    if (m.type === "boom" && battle) battle.noteBoom(m);
    if (m.type === "blow" && battle) battle.noteBlow(m.who, m.name || "", Number(m.dmg) || 0, !!m.crit, Number(m.x) || 0, Number(m.y) || 0, 0);
    if (m.type === "hand" && battle) {
      if (youId) battle.localId = youId;
      battle.applyHand(m.cd || [], Number(m.musou) || 0, Number(m.haste) || 0, !!m.snap, !!m.spent, m.down | 0, m.final | 0);
      const me = battle.party.find((p) => p.id === youId);
      if (me && m.heal > 0 && me.hp > 0) me.hp = Math.min(me.maxHp, me.hp + (m.heal | 0));
      if (m.snap && m.final) downSent = true;
    }
    if (m.type === "chest" && m.chest) rememberChest(m.chest, Number(m.x) || 1200, Number(m.y) || 780);
    if (m.type === "chests") {
      for (const row of m.list || []) if (row?.chest) rememberChest(row.chest, Number(row.x) || 1200, Number(row.y) || 780);
    }
    if (m.type === "taken") {
      if (m.profile) profile = normalize(m.profile);
      if (m.err) toast(m.err);
      else noteTake(String(m.id || ""), m.report || { moved: [], left: 0, already: true });
    }
    if (m.type === "loot") {
      if (m.profile) profile = normalize(m.profile);
      hideLoot();
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
  const lock = diffLock(profile, floor, diffPick);
  if (lock) return toast(lock);
  await pullTune();
  mirror = false;
  youId = "you";
  if (online) {
    const r = await act({ op: "start", floor, diff: diffPick });
    if (r?.nonce) {
      nonce = r.nonce;
      beginBattle(floor, [{ id: "you", name: nick, hero: profile.hero || "lorin", sheet: sheet(profile) }], profile.pending?.seed || 1, false, diffPick);
      return;
    }
    if (r?.err) return;
    online = false;
    toast("Сервер не ответил. Этот забег сохранится на устройстве.");
    $<HTMLElement>("net-pill").textContent = "сеть молчит";
    $<HTMLElement>("net-pill").classList.add("warn");
  }
  {
    const b = beginRun(profile, floor, Date.now(), undefined, false, diffPick);
    if ("err" in b) return toast(b.err);
    nonce = b.nonce;
    saveLocal();
    beginBattle(floor, [{ id: "you", name: nick, hero: profile.hero || "lorin", sheet: sheet(profile) }], profile.pending?.seed || b.seed || 1, false, diffPick);
  }
}

async function startMode(id: ModeId) {
  const lock = modeLock(profile, id);
  if (lock) return toast(lock);
  await pullTune();
  mirror = false;
  youId = "you";
  const floor = modeFloor(profile, id);
  if (online) {
    const r = await act({ op: "mode", id });
    if (r?.nonce) {
      nonce = r.nonce;
      beginBattle(floor, [{ id: "you", name: nick, hero: profile.hero || "lorin", sheet: sheet(profile) }], profile.pending?.seed || 1, false, 1);
      return;
    }
    if (r?.err) return;
    online = false;
    toast("Сервер не ответил. Этот забег сохранится на устройстве.");
  }
  const b = beginMode(profile, id, Date.now());
  if ("err" in b) return toast(b.err);
  nonce = b.nonce;
  saveLocal();
  beginBattle(floor, [{ id: "you", name: nick, hero: profile.hero || "lorin", sheet: sheet(profile) }], profile.pending?.seed || b.seed || 1, false, 1);
}

function beginBattle(floor: number | FloorDef, members: { id: string; name: string; hero: HeroId; sheet: any }[], seed: number, remote: boolean, diff = 1) {
  battle = new Battle(floor, members, seed, diff);
  battle.mirror = false;
  battle.remote = remote;
  battle.localId = youId || members[0].id;
  ended = false;
  ending = false;
  waitDrops.length = 0;
  downSent = false;
  const me = members.find((m) => m.id === youId) || members[0];
  cam = { x: 1200, y: 780 };
  youId = me.id;
  buildSkills(me.hero);
  show("fight");
  requestAnimationFrame(() => { resize(); resize(); });
}

function skillButton(sk: { key: string; name: string; id?: string }, i: number, touch = false) {
  const hero = battle ? heroById((battle.party.find((p) => p.id === youId) || battle.party[0]).hero) : null;
  const def = hero?.skills[i];
  return `<button type="button" class="${touch ? "skill-touch" : "skill"}" data-sk="${i + 1}" aria-label="${sk.name}" title="${sk.name}"><small>${sk.key}</small>${iconCell(def ? ((skillBook(profile).cards[i]?.icon) || "attack") : "attack", touch ? 36 : 32)}<b>${sk.name}</b><span class="sw"></span><span class="sec"></span></button>`;
}

function buildSkills(heroId: HeroId) {
  const hero = heroById(heroId);
  $<HTMLElement>("skills").innerHTML = hero.skills.map((sk, i) => skillButton(sk, i)).join("");
  $<HTMLElement>("skills-touch").innerHTML = hero.skills.map((sk, i) => skillButton(sk, i, true)).join("");
  document.querySelectorAll<HTMLButtonElement>("#skills .skill").forEach((b) => {
    b.onclick = () => queueSkill(Number(b.dataset.sk));
  });
}

let queued = 0;
let heavyQ = false;
let useQ = false;
let openChestId = "";
let chestHold = false;
const knownChests: PersonalChest[] = [];
const waitDrops: { id: string; kind: "general" | "boss"; name: string; x: number; y: number }[] = [];
let dropFlight = 0;
let ending = false;

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
function queueSkill(n: number) {
  if (!battle) return;
  const me = battle.party.find((p) => p.id === youId) || battle.party[0];
  const i = n - 1;
  const sk = heroById(me.hero).skills[i];
  if (!sk || (me.cd[i] || 0) > 0) return;
  if (sk.musou && me.musou < 100) return;
  if (me.hp <= 0) return;
  queued = n;
}

function readBtn(): Partial<Btn> {
  const rawX = (keys.has("a") || keys.has("arrowleft") ? -1 : 0) + (keys.has("d") || keys.has("arrowright") ? 1 : 0) + stick.x;
  const rawY = (keys.has("w") || keys.has("arrowup") ? -1 : 0) + (keys.has("s") || keys.has("arrowdown") ? 1 : 0) + stick.y;
  const moved = clampMove(rawX, rawY);
  const mx = moved.x;
  const my = moved.y;
  const look = mouseAim || aimHeld;
  pointerAim = travelAim(mx, my, pointerAim, look);
  const skill = queued;
  const heavy = heavyQ || keys.has("k");
  queued = 0;
  heavyQ = false;
  const dodge = dodgeQ || keys.has(" ");
  dodgeQ = false;
  const use = useQ || (keys.has("g") && !openChestId);
  useQ = false;
  return { mx, my, aim: pointerAim, light: holding || keys.has("j"), heavy, skill, dodge, use };
}

function resize() {
  const c = $<HTMLCanvasElement>("field");
  if (!c) return;
  const small = c.clientWidth < 820 || c.clientHeight < 520;
  const coarse = matchMedia("(pointer: coarse)").matches;
  const dpr = Math.min(small || coarse ? 1.1 : 1.75, devicePixelRatio || 1);
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
  const wave = battle.wave < 3 ? (f.stages[battle.wave] || `Волна ${battle.wave + 1}`) : (f.goal === "pack" ? (f.stages[2] || "Зачистка") : "Босс");
  const foe = battle.elites.find((e) => e.alive);
  const objHtml = `<b>${f.name}</b> · ${DIFF_NAME[(battle.diff | 0) - 1] || "Обычная"}<div>${wave} · тварей ${battle.kills} · генералов ${battle.genKills}${battle.bossDown && f.goal !== "pack" ? " · босс пал" : ""}${foe ? ` · цель: ${foe.name}` : ""}</div>`;
  const obj = $<HTMLElement>("obj");
  if (obj.innerHTML !== objHtml) obj.innerHTML = objHtml;
  $<HTMLButtonElement>("pause-btn").hidden = !!battle.remote;
  const chest = $<HTMLElement>("chest-hint");
  if (chest) {
    chest.hidden = !battle.nearChest;
    if (battle.nearChest) chest.textContent = `Рядом «${battle.focusName || "сундук"}». G или «Использовать». Само не открывается.`;
  }
  const useBtn = $<HTMLButtonElement>("m-use");
  if (useBtn) useBtn.classList.toggle("on", battle.nearChest);
  const flee = $<HTMLButtonElement>("flee");
  if (flee) flee.textContent = battle.bossDown ? "Дальше" : "Сдаться";
  paintBoss();
  const partyHtml = battle.party.map((p) => `<div><b>${p.name.split(" ")[0]}</b><div class="bar"><i style="width:${Math.max(0, p.hp / p.maxHp * 100)}%"></i></div></div>`).join("");
  const party = $<HTMLElement>("party");
  if (party.innerHTML !== partyHtml) party.innerHTML = partyHtml;
  const hero = heroById(me.hero);
  document.querySelectorAll<HTMLButtonElement>(".skill, .skill-touch").forEach((b) => {
    const i = Number(b.dataset.sk) - 1;
    const sk = hero.skills[i];
    const cd = Math.max(0, me.cd[i] || 0);
    const total = sk ? skillSeconds(me.hero, i, me.sheet) : 1;
    const musouLock = !!sk?.musou && me.musou < 100 && cd <= 0;
    const sw = b.querySelector(".sw") as HTMLElement | null;
    const sec = b.querySelector(".sec") as HTMLElement | null;
    const fill = cd > 0 ? Math.round(Math.min(1, cd / Math.max(0.2, total)) * 100) : musouLock ? 100 : 0;
    if (sw) sw.style.background = fill ? `conic-gradient(rgba(5,3,12,.78) ${fill}%, transparent 0)` : "none";
    if (sec) sec.textContent = cd > 0 ? (cd >= 10 ? String(Math.ceil(cd)) : cd.toFixed(1)) : musouLock ? "пыл" : "";
    const locked = cd > 0 || musouLock || me.hp <= 0;
    b.disabled = false;
    b.setAttribute("aria-disabled", locked ? "true" : "false");
    b.classList.toggle("cooling", cd > 0);
    b.classList.toggle("need", musouLock);
    b.classList.toggle("ready", cd <= 0 && !musouLock && me.hp > 0);
    b.dataset.cd = cd > 0 ? cd.toFixed(1) : "0";
    b.dataset.ready = locked ? "0" : "1";
  });
}

function showResult(report: RunReport | null, phase: string, reason?: RunReport["reason"], err?: string) {
  battle = null;
  $<HTMLElement>("pause").hidden = true;
  show("result");
  const why = report?.reason || reason || (phase === "won" ? "win" : "dead");
  const title = why === "win" ? (report?.replay ? "Повтор засчитан" : "Этаж зачищен") : why === "surrender" ? "Сдача" : "Поражение";
  const mode = report?.diffName ? `Сложность «${report.diffName}». ` : "";
  const items = report && "items" in report ? report.items : [];
  const pay = report && "gold" in report ? mode + (report.gold > 0 ? `+${report.gold} золота. ` : "Золота за этот исход нет. ") + (report.note || "") : (err ? `Награда не засчитана: ${err}.` : "Награда не засчитана.");
  paintPills();
  const xpLine = report && "xp" in report ? `Уровень ${profile.lvl}. Опыт ${report.xp}. До следующего ${profile.xp} / ${xpNeed(profile.lvl)}.` : `Уровень ${profile.lvl}. Опыт ${profile.xp} / ${xpNeed(profile.lvl)}.`;
  $<HTMLElement>("v-result").innerHTML = `<article class="result-card"><p class="tag">${why === "win" ? "Победа" : why === "surrender" ? "Выход" : "Падение"}</p><h2>${title}</h2>
  <p class="lvl-line">${xpLine}</p>
  <p>${pay}</p>
  <div class="result-grid">${items.map((n) => `<article class="loot${n.sold ? " sold" : ""}" style="border-color:${RARITY_COLOR[n.item.rarity]}"><b style="color:${RARITY_COLOR[n.item.rarity]}">${n.item.name}</b><div>${itemBlurb(n.item)}</div>${n.held ? "<div>Редкая вещь ждёт у входа в хаб — сумка была полна.</div>" : n.sold ? `<div>Обычная вещь не влезла и ушла за ${n.gold} золота.</div>` : n.item.affixes.map((a) => `<div class="aff">${affixText(a)}</div>`).join("")}</article>`).join("") || `<p>${listDrops(profile).length ? "Опыт и золото уже здесь. Вещи генерала и босса лежат в их сундуке и второй раз не выдаются." : "Опыт и золото за забег уже здесь. Сундука в этот раз не было."}</p>`}</div>
  <div class="row" style="margin-top:14px">${listDrops(profile).length ? `<button class="btn gold" id="open-holds" type="button">Сундуки (${listDrops(profile).length})</button>` : ""}<button class="btn gold" id="back-hub" type="button">В хаб</button></div></article>`;
  const again = document.getElementById("open-holds");
  if (again) again.onclick = () => { const first = listDrops(profile)[0]; if (first) showLoot(first.id); };
  $<HTMLButtonElement>("back-hub").onclick = () => { hideLoot(); renderHub(); show("hub"); };
}

async function endFight() {
  if (ended || ending || !battle) return;
  ending = true;
  let spins = 0;
  while ((dropFlight || waitDrops.length) && spins < 20) {
    if (!dropFlight) await flushDrops(performance.now());
    else await new Promise((r) => setTimeout(r, 40));
    spins++;
  }
  if (ended || !battle) { ending = false; return; }
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

let hitAudio: AudioContext | null = null;
let hitAt = 0;
function hitBlip(freq: number) {
  const now = performance.now();
  if (now - hitAt < 42) return;
  hitAt = now;
  try {
    hitAudio = hitAudio || new AudioContext();
    const o = hitAudio.createOscillator();
    const g = hitAudio.createGain();
    o.type = "square";
    o.frequency.value = freq;
    g.gain.value = 0.03;
    o.connect(g);
    g.connect(hitAudio.destination);
    o.start();
    g.gain.exponentialRampToValueAtTime(0.0001, hitAudio.currentTime + 0.05);
    o.stop(hitAudio.currentTime + 0.06);
  } catch { /* нет звукового выхода */ }
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
    const rs = ws ? ws.readyState : 3;
    battle.linked = !battle.remote || rs === 1;
    if (battle.remote && room) {
      if (rs === 1) linkGap = 0;
      else {
        linkGap += dt;
        if (linkGap > (rs === 2 ? 0.7 : 1.1)) {
          linkGap = 0;
          queueReconnect();
        }
      }
    }
    battle.press(youId, readBtn());
    const hpBefore = me.hp;
    const killsBefore = battle.kills;
    battle.step(dt);
    if (battle.kills > killsBefore) hitBlip(520);
    if (me.hp < hpBefore - 0.4) hitBlip(150);
    void flushDrops(now);
    for (const id of battle.takeUses()) {
      if (openChestId) continue;
      if (!battle.chests.some((c) => c.id === id && !c.open)) continue;
      showLoot(id);
    }
    cam.x += (me.x - cam.x) * 0.12;
    cam.y += (me.y - cam.y) * 0.12;
    const acts = battle.takeActs();
    if (battle.remote && ws && ws.readyState === 1 && room) {
      snapAcc += dt;
      if (snapAcc > 0.1) {
        snapAcc = 0;
        ws.send(JSON.stringify({ type: "pos", x: me.x, y: me.y, aim: me.aim, musou: Math.round(me.musou), guard: me.iframe > 0 ? 1 : 0 }));
      }
      for (const h of acts) ws.send(JSON.stringify({ type: "act", kind: h.kind, skill: h.skill, echo: h.echo, ids: h.ids, x: me.x, y: me.y, aim: me.aim, musou: Math.round(h.gauge) }));
      const dead = me.hp <= 0;
      if (dead && !downSent) {
        downSent = true;
        ws.send(JSON.stringify({ type: "down", final: me.revives <= 0 ? 1 : 0 }));
      } else if (!dead && downSent) {
        downSent = false;
        ws.send(JSON.stringify({ type: "up" }));
      }
    }
    const c = $<HTMLCanvasElement>("field");
    const ctx = c.getContext("2d");
    if (ctx) drawBattle(ctx, battle, c.width, c.height, cam, now);
    hud();
    const lootWaiting = dropFlight > 0 || waitDrops.length > 0 || battle.chests.some((c) => !c.open);
    if (battle.phase === "won" && lootWaiting) battle.phase = "fight";
    if (!ended && !ending && (battle.phase === "won" || battle.phase === "lost") && !(dropFlight || waitDrops.length)) endFight();
  } else if (view === "hub" || view === "pick") {
    if ((now / 50 | 0) % 2 === 0) paintPicks();
  }
}

function aimFrom(ev: { clientX: number; clientY: number; pointerId?: number }) {
  if (ev.pointerId != null && ev.pointerId === stickId) return;
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

function esc(s: string) {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#39;" }[c] || c));
}

function paintBoss() {
  const el = $<HTMLElement>("boss-hud");
  if (!el || !battle) return;
  const boss = battle.elites.find((e) => e.kind === "boss" && e.alive && e.hp > 0);
  if (!boss) { el.hidden = true; return; }
  el.hidden = false;
  const phase = boss.phase >= 3 ? "Последняя фаза" : boss.phase === 2 ? "Вторая фаза" : "Первая фаза";
  const name = el.querySelector("b");
  if (!name || name.textContent !== boss.name) {
    el.innerHTML = `<b></b><div class="boss-track"><i></i></div><span></span>`;
    el.querySelector("b")!.textContent = boss.name;
  }
  const bar = el.querySelector("i") as HTMLElement | null;
  const meta = el.querySelector("span");
  if (bar) bar.style.width = Math.max(0, Math.min(100, boss.maxHp > 0 ? boss.hp / boss.maxHp * 100 : 0)) + "%";
  if (meta) meta.textContent = `${Math.max(0, Math.ceil(boss.hp))} / ${boss.maxHp} · ${phase}`;
}

function rememberChest(raw: PersonalChest, x: number, y: number) {
  if (!raw?.id) return;
  const i = knownChests.findIndex((c) => c.id === raw.id);
  if (i >= 0) knownChests[i] = raw;
  else knownChests.push(raw);
  if (profile.pending && (!profile.pending.hero || profile.pending.hero === profile.hero)) {
    const drops = profile.pending.drops || [];
    const j = drops.findIndex((c) => c.id === raw.id);
    if (j >= 0) drops[j] = raw;
    else profile.pending.drops = [...drops, raw];
  }
  if (battle && !raw.missed && raw.left?.length) {
    battle.placeChest({ id: raw.id, x, y, open: false, kind: raw.source, name: raw.name });
  }
}

function chestById(id: string) {
  return listDrops(profile).find((c) => c.id === id) || knownChests.find((c) => c.id === id && !c.missed && c.left.length) || null;
}

function showLoot(id: string) {
  if (!chestById(id)) { toast("Сундук ещё считается"); return; }
  if (battle && !battle.remote && !chestHold) {
    battle.paused = true;
    chestHold = true;
  }
  openChestId = id;
  paintLoot(id);
}

function hideLoot() {
  const panel = $<HTMLElement>("loot-panel");
  if (panel) panel.hidden = true;
  openChestId = "";
  if (chestHold && battle) {
    battle.paused = false;
    chestHold = false;
  }
}

function paintLoot(id: string) {
  const panel = $<HTMLElement>("loot-panel");
  const card = $<HTMLElement>("loot-card");
  const chest = chestById(id);
  if (!panel || !card || !chest) { hideLoot(); return; }
  openChestId = id;
  panel.hidden = false;
  const rows = chest.items.filter((it) => chest.left.includes(it.id));
  const openList = battle ? battle.chests.filter((c) => !c.open) : listDrops(profile);
  const tabs = openList.length < 2 ? "" : openList.map((c) => {
    const row = "left" in c ? c : chestById(c.id);
    if (!row || !("source" in row)) return "";
    return `<button type="button" class="btn${row.id === id ? " gold" : ""}" data-chest="${esc(row.id)}">${esc(row.name)}</button>`;
  }).join("");
  card.innerHTML = `<div class="row"><h2>Сундук</h2><button type="button" class="btn" id="loot-x">Закрыть</button></div>
    <p>${esc(chest.name)} · ${chest.source === "boss" ? "босс" : "генерал"}. Свободно в сумке ${bagFree(profile)}.</p>
    ${tabs ? `<div class="row chest-tabs">${tabs}</div>` : ""}
    <div class="chest-rows">${rows.map((it) => {
      const cmp = chestCompare(profile, it);
      return `<article class="loot" style="border-color:${RARITY_COLOR[it.rarity]}"><div class="tip-head">${slotHtml(it, "")}<div><b style="color:${RARITY_COLOR[it.rarity]}">${esc(it.name)}</b><div>${RARITY_NAME[it.rarity]} · ур. ${it.ilvl}</div></div></div><div class="cmp"><div><b>Слот</b><span>${esc(cmp.slot)}</span></div><div><b>Надето</b><span>${esc(cmp.worn)}</span></div><div><b>В сундуке</b><span>${esc(cmp.next)}</span></div></div></article>`;
    }).join("") || "<p>Пусто.</p>"}</div>
    <div class="row"><button type="button" class="btn gold" id="loot-take">Забрать всё</button></div>
    <p class="derived" id="loot-status"></p>`;
  card.querySelector<HTMLButtonElement>("#loot-x")!.onclick = () => hideLoot();
  card.querySelector<HTMLButtonElement>("#loot-take")!.onclick = () => { void claimChestNow(id); };
  card.querySelectorAll<HTMLButtonElement>("[data-chest]").forEach((b) => { b.onclick = () => paintLoot(b.dataset.chest || id); });
}

function noteTake(id: string, r: { moved?: Item[]; left?: number; already?: boolean }) {
  const moved = r.moved?.length || 0;
  const left = r.left ?? 0;
  const line = r.already && !moved ? "Уже забрано." : left ? `В сумке ${moved}. В сундуке осталось ${left}: места нет.` : moved ? `Забрано ${moved}.` : "Пусто.";
  const known = knownChests.find((c) => c.id === id);
  if (known && !left) known.left = [];
  if (!left) {
    const world = battle?.chests.find((c) => c.id === id);
    if (world) world.open = true;
    hideLoot();
    toast(line);
  } else if (openChestId === id) {
    paintLoot(id);
    const status = $<HTMLElement>("loot-status");
    if (status) status.textContent = line;
  } else toast(line);
  paintPills();
  if (view === "hub") renderHub();
}

async function claimChestNow(id: string) {
  if (ws && ws.readyState === 1 && room) {
    ws.send(JSON.stringify({ type: "take", id }));
    return;
  }
  if (online) {
    const data = await act({ op: "take", id });
    if (!data || data.err) return;
    noteTake(id, data.report || { moved: [], left: 0, already: true });
    return;
  }
  const got = takeDrop(profile, id);
  saveLocal();
  if ("err" in got) return toast(got.err);
  noteTake(id, got);
}

async function flushDrops(_now: number) {
  if (!battle || battle.remote) return;
  const live = battle;
  for (const s of live.takeFresh()) waitDrops.push(s);
  if (!waitDrops.length || dropFlight) return;
  dropFlight++;
  try {
    const batch = waitDrops.splice(0, waitDrops.length);
    for (const s of batch) {
      if (battle !== live) return;
      const again = await askDrop(s);
      if (again && battle === live) waitDrops.push(s);
    }
  } finally {
    dropFlight--;
  }
}

async function askDrop(s: { id: string; name: string; x: number; y: number }): Promise<boolean> {
  if (online) {
    const data = await api("/musou/act", { op: "drop", source: s.id, name: s.name });
    if (data?.profile) profile = normalize(data.profile);
    if (!data) return true;
    if (data.err) return String(data.err).includes("ещё не выходил");
    const chest = data.report?.chest as PersonalChest | undefined;
    if (chest) rememberChest(chest, s.x, s.y);
    return false;
  }
  const r = noteDrop(profile, s.id, s.name, Date.now());
  if ("err" in r) return r.err.includes("ещё не выходил");
  saveLocal();
  rememberChest(r.chest, s.x, s.y);
  return false;
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
  $<HTMLElement>("net-pill").textContent = online ? (verified ? "в сети" : "гость") : "здесь";
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
    if (battle.bossDown) {
      battle.reason = "win";
      battle.phase = "won";
      endFight();
      return;
    }
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
    if (fresh && key === "g") {
      if (openChestId) hideLoot();
      else useQ = true;
    }
    const map: Record<string, number> = { q: 1, e: 2, r: 3, f: 4 };
    if (fresh && map[key]) queueSkill(map[key]);
  });
  window.addEventListener("keyup", (e) => {
    keys.delete(e.key.toLowerCase());
    if (e.key.toLowerCase() === "j") holding = false;
  });
  const field = $<HTMLCanvasElement>("field");
  field.addEventListener("pointerdown", (e) => {
    if (e.pointerId === stickId) return;
    if (e.pointerType === "mouse") {
      mouseAim = true;
      if (e.button === 0) holding = true;
      if (e.button === 2) heavyQ = true;
    } else {
      aimHeld = true;
      aimPointer = e.pointerId;
    }
    aimFrom(e);
  });
  field.addEventListener("pointerup", (e) => {
    if (e.pointerType === "mouse") holding = false;
    if (e.pointerId === aimPointer) { aimHeld = false; aimPointer = -1; }
  });
  field.addEventListener("pointercancel", (e) => {
    if (e.pointerType === "mouse") holding = false;
    if (e.pointerId === aimPointer) { aimHeld = false; aimPointer = -1; }
  });
  field.addEventListener("pointermove", (e) => {
    if (e.pointerId === stickId) return;
    if (e.pointerType === "mouse") { mouseAim = true; aimFrom(e); }
    else if (aimHeld && e.pointerId === aimPointer) aimFrom(e);
  });
  field.addEventListener("contextmenu", (e) => { e.preventDefault(); heavyQ = true; });
  const stopScroll = (e: Event) => { if (document.body.classList.contains("in-fight")) e.preventDefault(); };
  document.addEventListener("touchmove", stopScroll, { passive: false });
  document.addEventListener("gesturestart", stopScroll);
  const st = $<HTMLElement>("stick");
  const knob = st.querySelector("i") as HTMLElement;
  const moveStick = (e: PointerEvent) => {
    const r = st.getBoundingClientRect();
    const dx = e.clientX - (r.left + r.width / 2);
    const dy = e.clientY - (r.top + r.height / 2);
    const v = stickVector(dx, dy, r.width * 0.46);
    stick.x = v.x;
    stick.y = v.y;
    const reach = r.width * 0.30;
    knob.style.transform = `translate(${stick.x * reach}px, ${stick.y * reach}px)`;
  };
  const endStick = (e: PointerEvent) => {
    if (stickId !== -1 && e.pointerId !== stickId) return;
    stick.on = false;
    stick.x = 0;
    stick.y = 0;
    stickId = -1;
    knob.style.transform = "";
  };
  st.addEventListener("pointerdown", (e) => {
    if (stickId !== -1 && e.pointerId !== stickId) return;
    e.preventDefault();
    e.stopPropagation();
    stickId = e.pointerId;
    stick.on = true;
    st.setPointerCapture(e.pointerId);
    moveStick(e);
  });
  st.addEventListener("pointermove", (e) => { if (e.pointerId === stickId) { e.preventDefault(); moveStick(e); } });
  st.addEventListener("pointerup", endStick);
  st.addEventListener("pointercancel", endStick);
  st.addEventListener("lostpointercapture", endStick);
  window.addEventListener("resize", resize);
  const holdBtn = (id: string, down: () => void, up?: () => void) => {
    const el = $<HTMLButtonElement>(id);
    if (!el) return;
    el.addEventListener("pointerdown", (e) => {
      if (e.button !== 0) return;
      e.preventDefault();
      e.stopPropagation();
      el.setPointerCapture(e.pointerId);
      down();
    });
    el.addEventListener("pointerup", () => up?.());
    el.addEventListener("pointercancel", () => up?.());
  };
  holdBtn("m-light", () => { holding = true; }, () => { holding = false; });
  holdBtn("m-heavy", () => { heavyQ = true; });
  holdBtn("m-dodge", () => { dodgeQ = true; });
  holdBtn("m-use", () => {
    if (openChestId) hideLoot();
    else useQ = true;
  });
  document.getElementById("skills-touch")?.addEventListener("pointerdown", (e) => {
    const b = (e.target as HTMLElement).closest("button");
    if (!b) return;
    e.preventDefault();
    e.stopPropagation();
    queueSkill(Number((b as HTMLButtonElement).dataset.sk));
  });
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
  else { floorPick = openFloor(); renderMenu(); show("menu"); }
  (window as any).__orda = { get battle() { return battle; }, get profile() { return profile; } };
  requestAnimationFrame(loop);
}

boot();
