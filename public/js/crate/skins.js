/* Ящик: процедурные текстуры и материалы скинов (Three.js r128). */
(function (root) {
  'use strict';
  var S = 512;

  function rng(seed) { var s = seed % 2147483647; if (s <= 0) s += 2147483646; return function () { s = (s * 16807) % 2147483647; return (s - 1) / 2147483646; }; }
  function canvas() { var c = document.createElement('canvas'); c.width = c.height = S; return c; }
  function rgb(r, g, b, a) { return a === undefined ? 'rgb(' + (r | 0) + ',' + (g | 0) + ',' + (b | 0) + ')' : 'rgba(' + (r | 0) + ',' + (g | 0) + ',' + (b | 0) + ',' + a + ')'; }

  // ---------------------------------------------------------------- дерево
  function paintWood(g, o, r) {
    var planks = 5, ph = S / planks;
    for (var i = 0; i < planks; i++) {
      var k = 0.88 + r() * 0.2;
      g.fillStyle = rgb(o.base[0] * k, o.base[1] * k, o.base[2] * k);
      g.fillRect(0, i * ph, S, ph);
      for (var n = 0; n < 38; n++) {
        var y = i * ph + r() * ph;
        g.strokeStyle = rgb(o.grain[0], o.grain[1], o.grain[2], 0.08 + r() * 0.18);
        g.lineWidth = 0.6 + r() * 1.8;
        g.beginPath(); g.moveTo(0, y);
        for (var x = 0; x <= S; x += 32) g.lineTo(x, y + Math.sin(x * 0.02 + n) * (1 + r() * 2.5));
        g.stroke();
      }
      if (o.birch) {
        for (var b = 0; b < 7; b++) { g.fillStyle = 'rgba(30,25,20,' + (0.5 + r() * 0.4) + ')'; g.fillRect(r() * S, i * ph + r() * ph, 10 + r() * 40, 2 + r() * 4); }
      }
      if (r() > 0.4) {
        var kx = 60 + r() * (S - 120), ky = i * ph + ph * (0.3 + r() * 0.4);
        var grd = g.createRadialGradient(kx, ky, 1, kx, ky, 14);
        grd.addColorStop(0, rgb(o.grain[0], o.grain[1], o.grain[2], 0.9)); grd.addColorStop(1, rgb(o.grain[0], o.grain[1], o.grain[2], 0));
        g.fillStyle = grd; g.beginPath(); g.ellipse(kx, ky, 16, 7, 0, 0, Math.PI * 2); g.fill();
      }
      g.fillStyle = 'rgba(20,10,4,0.85)'; g.fillRect(0, i * ph, S, 3);
    }
    var F = 62;
    function plank(x, y, w, h) {
      g.fillStyle = o.frame; g.fillRect(x, y, w, h);
      g.strokeStyle = 'rgba(30,14,4,0.35)'; g.lineWidth = 1;
      for (var q = 0; q < 10; q++) {
        g.beginPath();
        if (w > h) { var yy = y + r() * h; g.moveTo(x, yy); g.lineTo(x + w, yy + (r() - 0.5) * 3); }
        else { var xx = x + r() * w; g.moveTo(xx, y); g.lineTo(xx + (r() - 0.5) * 3, y + h); }
        g.stroke();
      }
      g.strokeStyle = 'rgba(20,8,2,0.9)'; g.lineWidth = 3; g.strokeRect(x + 1.5, y + 1.5, w - 3, h - 3);
    }
    if (o.diagonal !== false) {
      g.save(); g.translate(S / 2, S / 2); g.rotate(-Math.PI / 4);
      var d = S * 1.25;
      g.fillStyle = o.frame; g.fillRect(-d / 2, -F / 2.4, d, F / 1.2);
      g.strokeStyle = 'rgba(20,8,2,0.9)'; g.lineWidth = 3; g.strokeRect(-d / 2, -F / 2.4, d, F / 1.2);
      g.restore();
    }
    plank(0, 0, S, F); plank(0, S - F, S, F); plank(0, 0, F, S); plank(S - F, 0, F, S);
    nails(g, F, o.nail || '#2a2a2e');
  }
  function nails(g, F, col) {
    [[F / 2, F / 2], [S - F / 2, F / 2], [F / 2, S - F / 2], [S - F / 2, S - F / 2], [S / 2, F / 2], [S / 2, S - F / 2], [F / 2, S / 2], [S - F / 2, S / 2]].forEach(function (p) {
      g.fillStyle = col; g.beginPath(); g.arc(p[0], p[1], 6, 0, Math.PI * 2); g.fill();
      g.fillStyle = 'rgba(255,255,255,0.4)'; g.beginPath(); g.arc(p[0] - 1.8, p[1] - 1.8, 2, 0, Math.PI * 2); g.fill();
    });
  }
  function grime(g, r, n, a) { for (var i = 0; i < n; i++) { g.fillStyle = 'rgba(0,0,0,' + r() * a + ')'; g.fillRect(r() * S, r() * S, 2, 2); } }
  function blotches(g, r, n, color, rad) {
    for (var i = 0; i < n; i++) {
      var x = r() * S, y = r() * S, rr = rad * (0.4 + r());
      var grd = g.createRadialGradient(x, y, 1, x, y, rr);
      grd.addColorStop(0, color); grd.addColorStop(1, 'rgba(0,0,0,0)');
      g.fillStyle = grd; g.beginPath(); g.arc(x, y, rr, 0, Math.PI * 2); g.fill();
    }
  }

  // ---------------------------------------------------------------- металл
  function paintMetal(g, o, r) {
    var grd = g.createLinearGradient(0, 0, S, S);
    grd.addColorStop(0, o.light); grd.addColorStop(1, o.dark);
    g.fillStyle = grd; g.fillRect(0, 0, S, S);
    for (var i = 0; i < 260; i++) {
      g.strokeStyle = 'rgba(255,255,255,' + r() * 0.08 + ')'; g.lineWidth = 1;
      var y = r() * S; g.beginPath(); g.moveTo(0, y); g.lineTo(S, y + (r() - 0.5) * 6); g.stroke();
    }
    var F = 54;
    g.fillStyle = o.frame;
    g.fillRect(0, 0, S, F); g.fillRect(0, S - F, S, F); g.fillRect(0, 0, F, S); g.fillRect(S - F, 0, F, S);
    g.strokeStyle = 'rgba(0,0,0,0.55)'; g.lineWidth = 4; g.strokeRect(F, F, S - 2 * F, S - 2 * F); g.strokeRect(2, 2, S - 4, S - 4);
    g.strokeStyle = 'rgba(255,255,255,0.18)'; g.lineWidth = 2; g.strokeRect(F + 4, F + 4, S - 2 * F - 8, S - 2 * F - 8);
    // заклёпки
    for (var t = 0; t < 8; t++) {
      var p = F / 2 + t * (S - F) / 7;
      [[p, F / 2], [p, S - F / 2], [F / 2, p], [S - F / 2, p]].forEach(function (q) {
        g.fillStyle = o.rivet; g.beginPath(); g.arc(q[0], q[1], 7, 0, Math.PI * 2); g.fill();
        g.fillStyle = 'rgba(255,255,255,0.55)'; g.beginPath(); g.arc(q[0] - 2, q[1] - 2, 2.4, 0, Math.PI * 2); g.fill();
      });
    }
    if (o.emblem) {
      g.font = 'bold 150px serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
      g.fillStyle = 'rgba(0,0,0,0.35)'; g.fillText(o.emblem, S / 2 + 4, S / 2 + 6);
      g.fillStyle = o.emblemColor || 'rgba(255,255,255,0.3)'; g.fillText(o.emblem, S / 2, S / 2);
    }
    if (o.rust) blotches(g, r, 40, 'rgba(150,70,20,0.55)', 50);
  }

  // ---------------------------------------------------------------- особые
  function paintStripes(g, r, a, b, w) {
    g.fillStyle = a; g.fillRect(0, 0, S, S);
    g.save(); g.translate(S / 2, S / 2); g.rotate(Math.PI / 4); g.fillStyle = b;
    for (var x = -S; x < S; x += w * 2) g.fillRect(x, -S, w, S * 2);
    g.restore();
  }
  function cracks(g, r, color, width, n) {
    g.strokeStyle = color; g.lineCap = 'round';
    for (var i = 0; i < n; i++) {
      var x = r() * S, y = r() * S; g.lineWidth = width * (0.5 + r());
      g.beginPath(); g.moveTo(x, y);
      for (var k = 0; k < 6; k++) { x += (r() - 0.5) * 90; y += (r() - 0.5) * 90; g.lineTo(x, y); }
      g.stroke();
    }
  }
  function stars(g, r, n) {
    for (var i = 0; i < n; i++) {
      var s = r() * 2.2; g.fillStyle = 'rgba(255,255,255,' + (0.4 + r() * 0.6) + ')';
      g.beginPath(); g.arc(r() * S, r() * S, s, 0, Math.PI * 2); g.fill();
    }
  }
  function frameLines(g, color, w) {
    var F = 46; g.strokeStyle = color; g.lineWidth = w;
    g.strokeRect(F / 2, F / 2, S - F, S - F);
    g.beginPath(); g.moveTo(F / 2, S - F / 2); g.lineTo(S - F / 2, F / 2); g.stroke();
  }
  function mimicFace(g, r) {
    // рот
    g.fillStyle = '#2a0508';
    g.beginPath(); g.moveTo(90, 300); g.quadraticCurveTo(256, 230, 422, 300); g.quadraticCurveTo(256, 470, 90, 300); g.fill();
    g.fillStyle = '#c0283a'; g.beginPath(); g.ellipse(256, 380, 70, 26, 0, 0, Math.PI * 2); g.fill();
    g.fillStyle = '#f5ecd8';
    for (var i = 0; i < 9; i++) {
      var x = 105 + i * 34, yTop = 300 - Math.sin((i + 0.5) / 9 * Math.PI) * 52 + 14;
      g.beginPath(); g.moveTo(x, yTop); g.lineTo(x + 30, yTop); g.lineTo(x + 15, yTop + 34); g.fill();
      var yb = 300 + Math.sin((i + 0.5) / 9 * Math.PI) * 70 - 12;
      g.beginPath(); g.moveTo(x, yb); g.lineTo(x + 30, yb); g.lineTo(x + 15, yb - 30); g.fill();
    }
    // глаза
    [[170, 170], [342, 170]].forEach(function (e) {
      g.fillStyle = '#ffe14a'; g.beginPath(); g.ellipse(e[0], e[1], 34, 26, 0, 0, Math.PI * 2); g.fill();
      g.fillStyle = '#100'; g.beginPath(); g.ellipse(e[0], e[1], 8, 22, 0, 0, Math.PI * 2); g.fill();
    });
  }
  function eye(g, cx, cy, rad) {
    var grd = g.createRadialGradient(cx, cy, 2, cx, cy, rad * 1.6);
    grd.addColorStop(0, 'rgba(216,180,254,0.9)'); grd.addColorStop(1, 'rgba(120,40,200,0)');
    g.fillStyle = grd; g.beginPath(); g.arc(cx, cy, rad * 1.6, 0, Math.PI * 2); g.fill();
    g.fillStyle = '#e9d5ff'; g.beginPath(); g.ellipse(cx, cy, rad, rad * 0.55, 0, 0, Math.PI * 2); g.fill();
    g.fillStyle = '#7e22ce'; g.beginPath(); g.arc(cx, cy, rad * 0.45, 0, Math.PI * 2); g.fill();
    g.fillStyle = '#050008'; g.beginPath(); g.ellipse(cx, cy, rad * 0.12, rad * 0.4, 0, 0, Math.PI * 2); g.fill();
  }

  // ---------------------------------------------------------------- описания скинов
  var DEFS = {
    pine: { chips: [0x8a5a2e, 0x6a3e1c, 0xb07a44], paint: function (g, r) { paintWood(g, { base: [168, 104, 54], grain: [70, 35, 12], frame: '#7a4a22' }, r); grime(g, r, 1600, 0.07); } },
    oak: { chips: [0x4a2c16, 0x6a4024, 0x2e1a0c], paint: function (g, r) { paintWood(g, { base: [100, 62, 34], grain: [30, 16, 6], frame: '#3d2412' }, r); grime(g, r, 2000, 0.1); } },
    birch: { chips: [0xe8dcc0, 0xcbbd98, 0x3a3020], paint: function (g, r) { paintWood(g, { base: [226, 212, 182], grain: [150, 130, 100], frame: '#b9a57e', birch: true, nail: '#555' }, r); } },
    mahogany: { chips: [0x7a2416, 0x5a1a10, 0x9a3a24], paint: function (g, r) { paintWood(g, { base: [140, 50, 32], grain: [50, 12, 6], frame: '#5a1a10', nail: '#c9a86c' }, r); } },
    charred: { chips: [0x1a1210, 0x2a1a14, 0xff6a20], rough: 1,
      paint: function (g, r) { paintWood(g, { base: [60, 40, 30], grain: [10, 6, 4], frame: '#1c120c' }, r); blotches(g, r, 30, 'rgba(0,0,0,0.7)', 70); },
      emissive: function (g, r) { g.fillStyle = '#000'; g.fillRect(0, 0, S, S); cracks(g, r, 'rgba(255,110,30,0.9)', 2.5, 18); }, emissiveColor: 0xff7a2a, emissiveIntensity: 1 },
    mossy: { chips: [0x6a4a26, 0x3f6a2a, 0x2a4a1c], paint: function (g, r) { paintWood(g, { base: [140, 96, 56], grain: [60, 34, 14], frame: '#5a3c1c' }, r); blotches(g, r, 26, 'rgba(70,130,50,0.75)', 60); blotches(g, r, 30, 'rgba(120,170,60,0.5)', 25); } },
    iron: { chips: [0x9aa0a8, 0x6a7078, 0xc8ccd2], metal: 0.55, rough: 0.4, paint: function (g, r) { paintMetal(g, { light: '#b9bec6', dark: '#6b7079', frame: '#4a4f57', rivet: '#30343a' }, r); } },
    rusty: { chips: [0x8a4a22, 0x6a6a6a, 0xa0582a], metal: 0.45, rough: 0.8, paint: function (g, r) { paintMetal(g, { light: '#8d8780', dark: '#4e4640', frame: '#5a3a26', rivet: '#3a2618', rust: true }, r); grime(g, r, 3000, 0.15); } },
    gift: { chips: [0xd62839, 0xffd166, 0xffffff], rough: 0.6,
      paint: function (g, r) {
        g.fillStyle = '#c81d32'; g.fillRect(0, 0, S, S);
        for (var i = 0; i < 40; i++) { g.fillStyle = 'rgba(255,255,255,0.85)'; var x = r() * S, y = r() * S; g.beginPath(); g.arc(x, y, 6, 0, Math.PI * 2); g.fill(); }
        g.fillStyle = '#ffcf4a'; g.fillRect(S / 2 - 40, 0, 80, S); g.fillRect(0, S / 2 - 40, S, 80);
        g.fillStyle = 'rgba(255,255,255,0.35)'; g.fillRect(S / 2 - 40, 0, 14, S); g.fillRect(0, S / 2 - 40, S, 14);
      },
      extra: function (THREE, group, mats) {
        var m = new THREE.MeshStandardMaterial({ color: 0xffcf4a, roughness: 0.4, metalness: 0.3, flatShading: true });
        var t1 = new THREE.Mesh(new THREE.TorusGeometry(0.22, 0.07, 6, 10), m); t1.position.set(-0.2, 1.47, 0); t1.rotation.set(0, Math.PI / 2, Math.PI / 4); t1.scale.z = 0.6;
        var t2 = t1.clone(); t2.position.x = 0.2; t2.rotation.z = -Math.PI / 4;
        var knot = new THREE.Mesh(new THREE.IcosahedronGeometry(0.1, 0), m); knot.position.y = 1.44;
        [t1, t2, knot].forEach(function (x) { x.castShadow = true; group.add(x); });
      } },
    gold: { chips: [0xffd24a, 0xffe58a, 0xc9a227], metal: 0.6, rough: 0.3, emissiveColor: 0x4a3200, emissiveIntensity: 1,
      paint: function (g, r) { paintMetal(g, { light: '#ffe48a', dark: '#b07d12', frame: '#c9961e', rivet: '#7a5608', emblem: '★', emblemColor: 'rgba(255,250,210,0.55)' }, r); } },
    neon: { chips: [0xff2bd6, 0x00ffe1, 0x8a2bff], rough: 0.4, basic: false,
      paint: function (g, r) { g.fillStyle = '#0a0612'; g.fillRect(0, 0, S, S); for (var i = 0; i < S; i += 32) { g.strokeStyle = 'rgba(80,40,140,0.35)'; g.lineWidth = 1; g.beginPath(); g.moveTo(i, 0); g.lineTo(i, S); g.moveTo(0, i); g.lineTo(S, i); g.stroke(); } },
      emissive: function (g, r) { g.fillStyle = '#000'; g.fillRect(0, 0, S, S); g.shadowBlur = 18; g.shadowColor = '#ff2bd6'; frameLines(g, '#ff2bd6', 10); g.shadowColor = '#00ffe1'; g.strokeStyle = '#00ffe1'; g.lineWidth = 5; g.strokeRect(70, 70, S - 140, S - 140); g.shadowBlur = 0; },
      emissiveColor: 0xffffff, emissiveIntensity: 1.3 },
    crystal: { chips: [0x9ff3ff, 0xc9a8ff, 0xffffff], metal: 0.2, rough: 0.05, transparent: 0.62, emissiveColor: 0x2a7a9a, emissiveIntensity: 0.6,
      paint: function (g, r) {
        var grd = g.createLinearGradient(0, 0, S, S); grd.addColorStop(0, '#d8fbff'); grd.addColorStop(0.5, '#8fd9ff'); grd.addColorStop(1, '#c9a8ff');
        g.fillStyle = grd; g.fillRect(0, 0, S, S);
        g.strokeStyle = 'rgba(255,255,255,0.8)'; g.lineWidth = 2;
        for (var i = 0; i < 16; i++) { g.beginPath(); g.moveTo(r() * S, r() * S); g.lineTo(r() * S, r() * S); g.lineTo(r() * S, r() * S); g.closePath(); g.stroke(); }
        frameLines(g, 'rgba(255,255,255,0.9)', 8);
      } },
    ice: { chips: [0xcff4ff, 0x9ad8f0, 0xffffff], rough: 0.15, metal: 0.1, transparent: 0.85,
      paint: function (g, r) { var grd = g.createLinearGradient(0, 0, 0, S); grd.addColorStop(0, '#e9fbff'); grd.addColorStop(1, '#7cc4e4'); g.fillStyle = grd; g.fillRect(0, 0, S, S); cracks(g, r, 'rgba(255,255,255,0.85)', 2, 22); blotches(g, r, 20, 'rgba(255,255,255,0.4)', 50); frameLines(g, 'rgba(220,250,255,0.9)', 12); } },
    mimic: { chips: [0x8a5a2e, 0xc0283a, 0xf5ecd8], faces: true,
      paint: function (g, r) { paintWood(g, { base: [150, 92, 46], grain: [60, 28, 8], frame: '#5a3418', diagonal: false, nail: '#c9a86c' }, r); mimicFace(g, r); } },
    lava: { chips: [0x2a1a14, 0xff5a14, 0xffb020], rough: 0.95,
      paint: function (g, r) { g.fillStyle = '#2a1e1a'; g.fillRect(0, 0, S, S); blotches(g, r, 60, 'rgba(0,0,0,0.5)', 60); grime(g, r, 4000, 0.3); },
      emissive: function (g, r) { g.fillStyle = '#000'; g.fillRect(0, 0, S, S); g.shadowBlur = 12; g.shadowColor = '#ff8a00'; cracks(g, r, '#ff7a14', 6, 22); cracks(g, r, '#ffd24a', 2, 14); g.shadowBlur = 0; },
      emissiveColor: 0xffffff, emissiveIntensity: 1.2 },
    candy: { chips: [0xff8fc8, 0xffffff, 0x8fe3ff], rough: 0.3,
      paint: function (g, r) { paintStripes(g, r, '#fff4fa', '#ff6fb5', 34); frameLines(g, '#ff3d9a', 18); for (var i = 0; i < 70; i++) { g.fillStyle = ['#8fe3ff', '#ffe14a', '#b5ff8f'][i % 3]; g.save(); g.translate(r() * S, r() * S); g.rotate(r() * 3); g.fillRect(-6, -2, 12, 4); g.restore(); } } },
    cosmic: { chips: [0x8a2bff, 0x2b6bff, 0xffffff], rough: 0.5,
      paint: function (g, r) { g.fillStyle = '#07031a'; g.fillRect(0, 0, S, S); blotches(g, r, 10, 'rgba(140,50,255,0.45)', 140); blotches(g, r, 8, 'rgba(40,120,255,0.4)', 120); stars(g, r, 380); frameLines(g, 'rgba(200,170,255,0.6)', 6); },
      emissive: function (g, r) { g.fillStyle = '#000'; g.fillRect(0, 0, S, S); stars(g, r, 300); blotches(g, r, 6, 'rgba(120,60,255,0.5)', 120); },
      emissiveColor: 0xffffff, emissiveIntensity: 0.9 },
    void: { chips: [0x14001f, 0x7e22ce, 0xd8b4fe], rough: 0.6,
      paint: function (g, r) { g.fillStyle = '#07020c'; g.fillRect(0, 0, S, S); blotches(g, r, 14, 'rgba(90,20,140,0.35)', 110); frameLines(g, '#2a0a40', 14); eye(g, S / 2, S / 2, 110); },
      emissive: function (g, r) { g.fillStyle = '#000'; g.fillRect(0, 0, S, S); eye(g, S / 2, S / 2, 110); g.strokeStyle = 'rgba(160,80,255,0.7)'; g.lineWidth = 3; g.strokeRect(23, 23, S - 46, S - 46); },
      emissiveColor: 0xffffff, emissiveIntensity: 1 }
  };

  var cache = {}, thumbs = {};
  function texFrom(THREE, c, renderer, srgb) {
    var t = new THREE.CanvasTexture(c);
    if (srgb) t.encoding = THREE.sRGBEncoding;
    if (renderer) t.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
    return t;
  }
  function paintCanvas(id, kind) {
    var d = DEFS[id], c = canvas(), g = c.getContext('2d');
    var seed = 0; for (var i = 0; i < id.length; i++) seed = seed * 31 + id.charCodeAt(i);
    (kind === 'emissive' ? d.emissive : d.paint)(g, rng(seed + (kind === 'emissive' ? 7 : 1)));
    return c;
  }

  // Возвращает { material, chips: [hex...], extra(group) }
  function get(THREE, id, renderer) {
    if (!DEFS[id]) id = 'pine';
    if (cache[id]) return cache[id];
    var d = DEFS[id];
    var mapC = paintCanvas(id, 'map');
    if (!thumbs[id]) thumbs[id] = makeThumb(id, mapC);
    var opts = {
      map: texFrom(THREE, mapC, renderer, true), roughness: d.rough !== undefined ? d.rough : 0.85, metalness: d.metal || 0, flatShading: true
    };
    if (d.emissive) { opts.emissiveMap = texFrom(THREE, paintCanvas(id, 'emissive'), renderer, true); opts.emissive = new THREE.Color(d.emissiveColor || 0xffffff); opts.emissiveIntensity = d.emissiveIntensity || 1; }
    else if (d.emissiveColor) { opts.emissive = new THREE.Color(d.emissiveColor); opts.emissiveIntensity = d.emissiveIntensity || 1; }
    if (d.transparent) { opts.transparent = true; opts.opacity = d.transparent; }
    var mat = new THREE.MeshStandardMaterial(opts);
    var material = mat;
    if (d.faces) {
      // мимик: пасть только на боковых гранях, сверху/снизу — обычные доски
      var plainC = canvas(), pg = plainC.getContext('2d');
      paintWood(pg, { base: [150, 92, 46], grain: [60, 28, 8], frame: '#5a3418', nail: '#c9a86c' }, rng(99));
      var plain = new THREE.MeshStandardMaterial({ map: texFrom(THREE, plainC, renderer, true), roughness: 0.85, flatShading: true });
      material = [mat, mat, plain, plain, mat, mat];
    }
    cache[id] = { material: material, chips: d.chips, extra: d.extra ? function (group) { d.extra(THREE, group); } : null, transparent: !!d.transparent };
    return cache[id];
  }
  function makeThumb(id, mapC) {
    var c = document.createElement('canvas'); c.width = c.height = 128; var g = c.getContext('2d');
    g.drawImage(mapC, 0, 0, 128, 128);
    if (DEFS[id].emissive) { g.globalCompositeOperation = 'lighter'; g.drawImage(paintCanvas(id, 'emissive'), 0, 0, 128, 128); }
    return c.toDataURL('image/png');
  }
  function thumb(id) {
    if (!DEFS[id]) return '';
    if (!thumbs[id]) thumbs[id] = makeThumb(id, paintCanvas(id, 'map'));
    return thumbs[id];
  }
  // Текстура трещин (прозрачная) для отображения урона
  function crackTexture(THREE) {
    var c = canvas(), g = c.getContext('2d'), r = rng(4242);
    g.clearRect(0, 0, S, S);
    g.strokeStyle = 'rgba(15,6,2,0.95)'; g.lineCap = 'round';
    for (var i = 0; i < 9; i++) {
      var x = S / 2 + (r() - 0.5) * 80, y = S / 2 + (r() - 0.5) * 80; g.lineWidth = 5;
      g.beginPath(); g.moveTo(x, y);
      var a = r() * Math.PI * 2;
      for (var k = 0; k < 7; k++) { a += (r() - 0.5) * 1.2; x += Math.cos(a) * 38; y += Math.sin(a) * 38; g.lineTo(x, y); g.lineWidth = Math.max(1, 5 - k * 0.6); }
      g.stroke();
    }
    return new THREE.CanvasTexture(c);
  }

  root.CrateSkins = { get: get, thumb: thumb, crackTexture: crackTexture, ids: Object.keys(DEFS) };
})(window);
