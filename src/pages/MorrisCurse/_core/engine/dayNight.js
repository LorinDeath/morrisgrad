// Смена дня и ночи в открытом мире (Аринар) — отдельный модуль (не трогает HUD/стили; слияние с ui-cursed-rework без конфликтов).
// Часы и настройки — с сервера (server/meta/dayNight.ts: dnAt — одна формула у сервера и клиента), между сообщениями
// клиент ведёт часы сам (плавно, каждый кадр): закат/рассвет по 30 мин с ease-in-out и ключевыми цветами.
//
// Свет — маска: буфер (¼…½ экрана) заливается «цветом неба» (грейд × темнота), поверх аддитивно рисуются пятна света
// (герои, мобы, огни пропсов и города, маг/купола/розы, снаряды), затем полноэкранный квад УМНОЖАЕТ кадр на маску.
// Днём (темнота 0, цвет белый) проход не выполняется вовсе. Интерфейс (DOM) не затрагивается. Забеги — не трогаем.
import { dnAt, DN_CFG, hex3 } from '../../../../../server/meta/dayNight.ts';
import { toX, toZ } from './geometry.js';

// источники света среди пропсов мира: ключ/шаблон → [цвет, радиус м, сила]
const PROP_LIGHT = [
  [/^(lantern|dm_lantern|dm_lamp)/, 0xffc36b, 4.2, 0.95], [/^(torch|dm_torch)/, 0xff9a3c, 3.8, 1], [/^(campfire|dm_campfire|dm_brazier|dm_fire)/, 0xff8a2a, 5.2, 1.1],
  [/^dm_hearth/, 0xff9a4a, 4.5, 1], [/^dm_candle/, 0xffd08a, 2.2, 0.7], [/window/, 0xffcf7a, 3.0, 0.7], [/^dm_fountain/, 0x8fb6ff, 4.0, 0.55],
  [/^(crystal|star_crystal)/, 0x9be8ff, 2.6, 0.5], [/^(portal|altar|obelisk)/, 0xb38bff, 4.5, 0.7], [/^pylon/, 0xa78bfa, 3.6, 0.7], [/^glitch_shard/, 0x7fe0ff, 2.0, 0.45],
];
const lightOf = (k) => { for (const L of PROP_LIGHT) if (L[0].test(k)) return L; return null; };
const KEY = 'mc-dn-reduce';
/** «Смягчить ночь» 0…100 (Настройки, на этом устройстве): меньше темноты для читаемости */
export function dnReduceGet() { try { const v = localStorage.getItem(KEY); return v == null ? 0 : Math.max(0, Math.min(100, Number(v) || 0)); } catch (_) { return 0; } }
export function dnReduceSet(v) { try { localStorage.setItem(KEY, String(Math.round(v))); } catch (_) {} }

export class DayNight {
  constructor(THREE, stage, { mobile = false } = {}) {
    this.THREE = THREE; this.stage = stage; this.mobile = mobile; this.q = 0;
    this.base = { min: 12 * 60, rate: 1, t: performance.now() }; this.state = dnAt(720); this.active = false; this.stats = { lights: 0, ms: 0 };
    this.rt = new THREE.WebGLRenderTarget(4, 4, { minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter, depthBuffer: false });
    // пятна света на земле: один InstancedMesh, цвет × сила на экземпляр (аддитивно в маску)
    const cv = document.createElement('canvas'); cv.width = cv.height = 64; const g = cv.getContext('2d');
    const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32); gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.35, 'rgba(255,255,255,0.62)'); gr.addColorStop(0.7, 'rgba(255,255,255,0.18)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
    const geo = new THREE.PlaneBufferGeometry(1, 1); geo.rotateX(-Math.PI / 2);
    this.lmat = new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(cv), transparent: true, depthTest: false, depthWrite: false, blending: THREE.AdditiveBlending, fog: false });
    this.lights = new THREE.InstancedMesh(geo, this.lmat, 384); this.lights.instanceMatrix.setUsage(THREE.DynamicDrawUsage); this.lights.frustumCulled = false; this.lights.count = 0;
    this.lights.setColorAt(0, new THREE.Color(1, 1, 1));
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
    if (d.cfg) Object.assign(DN_CFG, d.cfg);
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
    const red = dnReduceGet() / 100;
    const col = s.color.map((c) => c + (1 - c) * red * 0.65);
    this.active = !!active && DN_CFG.on !== false && (col[0] < 0.995 || col[1] < 0.995 || col[2] < 0.995);
    this.col = col;
    if (!this.active) { this.lights.count = 0; return; }
    const T0 = performance.now(), L = this.lights, d = this.d, c = this.c; let n = 0;
    const lk = s.lights, dark = 1 - Math.min(col[0], col[1], col[2]);
    const put = (x, z, color, rM, k, h = 0.02) => { if (n >= L.instanceMatrix.count || k <= 0.01) return; d.position.set(x, h, z); d.scale.set(rM * 2, 1, rM * 2); d.updateMatrix(); L.setMatrixAt(n, d.matrix); c.set(color).multiplyScalar(k); L.setColorAt(n, c); n++; };
    // герои: мягкий личный свет (всегда, пока темно) — герой не темнее ~0.82 (BLK_FX.heroLight)
    const pr = Number(DN_CFG.playerLightM) || 6, pk = Math.min(1, 0.95 * dark + 0.05);
    for (const p of src.players || []) put(toX(p.x), toZ(p.y), p.me ? 0xfff1dc : 0xe8e4ff, p.me ? pr : pr * 0.8, p.me ? pk : pk * 0.8);
    // мобы: небольшое свечение (глаза/огни)
    const mk = (Number(DN_CFG.mobLight) || 0) * dark;
    if (mk > 0.01) for (const m of src.mobs || []) put(toX(m.x), toZ(m.y), m.boss ? 0xff6a8a : 0xb48cff, m.boss ? 3.2 : 1.6, (m.boss ? 0.55 : 0.32) * mk);
    // огни пропсов/города — загораются на закате с lightsOn и гаснут на рассвете
    const tk = (Number(DN_CFG.townLight) || 0) * lk;
    if (tk > 0.01) for (const q of this.propLights(src)) { const fl = 0.9 + 0.1 * Math.sin(T0 / 130 + q[0] * 3.1); put(q[0], q[1], q[2], q[3], q[4] * tk * fl); }
    // FX: маг, купола, розы, снаряды — светятся сами
    for (const f of src.fx || []) put(toX(f.x), toZ(f.y), f.c, f.r, f.k * Math.max(0.3, dark));
    L.count = n; L.instanceMatrix.needsUpdate = true; if (L.instanceColor) L.instanceColor.needsUpdate = true;
    this.stats.lights = n; this.stats.ms = +(performance.now() - T0).toFixed(2);
  }
  /** огни пропсов из видимых чанков (кэш по чанку) */
  propLights(src) {
    const out = [], fx = src.fx0 || 0, fz = src.fz0 || 0, R2 = (src.viewM || 60) ** 2;
    for (const ch of src.chunks || []) {
      let a = this.propCache.get(ch.key);
      if (!a) { a = []; for (const p of ch.props || []) { const L = lightOf(String(p.k || '')); if (L) a.push([toX(p.x), toZ(p.y), L[1], L[2] * (p.s || 1), L[3]]); } this.propCache.set(ch.key, a); if (this.propCache.size > 200) this.propCache.delete(this.propCache.keys().next().value); }
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
