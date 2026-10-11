/* Ящик: Инкрементальная RPG — сцена Three.js, интерфейс, ввод, звук. */
(function () {
  'use strict';
  var C = window.CrateCore, SK = window.CrateSkins;
  var fmt = C.fmt, fmtTime = C.fmtTime, pct = C.pct;

  function $(id) { return document.getElementById(id); }
  function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  function affText(a) { var A = C.AFFIXES[a.id]; return '+' + pct(a.v) + ' ' + A.name; }

  function waitForThree(cb) { if (window.THREE) cb(window.THREE); else setTimeout(function () { waitForThree(cb); }, 40); }

  function boot() {
    var app = $('cr-app');
    if (!app || app.dataset.ready === '1') return;
    app.dataset.ready = '1';
    waitForThree(function (THREE) { start(THREE, app); });
  }

  function start(THREE, app) {
    var game = new C.Game(window.localStorage);
    var migrated = game.load();
    var S = function () { return game.s; };

    // ================================================================ ЗВУК
    var audio = null;
    function unlockAudio() {
      try { if (!audio) audio = new (window.AudioContext || window.webkitAudioContext)(); if (audio.state === 'suspended') audio.resume(); } catch (e) {}
    }
    function tone(type, f0, f1, dur, vol, delay) {
      if (!game.s.settings.sound || !audio || audio.state !== 'running') return;
      try {
        var t = audio.currentTime + (delay || 0), o = audio.createOscillator(), g = audio.createGain();
        o.type = type; o.frequency.setValueAtTime(f0, t); if (f1) o.frequency.exponentialRampToValueAtTime(f1, t + dur);
        g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0008, t + dur);
        o.connect(g); g.connect(audio.destination); o.start(t); o.stop(t + dur + 0.02);
      } catch (e) {}
    }
    function noise(dur, vol) {
      if (!game.s.settings.sound || !audio || audio.state !== 'running') return;
      try {
        var len = Math.floor(audio.sampleRate * dur), buf = audio.createBuffer(1, len, audio.sampleRate), d = buf.getChannelData(0);
        for (var i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 2);
        var src = audio.createBufferSource(), g = audio.createGain(), f = audio.createBiquadFilter();
        f.type = 'lowpass'; f.frequency.value = 1400; src.buffer = buf; g.gain.value = vol;
        src.connect(f); f.connect(g); g.connect(audio.destination); src.start();
      } catch (e) {}
    }
    var sfx = {
      hit: function (crit) { tone('triangle', crit ? 420 : 220 + Math.random() * 60, crit ? 140 : 90, crit ? 0.16 : 0.1, crit ? 0.26 : 0.18); },
      brk: function (boss) { noise(boss ? 0.6 : 0.3, boss ? 0.5 : 0.32); tone('sine', 120, 50, 0.25, 0.25); },
      level: function () { [523, 659, 784, 1046].forEach(function (f, i) { tone('square', f, 0, 0.12, 0.08, i * 0.08); }); },
      loot: function (r) { tone('sine', 660 + r * 120, 0, 0.18, 0.12); tone('sine', 990 + r * 160, 0, 0.25, 0.1, 0.08); },
      buy: function () { tone('sine', 880, 1320, 0.07, 0.08); },
      golden: function () { [784, 988, 1175, 1568].forEach(function (f, i) { tone('triangle', f, 0, 0.15, 0.1, i * 0.06); }); },
      boss: function () { tone('sawtooth', 110, 70, 0.6, 0.12); },
      skill: function () { tone('square', 330, 990, 0.2, 0.08); },
      fail: function () { tone('sawtooth', 300, 80, 0.5, 0.12); }
    };

    // ================================================================ СЦЕНА
    var canvas = $('cr-canvas'), stage = $('cr-stage');
    var renderer = new THREE.WebGLRenderer({ canvas: canvas, antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.outputEncoding = THREE.sRGBEncoding;
    var scene = new THREE.Scene();
    var camera = new THREE.PerspectiveCamera(40, 1, 0.1, 100);
    var hemi = new THREE.HemisphereLight(0xffe2c4, 0x2a1020, 0.5); scene.add(hemi);
    var sun = new THREE.DirectionalLight(0xffd7a0, 1.05);
    sun.position.set(3.5, 6, 4); sun.castShadow = true; sun.shadow.mapSize.set(1024, 1024);
    sun.shadow.camera.left = -3; sun.shadow.camera.right = 3; sun.shadow.camera.top = 3; sun.shadow.camera.bottom = -3;
    scene.add(sun);
    var rim = new THREE.DirectionalLight(0xc084fc, 0.55); rim.position.set(-4, 2.5, -3); scene.add(rim);
    var bossLight = new THREE.PointLight(0xff2a3a, 0, 6); bossLight.position.set(0, 1.2, 1.6); scene.add(bossLight);

    var gc = document.createElement('canvas'); gc.width = gc.height = 256;
    var gx = gc.getContext('2d'); gx.fillStyle = '#000'; gx.fillRect(0, 0, 256, 256);
    var gg = gx.createRadialGradient(128, 128, 20, 128, 128, 128); gg.addColorStop(0, '#fff'); gg.addColorStop(0.5, '#d0d0d0'); gg.addColorStop(1, '#000');
    gx.fillStyle = gg; gx.fillRect(0, 0, 256, 256);
    var groundMat = new THREE.MeshStandardMaterial({ color: 0x3a2028, roughness: 1, flatShading: true, alphaMap: new THREE.CanvasTexture(gc), transparent: true, depthWrite: false });
    var ground = new THREE.Mesh(new THREE.CircleGeometry(3.4, 10), groundMat);
    ground.rotation.x = -Math.PI / 2; ground.receiveShadow = true; scene.add(ground);

    // ящик: rot (вращение) → drop (падение) → squash (сплющивание) → mesh
    var rot = new THREE.Group(), drop = new THREE.Group(), squash = new THREE.Group();
    rot.add(drop); drop.add(squash); scene.add(rot);
    var boxGeo = new THREE.BoxGeometry(1.4, 1.4, 1.4);
    var crate = new THREE.Mesh(boxGeo, SK.get(THREE, 'pine', renderer).material);
    crate.position.y = 0.7; crate.castShadow = true; crate.receiveShadow = true; squash.add(crate);
    var crackMat = new THREE.MeshBasicMaterial({ map: SK.crackTexture(THREE), transparent: true, opacity: 0, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 });
    var cracks = new THREE.Mesh(new THREE.BoxGeometry(1.405, 1.405, 1.405), crackMat); cracks.position.y = 0.7; squash.add(cracks);
    var extras = new THREE.Group(); squash.add(extras);
    var hitbox = new THREE.Mesh(new THREE.BoxGeometry(1.45, 1.5, 1.45), new THREE.MeshBasicMaterial({ visible: false }));
    hitbox.position.y = 0.75; rot.add(hitbox);
    // украшения босса
    var bossDeco = new THREE.Group(); squash.add(bossDeco);
    (function () {
      var bm = new THREE.MeshStandardMaterial({ color: 0x2a2a30, metalness: 0.9, roughness: 0.35, flatShading: true });
      [0.18, 1.22].forEach(function (y) { var b = new THREE.Mesh(new THREE.BoxGeometry(1.48, 0.13, 1.48), bm); b.position.y = y; b.castShadow = true; bossDeco.add(b); });
      var sp = new THREE.MeshStandardMaterial({ color: 0x8a8a90, metalness: 1, roughness: 0.3, flatShading: true });
      for (var i = 0; i < 4; i++) { var c = new THREE.Mesh(new THREE.ConeGeometry(0.1, 0.28, 4), sp); var a = i * Math.PI / 2 + Math.PI / 4; c.position.set(Math.cos(a) * 0.74, 1.46, Math.sin(a) * 0.74); bossDeco.add(c); }
      var aura = new THREE.Mesh(new THREE.BoxGeometry(1.62, 1.62, 1.62), new THREE.MeshBasicMaterial({ color: 0xff1f3d, transparent: true, opacity: 0.18, side: THREE.BackSide, blending: THREE.AdditiveBlending, depthWrite: false }));
      aura.position.y = 0.7; aura.name = 'aura'; bossDeco.add(aura);
    })();
    bossDeco.visible = false;

    // золотой ящик
    var goldMesh = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.5, 0.5), SK.get(THREE, 'gold', renderer).material);
    goldMesh.castShadow = true; goldMesh.visible = false; scene.add(goldMesh);
    var glowTex = (function () {
      var c = document.createElement('canvas'); c.width = c.height = 128; var g = c.getContext('2d');
      var gr = g.createRadialGradient(64, 64, 4, 64, 64, 64); gr.addColorStop(0, 'rgba(255,230,140,0.9)'); gr.addColorStop(0.4, 'rgba(255,200,60,0.35)'); gr.addColorStop(1, 'rgba(255,200,60,0)');
      g.fillStyle = gr; g.fillRect(0, 0, 128, 128); return new THREE.CanvasTexture(c);
    })();
    var goldGlow = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true }));
    goldGlow.scale.set(1.5, 1.5, 1); goldMesh.add(goldGlow);
    var goldLight = new THREE.PointLight(0xffd24a, 1.2, 3); goldMesh.add(goldLight);
    var golden = { active: false, until: 0, x: 0, born: 0 };

    var currentSkin = null, currentSkinData = null;
    var BOSS_SKIN = { 'Окованный сундук': 'oak', 'Мимик': 'mimic', 'Сейф Алзора': 'iron', 'Гроб Склепа': 'charred', 'Сундук Лорин': 'void', 'Ящик Пандоры': 'cosmic' };
    function applyCrateSkin() {
      var id = game.s.skins.cur.crate;
      if (game.boss) id = BOSS_SKIN[C.bossName(game.s.zone)] || id;
      if (id === currentSkin) return;
      currentSkin = id;
      currentSkinData = SK.get(THREE, id, renderer);
      crate.material = currentSkinData.material;
      while (extras.children.length) extras.remove(extras.children[0]);
      if (currentSkinData.extra) currentSkinData.extra(extras);
    }
    function applyBg() {
      var id = game.s.skins.cur.bg, d = C.BG_SKINS.filter(function (b) { return b.id === id; })[0] || C.BG_SKINS[0];
      var tint = C.regionOf(game.s.zone).tint;
      stage.style.background = 'radial-gradient(ellipse at 50% 38%, ' + d.a + ' 0%, ' + tint + ' 45%, ' + d.b + ' 100%)';
      groundMat.color.set(d.ground).convertSRGBToLinear();
      hemi.color.set(d.hemi); rim.color.set(d.rim);
    }

    // ---------------------------------------------------------------- частицы
    var particles = [];
    var pGeo = {
      chip: new THREE.BoxGeometry(0.09, 0.05, 0.16), spark: new THREE.TetrahedronGeometry(0.06), conf: new THREE.PlaneGeometry(0.1, 0.06),
      snow: new THREE.OctahedronGeometry(0.06), gem: new THREE.OctahedronGeometry(0.08), chunk: new THREE.BoxGeometry(0.3, 0.12, 0.5)
    };
    var matCache = {};
    function mat(kind, color) {
      var k = kind + color; if (matCache[k]) return matCache[k];
      var m;
      if (kind === 'basic') m = new THREE.MeshBasicMaterial({ color: color, side: THREE.DoubleSide });
      else if (kind === 'gem') m = new THREE.MeshStandardMaterial({ color: color, metalness: 0.5, roughness: 0.15, flatShading: true, emissive: color, emissiveIntensity: 0.25 });
      else m = new THREE.MeshStandardMaterial({ color: new THREE.Color(color).convertSRGBToLinear(), roughness: 1, flatShading: true });
      return (matCache[k] = m);
    }
    var heartTex = (function () {
      var c = document.createElement('canvas'); c.width = c.height = 64; var g = c.getContext('2d');
      g.fillStyle = '#ff3d7a'; g.beginPath(); g.moveTo(32, 56); g.bezierCurveTo(-8, 28, 14, -4, 32, 18); g.bezierCurveTo(50, -4, 72, 28, 32, 56); g.fill();
      return new THREE.CanvasTexture(c);
    })();
    var heartMat = new THREE.SpriteMaterial({ map: heartTex, depthWrite: false });
    function spawnParticles(point, count, big) {
      if (!game.s.settings.particles) count = Math.ceil(count / 3);
      var fx = game.s.skins.cur.fx, chips = currentSkinData ? currentSkinData.chips : [0x8a5a2e];
      for (var i = 0; i < count; i++) {
        var m;
        if (fx === 'sparks') m = new THREE.Mesh(pGeo.spark, mat('basic', [0xffd24a, 0xff8a1a, 0xfff2a0][i % 3]));
        else if (fx === 'confetti') m = new THREE.Mesh(pGeo.conf, mat('basic', [0xff3d7a, 0x3dd6ff, 0xffe14a, 0x7aff5a, 0xb07aff][i % 5]));
        else if (fx === 'snow') m = new THREE.Mesh(pGeo.snow, mat('basic', [0xffffff, 0xcff4ff][i % 2]));
        else if (fx === 'gems') m = new THREE.Mesh(pGeo.gem, mat('gem', [0x60a5fa, 0xc084fc, 0x4ade80, 0xf43f5e][i % 4]));
        else if (fx === 'hearts') { m = new THREE.Sprite(heartMat); m.scale.set(0.16, 0.16, 1); }
        else m = new THREE.Mesh(pGeo.chip, mat('std', chips[i % chips.length]));
        m.position.copy(point);
        var a = Math.random() * Math.PI * 2, sp = (big ? 2.4 : 1.4) + Math.random() * 2;
        m.userData = { v: new THREE.Vector3(Math.cos(a) * sp * 0.6, 2 + Math.random() * (big ? 3.5 : 2.4), Math.sin(a) * sp * 0.6),
          w: new THREE.Vector3(Math.random() * 12, Math.random() * 12, Math.random() * 12), life: 0.8 + Math.random() * 0.5, age: 0, s0: m.scale.x };
        if (m.isMesh) m.castShadow = false;
        scene.add(m); particles.push(m);
      }
      if (particles.length > 220) particles.splice(0, particles.length - 220).forEach(function (o) { scene.remove(o); });
    }
    var lastChunks = 0;
    function spawnChunks() {
      var now = performance.now(), fast = now - lastChunks < 400;
      lastChunks = now;
      var n = fast ? 3 : (game.s.settings.particles ? 14 : 6);
      for (var i = 0; i < n; i++) {
        var m = new THREE.Mesh(pGeo.chunk, Array.isArray(crate.material) ? crate.material[0] : crate.material);
        m.position.set((Math.random() - 0.5) * 1.1, 0.3 + Math.random() * 1.1, (Math.random() - 0.5) * 1.1);
        m.rotation.set(Math.random() * 3, Math.random() * 3, Math.random() * 3);
        var dir = m.position.clone().setY(0).normalize();
        m.userData = { v: new THREE.Vector3(dir.x * (2 + Math.random() * 2.5), 2.5 + Math.random() * 3, dir.z * (2 + Math.random() * 2.5)),
          w: new THREE.Vector3(Math.random() * 8, Math.random() * 8, Math.random() * 8), life: 1.1 + Math.random() * 0.4, age: 0, s0: 1 };
        m.castShadow = true; scene.add(m); particles.push(m);
      }
    }

    // ---------------------------------------------------------------- анимация ящика
    var anim = { sqV: 0, sq: 0, spin: 0, dropY: 0, dropV: 0, hidden: 0, shake: 0, lastSpawn: 0 };
    function respawnAnim() {
      var now = performance.now(), fast = now - anim.lastSpawn < 600;
      anim.lastSpawn = now;
      // при очень быстром разрушении не прячем ящик — иначе он бы вечно падал
      if (fast) { anim.dropY = 0.35; anim.dropV = 0; anim.hidden = 0; drop.visible = true; }
      else { anim.dropY = 3.2; anim.dropV = 0; anim.hidden = 0.12; }
    }

    // ================================================================ ВВОД
    var raycaster = new THREE.Raycaster(), ndc = new THREE.Vector2();
    function pick(e) {
      var rect = canvas.getBoundingClientRect();
      ndc.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      ndc.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
      raycaster.setFromCamera(ndc, camera);
      if (golden.active) { var gh = raycaster.intersectObject(goldMesh, false); if (gh.length) return { golden: true, point: gh[0].point }; }
      // невидимая «мишень» в точке покоя ящика: клики не теряются, пока новый ящик падает
      hitbox.scale.setScalar(game.boss ? 1.3 : 1);
      hitbox.updateMatrixWorld();
      var h = raycaster.intersectObject(hitbox, false);
      return h.length ? { crate: true, point: h[0].point } : null;
    }
    canvas.addEventListener('pointerdown', function (e) {
      var p = pick(e); if (!p) return;
      e.preventDefault();
      if (p.golden) { catchGolden(); return; }
      doClick(p.point, e.clientX, e.clientY, false);
    });
    canvas.addEventListener('pointermove', function (e) { if (e.pointerType === 'mouse') canvas.style.cursor = pick(e) ? 'pointer' : 'default'; });
    ['pointerup', 'touchend', 'keydown'].forEach(function (ev) { window.addEventListener(ev, unlockAudio, { passive: true }); });
    window.addEventListener('keydown', function (e) {
      if (e.target && /INPUT|TEXTAREA|SELECT/.test(e.target.tagName)) return;
      if (e.code === 'Space') { e.preventDefault(); if (!e.repeat) doClick(null, null, null, false); }
      var n = parseInt(e.key, 10);
      if (n >= 1 && n <= C.SKILLS.length) useSkill(C.SKILLS[n - 1].id);
    });

    var hitPoint = new THREE.Vector3();
    function doClick(point, cx, cy, auto) {
      var r = game.click(auto);
      anim.sqV -= auto ? 3 : 7.5; anim.spin += auto ? 0.6 : 2;
      if (!point) { hitPoint.set((Math.random() - 0.5) * 0.8, 0.7 + (Math.random() - 0.5) * 0.8, 0.72); hitPoint.applyAxisAngle(new THREE.Vector3(0, 1, 0), rot.rotation.y); point = hitPoint; }
      spawnParticles(point, r.crit ? 10 : (auto ? 2 : 6));
      if (!auto || Math.random() < 0.3) sfx.hit(r.crit);
      if (!auto && navigator.vibrate && (!navigator.userActivation || navigator.userActivation.hasBeenActive)) { try { navigator.vibrate(r.crit ? 15 : 6); } catch (e) {} }
      if (game.s.settings.dmgNums) {
        if (cx === null || cx === undefined) { var sp = toScreen(point); cx = sp.x; cy = sp.y; }
        floater((r.crit ? '💥 ' : '') + fmt(r.dmg, true), cx, cy, r.crit ? 'crit' : (auto ? 'auto' : ''));
      }
    }
    function toScreen(v) {
      var p = v.clone().project(camera), rect = canvas.getBoundingClientRect(), srect = stage.getBoundingClientRect();
      return { x: (p.x + 1) / 2 * rect.width + rect.left - srect.left + srect.left, y: (1 - p.y) / 2 * rect.height + rect.top };
    }
    var floatersEl = $('cr-floaters');
    function floater(text, cx, cy, cls) {
      if (floatersEl.childElementCount > 30) floatersEl.removeChild(floatersEl.firstChild);
      var r = stage.getBoundingClientRect(), f = document.createElement('div');
      f.className = 'cr-floater ' + (cls || ''); f.textContent = text;
      f.style.left = (cx - r.left + (Math.random() - 0.5) * 30) + 'px'; f.style.top = (cy - r.top) + 'px';
      floatersEl.appendChild(f); setTimeout(function () { f.remove(); }, 1000);
    }

    // ================================================================ УВЕДОМЛЕНИЯ / МОДАЛКИ
    var toastsEl = $('cr-toasts');
    function toast(html, cls, ms) {
      while (toastsEl.childElementCount > 2) toastsEl.removeChild(toastsEl.firstChild);
      var t = document.createElement('div'); t.className = 'cr-toast ' + (cls || ''); t.innerHTML = html;
      toastsEl.appendChild(t);
      setTimeout(function () { t.classList.add('out'); setTimeout(function () { t.remove(); }, 400); }, ms || 2600);
    }
    var modal = $('cr-modal'), modalBody = $('cr-modal-body');
    function openModal(html, onBind) { modalBody.innerHTML = html; modal.classList.add('open'); if (onBind) onBind(modalBody); }
    function closeModal() { modal.classList.remove('open'); modalBody.innerHTML = ''; }
    modal.addEventListener('click', function (e) { if (e.target === modal || e.target.closest('[data-close]')) closeModal(); });
    function confirmBox(title, text, okText, cb, danger) {
      openModal('<h3>' + title + '</h3><p>' + text + '</p><div class="cr-row-btns"><button class="cr-btn ' + (danger ? 'danger' : 'gold') + '" data-ok>' + okText + '</button><button class="cr-btn ghost" data-close>Отмена</button></div>',
        function (b) { b.querySelector('[data-ok]').addEventListener('click', function () { closeModal(); cb(); }); });
    }

    // ================================================================ СОБЫТИЯ ЯДРА
    var dirty = true;
    function handleEvents() {
      game.drain().forEach(function (ev) {
        var d = ev.data;
        switch (ev.type) {
          case 'spawn': applyCrateSkin(); bossDeco.visible = d.boss; if (d.boss) { sfx.boss(); toast('⚔️ БОСС: <b>' + esc(C.bossName(d.zone)) + '</b>', 'boss'); } respawnAnim(); updateZoneUi(); break;
          case 'break':
            spawnChunks(); spawnParticles(new THREE.Vector3(0, 0.9, 0), d.boss ? 30 : 12, true); sfx.brk(d.boss);
            var sp = toScreen(new THREE.Vector3(0, 1.6, 0));
            floater('+' + fmt(d.reward) + ' 🪵', sp.x, sp.y, 'reward');
            if (d.gems) toast('Босс повержен! +' + d.gems + ' 💎', 'good');
            break;
          case 'zoneUnlocked': applyBg(); dirty = true; if (C.isBossZone(d.zone)) toast('Впереди босс — зона ' + d.zone, 'boss'); break;
          case 'bossFail': sfx.fail(); toast('⏱ Время вышло! Босс устоял. Автопродвижение выключено — прокачайся и попробуй снова.', 'bad', 4200); dirty = true; break;
          case 'levelUp':
            sfx.level(); toast('⭐ Уровень <b>' + d.level + '</b>! +3 очка характеристик' + (d.level % 5 === 0 ? ', +1 💎' : ''), 'level');
            d.skills.forEach(function (k) { toast('Новый навык: ' + k.icon + ' <b>' + k.name + '</b>', 'level', 3500); });
            dirty = true; renderSkills(); break;
          case 'loot':
            var R = C.RARITIES[d.item.r];
            sfx.loot(d.item.r);
            toast(d.item.icon + ' <span style="color:' + R.color + '">' + esc(d.item.name) + '</span>' + (d.sold ? ' <small>(продано)</small>' : ''), 'loot');
            dirty = true; break;
          case 'ach': toast('🏆 Достижение: <b>' + esc(d.name) + '</b> +' + d.gems + ' 💎', 'ach', 3500); dirty = true; break;
          case 'skin': toast('🎨 Новый скин: <b>' + esc(d.name) + '</b>', 'ach', 3500); dirty = true; break;
          case 'skinSet': if (d.kind === 'crate') applyCrateSkin(); if (d.kind === 'bg') applyBg(); dirty = true; break;
          case 'goldenSpawn': spawnGolden(); break;
          case 'golden': sfx.golden(); toast('🌟 ' + d.text, 'gold', 3500); break;
          case 'prestige': dirty = true; break;
          case 'autoclick': doClickVisualAuto(d); break;
          case 'buy': dirty = true; break;
        }
      });
    }
    function doClickVisualAuto(r) {
      anim.sqV -= 2.5; anim.spin += 0.4;
      if (Math.random() < 0.5) spawnParticles(new THREE.Vector3((Math.random() - 0.5), 0.7 + (Math.random() - 0.5), 0.72).applyAxisAngle(new THREE.Vector3(0, 1, 0), rot.rotation.y), 2);
      if (game.s.settings.dmgNums && Math.random() < 0.5) { var sp = toScreen(new THREE.Vector3((Math.random() - 0.5), 1, 0.7)); floater(fmt(r.dmg, true), sp.x, sp.y, r.crit ? 'crit' : 'auto'); }
    }

    // ---------------------------------------------------------------- золотой ящик
    function spawnGolden() {
      var halfW = Math.tan(camera.fov * Math.PI / 360) * camera.position.z * camera.aspect;
      golden.x = (Math.random() < 0.5 ? -1 : 1) * Math.min(2.2, halfW * 0.6);
      golden.active = true; golden.until = performance.now() + 10000; golden.born = performance.now();
      goldMesh.visible = true; sfx.golden();
      toast('🌟 Золотой ящик! Лови!', 'gold');
    }
    function catchGolden() {
      if (!golden.active) return;
      golden.active = false; goldMesh.visible = false;
      spawnParticles(goldMesh.position.clone(), 24, true);
      game.goldenReward(); dirty = true;
    }

    // ================================================================ HUD
    var el = {
      zoneName: $('cr-zone-name'), zoneRegion: $('cr-zone-region'), kills: $('cr-kills'), prev: $('cr-zone-prev'), next: $('cr-zone-next'), auto: $('cr-auto'),
      crateName: $('cr-crate-name'), hpFill: $('cr-hp-fill'), hpText: $('cr-hp-text'), bossBar: $('cr-boss-timer'), bossFill: $('cr-boss-fill'), bossText: $('cr-boss-text'),
      chips: $('cr-chips'), gems: $('cr-gems'), sparks: $('cr-sparks'), lvl: $('cr-lvl'), xpFill: $('cr-xp-fill'), xpText: $('cr-xp-text'), dps: $('cr-dps'), click: $('cr-click'),
      skills: $('cr-skills'), buffs: $('cr-buffs'), daily: $('cr-daily'), tabs: $('cr-tabs'), body: $('cr-tabbody'), points: $('cr-points-badge')
    };
    el.prev.addEventListener('click', function () { game.setZone(game.s.zone - 1); game.s.settings.autoAdvance = false; updateZoneUi(); });
    el.next.addEventListener('click', function () { game.setZone(game.s.zone + 1); updateZoneUi(); });
    el.auto.addEventListener('click', function () { game.s.settings.autoAdvance = !game.s.settings.autoAdvance; if (game.s.settings.autoAdvance) game.setZone(game.s.runMax); updateZoneUi(); });
    el.daily.addEventListener('click', function () {
      var r = game.claimDaily();
      if (r) { sfx.golden(); toast('🎁 День ' + r.day + ': +' + fmt(r.chips) + ' 🪵, +' + r.gems + ' 💎', 'gold', 3500); dirty = true; }
      else toast('Следующая награда через ' + fmtTime(game.dailyLeft()), '', 2000);
    });
    function updateZoneUi() {
      var s = game.s, z = s.zone, boss = C.isBossZone(z);
      el.zoneName.textContent = 'Зона ' + z;
      el.zoneRegion.textContent = C.regionOf(z).name;
      el.prev.disabled = z <= 1; el.next.disabled = z >= s.runMax;
      el.auto.classList.toggle('on', s.settings.autoAdvance);
      el.auto.title = s.settings.autoAdvance ? 'Автопродвижение: вкл' : 'Автопродвижение: выкл';
      var k = '';
      if (z < s.runMax) k = '<span class="cr-farm">фарм</span>';
      else if (boss) k = '<span class="cr-bossmark">☠ босс</span>';
      else for (var i = 0; i < C.KILLS_PER_ZONE; i++) k += '<i class="' + (i < s.kills ? 'on' : '') + '"></i>';
      el.kills.innerHTML = k;
      el.crateName.textContent = game.boss ? '☠ ' + C.bossName(z) : (boss ? 'Окованный ящик (повтор)' : 'Ящик');
      el.crateName.classList.toggle('boss', !!game.boss);
      applyBg();
    }
    function updateHud() {
      var s = game.s;
      var f = Math.max(0, game.hp / game.maxHp);
      el.hpFill.style.width = (f * 100).toFixed(1) + '%';
      el.hpText.textContent = fmt(Math.max(0, game.hp)) + ' / ' + fmt(game.maxHp);
      crackMat.opacity = f < 0.75 ? Math.min(0.9, (0.75 - f) * 1.4) : 0;
      if (game.boss) {
        var left = Math.max(0, (game.boss.until - Date.now()) / 1000);
        el.bossBar.style.display = ''; el.bossFill.style.width = (left / game.boss.total * 100) + '%'; el.bossText.textContent = left.toFixed(1) + ' с';
      } else el.bossBar.style.display = 'none';
    }
    function updateRes() {
      var s = game.s;
      el.chips.textContent = fmt(s.chips); el.gems.textContent = fmt(s.gems); el.sparks.textContent = fmt(s.sparks);
      el.lvl.textContent = s.level;
      var need = C.xpNeed(s.level);
      el.xpFill.style.width = Math.min(100, s.xp / need * 100) + '%';
      el.xpText.textContent = fmt(s.xp) + ' / ' + fmt(need);
      el.dps.textContent = fmt(game.effDps(), true);
      el.click.textContent = fmt(game.effClick(), true);
      el.points.textContent = s.points; el.points.style.display = s.points > 0 ? '' : 'none';
      var ready = game.dailyReady();
      el.daily.classList.toggle('ready', ready);
      el.daily.querySelector('small').textContent = ready ? 'Забрать!' : fmtTime(game.dailyLeft());
      // баффы
      var b = [], now = Date.now();
      if (s.buffs.frenzyUntil > now) b.push('🔥 Клик ×5 · ' + Math.ceil((s.buffs.frenzyUntil - now) / 1000) + 'с');
      if (s.buffs.lootRain > 0) b.push('🎁 Лут ×' + s.buffs.lootRain);
      C.SKILLS.forEach(function (k) { var st = game.skillState(k.id); if (st.active && k.dur) b.push(k.icon + ' ' + Math.ceil(st.activeLeft) + 'с'); });
      el.buffs.innerHTML = b.map(function (x) { return '<span>' + x + '</span>'; }).join('');
      updateSkills();
    }

    // ---------------------------------------------------------------- навыки
    function renderSkills() {
      el.skills.innerHTML = C.SKILLS.map(function (k, i) {
        return '<button class="cr-skill" data-skill="' + k.id + '" title="' + esc(k.name + ': ' + k.desc + ' (клавиша ' + (i + 1) + ')') + '"><span class="ic">' + k.icon + '</span><span class="cd"></span><span class="lock">' + k.lvl + '</span></button>';
      }).join('');
    }
    el.skills.addEventListener('click', function (e) { var b = e.target.closest('[data-skill]'); if (b) useSkill(b.dataset.skill); });
    function useSkill(id) {
      var st = game.skillState(id);
      if (!st.unlocked) { toast('Навык «' + st.def.name + '» откроется на ' + st.def.lvl + ' уровне', '', 2000); return; }
      if (!st.ready) return;
      game.useSkill(id); sfx.skill();
      toast(st.def.icon + ' <b>' + st.def.name + '</b>: ' + st.def.desc, 'skill', 2200);
      if (id === 'quake') { anim.shake = 0.6; spawnParticles(new THREE.Vector3(0, 0.2, 0), 30, true); }
    }
    function updateSkills() {
      var btns = el.skills.children;
      for (var i = 0; i < btns.length; i++) {
        var b = btns[i], st = game.skillState(b.dataset.skill);
        b.classList.toggle('locked', !st.unlocked); b.classList.toggle('active', st.active); b.classList.toggle('ready', st.ready);
        var cd = b.querySelector('.cd');
        cd.textContent = st.unlocked && !st.ready ? (st.active ? Math.ceil(st.activeLeft) : Math.ceil(st.cdLeft)) : '';
      }
    }

    // ================================================================ ВКЛАДКИ
    var TABS = [
      { id: 'shop', name: 'Магазин', icon: '⚒️' }, { id: 'hero', name: 'Герой', icon: '🧙' }, { id: 'gear', name: 'Лут', icon: '🎒' },
      { id: 'skins', name: 'Скины', icon: '🎨' }, { id: 'prestige', name: 'Искры', icon: '✨' }, { id: 'ach', name: 'Трофеи', icon: '🏆' },
      { id: 'stats', name: 'Статы', icon: '📊' }, { id: 'settings', name: 'Опции', icon: '⚙️' }
    ];
    var tab = 'shop';
    el.tabs.innerHTML = TABS.map(function (t) {
      return '<button class="cr-tab" data-tab="' + t.id + '"><span>' + t.icon + '</span><b>' + t.name + '</b>' + (t.id === 'hero' ? '<em id="cr-points-badge" class="cr-badge"></em>' : '') + '</button>';
    }).join('');
    el.points = $('cr-points-badge');
    el.tabs.addEventListener('click', function (e) { var b = e.target.closest('[data-tab]'); if (!b) return; tab = b.dataset.tab; dirty = true; el.body.scrollTop = 0; });
    var skinKind = 'crate';

    function costBtn(action, label, cost, cur, extraAttr) {
      return '<button class="cr-btn buy" data-act="' + action + '" data-cost="' + cost + '" data-cur="' + (cur || 'chips') + '" ' + (extraAttr || '') + '>' + label + '</button>';
    }
    function curIcon(c) { return c === 'gems' ? '💎' : c === 'sparks' ? '✨' : '🪵'; }

    var R = {};
    R.shop = function () {
      var s = game.s, c = game.calc(), h = '';
      h += '<div class="cr-bulk">Покупать: ' + [1, 10, 100, 'max'].map(function (b) { return '<button class="cr-chip ' + (s.settings.bulk === b ? 'on' : '') + '" data-act="bulk" data-v="' + b + '">' + (b === 'max' ? 'Макс' : '×' + b) + '</button>'; }).join('') + '</div>';
      // разовые улучшения
      var ups = C.UPGRADES.filter(function (u) { return game.upgradeVisible(u); }).sort(function (a, b) { return a.cost - b.cost; }).slice(0, 12);
      if (ups.length) {
        h += '<h4>Улучшения</h4><div class="cr-upgs">' + ups.map(function (u) {
          return '<button class="cr-upg" data-act="upg" data-id="' + u.id + '" data-cost="' + u.cost + '" data-cur="chips" title="' + esc(u.name + ' — ' + u.desc) + '"><span>' + u.icon + '</span><b>' + esc(u.name) + '</b><small>' + esc(u.desc) + '</small><em>' + fmt(u.cost) + ' 🪵</em></button>';
        }).join('') + '</div>';
      }
      // клик
      var n = game.bulkN('click'), cc = game.clickCost(n);
      h += '<h4>Твой удар</h4><div class="cr-card"><div class="cr-ico">👊</div><div class="cr-info"><b>Сила удара <span class="lv">ур. ' + s.clickLvl + '</span></b><small>Клик: ' + fmt(game.effClick(), true) + ' урона · крит ' + pct(game.effCrit()) + ' ×' + c.critMult.toFixed(1).replace('.', ',') + (c.clickDpsPct ? ' · +' + pct(c.clickDpsPct) + ' от DPS' : '') + '</small>' + msBar(s.clickLvl) + '</div>' +
        costBtn('click', '+' + n + '<br><span data-live="cost">' + fmt(cc) + '</span> 🪵', cc, 'chips', 'data-live-cost="click"') + '</div>';
      // помощники
      h += '<h4>Помощники <small>урон в секунду: ' + fmt(game.effDps(), true) + '</small></h4>';
      C.HELPERS.forEach(function (hp, i) {
        if (!game.helperVisible(i)) { if (i === 0 || game.helperVisible(i - 1)) h += '<div class="cr-card locked"><div class="cr-ico">❔</div><div class="cr-info"><b>???</b><small>Найми «' + esc(C.HELPERS[i - 1].name) + '», чтобы открыть</small></div></div>'; return; }
        var lvl = s.helpers[i], nn = game.bulkN('helper', i), cost = game.helperCost(i, nn);
        h += '<div class="cr-card"><div class="cr-ico">' + hp.icon + '</div><div class="cr-info"><b>' + esc(hp.name) + ' <span class="lv">ур. ' + lvl + '</span></b><small>' + (lvl ? fmt(c.helperDps[i], true) + ' урона/с' : esc(hp.desc)) + '</small>' + msBar(lvl) + '</div>' +
          costBtn('helper', '+' + nn + '<br><span>' + fmt(cost) + '</span> 🪵', cost, 'chips', 'data-i="' + i + '" data-live-cost="helper"') + '</div>';
      });
      return h;
    };
    function msBar(lvl) {
      var next = C.MILESTONES.filter(function (m) { return m > lvl; })[0];
      if (!next) return '';
      var prev = C.MILESTONES.filter(function (m) { return m <= lvl; }).pop() || 0;
      return '<div class="cr-ms" title="На ' + next + ' уровне урон ×2"><i style="width:' + ((lvl - prev) / (next - prev) * 100) + '%"></i><span>×2 на ' + next + '</span></div>';
    }
    R.hero = function () {
      var s = game.s, c = game.calc(), h = '';
      h += '<div class="cr-hero"><div class="cr-hero-lvl">' + s.level + '<small>уровень</small></div><div><b>Очки характеристик: <span class="cr-pts">' + s.points + '</span></b><small>+3 очка за уровень, +1 💎 каждые 5 уровней. Опыт даёт каждый разбитый ящик.</small></div></div>';
      h += C.STATS.map(function (st) {
        return '<div class="cr-card"><div class="cr-ico">' + st.icon + '</div><div class="cr-info"><b>' + st.name + ' <span class="lv">' + s.stats[st.id] + '</span></b><small>' + st.desc + '</small></div>' +
          '<div class="cr-statbtns"><button class="cr-btn small" data-act="stat" data-id="' + st.id + '" data-n="1" ' + (s.points < 1 ? 'disabled' : '') + '>+1</button><button class="cr-btn small" data-act="stat" data-id="' + st.id + '" data-n="10" ' + (s.points < 1 ? 'disabled' : '') + '>+10</button></div></div>';
      }).join('');
      h += '<h4>Итоговые бонусы</h4><div class="cr-kv">' + [
        ['Урон клика', fmt(game.effClick(), true)], ['Урон помощников/с', fmt(game.effDps(), true)], ['Шанс крита', pct(game.effCrit())], ['Множитель крита', '×' + c.critMult.toFixed(2).replace('.', ',')],
        ['Множитель щепок', '×' + c.chipsMult.toFixed(2).replace('.', ',')], ['Множитель опыта', '×' + c.xpMult.toFixed(2).replace('.', ',')], ['Шанс лута', pct(c.drop)],
        ['Общий множитель урона', '×' + fmt(c.global, true)], ['Бонус достижений', '+' + c.achCount + '%'], ['Бонус коллекции скинов', '+' + c.skinsOwned + '% щепок']
      ].map(function (r) { return '<div><span>' + r[0] + '</span><b>' + r[1] + '</b></div>'; }).join('') + '</div>';
      h += '<h4>Навыки</h4>' + C.SKILLS.map(function (k, i) { var ok = s.level >= k.lvl; return '<div class="cr-card ' + (ok ? '' : 'locked') + '"><div class="cr-ico">' + k.icon + '</div><div class="cr-info"><b>' + k.name + ' <span class="lv">' + (ok ? 'клавиша ' + (i + 1) : 'ур. ' + k.lvl) + '</span></b><small>' + k.desc + ' · откат ' + fmtTime(k.cd * c.cdMult) + '</small></div></div>'; }).join('');
      h += '<div class="cr-row-btns">' + costBtn('respec', 'Сбросить характеристики · ' + game.respecCost() + ' 💎', game.respecCost(), 'gems') + '</div>';
      return h;
    };
    function itemHtml(it, opts) {
      var Rr = C.RARITIES[it.r];
      return '<div class="cr-item r' + it.r + '" style="--rc:' + Rr.color + '" ' + (opts && opts.attr || '') + '><span class="ic">' + it.icon + '</span><div><b>' + esc(it.name) + '</b><small>' + Rr.name + ' · зона ' + it.z + '</small>' +
        '<ul>' + (it.flat ? '<li>+' + fmt(it.flat) + ' урона клика</li>' : '') + it.aff.map(function (a) { return '<li>' + affText(a) + '</li>'; }).join('') + '</ul></div></div>';
    }
    R.gear = function () {
      var s = game.s, h = '<h4>Надето</h4><div class="cr-slots">';
      C.SLOTS.forEach(function (sl) {
        var it = s.equip[sl.id];
        h += '<div class="cr-slot">' + (it ? itemHtml(it, { attr: 'data-act="unequip" data-slot="' + sl.id + '" title="Снять"' }) : '<div class="cr-item empty"><span class="ic">' + sl.icon + '</span><div><b>' + sl.name + '</b><small>пусто</small></div></div>') + '</div>';
      });
      h += '</div><h4>Сумка <small>' + s.inv.length + ' / 40 · шанс лута ' + pct(game.calc().drop) + '</small></h4>';
      if (!s.inv.length) h += '<p class="cr-empty">Пусто. Разбивай ящики — из них выпадают инструменты, перчатки, амулеты и кольца. Боссы всегда оставляют лут.</p>';
      var inv = s.inv.slice().sort(function (a, b) { return b.r - a.r || b.z - a.z; });
      h += '<div class="cr-inv">' + inv.map(function (it) {
        var better = game.itemScore(it) > game.itemScore(s.equip[it.slot]);
        return '<div class="cr-invcell" data-act="item" data-id="' + it.id + '">' + itemHtml(it) + (better ? '<span class="cr-better">▲</span>' : '') + '</div>';
      }).join('') + '</div>';
      h += '<div class="cr-row-btns"><button class="cr-btn" data-act="sellbelow" data-r="0">Продать обычные</button><button class="cr-btn" data-act="sellbelow" data-r="1">Продать до необычных</button><button class="cr-btn" data-act="sellbelow" data-r="2">Продать до редких</button></div>';
      h += '<label class="cr-setting">Автопродажа находок: <select data-act="autosell">' + [[-1, 'выключена'], [0, 'обычные'], [1, 'до необычных'], [2, 'до редких'], [3, 'до эпических']].map(function (o) { return '<option value="' + o[0] + '" ' + (s.settings.autoSell === o[0] ? 'selected' : '') + '>' + o[1] + '</option>'; }).join('') + '</select></label>';
      return h;
    };
    function openItem(id) {
      var s = game.s, idx = game.findInv(id); if (idx < 0) return;
      var it = s.inv[idx], cur = s.equip[it.slot], sell = game.sellValue(it), gems = C.RARITIES[it.r].sellGems;
      openModal('<h3>Предмет</h3>' + itemHtml(it) + (cur ? '<p class="cr-cmp">Сейчас надето:</p>' + itemHtml(cur) : '<p class="cr-cmp">Слот пуст.</p>') +
        '<div class="cr-row-btns"><button class="cr-btn gold" data-ok="equip">Надеть</button><button class="cr-btn" data-ok="sell">Продать · ' + fmt(sell) + ' 🪵' + (gems ? ' + ' + gems + ' 💎' : '') + '</button><button class="cr-btn ghost" data-close>Закрыть</button></div>',
        function (b) {
          b.querySelector('[data-ok="equip"]').addEventListener('click', function () { game.equipItem(id); sfx.buy(); closeModal(); dirty = true; });
          b.querySelector('[data-ok="sell"]').addEventListener('click', function () { game.sellItem(id); sfx.buy(); closeModal(); dirty = true; });
        });
    }
    R.skins = function () {
      var s = game.s, list = game.skinList(skinKind), h = '';
      h += '<div class="cr-bulk">' + [['crate', '📦 Ящики'], ['bg', '🌄 Фоны'], ['fx', '✨ Частицы']].map(function (k) { return '<button class="cr-chip ' + (skinKind === k[0] ? 'on' : '') + '" data-act="skinkind" data-v="' + k[0] + '">' + k[1] + '</button>'; }).join('') + '</div>';
      h += '<p class="cr-note">Каждый собранный скин даёт +1% щепок навсегда. Собрано: ' + game.calc().skinsOwned + ' / ' + (C.CRATE_SKINS.length + C.BG_SKINS.length + C.FX_SKINS.length) + '</p>';
      h += '<div class="cr-skins">' + list.map(function (d) {
        var own = game.owns(skinKind, d.id), cur = s.skins.cur[skinKind] === d.id, prev;
        if (skinKind === 'crate') prev = '<img src="' + SK.thumb(d.id) + '" alt="">';
        else if (skinKind === 'bg') prev = '<i style="background:radial-gradient(ellipse at 50% 40%,' + d.a + ',' + d.b + ')"></i>';
        else prev = '<i class="fxprev fx-' + d.id + '"></i>';
        var btn;
        if (cur) btn = '<span class="cr-tag on">Выбран</span>';
        else if (own) btn = '<button class="cr-btn small" data-act="skinset" data-id="' + d.id + '">Выбрать</button>';
        else if (d.unlock.type === 'gems') btn = costBtn('skinbuy', d.unlock.val + ' 💎', d.unlock.val, 'gems', 'data-id="' + d.id + '"');
        else btn = '<span class="cr-tag">🔒 ' + C.unlockText(d.unlock) + '</span>';
        return '<div class="cr-skin ' + (own ? '' : 'locked ') + (cur ? 'cur' : '') + '">' + prev + '<b>' + d.name + '</b>' + btn + '</div>';
      }).join('') + '</div>';
      return h;
    };
    R.prestige = function () {
      var s = game.s, pend = game.pendingSparks(), c = game.calc(), h = '';
      h += '<div class="cr-prest"><div><b>✨ Искры: ' + fmt(s.sparks) + '</b><small>Каждая неистраченная искра: +' + Math.round((0.05 + 0.01 * game.p('resonance')) * 100) + '% ко всему урону. Всего получено: ' + fmt(s.sparksTotal) + '</small></div>' +
        '<div class="cr-prest-go"><small>Перерождение сейчас даст</small><b data-live="pend">+' + fmt(pend) + ' ✨</b>' +
        '<button class="cr-btn gold" data-act="prestige" ' + (pend > 0 ? '' : 'disabled') + '>Переродиться</button><small>' + (s.runMax < 30 ? 'Доступно с 30-й зоны (сейчас ' + s.runMax + ')' : 'Сбросит зону, щепки, помощников и улучшения. Уровень, снаряжение, скины, самоцветы и достижения остаются.') + '</small></div></div>';
      h += '<h4>Древо вечности</h4><div class="cr-tree">';
      var rows = {}; C.PRESTIGE.forEach(function (p) { (rows[p.row] = rows[p.row] || []).push(p); });
      Object.keys(rows).forEach(function (r) {
        h += '<div class="cr-tree-row">' + rows[r].map(function (p) {
          var l = game.p(p.id), req = game.prestigeReqMet(p), max = l >= p.max, cost = C.prestigeCost(p, l);
          return '<div class="cr-node ' + (req ? '' : 'locked ') + (l ? 'has ' : '') + (max ? 'max' : '') + '"><span class="ic">' + p.icon + '</span><b>' + p.name + '</b><small>' + p.desc + '</small><em>' + l + ' / ' + p.max + '</em>' +
            (max ? '<span class="cr-tag on">Максимум</span>' : req ? costBtn('pbuy', cost + ' ✨', cost, 'sparks', 'data-id="' + p.id + '"') : '<span class="cr-tag">🔒 нужно: ' + p.req.map(function (x) { return C.PRESTIGE.filter(function (q) { return q.id === x; })[0].name; }).join(', ') + '</span>') + '</div>';
        }).join('') + '</div>';
      });
      h += '</div>';
      return h;
    };
    R.ach = function () {
      var s = game.s, got = Object.keys(s.ach).length;
      return '<p class="cr-note">Получено ' + got + ' из ' + C.ACH.length + '. Каждое достижение: +1% ко всему урону и самоцветы.</p><div class="cr-achs">' + C.ACH.map(function (a) {
        var ok = !!s.ach[a.id];
        return '<div class="cr-ach ' + (ok ? 'ok' : '') + '"><span>' + (ok ? '🏆' : '🔒') + '</span><b>' + esc(a.name) + '</b><small>' + esc(a.desc) + '</small><em>+' + a.gems + ' 💎</em></div>';
      }).join('') + '</div>';
    };
    R.stats = function () {
      var s = game.s, st = s.st;
      return '<div class="cr-kv">' + [
        ['Кликов', fmt(st.clicks)], ['Критов', fmt(st.crits)], ['Сильнейший удар', fmt(st.bestHit, true)], ['Нанесено урона', fmt(st.dmg)],
        ['Разбито ящиков', fmt(st.breaks)], ['Побеждено боссов', fmt(st.bosses)], ['Текущая зона', s.zone], ['Макс. зона (забег)', s.runMax], ['Макс. зона (всего)', s.bestZone],
        ['Заработано щепок', fmt(st.chipsEarned)], ['Найдено предметов', fmt(st.items)], ['Легендарных', fmt(st.legendary)], ['Мифических', fmt(st.mythic)],
        ['Золотых ящиков', fmt(st.golden)], ['Навыков применено', fmt(st.skills)], ['Перерождений', fmt(st.prestiges)], ['Ежедневная серия', s.daily.streak + ' дн.'],
        ['Время в игре', fmtTime(st.playTime)], ['Достижений', Object.keys(s.ach).length + ' / ' + C.ACH.length]
      ].map(function (r) { return '<div><span>' + r[0] + '</span><b>' + r[1] + '</b></div>'; }).join('') + '</div>';
    };
    R.settings = function () {
      var st = game.s.settings;
      function tg(key, label) { return '<label class="cr-toggle"><input type="checkbox" data-act="toggle" data-key="' + key + '" ' + (st[key] ? 'checked' : '') + '><span></span>' + label + '</label>'; }
      return tg('sound', '🔊 Звук') + tg('particles', '✨ Много частиц') + tg('dmgNums', '💬 Числа урона') + tg('autoAdvance', '⏩ Автопродвижение по зонам') +
        '<h4>Сохранение</h4><p class="cr-note">Игра сохраняется автоматически в этом браузере каждые 10 секунд.</p>' +
        '<div class="cr-row-btns"><button class="cr-btn" data-act="export">📤 Экспорт</button><button class="cr-btn" data-act="import">📥 Импорт</button><button class="cr-btn" data-act="savenow">💾 Сохранить</button></div>' +
        '<h4>Опасная зона</h4><div class="cr-row-btns"><button class="cr-btn danger" data-act="reset">🗑 Сбросить весь прогресс</button></div>' +
        '<p class="cr-note">Горячие клавиши: Пробел — удар, 1–6 — навыки.</p>';
    };

    function render() {
      dirty = false;
      var btns = el.tabs.children;
      for (var i = 0; i < btns.length; i++) btns[i].classList.toggle('on', btns[i].dataset.tab === tab);
      var st = el.body.scrollTop;
      el.body.innerHTML = '<div class="cr-tabpage">' + R[tab]() + '</div>';
      el.body.scrollTop = st;
      live();
    }
    // обновление доступности кнопок без перерисовки
    var lastSig = '';
    function live() {
      var s = game.s, list = el.body.querySelectorAll('[data-cost]');
      for (var i = 0; i < list.length; i++) {
        var b = list[i], have = s[b.dataset.cur] || 0;
        b.classList.toggle('cant', have < parseFloat(b.dataset.cost));
      }
      var pend = el.body.querySelector('[data-live="pend"]'); if (pend) pend.textContent = '+' + fmt(game.pendingSparks()) + ' ✨';
      // в режиме «Макс» количество и цена меняются вместе с щепками — обновляем подписи на месте
      if (tab === 'shop' && s.settings.bulk === 'max') {
        var bb = el.body.querySelectorAll('[data-live-cost]');
        for (var j = 0; j < bb.length; j++) {
          var btn = bb[j], isClick = btn.dataset.liveCost === 'click', idx = parseInt(btn.dataset.i, 10);
          var n = isClick ? game.bulkN('click') : game.bulkN('helper', idx);
          var cost = isClick ? game.clickCost(n) : game.helperCost(idx, n);
          var label = '+' + n + '<br><span>' + fmt(cost) + '</span> 🪵';
          if (btn.innerHTML !== label) { btn.innerHTML = label; btn.dataset.cost = cost; btn.classList.toggle('cant', s.chips < cost); }
        }
      }
    }
    // подпись, при изменении которой вкладку надо перерисовать
    function sig() {
      var s = game.s;
      if (tab === 'shop') return '';
      if (tab === 'prestige') return game.canPrestige() ? 1 : 0;
      if (tab === 'stats') return Math.floor(Date.now() / 2000);
      return '';
    }

    el.body.addEventListener('click', function (e) {
      var b = e.target.closest('[data-act]'); if (!b || b.disabled) return;
      var a = b.dataset.act, s = game.s, ok = false;
      switch (a) {
        case 'bulk': s.settings.bulk = b.dataset.v === 'max' ? 'max' : parseInt(b.dataset.v, 10); dirty = true; return;
        case 'click': ok = game.buyClick(); break;
        case 'helper': ok = game.buyHelper(parseInt(b.dataset.i, 10)); break;
        case 'upg': ok = game.buyUpgrade(b.dataset.id); break;
        case 'stat': ok = game.addStat(b.dataset.id, parseInt(b.dataset.n, 10)); break;
        case 'respec': confirmBox('Сброс характеристик', 'Вернуть все очки за ' + game.respecCost() + ' 💎?', 'Сбросить', function () { if (game.respec()) { dirty = true; sfx.buy(); } }); return;
        case 'item': openItem(parseInt(b.dataset.id, 10)); return;
        case 'unequip': ok = game.unequip(b.dataset.slot); if (!ok) toast('Сумка полна', 'bad'); break;
        case 'sellbelow': var v = game.sellAllBelow(parseInt(b.dataset.r, 10)); if (v) toast('Продано на ' + fmt(v) + ' 🪵', 'good'); ok = true; break;
        case 'skinkind': skinKind = b.dataset.v; dirty = true; return;
        case 'skinset': ok = game.setSkin(skinKind, b.dataset.id); break;
        case 'skinbuy': ok = game.buySkin(skinKind, b.dataset.id); if (ok) game.setSkin(skinKind, b.dataset.id); break;
        case 'prestige':
          confirmBox('Перерождение', 'Получить <b>' + fmt(game.pendingSparks()) + ' ✨ искр</b>? Зона, щепки, помощники и улучшения обнулятся.', 'Переродиться ✨', function () {
            var n = game.prestige(); if (n) { toast('✨ Перерождение! +' + fmt(n) + ' искр', 'gold', 4000); sfx.level(); updateZoneUi(); dirty = true; game.save(); }
          }); return;
        case 'pbuy': ok = game.buyPrestige(b.dataset.id); break;
        case 'export': openModal('<h3>Экспорт сохранения</h3><p>Скопируй этот код и сохрани его где-нибудь:</p><textarea class="cr-ta" readonly>' + esc(game.exportSave()) + '</textarea><div class="cr-row-btns"><button class="cr-btn gold" data-ok>Скопировать</button><button class="cr-btn ghost" data-close>Закрыть</button></div>', function (m) {
            var ta = m.querySelector('textarea'); ta.select();
            m.querySelector('[data-ok]').addEventListener('click', function () { ta.select(); try { navigator.clipboard.writeText(ta.value); toast('Скопировано!', 'good'); } catch (err) { document.execCommand('copy'); } });
          }); return;
        case 'import': openModal('<h3>Импорт сохранения</h3><p>Вставь код сохранения. Текущий прогресс будет заменён.</p><textarea class="cr-ta" placeholder="MGCRATE1:..."></textarea><div class="cr-row-btns"><button class="cr-btn gold" data-ok>Загрузить</button><button class="cr-btn ghost" data-close>Отмена</button></div>', function (m) {
            m.querySelector('[data-ok]').addEventListener('click', function () {
              try { game.importSave(m.querySelector('textarea').value); closeModal(); toast('Сохранение загружено', 'good'); afterLoad(); } catch (err) { toast('Ошибка: ' + esc(err.message), 'bad', 3500); }
            });
          }); return;
        case 'savenow': game.save(); toast('Сохранено 💾', 'good'); return;
        case 'reset':
          openModal('<h3>Сброс прогресса</h3><p>Это удалит <b>всё</b>: уровни, предметы, скины, искры. Напиши <b>СБРОС</b>, чтобы подтвердить.</p><input class="cr-input" type="text" autocomplete="off"><div class="cr-row-btns"><button class="cr-btn danger" data-ok>Удалить всё</button><button class="cr-btn ghost" data-close>Отмена</button></div>', function (m) {
            m.querySelector('[data-ok]').addEventListener('click', function () {
              if (m.querySelector('input').value.trim().toUpperCase() !== 'СБРОС') { toast('Нужно написать СБРОС', 'bad'); return; }
              game.hardReset(); closeModal(); toast('Прогресс сброшен', ''); afterLoad();
            });
          }); return;
      }
      if (ok) { sfx.buy(); dirty = true; }
    });
    el.body.addEventListener('change', function (e) {
      var t = e.target;
      if (t.dataset.act === 'toggle') { game.s.settings[t.dataset.key] = t.checked; if (t.dataset.key === 'autoAdvance') { if (t.checked) game.setZone(game.s.runMax); updateZoneUi(); } }
      if (t.dataset.act === 'autosell') game.s.settings.autoSell = parseInt(t.value, 10);
    });

    // ================================================================ РЕСАЙЗ
    function resize() {
      var w = stage.clientWidth, h = stage.clientHeight;
      if (!w || !h) return;
      renderer.setSize(w, h, false);
      camera.aspect = w / h;
      var narrow = w / h < 0.9, compact = h < 520;
      var dist = narrow ? 7.6 + (0.9 - w / h) * 4 : 7.2;
      if (compact) dist = Math.max(dist, 9.4);
      camera.position.set(0, 2.6, dist);
      camera.lookAt(0, compact ? 0.95 : 0.8, 0);
      camera.updateProjectionMatrix();
    }
    window.addEventListener('resize', resize);
    if (window.ResizeObserver) new ResizeObserver(resize).observe(stage);

    // ================================================================ ЦИКЛ
    function afterLoad() { currentSkin = null; applyCrateSkin(); applyBg(); updateZoneUi(); renderSkills(); dirty = true; }
    var clock = new THREE.Clock(), time = 0, uiAcc = 0, saveAcc = 0, last = performance.now();
    function frame() {
      if (!document.body.contains(canvas)) return;
      var dt = Math.min(clock.getDelta(), 0.1);
      time += dt;
      // логика: при сворачивании вкладки rAF спит — догоняем через офлайн
      game.tick(dt);
      handleEvents();
      // анимация ящика
      anim.sqV += (-anim.sq * 260 - anim.sqV * 14) * dt; anim.sq += anim.sqV * dt;
      var sy = 1 + Math.max(-0.35, Math.min(0.35, anim.sq * 0.12)), sxz = 1 / Math.sqrt(sy);
      var bossScale = game.boss ? 1.3 : 1;
      squash.scale.set(sxz * bossScale, sy * bossScale, sxz * bossScale);
      anim.spin *= Math.pow(0.04, dt);
      rot.rotation.y += (0.35 + anim.spin) * dt;
      if (anim.hidden > 0) { anim.hidden -= dt; drop.visible = anim.hidden <= 0; }
      if (anim.dropY > 0 || anim.dropV !== 0) {
        anim.dropV -= 22 * dt; anim.dropY += anim.dropV * dt;
        if (anim.dropY <= 0) { anim.dropY = 0; if (anim.dropV < -3) { anim.dropV = -anim.dropV * 0.3; anim.sqV -= 4; } else anim.dropV = 0; }
      }
      anim.shake = Math.max(0, anim.shake - dt);
      drop.position.y = anim.dropY + 0.06 + Math.sin(time * 1.6) * 0.04;
      drop.position.x = anim.shake ? (Math.random() - 0.5) * anim.shake * 0.4 : 0;
      rot.rotation.z = Math.sin(time * 1.1) * 0.03;
      if (game.boss) { var pulse = 0.5 + Math.sin(time * 6) * 0.5; bossLight.intensity = 1.2 + pulse * 1.5; bossDeco.getObjectByName('aura').material.opacity = 0.12 + pulse * 0.14; }
      else bossLight.intensity = 0;
      // золотой ящик
      if (golden.active) {
        var t = (performance.now() - golden.born) / 1000;
        goldMesh.position.set(golden.x + Math.sin(t * 1.3) * 0.2, 1.7 + Math.sin(t * 3) * 0.18, 0);
        goldGlow.material.rotation = t;
        goldMesh.rotation.set(t * 1.2, t * 2, 0);
        goldMesh.scale.setScalar(Math.min(1, t * 3) * (performance.now() > golden.until - 1500 ? 0.6 + 0.4 * Math.abs(Math.sin(t * 10)) : 1));
        if (performance.now() > golden.until) { golden.active = false; goldMesh.visible = false; toast('Золотой ящик улетел…', '', 1800); }
      }
      // частицы
      for (var i = particles.length - 1; i >= 0; i--) {
        var p = particles[i], d = p.userData;
        d.age += dt; d.v.y -= 9.8 * dt; p.position.addScaledVector(d.v, dt);
        if (p.position.y < 0.03) { p.position.y = 0.03; d.v.y *= -0.3; d.v.x *= 0.6; d.v.z *= 0.6; }
        if (!p.isSprite) { p.rotation.x += d.w.x * dt; p.rotation.y += d.w.y * dt; p.rotation.z += d.w.z * dt; }
        var k = Math.max(0, 1 - Math.pow(d.age / d.life, 3));
        if (p.isSprite) p.scale.set(0.16 * k, 0.16 * k, 1); else p.scale.setScalar(k);
        if (d.age >= d.life) { scene.remove(p); particles.splice(i, 1); }
      }
      updateHud();
      uiAcc += dt;
      if (uiAcc > 0.2) {
        uiAcc = 0; updateRes();
        var sg = sig(); if (sg !== lastSig) { lastSig = sg; dirty = true; }
        if (dirty) render(); else live();
      }
      saveAcc += dt;
      if (saveAcc > 10) { saveAcc = 0; game.save(); }
      renderer.render(scene, camera);
      requestAnimationFrame(frame);
    }

    // офлайн-прогресс и возвращение на вкладку
    function showOffline(r) {
      if (!r || r.chips <= 0) return;
      openModal('<h3>💤 Пока тебя не было</h3><p>Прошло <b>' + fmtTime(r.seconds) + '</b>' + (r.counted < r.seconds ? ' (учтено ' + fmtTime(r.counted) + ')' : '') + '. Помощники трудились без тебя:</p>' +
        '<div class="cr-kv"><div><span>Разбито ящиков</span><b>' + fmt(r.kills) + '</b></div><div><span>Щепки</span><b>+' + fmt(r.chips) + ' 🪵</b></div><div><span>Опыт</span><b>+' + fmt(r.xp) + '</b></div></div>' +
        '<div class="cr-row-btns"><button class="cr-btn gold" data-close>Отлично!</button></div>');
    }
    document.addEventListener('visibilitychange', function () {
      if (document.hidden) game.save();
      else { var r = game.offline(); handleEvents(); if (r) showOffline(r); game.s.lastTick = Date.now(); }
    });
    window.addEventListener('pagehide', function () { game.save(); });

    afterLoad();
    resize();
    var off = game.offline();
    game.s.lastTick = Date.now();
    handleEvents();
    if (off) showOffline(off);
    if (migrated) setTimeout(function () { toast('📦 Ящик стал RPG! Твои ' + fmt(migrated) + ' старых кликов превращены в щепки 🪵', 'gold', 6000); }, 600);
    else if (game.s.st.clicks === 0) setTimeout(function () { toast('Бей по ящику, копи щепки 🪵 и нанимай помощников!', '', 5000); }, 600);
    game.save();
    frame();

    // для тестов и любопытных
    window.CrateGame = { game: game, render: function () { dirty = true; }, setTab: function (t) { tab = t; dirty = true; }, setSkinKind: function (k) { skinKind = k; dirty = true; }, spawnGolden: spawnGolden, catchGolden: catchGolden, refresh: afterLoad };
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();
  document.addEventListener('astro:page-load', boot);
})();
