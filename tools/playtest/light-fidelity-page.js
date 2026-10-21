// Цветовая точность спрайтов под светом (запускает light-fidelity.cjs, только локально через vite).
// Настоящие классы движка (Stage, atmosphere, PixCharacter, makePortal/propObject, SpriteBatch, PropSprites, terrain) рисуют
// объекты камерой игры, со светом зоны (GRADE), ореолами, пятнами огней и тенями. Для каждого внутреннего (не у края силуэта)
// пикселя кадра атласа считаем точку на экране и сравниваем: ожидание = пиксель атласа × тон зоны × яркость (+ своё свечение *_glow).
// ?repo=/workspace/mg-light — какую копию движка проверять (для «до» — origin/main в соседнем worktree).
let REPO = '/workspace/mg-light';
const imp = (p) => import(/* @vite-ignore */ `/@fs${REPO}/src/pages/MorrisCurse/_core/${p}`);

function loadThree() {
  return new Promise((res, rej) => { if (window.THREE) return res(window.THREE); const s = document.createElement('script'); s.src = '/js/three.min.js'; s.onload = () => res(window.THREE); s.onerror = rej; document.head.appendChild(s); });
}
const imgCache = new Map();
function pixelsOf(img) {
  if (imgCache.has(img)) return imgCache.get(img);
  const cv = document.createElement('canvas'); cv.width = img.width; cv.height = img.height;
  const g = cv.getContext('2d'); g.drawImage(img, 0, 0); const d = { w: img.width, h: img.height, a: g.getImageData(0, 0, img.width, img.height).data };
  imgCache.set(img, d); return d;
}
const rgb2sv = (r, g, b) => { const mx = Math.max(r, g, b), mn = Math.min(r, g, b); return [mx > 1e-6 ? (mx - mn) / mx : 0, mx]; };

export async function run(opts = {}) {
  if (opts.repo) REPO = opts.repo;
  const THREE = await loadThree();
  const { Stage } = await imp('engine/stage.js');
  const { atmo, GRADE } = await imp('engine/atmosphere.js');
  const { toX, toZ } = await imp('engine/geometry.js');
  const pix = await imp('engine/pixSprites.js');
  const { makePortal } = await imp('engine/models.js');
  const { loadPropTextures, PropSprites } = await imp('engine/propAtlas.js');
  const { SpriteBatch } = await imp('engine/spriteBatch.js');
  const { buildTerrain } = await imp('worlds/terrain.js');
  const pc = await imp('engine/pixColor.js').catch(() => null); // в «до» модуля нет
  const LIGHT = pc?.LIGHT || { hero: 1, props: 1, glow: 1, ground: 0.84 };
  if (opts.light && pc) pc.setLightCfg(opts.light); // значения админки «💡 Свет» для прогона
  const { PROPS_META, propVariant } = await import(/* @vite-ignore */ `/@fs${REPO}/server/meta/propsV2.ts`);

  const W = 900, H = 700;
  const canvas = document.createElement('canvas'); canvas.width = W; canvas.height = H; canvas.style.cssText = `width:${W}px;height:${H}px`; document.body.appendChild(canvas);
  const stage = new Stage(THREE, canvas, { mobile: !!opts.mobile });
  stage.resize(true);
  stage.setEnvironment({ sky: 0x17122e, fog: { color: 0x1d1538, near: 400, far: 900 }, hemi: { sky: 0xb7a2ff, ground: 0x2c3a3a, intensity: 0.95 }, sun: { color: 0xc4b0ff, intensity: 0.6 } });
  atmo.init(THREE, stage, { mobile: !!opts.mobile });
  const atl = await pix.loadPixAtlases(THREE); const ptex = await loadPropTextures(THREE);
  const gl = stage.renderer.getContext();
  // сцена: тёмная земля (непрозрачная, пишет глубину — как тайлы) + объекты в ряд
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(400, 400), new THREE.MeshBasicMaterial({ color: 0x101418 }));
  floor.rotation.x = -Math.PI / 2; floor.position.y = -0.002; stage.scene.add(floor);
  const PX0 = 600, PY0 = 600, X0 = toX(PX0), Z0 = toZ(PY0); // точка мира, вокруг неё всё стоит

  const frame = (dt = 0.016) => { atmo.begin(); atmo.end(dt, opts.world || 'hellfire', PX0, PY0); stage.follow(focus.x, focus.z, dt, true); stage.camera.updateMatrixWorld(); stage.render(); };
  const focus = { x: X0, z: Z0 };
  const readAll = () => { const b = new Uint8Array(W * H * 4); gl.readPixels(0, 0, W, H, gl.RGBA, gl.UNSIGNED_BYTE, b); return b; };
  const v = new THREE.Vector3();
  const toScreen = (anchor, ox, oy) => { // anchor — мировая точка якоря; ox, oy — смещение в пространстве вида (м)
    v.copy(anchor).applyMatrix4(stage.camera.matrixWorldInverse); v.x += ox; v.y += oy; v.applyMatrix4(stage.camera.projectionMatrix);
    return [Math.floor((v.x + 1) / 2 * W), Math.floor((v.y + 1) / 2 * H)]; // y снизу (как readPixels)
  };

  /** проверка одного объекта: L = [{ img, fx, fy, fw, fh, mul:[r,g,b] }...] (слой 0 — основа, остальные — аддитивное свечение) */
  function measure(name, anchor, sx, sy, cx, cy, layers, buf, flip = false) {
    const B = pixelsOf(layers[0].img), { fx, fy, fw, fh } = layers[0];
    const op = (i, j) => i >= 0 && j >= 0 && i < fw && j < fh && B.a[((fy + j) * B.w + fx + i) * 4 + 3] >= 250;
    let n = 0, sdv = 0, sds = 0, clip = 0, worst = 0, wpair = null; const errs = [];
    for (let j = 1; j < fh - 1; j++) for (let i = 1; i < fw - 1; i++) {
      if (!(op(i, j) && op(i - 1, j) && op(i + 1, j) && op(i, j - 1) && op(i, j + 1) && op(i - 1, j - 1) && op(i + 1, j + 1) && op(i - 1, j + 1) && op(i + 1, j - 1))) continue;
      const u = flip ? 1 - (i + 0.5) / fw : (i + 0.5) / fw, vv = 1 - (j + 0.5) / fh;
      const [X, Y] = toScreen(anchor, (u - cx) * sx, (vv - cy) * sy);
      if (X < 1 || Y < 1 || X >= W - 1 || Y >= H - 1) continue;
      const e = [0, 0, 0];
      for (const L of layers) { const P = pixelsOf(L.img), o = ((L.fy + j) * P.w + L.fx + i) * 4, a = L.glow ? P.a[o + 3] / 255 : 1;
        for (let c = 0; c < 3; c++) e[c] += (P.a[o + c] / 255) * L.mul[c] * a; }
      for (let c = 0; c < 3; c++) e[c] = Math.min(1, e[c]);
      const o = (Y * W + X) * 4, r = [buf[o] / 255, buf[o + 1] / 255, buf[o + 2] / 255];
      const [es, ev] = rgb2sv(...e), [rs, rv] = rgb2sv(...r);
      const d = Math.max(Math.abs(r[0] - e[0]), Math.abs(r[1] - e[1]), Math.abs(r[2] - e[2]));
      n++; sdv += Math.abs(rv - ev); sds += rs - es; errs.push(d); if (d > worst) { worst = d; wpair = [e.map((x) => +x.toFixed(3)), r.map((x) => +x.toFixed(3)), i, j]; }
      if (Math.min(...r) >= 0.96 && Math.min(...e) < 0.85) clip++;
    }
    errs.sort((a, b) => a - b);
    return { name, n, dV: +(sdv / Math.max(1, n)).toFixed(4), dS: +(sds / Math.max(1, n)).toFixed(4), p95: +(errs[Math.floor(errs.length * 0.95)] || 0).toFixed(4), worst: +worst.toFixed(3), clip, wpair };
  }

  const moods = opts.only === 'ground' ? [] : opts.moods || ['meadow', 'b_ice', 'b_fire', 'b_stone', 'b_air', 'crypt', 'hub'];
  const results = [];
  // объекты (в ряд по X, шаг 4 м)
  const heroes = ['spearman', 'rogue', 'mage', 'warrior'], looks = ['imp', 'golem', 'dream_moth'];
  const chars = [...heroes, ...looks.map((l) => 'look:' + l)].map((k, i) => { const c = new pix.PixCharacter(THREE, k); c.group.position.set(X0 - 9 + i * 2.6, 0, Z0 + 3.5); stage.scene.add(c.group); return { k, c }; });
  const portal = makePortal(THREE, { id: 'portal_arinar', color: '#818cf8' }); portal.group.position.set(X0 - 6, 0, Z0 - 3); stage.scene.add(portal.group);
  const altar = makePortal(THREE, { id: 'portal_class_select', color: '#38bdf8' }); altar.group.position.set(X0 + 0, 0, Z0 - 3); stage.scene.add(altar.group);
  // пропсы SpriteBatch (факел, бочка, обелиск) + мобы/NPC SpriteBatch — контроль: свой шейдер всегда был верным
  const props = new PropSprites(THREE, ptex, { max: 16, parent: stage.scene });
  const PL = [['torch', X0 + 4, Z0 - 3], ['barrel', X0 + 6, Z0 - 3], ['obelisk', X0 + 8, Z0 - 3]];
  const mobB = new SpriteBatch(THREE, atl.mobs, { cellW: pix.MOB_CELL.w, cellH: pix.MOB_CELL.h, cols: pix.MOB_CELL.cols, rows: pix.MOB_CELL.rows, max: 8 }); stage.scene.add(mobB.mesh);
  const npcB = new SpriteBatch(THREE, atl.heroes, { cellW: pix.HERO_CELL.w, cellH: pix.HERO_CELL.h, cols: pix.HERO_CELL.cols, rows: pix.HERO_CELL.rows, max: 8 }); stage.scene.add(npcB.mesh);
  // источники света сцены: портал, алтарь и факел (ореолы + пятна, как в игре)
  const wpx = (x) => (x + 30) * 20;
  atmo.setScene('hellfire', { props: PL.map(([k, x, z]) => ({ k, x: wpx(x), y: wpx(z), s: 1 })) }, [{ id: 'portal_arinar', world: 'hellfire', x: wpx(X0 - 6), y: wpx(Z0 - 3) }, { id: 'portal_class_select', world: 'hellfire', x: wpx(X0), y: wpx(Z0 - 3) }]);
  for (let i = 0; i < 100; i++) { let ok = true; for (const o of [portal, altar]) o.group.traverse((x) => { if (x.isSprite && !x.material.map?.image?.width) ok = false; }); if (ok) break; await new Promise((r) => setTimeout(r, 100)); }
  focus.x = X0; focus.z = Z0; stage.view.zoom = stage.view.targetZoom = opts.zoom || 0.5;

  for (const mood of moods) {
    atmo.moodFor = () => mood; atmo.t = 0;
    for (let i = 0; i < 3; i++) frame(100); // настроение — сразу целиком (lerp k = 1)
    const G = GRADE.value, g = [G.r, G.g, G.b];
    const T = 1.234;
    for (const { c } of chars) c.update(0, false, T, 0, 1);
    portal.update(T); altar.update(T);
    props.begin(); for (const [k, x, z] of PL) props.push(k, wpx(x), wpx(z), x, z, 1); props.end();
    mobB.begin(); mobB.push(X0 - 8, 0, Z0 + 8.5, pix.MOB_HEIGHT.imp, 1, pix.MOB_ROWS.imp); mobB.push(X0 - 4, 0, Z0 + 8.5, pix.MOB_HEIGHT.ghoul, 1, pix.MOB_ROWS.ghoul); mobB.end();
    npcB.begin(); npcB.push(X0, 0, Z0 + 8.5, pix.HERO_H_M, 1, pix.NPC_ROWS.alzi); npcB.end();
    atmo.parts.visible = false; atmo.end = ((f) => function (...a) { f.apply(this, a); this.parts.visible = false; })(atmo.end); // частицы (светлячки, искры) — эффект, не свет на спрайте
    frame(0.016); const buf = readAll();
    const R = [];
    // персонажи THREE.Sprite
    for (const { k, c } of chars) {
      const sp = c.sprite, t = c.tex, img = t.image, cols = c.cell.cols, rows = c.cell.rows;
      const col = Math.round(t.offset.x * cols), row = rows - 1 - Math.round(t.offset.y * rows);
      const kh = k.startsWith('look:') ? LIGHT.hero : (pix.BLK_FX.heroLight * LIGHT.hero);
      const a = new THREE.Vector3(); sp.getWorldPosition(a);
      R.push(measure(k, a, sp.scale.x, sp.scale.y, sp.center.x, sp.center.y, [{ img, fx: col * c.cell.w, fy: row * c.cell.h, fw: c.cell.w, fh: c.cell.h, mul: g.map((x) => x * kh) }], buf));
    }
    // одиночные пропсы: портал (основа + свечение вихря), алтарь
    for (const [name, obj, glowCol] of [['portal', portal, '#818cf8'], ['altar', altar, null]]) {
      const sps = []; obj.group.traverse((o) => { if (o.isSprite) sps.push(o); });
      const base = sps.find((s) => s.material.blending !== THREE.AdditiveBlending), gs = sps.find((s) => s.material.blending === THREE.AdditiveBlending);
      const m = base.material.map; if (!m?.image) { R.push({ name, err: 'no map' }); continue; }
      const iw = m.image.width, ih = m.image.height, fw = Math.round(m.repeat.x * iw), fh = Math.round(m.repeat.y * ih);
      const fx = Math.round(m.offset.x * iw), fy = ih - fh - Math.round(m.offset.y * ih);
      const L = [{ img: m.image, fx, fy, fw, fh, mul: g.map((x) => x * LIGHT.props) }];
      if (gs?.material.map?.image) { const gm = gs.material.map, gc = new THREE.Color(glowCol || 0xffffff); L.push({ img: gm.image, glow: true, fx: Math.round(gm.offset.x * gm.image.width), fy: gm.image.height - fh - Math.round(gm.offset.y * gm.image.height), fw, fh, mul: [gc.r * g[0] * LIGHT.glow, gc.g * g[1] * LIGHT.glow, gc.b * g[2] * LIGHT.glow] }); }
      const a = new THREE.Vector3(); base.getWorldPosition(a);
      R.push(measure(name, a, base.scale.x, base.scale.y, base.center.x, base.center.y, L, buf));
    }
    // SpriteBatch (контроль): пропсы с *_glow, мобы, NPC
    for (const [k, x, z] of PL) {
      const key = propVariant(k, wpx(x), wpx(z)), d = key && PROPS_META.keys[key]; if (!d) continue; // тот же вариант, что выбрал PropSprites.push
      const S = PROPS_META.sheets[d.sheet], img = ptex[d.sheet].image, h = S.frameH / 10, w = h * S.frameW / S.frameH;
      if (d.frames > 1) continue; // кадр анимации считает шейдер по uTime — меряем только статичные пропсы
      const L = [{ img, fx: d.col * S.frameW, fy: d.row * S.frameH, fw: S.frameW, fh: S.frameH, mul: g }];
      if (d.glow) L.push({ img: ptex[d.glow.sheet].image, glow: true, fx: d.col * S.frameW, fy: d.row * S.frameH, fw: S.frameW, fh: S.frameH, mul: g });
      R.push(measure('prop:' + k, new THREE.Vector3(x, 0, z), w, h, 0.5, 0, L, buf));
    }
    for (const [nm, x, row, hh, B, cell] of [['mob:imp', X0 - 8, pix.MOB_ROWS.imp, pix.MOB_HEIGHT.imp, atl.mobs, pix.MOB_CELL], ['mob:ghoul', X0 - 4, pix.MOB_ROWS.ghoul, pix.MOB_HEIGHT.ghoul, atl.mobs, pix.MOB_CELL], ['npc:alzi', X0, pix.NPC_ROWS.alzi, pix.HERO_H_M, atl.heroes, pix.HERO_CELL]])
      R.push(measure(nm, new THREE.Vector3(x, 0, Z0 + 8.5), hh * cell.w / cell.h, hh, 0.5, 0, [{ img: B.image, fx: 1 * cell.w, fy: row * cell.h, fw: cell.w, fh: cell.h, mul: g }], buf));
    results.push({ mood, grade: g.map((x) => +x.toFixed(3)), items: R });
  }
  // земля: настоящая Поляна (terrain.js), пропсы скрыты; ожидание = тайл × LIGHT.ground
  if (opts.only === 'ground') {
    for (const o of [...stage.scene.children]) if (o !== floor && !o.isLight && o.type !== 'InstancedMesh' && o.type !== 'Points') o.visible = false;
    floor.visible = false;
    const T = await buildTerrain(THREE, 'hellfire'); stage.scene.add(T.group); T.group.traverse((o) => { if (o.name === 'props') o.visible = false; });
    atmo.setScene('hellfire', { props: [] }, []); atmo.moodFor = () => 'hub';
    const gpx = [[300, 900], [900, 300], [1000, 1000]];
    const gr = [];
    for (const [gx, gy] of gpx) {
      focus.x = toX(gx); focus.z = toZ(gy); stage.view.zoom = stage.view.targetZoom = 1.5; for (let i = 0; i < 3; i++) frame(100); frame(0.016);
      const buf = readAll(), m = T.ground, img = m.material.map.image, P = pixelsOf(img), span = m.geometry.parameters.width;
      let n = 0, sdv = 0, sds = 0, clip = 0; const errs = [];
      for (let k = 0; k < 4000; k++) {
        const X = 40 + Math.floor(Math.random() * (W - 80)), Y = 40 + Math.floor(Math.random() * (H - 80));
        const ray = new THREE.Raycaster(); ray.setFromCamera({ x: (X + 0.5) / W * 2 - 1, y: (Y + 0.5) / H * 2 - 1 }, stage.camera);
        const hit = ray.ray.intersectPlane(new THREE.Plane(new THREE.Vector3(0, 1, 0), 0), new THREE.Vector3()); if (!hit) continue;
        const u = (hit.x - m.position.x) / span + 0.5, vv = -(hit.z - m.position.z) / span + 0.5;
        const ti = Math.floor(u * P.w), tj = Math.floor((1 - vv) * P.h); if (ti < 1 || tj < 1 || ti >= P.w - 1 || tj >= P.h - 1) continue;
        // только внутри однотонных 3×3 текселей (без границ текселя и фильтрации)
        const o0 = (tj * P.w + ti) * 4; let same = true; for (let a = -1; a <= 1 && same; a++) for (let b = -1; b <= 1; b++) { const o1 = ((tj + a) * P.w + ti + b) * 4; if (Math.abs(P.a[o1] - P.a[o0]) + Math.abs(P.a[o1 + 1] - P.a[o0 + 1]) + Math.abs(P.a[o1 + 2] - P.a[o0 + 2]) > 6) { same = false; break; } }
        if (!same) continue;
        const e = [0, 1, 2].map((c) => Math.min(1, P.a[o0 + c] / 255 * LIGHT.ground)), o = (Y * W + X) * 4, r = [buf[o] / 255, buf[o + 1] / 255, buf[o + 2] / 255];
        const [es, ev] = rgb2sv(...e), [rs, rv] = rgb2sv(...r); const d = Math.max(...[0, 1, 2].map((c) => Math.abs(r[c] - e[c])));
        n++; sdv += Math.abs(rv - ev); sds += rs - es; errs.push(d); if (Math.min(...r) >= 0.96 && Math.min(...e) < 0.85) clip++;
      }
      errs.sort((a, b) => a - b);
      gr.push({ name: `ground@${gx},${gy}`, n, dV: +(sdv / Math.max(1, n)).toFixed(4), dS: +(sds / Math.max(1, n)).toFixed(4), p95: +(errs[Math.floor(errs.length * 0.95)] || 0).toFixed(4), worst: +(errs[errs.length - 1] || 0).toFixed(3), clip });
    }
    results.push({ mood: 'ground(hub)', grade: [LIGHT.ground], items: gr });
  }
  return { repo: REPO, light: { ...LIGHT }, heroLight: pix.BLK_FX.heroLight, results };
}
