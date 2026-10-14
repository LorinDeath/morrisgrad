// «Единый стиль»: один полноэкранный проход поверх 3D-сцены, чтобы меши Three.js, пиксельные спрайты и PNG художников
// выглядели одной картинкой. Сцена рисуется в буфер (sRGB, с глубиной), затем шейдер:
//   1) общий тон: ACES рендерера + плёночная S-кривая поверх всех источников;
//   2) квантование в общую ограниченную палитру (37 цветов, тёмное фэнтези) с лёгким упорядоченным дизерингом Байера 4×4;
//   3) тонкий пиксельный контур по скачкам глубины (силуэты мешей и спрайтов) + немного по яркости;
//   4) лёгкое плёночное зерно.
// Сила 0 — проход выключен полностью (рисуем прямо на экран, как до этого). Интерфейс (DOM) не затронут.
const PALETTE = [ // тёмное фэнтези: ночь, камень, мох и листва, вода, кровь, золото огней, кожа, магия — акценты оставлены для читаемости
  '0b0a12', '1a1626', '2b2438', '3f3550', '5a4d6e', '7d6f91', 'a99cb8', 'dcd3e6',
  '10201c', '1d3a2c', '2f5a3a', '3d6b35', '4a7d43', '5e8a3c', '7aa356', 'b5cf7a', '25463f', '3b6b5e', '5f9483',
  '1c2a40', '2e4a6b', '4c76a0', '7fb0d0', 'c4e4f0',
  '3a1414', '6b1f1f', 'a3302a', 'd9573a',
  '4a2c14', '7d4d22', 'b07a35', 'e3b04b', 'ffe08a',
  '6b4a3a', 'b08a70', '7a2e8a', 'c46ad8',
];
const N = PALETTE.length;
export class UnifyPass {
  constructor(THREE, renderer) {
    this.THREE = THREE; this.renderer = renderer; this.strength = 0; this.outline = 1;
    // буфер в sRGB, как экран: каждый материал (стандартный или свой шейдер со «своим» sRGB) выглядит ровно как без прохода
    this.rt = new THREE.WebGLRenderTarget(4, 4, { type: THREE.UnsignedByteType, encoding: THREE.sRGBEncoding || 3001, minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter, depthBuffer: true });
    this.rt.depthTexture = new THREE.DepthTexture(4, 4); this.rt.depthTexture.type = THREE.UnsignedIntType;
    const pal = PALETTE.map((h) => { const v = parseInt(h, 16); return new THREE.Vector3(((v >> 16) & 255) / 255, ((v >> 8) & 255) / 255, (v & 255) / 255); });
    this.mat = new THREE.ShaderMaterial({
      uniforms: { tCol: { value: this.rt.texture }, tDep: { value: this.rt.depthTexture }, uRes: { value: new THREE.Vector2(4, 4) }, uS: { value: 0 }, uOut: { value: 1 },
        uExp: { value: renderer.toneMappingExposure || 1 }, uNear: { value: 0.1 }, uFar: { value: 400 }, uT: { value: 0 }, uPx: { value: 1 }, uPal: { value: pal } },
      vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }',
      fragmentShader: `
        precision highp float; varying vec2 vUv;
        uniform sampler2D tCol, tDep; uniform vec2 uRes; uniform float uS, uOut, uExp, uNear, uFar, uT, uPx; uniform vec3 uPal[${N}];
        float lin(float d){ float z = d*2.0-1.0; return (2.0*uNear*uFar)/(uFar+uNear - z*(uFar-uNear)); }
        float bayer(vec2 p){ vec2 q = mod(floor(p), 4.0); float i = q.x + q.y*4.0;
          // 4×4 Байер, нормирован в [-0.5, 0.5)
          float b = i<1.?0.:i<2.?8.:i<3.?2.:i<4.?10.:i<5.?12.:i<6.?4.:i<7.?14.:i<8.?6.:i<9.?3.:i<10.?11.:i<11.?1.:i<12.?9.:i<13.?15.:i<14.?7.:i<15.?13.:5.;
          return b/16.0 - 0.47; }
        float hash(vec2 p){ return fract(sin(dot(p, vec2(12.9898, 78.233)) + uT) * 43758.5453); }
        void main(){
          // буфер уже как на экране: ACES рендерера + sRGB (r128 применяет оба и к буферу с encoding sRGB)
          vec3 c = texture2D(tCol, vUv).rgb;
          if (uS > 0.001) {
            // общий плёночный S-тон для всех источников (меши/спрайты/PNG): глубже тени, мягче света
            vec3 sc = c * c * (3.0 - 2.0 * c); c = mix(c, sc, 0.35 * uS);
            vec2 px = gl_FragCoord.xy / uPx; // «пиксель» сетки дизеринга в CSS-пикселях
            vec3 cd = c + bayer(px) * 0.09 * uS;
            vec3 best = c; float bd = 1e9;
            for (int i = 0; i < ${N}; i++) { vec3 d = (cd - uPal[i]) * vec3(0.30, 0.59, 0.11) * 3.0; float e = dot(d, d) * 0.25 + dot((cd - uPal[i]) * vec3(0.9, 1.0, 0.75), (cd - uPal[i]) * vec3(0.9, 1.0, 0.75)); if (e < bd) { bd = e; best = uPal[i]; } }
            // сохраняем яркость исходника (снаряды/свечение не тускнеют), палитра задаёт оттенок
            float lo = dot(c, vec3(0.299, 0.587, 0.114)), lb = dot(best, vec3(0.299, 0.587, 0.114));
            vec3 q = mix(best, best * (lo + 0.02) / (lb + 0.02), 0.3);
            c = mix(c, clamp(q, 0.0, 1.0), min(0.85, 0.7 * uS + 0.1));
            if (uOut > 0.0) {
              vec2 o = uPx / uRes; float d0 = lin(texture2D(tDep, vUv).r);
              float dn = min(min(lin(texture2D(tDep, vUv + vec2(o.x, 0.)).r), lin(texture2D(tDep, vUv - vec2(o.x, 0.)).r)), min(lin(texture2D(tDep, vUv + vec2(0., o.y)).r), lin(texture2D(tDep, vUv - vec2(0., o.y)).r)));
              float edge = smoothstep(0.04, 0.12, (d0 - dn) / max(d0, 0.001)); // сосед заметно ближе → мы снаружи силуэта
              c *= 1.0 - edge * 0.55 * uS * uOut;
            }
            c += (hash(gl_FragCoord.xy) - 0.5) * 0.035 * uS; // зерно
          }
          gl_FragColor = vec4(c, 1.0);
        }`,
      depthTest: false, depthWrite: false,
    });
    this.scene = new THREE.Scene(); this.cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    const q = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.mat); q.frustumCulled = false; this.scene.add(q);
  }
  /** true — кадр нарисован проходом; false — проход выключен, рисуйте как обычно */
  render(scene, camera) {
    if (this.strength <= 0.001) return false;
    const r = this.renderer, T = this.THREE, s = r.getDrawingBufferSize(this._v || (this._v = new T.Vector2()));
    if (this.rt.width !== s.x || this.rt.height !== s.y) { this.rt.setSize(s.x, s.y); this.rt.depthTexture.image.width = s.x; this.rt.depthTexture.image.height = s.y; }
    const u = this.mat.uniforms;
    u.uRes.value.copy(s); u.uS.value = this.strength; u.uOut.value = this.outline; u.uPx.value = r.getPixelRatio();
    u.uNear.value = camera.near; u.uFar.value = camera.far; u.uT.value = (performance.now() % 10000) / 1000; u.uExp.value = r.toneMappingExposure || 1;
    r.setRenderTarget(this.rt); r.render(scene, camera); // ACES + sRGB как на экране
    r.setRenderTarget(null); r.render(this.scene, this.cam);
    return true;
  }
}
