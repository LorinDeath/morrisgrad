// Смена дня и ночи в открытом мире (Аринар) — отдельный модуль (не трогает HUD/стили; слияние с ui-cursed-rework без конфликтов).
// Часы и настройки — с сервера (server/meta/dayNight.ts: dnAt — одна формула у сервера и клиента), между сообщениями
// клиент ведёт часы сам (плавно, каждый кадр): закат/рассвет по 30 мин с ease-in-out и ключевыми цветами.
//
// Свет — маска: буфер (¼…½ экрана) заливается «цветом неба» (грейд × темнота), поверх аддитивно рисуются пятна света
// (герои, мобы, огни пропсов и города, маг/купола/розы, снаряды), затем полноэкранный квад УМНОЖАЕТ кадр на маску.
// Днём (темнота 0, цвет белый) проход не выполняется вовсе. Интерфейс (DOM) не затрагивается. Забеги — не трогаем.
import { dnAt, DN_CFG, hex3, lampK } from '../../../../../server/meta/dayNight.ts';
import { toX, toZ } from './geometry.js';

// источники света среди пропсов мира: ключ/шаблон → [цвет, радиус пятна м, сила, высота головы м (ореол у огня; 0 — только пятно)]
import { emitterOffsetM, emitterWorld, emitterGround, setEmitterCamera, setEmitterOverrides } from './lightEmitter.js';
const PROP_LIGHT = [
  [/^(dm_lantern_pole)/, 0xffbf66, 5.2, 1.08, 3.4], [/^(lantern|dm_lantern|dm_lamp)/, 0xffc36b, 4.6, 1.0, 1.6], [/^(torch|dm_torch)/, 0xff9a3c, 4.0, 1, 1.4],
  [/^(campfire|dm_campfire|dm_cookfire|dm_brazier|dm_fire)/, 0xff7a22, 6.0, 0.88, 0.7],
  [/^dm_hearth/, 0xff9a4a, 4.5, 1, 0.8], [/^dm_candle/, 0xffd08a, 2.2, 0.7, 0.6], [/^dm_cauldron/, 0xffa860, 2.6, 0.6, 0.6], [/window/, 0xffcf7a, 3.0, 0.7, 1.4], [/^dm_fountain/, 0x8fb6ff, 4.0, 0.35, 0],
  [/^dm_glitch_sprout/, 0x7fe0ff, 1.5, 0.38, 0], [/^(crystal|star_crystal)/, 0x9be8ff, 2.6, 0.5, 0], [/^(portal|altar|obelisk)/, 0xb38bff, 4.5, 0.7, 0], [/^pylon/, 0xa78bfa, 3.6, 0.7, 0], [/^glitch_shard/, 0x7fe0ff, 2.0, 0.45, 0],
];
/** «характер» огня 0…1 по месту: когда он загорится/погаснет (вразнобой) */
export const lampHash = (x, z) => { const v = Math.sin(x * 12.9898 + z * 78.233) * 43758.5453; return v - Math.floor(v); };
export const lightOf = (k) => { for (const L of PROP_LIGHT) if (L[0].test(k)) return L; return null; };
/** живой огонь (костёр/факел/жаровня) — мерцает заметно; фонари/окна — едва */
export const FIRE = /campfire|cookfire|torch|brazier|_fire|hearth|candle|hell_flame/;
/** настройки огней (админка «Огни», kind lamps): мерцание, ореол, вытянутость пятна */
export const LT = { flickFire: 0.22, flickLamp: 0.06, flickSpeed: 1, halo: 1, poolEl: 1.22,
  // сила поверх маски ночи (аддитивно, без пересвета): ореолы и _glow-слои по виду огня
  haloFire: 0.34, haloLamp: 0.6, haloWindow: 0.22, haloDoor: 0.36, glowFire: 0.32, glowLamp: 0.7, glowWindow: 0.3, nightFire: 0, nightLamp: 0.5, nightWindow: 0.25 };
/** _glow-слой в основном кадре ночью (под маской): у огня — 0, иначе пятно маски пересвечивает его до белого */
export const nightGlow = (kind) => LT[{ fire: 'nightFire', window: 'nightWindow' }[kind] || 'nightLamp'] ?? 0.35;
/** сила ореола/свечения огня над маской: kind — fire | lamp | window | door */
export const lampGlowK = (kind, halo) => (halo ? LT[{ fire: 'haloFire', window: 'haloWindow', door: 'haloDoor' }[kind] || 'haloLamp'] : LT[{ fire: 'glowFire', window: 'glowWindow' }[kind] || 'glowLamp']) ?? 0.5;
export function flickerOf(T, x, z, fire) {
  const sp = LT.flickSpeed || 1, a = fire ? LT.flickFire : LT.flickLamp;
  const w = fire ? 0.55 * Math.sin(T * 0.0112 * sp + x * 3.1) + 0.3 * Math.sin(T * 0.0291 * sp + z * 5.3) + 0.15 * Math.sin(T * 0.0613 * sp + x * 1.7)
                 : Math.sin(T / 130 * sp + x * 3.1) * Math.sin(T / 217 * sp + z * 1.7);
  return 1 - a * (0.5 - 0.5 * w);
}
const G2 = [0, 0], W3 = [0, 0, 0];
const KEY = 'mc-dn-reduce';
/** «Смягчить ночь» 0…100 (Настройки, на этом устройстве): меньше темноты для читаемости */
export function dnReduceGet() { try { const v = localStorage.getItem(KEY); return v == null ? 0 : Math.max(0, Math.min(100, Number(v) || 0)); } catch (_) { return 0; } }
export function dnReduceSet(v) { try { localStorage.setItem(KEY, String(Math.round(v))); } catch (_) {} }

export class DayNight {
  constructor(THREE, stage, { mobile = false } = {}) {
    this.THREE = THREE; this.stage = stage; this.mobile = mobile; this.q = 0;
    this.base = { min: 12 * 60, rate: 1, t: performance.now() }; this.state = dnAt(720); this.active = false; this.stats = { lights: 0, ms: 0 };
    this.rt = new THREE.WebGLRenderTarget(4, 4, { minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter, depthBuffer: false });
    // пятна света на земле: один InstancedMesh, свой атрибут цвета × силы на экземпляр (instanceColor в three r128 давал чёрный — пятна не светили)
    const geo = new THREE.PlaneBufferGeometry(1, 1); geo.rotateX(-Math.PI / 2);
    this.lcol = new THREE.InstancedBufferAttribute(new Float32Array(384 * 3), 3); this.lcol.setUsage(THREE.DynamicDrawUsage); geo.setAttribute('aCol', this.lcol);
    this.lmat = new THREE.ShaderMaterial({
      vertexShader: 'attribute vec3 aCol; varying vec3 vC; varying vec2 vUv; void main(){ vUv = uv; vC = aCol; gl_Position = projectionMatrix * modelViewMatrix * instanceMatrix * vec4(position, 1.0); }',
      // мягкое пятно: плотное ядро и длинный спад (как прежний радиальный градиент 1 → 0.62 → 0.18 → 0)
      fragmentShader: 'varying vec3 vC; varying vec2 vUv; void main(){ float r = length(vUv - 0.5) * 2.0; float a = clamp(1.0 - r, 0.0, 1.0); a = a * a * (3.0 - 2.0 * a); gl_FragColor = vec4(vC * a, 1.0); }',
      transparent: true, depthTest: false, depthWrite: false, blending: THREE.CustomBlending, blendEquation: THREE.AddEquation, blendSrc: THREE.OneFactor, blendDst: THREE.OneFactor,
    });
    this.lights = new THREE.InstancedMesh(geo, this.lmat, 384); this.lights.instanceMatrix.setUsage(THREE.DynamicDrawUsage); this.lights.frustumCulled = false; this.lights.count = 0;
    this.lscene = new THREE.Scene(); this.lscene.add(this.lights);
    // умножение кадра на маску
    this.cmat = new THREE.ShaderMaterial({
      uniforms: { tMask: { value: this.rt.texture } },
      vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }',
      fragmentShader: 'uniform sampler2D tMask; varying vec2 vUv; void main(){ gl_FragColor = vec4(texture2D(tMask, vUv).rgb, 1.0); }',
      transparent: true, depthTest: false, depthWrite: false,
      blending: THREE.CustomBlending, blendEquation: THREE.AddEquation, blendSrc: THREE.ZeroFactor, blendDst: THREE.SrcColorFactor,
    });
    const quad = new THREE.Mesh(new THREE.PlaneBufferGeometry(2, 2), this.cmat); quad.frustumCulled = false;
    this.cscene = new THREE.Scene(); this.cscene.add(quad); this.ccam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    this.d = new THREE.Object3D(); this.c = new THREE.Color(); this.clear = new THREE.Color();
    this.propCache = new Map(); // ключ чанка → [[x,z,col,r,k]]
  }
  /** dn с сервера: { cfg, min, rate } — минута суток и скорость хода часов */
  setServer(d) {
    if (!d) return;
    if (d.cfg) { Object.assign(DN_CFG, d.cfg); if (d.cfg.lt && typeof d.cfg.lt === 'object') Object.assign(LT, d.cfg.lt); // админка «День и ночь» → огни: вживую
      if ('emitters' in d.cfg) { let o = {}; try { o = d.cfg.emitters ? JSON.parse(d.cfg.emitters) : {}; } catch (_) {} const s = JSON.stringify(o); if (s !== this.emSig) { this.emSig = s; setEmitterOverrides(o); this.propCache?.clear?.(); this.emVer = (this.emVer || 0) + 1; } } }
    if (Number.isFinite(d.min)) this.base = { min: d.min, rate: Number(d.rate) || 1, t: performance.now() };
  }
  /** отладка/скриншоты: закрепить минуту суток локально (null — снова часы сервера) */
  pinAt(m) { if (typeof m === 'string' && /^\d{1,2}:\d{2}$/.test(m)) { const [h, mm] = m.split(':').map(Number); m = h * 60 + mm; } this.pin = m == null ? null : ((Number(m) % 1440) + 1440) % 1440; }
  minutes() { if (this.pin != null) return this.pin; return (((this.base.min + ((performance.now() - this.base.t) / 60000) * this.base.rate) % 1440) + 1440) % 1440; }
  /** авто-качество/текстуры: 0 — ½ экрана, 1 — ⅓, 2+ (и телефоны) — ¼ */
  setQuality(level) { this.q = level | 0; }
  /** кадр: active — открытый мир (Аринар, не в доме); src — откуда брать источники */
  frame(active, src) {
    const s = (this.state = dnAt(this.minutes(), DN_CFG));
    const red = Math.min(dnReduceGet(), Math.max(0, Math.min(100, Number(DN_CFG.reduceMax ?? 100)))) / 100; // админка: максимум ползунка
    const col = s.color.map((c) => c + (1 - c) * red * 0.65);
    this.active = !!active && DN_CFG.on !== false && (col[0] < 0.995 || col[1] < 0.995 || col[2] < 0.995);
    this.col = col;
    if (!this.active) { this.lights.count = 0; return; }
    const T0 = performance.now(), L = this.lights, d = this.d, c = this.c; let n = 0;
    const dark = 1 - Math.min(col[0], col[1], col[2]);
    const put = (x, z, color, rM, k, h = 0.02, el = 1) => { if (n >= L.instanceMatrix.count || k <= 0.01) return; d.position.set(x, h, z); d.scale.set(rM * 2 * el, 1, rM * 2); d.updateMatrix(); L.setMatrixAt(n, d.matrix); c.set(color).multiplyScalar(k); this.lcol.setXYZ(n, c.r, c.g, c.b); n++; };
    // герои: мягкий личный свет (всегда, пока темно) — герой не темнее ~0.82 (BLK_FX.heroLight)
    const pr = Number(DN_CFG.playerLightM) || 6, pk = Math.min(1, 0.95 * dark + 0.05);
    for (const p of src.players || []) put(toX(p.x), toZ(p.y), p.me ? 0xfff1dc : 0xe8e4ff, p.me ? pr : pr * 0.8, p.me ? pk : pk * 0.8);
    // NPC: мягкий тёплый свет — жителей видно ночью (диалог, квесты)
    for (const q of src.npcs || []) put(toX(q.x), toZ(q.y), 0xffe6c4, pr * 0.55, pk * 0.62);
    // мобы: слабое читаемое свечение (силуэт не теряется в темноте)
    const mk = (Number(DN_CFG.mobLight) || 0) * dark;
    if (mk > 0.01) for (const m of src.mobs || []) put(toX(m.x), toZ(m.y), m.boss ? 0xff6a8a : 0xb48cff, m.boss ? 3.4 : 2.3, (m.boss ? 0.6 : 0.42) * mk);
    // огни пропсов/города — каждый загорается сам (вразнобой с начала заката) и гаснет вразнобой на рассвете;
    // пятно у основания + ореол у головы фонаря (высота h — пятно проецируется туда, где на экране огонь)
    const tl = Number(DN_CFG.townLight) || 0, mins = this.minutes();
    if (tl > 0.01) for (const q of this.propLights(src)) {
      const lk = lampK(mins, q[6] ?? lampHash(q[0], q[1]), DN_CFG) * tl; if (lk <= 0.01) continue;
      const fl = flickerOf(T0, q[0], q[1], !!q[8]); // огонь (костёр/факел) мерцает сильнее, фонари — едва
      // q[7] — смещение огня в плоскости спрайта [вправо, вверх] м (lightEmitter): пятно — на земле ПРЯМО ПОД огнём (чуть вытянуто
      // по горизонтали в 3/4), ореол — в самой точке огня; без q[7] (старые источники) — по центру, ореол на высоте q[5]
      const fk = q[9] ?? 1, flk = 1 - fk * (1 - fl), kk = Number(LT[q[8] ? 'kFire' : q[10] === 'window' || q[10] === 'door' ? 'kWindow' : 'kLamp'] ?? 1), pr0 = q[3] * (Number(LT.pool) || 1); if (kk <= 0.001) continue;
      if (q[7]) { emitterGround(q[0], q[1], q[7], G2); put(G2[0], G2[1], q[2], pr0, q[4] * lk * flk * kk, 0.02, LT.poolEl);
        emitterWorld(q[0], 0, q[1], q[7], 0, W3); put(W3[0], W3[2], q[2], Math.max(1.0, q[3] * 0.3 * LT.halo), Math.min(1, q[4] * 0.95 * kk) * lk * flk, W3[1]); }
      else { put(q[0], q[1], q[2], pr0, q[4] * lk * flk * kk);
        if (q[5] > 0) put(q[0], q[1], q[2], Math.max(1.2, q[3] * 0.34 * LT.halo), Math.min(1, q[4] * 0.95 * kk) * lk * flk, q[5]); }
    }
    // FX: маг, купола, розы, снаряды — светятся сами
    for (const f of src.fx || []) put(toX(f.x), toZ(f.y), f.c, f.r, f.k * Math.max(0.3, dark));
    L.count = n; L.instanceMatrix.needsUpdate = true; this.lcol.needsUpdate = true;
    this.stats.lights = n; this.stats.ms = +(performance.now() - T0).toFixed(2);
  }
  /** сила огня 0…1 сейчас (h — его хэш): для ореолов/свечения спрайтов поверх маски */
  lamp(h) { return lampK(this.minutes(), h, DN_CFG) * (Number(DN_CFG.townLight) || 0); }
  /** огни пропсов из видимых чанков (кэш по чанку) */
  propLights(src) {
    const out = [], fx = src.fx0 || 0, fz = src.fz0 || 0, R2 = (src.viewM || 60) ** 2;
    for (const ch of src.chunks || []) {
      let a = this.propCache.get(ch.key);
      if (!a) { a = []; for (const p of ch.props || []) { const L = lightOf(String(p.k || '')); if (L) { const x = toX(p.x), z = toZ(p.y), sc = p.s || 1, off = emitterOffsetM(String(p.k), { s: sc, flip: !!p.f, set: 'world' }); a.push([x, z, L[1], L[2] * sc, L[3], (L[4] || 0) * sc, lampHash(x, z), off, FIRE.test(String(p.k)), 1]); } } this.propCache.set(ch.key, a); if (this.propCache.size > 200) this.propCache.delete(this.propCache.keys().next().value); }
      for (const q of a) if ((q[0] - fx) ** 2 + (q[1] - fz) ** 2 < R2) out.push(q);
    }
    for (const q of src.extra || []) out.push(q);
    return out;
  }
  /** после кадра: маска → умножение. Возвращает true, если проход выполнен */
  render(renderer, camera) {
    if (!this.active) return false;
    const T = this.THREE, s = renderer.getDrawingBufferSize(this._v || (this._v = new T.Vector2()));
    const k = this.mobile || this.q >= 2 ? 0.25 : this.q === 1 ? 0.34 : 0.5;
    const w = Math.max(16, Math.round(s.x * k)), h = Math.max(16, Math.round(s.y * k));
    if (this.rt.width !== w || this.rt.height !== h) this.rt.setSize(w, h);
    const prevClear = renderer.getClearColor(this.clear).getHex(), prevA = renderer.getClearAlpha(), prevAuto = renderer.autoClear, tm = renderer.toneMapping;
    renderer.setRenderTarget(this.rt); renderer.toneMapping = T.NoToneMapping;
    renderer.setClearColor(new T.Color(this.col[0], this.col[1], this.col[2]), 1); renderer.clear(true, false, false);
    renderer.render(this.lscene, camera);
    renderer.setRenderTarget(null); renderer.autoClear = false;
    renderer.render(this.cscene, this.ccam);
    renderer.autoClear = prevAuto; renderer.toneMapping = tm; renderer.setClearColor(prevClear, prevA);
    return true;
  }
  debug() { const s = this.state, m = this.minutes(); return { time: `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(Math.floor(m % 60)).padStart(2, '0')}`, min: +m.toFixed(2), phase: s.phase, p: +s.p.toFixed(3), dark: +s.dark.toFixed(3), lights: +s.lights.toFixed(3), color: this.col?.map((x) => +x.toFixed(3)), active: this.active, n: this.stats.lights, ms: this.stats.ms, reduce: dnReduceGet() }; }
}
export { hex3 };
