// Сцена Three.js: рендерер, камера «сверху под углом» (как в Vampire Survivors), свет, тени,
// проекция 3D → экран для DOM-подписей и пикинг по земле.
export class Stage {
  constructor(THREE, canvas, { mobile = false } = {}) {
    this.THREE = THREE;
    this.canvas = canvas;
    this.mobile = mobile;
    const renderer = new THREE.WebGLRenderer({ canvas, antialias: !mobile, alpha: false, powerPreference: 'high-performance' });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, mobile ? 1.5 : 2));
    renderer.shadowMap.enabled = !mobile;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    if (THREE.sRGBEncoding) renderer.outputEncoding = THREE.sRGBEncoding;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.15;
    this.renderer = renderer;

    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(42, 1, 0.1, 400);
    this.ortho = new THREE.OrthographicCamera(-10, 10, 10, -10, 0.1, 400);
    this.useOrtho = false;

    this.hemi = new THREE.HemisphereLight(0x9b7bd6, 0x2a1006, 0.55);
    this.scene.add(this.hemi);
    this.ambient = new THREE.AmbientLight(0xffffff, 0.18);
    this.scene.add(this.ambient);
    this.sun = new THREE.DirectionalLight(0xffd9a8, 0.85);
    this.sun.position.set(8, 18, 6);
    this.sun.castShadow = !mobile;
    this.sun.shadow.mapSize.set(1024, 1024);
    const sc = this.sun.shadow.camera;
    sc.left = -22; sc.right = 22; sc.top = 22; sc.bottom = -22; sc.near = 1; sc.far = 60;
    this.sun.shadow.bias = -0.0008;
    this.scene.add(this.sun);
    this.scene.add(this.sun.target);

    // «Зум» в тех же единицах, что и у 2D-версии (0.2…1.5), чтобы HUD/админка не менялись
    this.view = { x: 600, y: 600, zoom: 0.5, targetZoom: 0.5, minZoom: 0.2, maxZoom: 1.5 };
    this.pitch = 1.02; // ~58° над горизонтом: вид сверху под углом
    this.focus = new THREE.Vector3();
    this.width = 1; this.height = 1;
    this.tmp = new THREE.Vector3();
    this.ray = new THREE.Raycaster();
    this.plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
    this.resize(true);
  }

  setEnvironment(env) {
    const THREE = this.THREE;
    this.scene.background = new THREE.Color(env.sky);
    this.scene.fog = new THREE.Fog(env.fog.color, env.fog.near, env.fog.far);
    this.hemi.color.setHex(env.hemi.sky);
    this.hemi.groundColor.setHex(env.hemi.ground);
    this.hemi.intensity = env.hemi.intensity;
    this.sun.color.setHex(env.sun.color);
    this.sun.intensity = env.sun.intensity;
    this.baseFog = { near: env.fog.near, far: env.fog.far };
  }

  resize(force) {
    const w = Math.max(1, Math.round(this.canvas.clientWidth || this.canvas.width || 300));
    const h = Math.max(1, Math.round(this.canvas.clientHeight || this.canvas.height || 300));
    if (!force && w === this.width && h === this.height) return;
    this.width = w; this.height = h;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  // Расстояние камеры из «зума»: 0.5 ≈ стандартный обзор забега
  distance() {
    const portrait = this.height > this.width * 1.15;
    const base = portrait ? 26 : 24;
    return base * Math.pow(0.5 / this.view.zoom, 0.85);
  }

  /** сколько клеток (32 px мира = 1.6 ед.) видно по большей стороне экрана при зуме z */
  viewCells(z = this.view.zoom) {
    const portrait = this.height > this.width * 1.15, base = portrait ? 26 : 24;
    const d = base * Math.pow(0.5 / z, 0.85), half = d * Math.tan((this.camera.fov / 2) * Math.PI / 180);
    const wU = 2 * half * (this.width / Math.max(1, this.height)), hU = (2 * half) / Math.sin(this.pitch);
    return Math.max(wU, hU) / 1.6;
  }
  /** зум, при котором видно cells клеток (viewCells монотонно убывает по зуму) */
  zoomForCells(cells) {
    let lo = 0.01, hi = 3;
    for (let i = 0; i < 40; i++) { const m = (lo + hi) / 2; if (this.viewCells(m) > cells) lo = m; else hi = m; }
    return (lo + hi) / 2;
  }
  follow(x, z, dt, snap = false) {
    const k = snap ? 1 : Math.min(1, dt * 9);
    this.view.zoom += (this.view.targetZoom - this.view.zoom) * Math.min(1, dt * 10);
    this.focus.x += (x - this.focus.x) * k;
    this.focus.z += (z - this.focus.z) * k;
    const d = this.distance();
    this.camera.position.set(this.focus.x, Math.sin(this.pitch) * d, this.focus.z + Math.cos(this.pitch) * d);
    this.camera.lookAt(this.focus.x, 0, this.focus.z);
    if (this.scene.fog && this.baseFog) {
      this.scene.fog.near = this.baseFog.near + d * 0.6;
      this.scene.fog.far = this.baseFog.far + d * 0.9;
    }
    this.sun.position.set(this.focus.x + 8, 20, this.focus.z + 6);
    this.sun.target.position.set(this.focus.x, 0, this.focus.z);
  }

  // Ортографический вид строго сверху для редактора карт (соответствует 2D-математике редактора)
  setOrthoTopDown(centerX, centerZ, unitsPerScreenPx) {
    this.useOrtho = true;
    const hw = (this.width / 2) * unitsPerScreenPx;
    const hh = (this.height / 2) * unitsPerScreenPx;
    const o = this.ortho;
    o.left = -hw; o.right = hw; o.top = hh; o.bottom = -hh;
    o.position.set(centerX, 80, centerZ);
    o.up.set(0, 0, -1);
    o.lookAt(centerX, 0, centerZ);
    o.updateProjectionMatrix();
  }

  activeCamera() { return this.useOrtho ? this.ortho : this.camera; }

  render() {
    this.renderer.render(this.scene, this.activeCamera());
  }

  // 3D-точка → CSS-пиксели внутри канваса. null, если за камерой.
  project(x, y, z) {
    const v = this.tmp.set(x, y, z).project(this.activeCamera());
    if (v.z > 1) return null;
    return { x: (v.x * 0.5 + 0.5) * this.width, y: (-v.y * 0.5 + 0.5) * this.height };
  }

  // Экранная точка (clientX/Y) → точка на земле (y=0)
  groundPoint(clientX, clientY) {
    const rect = this.canvas.getBoundingClientRect();
    const nx = ((clientX - rect.left) / rect.width) * 2 - 1;
    const ny = -((clientY - rect.top) / rect.height) * 2 + 1;
    this.ray.setFromCamera({ x: nx, y: ny }, this.activeCamera());
    const out = new this.THREE.Vector3();
    return this.ray.ray.intersectPlane(this.plane, out) ? out : null;
  }
}
