// Тест якорей света: для каждого ключа с _glow точка излучения (lightEmitter → мир) == центроид светящихся пикселей ±1 px.
// Центроид считается здесь заново (sharp), независимо от gen.py. Запуск: node tools/light-emitters/run-test.mjs
import sharp from 'sharp';
import { lightEmitter, emitterOffsetM, emitterWorld, emitterGround, emitterDef, emitterSpotsM, setEmitterOverrides } from '../../src/pages/MorrisCurse/_core/engine/lightEmitter.js';
import { lightOf } from '../../src/pages/MorrisCurse/_core/engine/dayNight.js';
import W from '../../src/assets/mc/props2/props_atlas.json';
import C from '../../src/assets/mc/city/props_dark_atlas.json';
import B from '../../src/assets/mc/city/buildings.json';
const A = new URL('../../src/assets/mc/', import.meta.url).pathname;
let ok = 0, bad = 0; const t = (n, c, x) => { if (c) ok++; else { bad++; console.log('FAIL', n, x !== undefined ? JSON.stringify(x) : ''); } };
const raw = async (f) => { const { data, info } = await sharp(f).ensureAlpha().raw().toBuffer({ resolveWithObject: true }); return { data, w: info.width }; };
function cen(im, x0, y0, w, h, ax, ay) { let sw = 0, sx = 0, sy = 0; for (let y = y0; y < y0 + h; y++) for (let x = x0; x < x0 + w; x++) { const i = (y * im.w + x) * 4, a = im.data[i + 3]; if (!a) continue;
  const wt = (a / 255) * (0.2 + 0.8 * Math.max(im.data[i], im.data[i + 1], im.data[i + 2]) / 255); sw += wt; sx += wt * (x - x0 + 0.5); sy += wt * (y - y0 + 0.5); } return sw ? { e: [sx / sw - ax * w, ay * h - sy / sw], n: sw } : null; }
const SIN_P = Math.sin(1.02);
async function atlas(set, J, dir, pre) {
  const ims = {}; for (const [k, S] of Object.entries(J.sheets)) if (/_glow$/.test(k)) ims[k] = await raw(A + dir + S.image);
  let n = 0, lights = 0;
  for (const [k, d] of Object.entries(J.keys)) {
    if (!d.glow) continue; const im = ims[d.glow.sheet], cols = J.sheets[d.glow.sheet].cols, [ax, ay] = d.anchor || [0.5, 1];
    let sw = 0, sx = 0, sy = 0; const F = d.frames || 1;
    for (let f = 0; f < F; f++) { const c = d.col + f, r = cen(im, (c % cols) * d.w, (d.row + Math.floor(c / cols)) * d.h, d.w, d.h, ax, ay); if (r) { sw += r.n; sx += r.e[0] * r.n; sy += r.e[1] * r.n;
        const fe = lightEmitter(`${set}:${k}`, f); t(`${set}:${k} кадр ${f}: якорь = центроид ±1 px`, fe && Math.abs(fe[0] - r.e[0]) <= 1 && Math.abs(fe[1] - r.e[1]) <= 1, { fe, c: r.e }); } }
    if (!sw) continue; n++; const c = [sx / sw, sy / sw], e = lightEmitter(`${set}:${k}`);
    const isL = !!lightOf(k); if (isL) lights++;
    // мир: спрайт (wM × hM как он нарисован), основание (x0, 0, z0) → точка огня; обратно в px спрайта — тот же центроид ±1 px
    const [wM, hM] = d.size_m || [d.w / 10, d.h / 10], sy_ = set === 'city' ? SIN_P : 1, x0 = 100, z0 = 50;
    for (const flip of [false, true]) {
      const off = emitterOffsetM(`${set}:${k}`, { wM, hM: hM * sy_, flip }), P = emitterWorld(x0, 0, z0, off), G = emitterGround(x0, z0, off);
      const B0 = { ux: 0, uy: Math.cos(1.02), uz: -Math.sin(1.02) }; // базис по умолчанию (камера 58°, без поворота)
      const dx = P[0] - x0, up = (P[1] * B0.uy + (P[2] - z0) * B0.uz); // проекция на оси спрайта
      const px = [(flip ? -1 : 1) * dx / (wM / d.w), up / (hM * sy_ / d.h)];
      t(`${set}:${k}${flip ? ' (зеркало)' : ''}: огонь в мире = центроид _glow ±1 px`, Math.abs(px[0] - c[0]) <= 1 && Math.abs(px[1] - c[1]) <= 1, { px, c, e });
      t(`${set}:${k}${flip ? ' (зеркало)' : ''}: пятно — на земле прямо под огнём`, Math.abs(G[0] - P[0]) < 1e-6 && Math.abs(G[1] - z0) < 1e-6, { G, P });
    }
  }
  return { n, lights };
}
const w = await atlas('world', W, 'props2/', 'props_'), c = await atlas('city', C, 'city/', 'props_dark_');
console.log('world keys', w, 'city keys', c);
t('мир: фонарь/факел/костёр/портал — с якорем', ['lantern', 'torch', 'campfire', 'portal', 'portal_swirl', 'brazier'].every((k) => emitterDef(k, 'world')));
t('город: фонарь на столбе — с якорем', !!emitterDef('dm_lantern_pole', 'city'));
const lp = lightEmitter('city:dm_lantern_pole'); t('фонарь на столбе: огонь — голова фонаря справа на кронштейне (не центр спрайта)', lp && lp[0] > 2 && lp[1] > 20, lp);
const tor = lightEmitter('world:torch'); t('факел: огонь — у кончика пламени (верх спрайта)', tor && tor[1] > 30, tor);
const cf = lightEmitter('city:dm_campfire'); t('костёр: огонь — у основания пламени (низко)', cf && cf[1] < 16, cf);
// здания: окна/двери — пятна _glow; каждое — внутри спрайта
for (const [k, d] of Object.entries(B.keys)) { if (!d.glow) continue; const sp = emitterSpotsM(k, { wM: d.w / 20, hM: d.h / 20, max: 99, min: 1 });
  t(`${k}: окна/двери — пятна glow (${sp.length})`, sp.length > 0 && sp.every((s) => Math.abs(s[0]) <= d.w / 40 + 0.01 && s[1] >= 0 && s[1] <= d.h / 20 + 0.01), sp.slice(0, 3)); }
// правки админки — поверх автоматики; зеркало зеркалит правку
setEmitterOverrides({ 'city:dm_lantern_pole': [6, 30] }); t('правка якоря из админки применяется', JSON.stringify(lightEmitter('city:dm_lantern_pole')) === '[6,30]');
const o2 = emitterOffsetM('city:dm_lantern_pole', { wM: 3.2, hM: 4.8, flip: true }); t('зеркальный фонарь — смещение зеркалится', o2[0] < 0, o2);
setEmitterOverrides({}); t('сброс правок — снова центроид', JSON.stringify(lightEmitter('city:dm_lantern_pole')) === JSON.stringify(emitterDef('dm_lantern_pole', 'city').e));
console.log(`\n${ok} ok, ${bad} fail`); if (bad) process.exit(1);
