// t1290: кэш ресурсов «Партии Чёрных королей»: сервис-воркер public/strat-sw.js + индекс /strat/precache.json (tools/strat/precache.mjs).
// При старте страницы прогреваем общие спрайты/тайлы/иконки; при начале партии — арт своих рас. Неизменённые файлы больше не качаются.
const RACES = ["fire", "ice", "water", "stone", "nature", "lightning"];
let idx: { files: { p: string; h: string; s: number }[] } | null = null, ready: Promise<ServiceWorker | null> | null = null;
const warmed = new Set<string>();
const post = (sw: ServiceWorker, msg: any) => new Promise<any>((res) => { const ch = new MessageChannel(); ch.port1.onmessage = (e) => res(e.data); sw.postMessage(msg, [ch.port2]); setTimeout(() => res(null), 120000); });
const slow = () => { const c: any = (navigator as any).connection; return !!c && (c.saveData || /2g/.test(c.effectiveType || "")); };
export function startAssetCache(): void {
  if (ready || !("serviceWorker" in navigator) || !("caches" in window)) return;
  ready = (async () => {
    try {
      const r = await fetch("/strat/precache.json", { cache: "no-cache" }); if (!r.ok) return null; idx = await r.json();
      const reg = await navigator.serviceWorker.register("/strat-sw.js", { scope: "/games/strategy", updateViaCache: "none" });
      const sw = reg.active || reg.waiting || reg.installing; if (!sw) return null;
      if (sw.state !== "activated") await new Promise<void>((res) => { sw.addEventListener("statechange", () => sw.state === "activated" && res()); setTimeout(res, 8000); });
      await post(sw, { type: "strat-index", index: idx });
      warm(sw, (p) => slow() ? p.startsWith("/strat/ui/") : !RACES.some((rc) => p.startsWith(`/strat/art/${rc}/`)));
      return sw;
    } catch { return null; }
  })();
}
function warm(sw: ServiceWorker, pick: (p: string) => boolean) {
  const paths = (idx?.files || []).map((f) => f.p).filter((p) => pick(p) && !warmed.has(p)); if (!paths.length) return;
  for (const p of paths) warmed.add(p);
  const go = () => post(sw, { type: "strat-warm", paths });
  (window as any).requestIdleCallback ? (window as any).requestIdleCallback(go, { timeout: 3000 }) : setTimeout(go, 500);
}
/** арт рас партии (свою и соперников) — когда стали известны */
export function warmRaces(races: string[]): void {
  ready?.then((sw) => { if (sw && !slow()) warm(sw, (p) => races.some((rc) => p.startsWith(`/strat/art/${rc}/`))); });
}
