// Эффекты уровня в забеге: пузырь неуязвимости над героями (3 с выбора) и пиксельное кольцо ударной волны.
// PNG — tools/mc-sprites/gen_fx.py. Состояние берётся из RunSession: invulnLeft()/remotes[].inv/waveFx.
import { loadAtlasTexture } from './spriteBatch.js';
import { WAVE } from '../survivors/run.js';
import shieldSrc from '../../../../assets/mc/fx_shield.png';
import waveSrc from '../../../../assets/mc/fx_shockwave.png';

const url = (s) => (typeof s === 'object' && s ? s.src || s.default || '' : s);
const WAVE_LIFE = 0.45;

export class LevelFx {
  constructor(THREE, root) {
    this.THREE = THREE; this.root = root;
    this.shields = new Map(); // id → Sprite
    this.waves = []; // пул плоскостей
    this.tShield = null; this.tWave = null;
    const prep = (t) => { t.magFilter = THREE.NearestFilter; t.minFilter = THREE.NearestFilter; t.generateMipmaps = false; return t; };
    loadAtlasTexture(THREE, url(shieldSrc)).then((t) => { this.tShield = prep(t); }).catch(() => {});
    loadAtlasTexture(THREE, url(waveSrc)).then((t) => { this.tWave = prep(t); }).catch(() => {});
  }

  shield(id) {
    let s = this.shields.get(id);
    if (!s && this.tShield) {
      s = new this.THREE.Sprite(new this.THREE.SpriteMaterial({ map: this.tShield, transparent: true, depthWrite: false, opacity: 0.8 }));
      s.scale.set(2.6, 2.6, 1); s.renderOrder = 5;
      this.root.add(s); this.shields.set(id, s);
    }
    return s;
  }

  // list: [{id, x, z, left}] — кто сейчас неуязвим; waveFx: run.waveFx (стареет здесь)
  update(dt, time, list, waveFx) {
    const on = new Set();
    for (const p of list) {
      const s = this.shield(p.id);
      if (!s) continue;
      on.add(p.id);
      s.visible = true;
      const end = p.left !== undefined && p.left < 0.6 ? Math.floor(time * 16) % 2 : 1; // мигает в конце окна
      s.material.opacity = (0.55 + Math.sin(time * 9) * 0.2) * end;
      s.material.rotation = Math.sin(time * 2) * 0.15;
      const k = 1 + Math.sin(time * 6) * 0.04;
      s.scale.set(2.6 * k, 2.6 * k, 1);
      s.position.set(p.x, 1.25, p.z);
    }
    for (const [id, s] of this.shields) if (!on.has(id)) s.visible = false;
    // волны
    let i = 0;
    for (let j = waveFx.length - 1; j >= 0; j--) {
      const w = waveFx[j];
      w.t += dt;
      if (w.t >= WAVE_LIFE) { waveFx.splice(j, 1); continue; }
      if (!this.tWave) continue;
      let m = this.waves[i];
      if (!m) {
        m = new this.THREE.Mesh(new this.THREE.PlaneGeometry(1, 1), new this.THREE.MeshBasicMaterial({ map: this.tWave, transparent: true, depthWrite: false, side: this.THREE.DoubleSide }));
        m.rotation.x = -Math.PI / 2; m.renderOrder = 4;
        this.root.add(m); this.waves[i] = m;
      }
      const k = w.t / WAVE_LIFE, R = WAVE.r * 2 * (0.25 + 0.85 * (1 - (1 - k) * (1 - k)));
      m.visible = true; m.position.set(w.x, 0.08, w.z); m.scale.set(R, R, 1);
      m.material.opacity = 1 - k * k;
      i++;
    }
    for (; i < this.waves.length; i++) this.waves[i].visible = false;
  }
}
