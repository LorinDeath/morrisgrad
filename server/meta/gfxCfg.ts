// Графика пропсов (только отрисовка у клиента, на механику и коллизии не влияет): админка «🖼 Графика» (kind='gfx', id='main').
// Живые (применяются сразу): fpsMul, glow, lt.*, em.*. При загрузке страницы (клиент кэширует в localStorage, со следующей загрузки):
// props3Pc / props3Mobile, pack16, packGlow, lightSprites. arena3 — со следующей арены забега.
export const LIGHT_TYPES = ["warm", "fire", "cool", "violet", "lime", "portal"] as const; // lantern; torch/campfire; crystal; star_crystal; pylon; порталы/алтарь
export const A3_THEMES = ["crypt", "abyss", "mirror", "abode"] as const;
const A3_AMB: Record<string, number> = { crypt: 0.85, abyss: 1, mirror: 0.75, abode: 0.85 };
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
  arena3Shape: "round", // граница arena32: round — настоящий круг (парапет из куска h по дуге), tiles — автотайл README §4 (ступеньки)
  arena3Wall: "auto",  // парапет arena32: auto — ПК спрайты, телефон запечён в пол; sprites; baked
  arena3Posts: 1,      // угловые столбы на диагоналях: 1 — все, n — каждый n-й (остальные — стык «на ус» без столба)
  arena3Tall: true,    // высокое кольцо arena_wall_* за парапетом (только arena3Shape tiles: у круга кольца нет)
  arena3TallGap: 1.5,  // насколько кольцо arena_wall_* дальше парапета, м
  arena3Rim: false,    // тонкая подсветка-обод (торус) поверх кромки
  arena3Cracks: 18,    // трещин на полу (декали arena32)
  arena3Floor: 1,      // яркость пола арены 32, × (1 — как старая арена; подбор по темам — survivors/arena32.js A32_FLOOR_K)
  arena3Amb: { crypt: 0.85, abyss: 1, mirror: 0.75, abode: 0.85 }, // свет арены 32 по темам: общий фон, экранный × (1 — как превью Художника)
  arena3Lit: 1,        // огни арены 32 (колонны, сигил, свечи, кристаллы, кромка): сила, ×
  arena3Edge: 0.8,    // арена 32: затемнение пола у стены (1 — нет, 0 — чёрный край)
  arena3WallL: 1,   // арена 32: яркость парапета, колонн и декора (свечение огней — полное)
  arena3GlowW: 0.5,    // вес светящихся анимированных вариантов пола (README: 0.5, иначе руны рябят)
  assetCache: true,    // кэш ресурсов у игрока (public/mc-sw.js + boot/assetCache.js); выкл — аварийно: снять воркер и стереть кэш у всех, кто зайдёт
  // видеопамять по требованию (engine/vramStream.js): бюджет МБ, grace с, радиус загрузки и гистерезис в клетках, загрузка в GPU мс/кадр
  vram: { budgetPc: 1024, budgetMob: 512, gracePc: 20, graceMob: 10, loadTilesPc: 50, loadTilesMob: 50, hystTiles: 6, marginTiles: 4, upMsPc: 4, upMsMob: 2 },
  fpsMul: 1,           // скорость анимации пропсов, ×
  glow: 1,             // сила свечения *_glow пропсов, ×
  lt: Object.fromEntries(LIGHT_TYPES.map((t) => [t, lt()])), // ореол/пятно по типу огня: размер и сила, ×
  em: { v3: em(), v2: em() }, // ручная точка излучения, px кадра (−1 — авто: центроид свечения)
  // мобы bestiary32 (Художник, 64 кадра) — всё живое, без перезагрузки (engine/mobPref.js, engine/beast32.js)
  mobs32: true,        // общий выключатель новых спрайтов мобов (выкл — у всех старые, сильнее настройки игрока «Мобы»)
  mobs32Pc: true,      // «Мобы: Новые» по умолчанию на ПК
  mobs32Mobile: false, // то же на телефоне (игрок может включить сам)
  mobs32Run: false,    // забеги (Выживание/Испытание): новые мобы тоже (по умолчанию выкл — забег не трогаем)
  mobFps: 1,           // скорость анимации мобов, ×
  mobGlow: 1,          // сила свечения _glow мобов, ×
  mobHurtFlash: 0,     // белая шейдерная вспышка при попадании поверх новых кадров (0 — нет: вспышка нарисована в кадрах hurt)
  mobGrace: 20,        // страница тира выгружается из видеопамяти через столько секунд без мобов рядом
  mobLoadR: 50,        // радиус подгрузки страниц, тайлов (выгрузка — на +6 тайлов дальше)
  mobPackGlow: true,   // листы _glow мобов как RGBA 5551 (вдвое меньше видеопамяти; со следующей загрузки страницы тира)
};
const cl = (v: any, a: number, b: number, d: number) => { const n = Number(v); return Number.isFinite(n) ? Math.max(a, Math.min(b, n)) : d; };
const b = (v: any, d: boolean) => (typeof v === "boolean" ? v : d);
export const gfxClient = () => {
  const G = GFX_CFG;
  return { props3Pc: b(G.props3Pc, true), props3Mobile: b(G.props3Mobile, false), pack16: b(G.pack16, false), packGlow: b(G.packGlow, true), lightSprites: b(G.lightSprites, true), fallbackV2: b(G.fallbackV2, true), arena3: b(G.arena3, false),
    arena3Shape: G.arena3Shape === "tiles" ? "tiles" : "round", arena3Wall: ["auto", "sprites", "baked"].includes(G.arena3Wall) ? G.arena3Wall : "auto", arena3Posts: Math.round(cl(G.arena3Posts, 1, 6, 1)), arena3Tall: b(G.arena3Tall, true),
    arena3TallGap: cl(G.arena3TallGap, 0, 8, 1.5), arena3Rim: b(G.arena3Rim, false), arena3Cracks: Math.round(cl(G.arena3Cracks, 0, 80, 18)), arena3GlowW: cl(G.arena3GlowW, 0, 3, 0.5), arena3Floor: cl(G.arena3Floor, 0.2, 3, 1),
    arena3Amb: Object.fromEntries(A3_THEMES.map((t) => [t, cl(G.arena3Amb?.[t], 0, 1.5, A3_AMB[t])])), arena3Lit: cl(G.arena3Lit, 0, 3, 1), arena3Edge: cl(G.arena3Edge, 0, 1, 0.8), arena3WallL: cl(G.arena3WallL, 0.2, 1.5, 1),
    assetCache: b(G.assetCache, true),
    vram: (() => { const v = G.vram || {}; return { budgetPc: cl(v.budgetPc, 128, 8192, 1024), budgetMob: cl(v.budgetMob, 64, 4096, 512), gracePc: cl(v.gracePc, 1, 600, 20), graceMob: cl(v.graceMob, 1, 600, 10),
      loadTilesPc: cl(v.loadTilesPc, 20, 150, 50), loadTilesMob: cl(v.loadTilesMob, 20, 150, 50), hystTiles: cl(v.hystTiles, 1, 40, 6), marginTiles: cl(v.marginTiles, 0, 20, 4), upMsPc: cl(v.upMsPc, 0.5, 16, 4), upMsMob: cl(v.upMsMob, 0.5, 16, 2) }; })(),
    fpsMul: cl(G.fpsMul, 0.25, 3, 1), glow: cl(G.glow, 0, 3, 1),
    mobs32: b(G.mobs32, true), mobs32Pc: b(G.mobs32Pc, true), mobs32Mobile: b(G.mobs32Mobile, false), mobs32Run: b(G.mobs32Run, false), mobPackGlow: b(G.mobPackGlow, true),
    mobFps: cl(G.mobFps, 0.25, 3, 1), mobGlow: cl(G.mobGlow, 0, 3, 1), mobHurtFlash: cl(G.mobHurtFlash, 0, 1, 0), mobGrace: cl(G.mobGrace, 2, 600, 20), mobLoadR: cl(G.mobLoadR, 10, 200, 50),
    lt: Object.fromEntries(LIGHT_TYPES.map((t) => { const o = G.lt?.[t] || {}; return [t, { haloS: cl(o.haloS, 0.2, 3, 1), haloK: cl(o.haloK, 0, 3, 1), poolS: cl(o.poolS, 0.2, 3, 1), poolK: cl(o.poolK, 0, 3, 1) }]; })),
    em: Object.fromEntries(["v3", "v2"].map((s) => [s, Object.fromEntries(EMIT_KEYS.map((k) => { const o = G.em?.[s]?.[k] || {}; return [k, { x: cl(o.x, -1, 128, -1), y: cl(o.y, -1, 128, -1) }]; }))])) };
};
