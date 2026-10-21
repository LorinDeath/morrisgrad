// Графика пропсов (только отрисовка у клиента, на механику и коллизии не влияет): админка «🖼 Графика» (kind='gfx', id='main').
// Живые (применяются сразу): fpsMul, glow, lt.*, em.*. При загрузке страницы (клиент кэширует в localStorage, со следующей загрузки):
// props3Pc / props3Mobile, pack16, packGlow, lightSprites. arena3 — со следующей арены забега.
export const LIGHT_TYPES = ["warm", "fire", "cool", "violet", "lime", "portal"] as const; // lantern; torch/campfire; crystal; star_crystal; pylon; порталы/алтарь
export const EMIT_KEYS = ["lantern", "torch", "campfire", "crystal", "star_crystal", "pylon"] as const;
const lt = () => ({ haloS: 1, haloK: 1, poolS: 1, poolK: 1 });
const em = () => Object.fromEntries(EMIT_KEYS.map((k) => [k, { x: -1, y: -1 }])) as Record<string, { x: number; y: number }>;
export const GFX_CFG: any = {
  props3Pc: true,      // ПК: пропсы 32 (props3) при «Текстуры: Новые (32)»
  props3Mobile: false, // телефон: то же (по умолчанию выкл — телефоны на props2 даже с «Новыми»)
  pack16: false,       // базовые листы props3 как RGBA 5551 (вдвое меньше VRAM); выкл: на 5551 light-fidelity ловит ΔS≈−0.026 у обелиска
  packGlow: true,      // листы *_glow как RGBA 5551 (аддитивное свечение, разница не видна)
  lightSprites: true,  // ореолы и пятна огней — пиксельные спрайты light_halo/light_pool (props3); выкл — радиальный градиент
  fallbackV2: true,    // ключи из src/assets/mc/props3/fallback_v2.json (портал) при props3 рисуются из props2, пока нет нового арта
  arena3: false,       // забег: замены 3D-мешей арены спрайтами props3 (x64), со следующей арены; только при props3 на странице
  assetCache: true,    // кэш ресурсов у игрока (public/mc-sw.js + boot/assetCache.js); выкл — аварийно: снять воркер и стереть кэш у всех, кто зайдёт
  // видеопамять по требованию (engine/vramStream.js): бюджет МБ, grace с, радиус загрузки и гистерезис в клетках, загрузка в GPU мс/кадр
  vram: { budgetPc: 1024, budgetMob: 512, gracePc: 20, graceMob: 10, loadTilesPc: 50, loadTilesMob: 50, hystTiles: 6, marginTiles: 4, upMsPc: 4, upMsMob: 2 },
  fpsMul: 1,           // скорость анимации пропсов, ×
  glow: 1,             // сила свечения *_glow пропсов, ×
  lt: Object.fromEntries(LIGHT_TYPES.map((t) => [t, lt()])), // ореол/пятно по типу огня: размер и сила, ×
  em: { v3: em(), v2: em() }, // ручная точка излучения, px кадра (−1 — авто: центроид свечения)
};
const cl = (v: any, a: number, b: number, d: number) => { const n = Number(v); return Number.isFinite(n) ? Math.max(a, Math.min(b, n)) : d; };
const b = (v: any, d: boolean) => (typeof v === "boolean" ? v : d);
export const gfxClient = () => {
  const G = GFX_CFG;
  return { props3Pc: b(G.props3Pc, true), props3Mobile: b(G.props3Mobile, false), pack16: b(G.pack16, false), packGlow: b(G.packGlow, true), lightSprites: b(G.lightSprites, true), fallbackV2: b(G.fallbackV2, true), arena3: b(G.arena3, false),
    assetCache: b(G.assetCache, true),
    vram: (() => { const v = G.vram || {}; return { budgetPc: cl(v.budgetPc, 128, 8192, 1024), budgetMob: cl(v.budgetMob, 64, 4096, 512), gracePc: cl(v.gracePc, 1, 600, 20), graceMob: cl(v.graceMob, 1, 600, 10),
      loadTilesPc: cl(v.loadTilesPc, 20, 150, 50), loadTilesMob: cl(v.loadTilesMob, 20, 150, 50), hystTiles: cl(v.hystTiles, 1, 40, 6), marginTiles: cl(v.marginTiles, 0, 20, 4), upMsPc: cl(v.upMsPc, 0.5, 16, 4), upMsMob: cl(v.upMsMob, 0.5, 16, 2) }; })(),
    fpsMul: cl(G.fpsMul, 0.25, 3, 1), glow: cl(G.glow, 0, 3, 1),
    lt: Object.fromEntries(LIGHT_TYPES.map((t) => { const o = G.lt?.[t] || {}; return [t, { haloS: cl(o.haloS, 0.2, 3, 1), haloK: cl(o.haloK, 0, 3, 1), poolS: cl(o.poolS, 0.2, 3, 1), poolK: cl(o.poolK, 0, 3, 1) }]; })),
    em: Object.fromEntries(["v3", "v2"].map((s) => [s, Object.fromEntries(EMIT_KEYS.map((k) => { const o = G.em?.[s]?.[k] || {}; return [k, { x: cl(o.x, -1, 128, -1), y: cl(o.y, -1, 128, -1) }]; }))])) };
};
