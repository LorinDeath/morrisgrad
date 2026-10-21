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
  arena3: false,       // забег: замены 3D-мешей арены спрайтами props3 (x64) + пол/кромка/парапет/декали arena32, со следующей арены; только при props3 на странице
  arena3Wall: "auto",  // парапет arena32: auto — ПК спрайты, телефон запечён в пол; sprites; baked
  arena3Posts: 1,      // угловые столбы на диагоналях: 1 — все, n — каждый n-й (остальные — стык «на ус» без столба)
  arena3Tall: true,    // высокое кольцо arena_wall_* за парапетом
  arena3TallGap: 1.5,  // насколько кольцо arena_wall_* дальше парапета, м
  arena3Rim: false,    // тонкая подсветка-обод (торус) поверх кромки
  arena3Cracks: 18,    // трещин на полу (декали arena32)
  arena3GlowW: 0.5,    // вес светящихся анимированных вариантов пола (README: 0.5, иначе руны рябят)
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
    arena3Wall: ["auto", "sprites", "baked"].includes(G.arena3Wall) ? G.arena3Wall : "auto", arena3Posts: Math.round(cl(G.arena3Posts, 1, 6, 1)), arena3Tall: b(G.arena3Tall, true),
    arena3TallGap: cl(G.arena3TallGap, 0, 8, 1.5), arena3Rim: b(G.arena3Rim, false), arena3Cracks: Math.round(cl(G.arena3Cracks, 0, 80, 18)), arena3GlowW: cl(G.arena3GlowW, 0, 3, 0.5),
    fpsMul: cl(G.fpsMul, 0.25, 3, 1), glow: cl(G.glow, 0, 3, 1),
    lt: Object.fromEntries(LIGHT_TYPES.map((t) => { const o = G.lt?.[t] || {}; return [t, { haloS: cl(o.haloS, 0.2, 3, 1), haloK: cl(o.haloK, 0, 3, 1), poolS: cl(o.poolS, 0.2, 3, 1), poolK: cl(o.poolK, 0, 3, 1) }]; })),
    em: Object.fromEntries(["v3", "v2"].map((s) => [s, Object.fromEntries(EMIT_KEYS.map((k) => { const o = G.em?.[s]?.[k] || {}; return [k, { x: cl(o.x, -1, 128, -1), y: cl(o.y, -1, 128, -1) }]; }))])) };
};
