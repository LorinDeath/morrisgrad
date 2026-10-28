// «Чёрная магия», этап А — клиент: вкладка «Артефакты» (до 30 на аккаунт; видно, как обычные параметры глушатся,
// а чёрные раскрываются), Библиотека «🔥 Навыки артефактов» и парящий огненный слой-заглушка у руки героя.
// Все числа — из снимка сервера (hero.effective.bm/art, bma) и карточек предметов (card.art); клиент ничего не считает в бою.
import { BM_KEYS, BM_NAMES, BM_PARTS } from '../../../../../server/meta/blackArt.ts';
import { ABILITIES_DEF, SLOT_ORDER, SLOTS } from '../../../../../server/meta/shared.ts';
import { ITEM_BY_ID } from '../meta/itemCards.js';
import { esc } from './overlay.js';

const CSS = `
.bm-wrap{--f1:#ff6a1a;--f2:#ffb347;--f3:#ffe08a;--ch:#1a0d08}
.bm-head{display:flex;gap:10px;align-items:center;flex-wrap:wrap;margin:4px 0 8px}
.bm-cnt{color:var(--f2);font-weight:700}
.bm-list{display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:8px;margin-bottom:10px}
.bm-card{background:radial-gradient(120% 90% at 50% 110%,#5c1a0b 0%,#1a0d08 60%,#0b0604 100%);border:1px solid #a8320f;border-radius:8px;padding:8px;color:#ffe9d0;text-align:left;cursor:pointer;position:relative;overflow:hidden}
.bm-card.on{border-color:var(--f3);box-shadow:0 0 12px #ff6a1a99}
.bm-card.hand::after{content:'В РУКЕ';position:absolute;top:4px;right:6px;font-size:10px;color:var(--f3);letter-spacing:1px}
.bm-card b{display:block;color:var(--f2)}
.bm-card small{opacity:.8}
.bm-cols{display:grid;grid-template-columns:1fr 1fr;gap:12px}
@media (max-width:640px){.bm-cols{grid-template-columns:1fr}}
.bm-col{border-radius:8px;padding:8px 10px;border:1px solid #334155;background:#0f172a}
.bm-col.blk{border-color:#a8320f;background:radial-gradient(140% 100% at 50% 120%,#3a1206 0%,#120805 70%)}
.bm-col h4{margin:0 0 6px}
.bm-row{display:flex;justify-content:space-between;gap:8px;padding:2px 0;font-size:13px}
.bm-sup .bm-row{animation:bmDim .9s ease-out forwards;animation-delay:calc(var(--i)*70ms)}
.bm-sup .bm-row b{position:relative}
.bm-sup .bm-row b::after{content:'';position:absolute;left:-2px;right:-2px;top:50%;height:2px;background:#ef4444;transform:scaleX(0);transform-origin:left;animation:bmStrike .5s ease-out forwards;animation-delay:calc(var(--i)*70ms + .2s)}
.bm-unl .bm-row{opacity:0;animation:bmRise .8s ease-out forwards;animation-delay:calc(.5s + var(--i)*90ms)}
.bm-unl .bm-row b{color:var(--f3);text-shadow:0 0 6px #ff6a1a,0 0 12px #ff3d0088;animation:bmFlick 1.6s infinite alternate}
.bm-keep{margin-top:8px;font-size:12px;color:#86efac}
.bm-lock{color:#fca5a5;font-size:12px}
.bm-skill{display:flex;gap:8px;align-items:flex-start;padding:6px 8px;margin:4px 0;border-radius:6px;background:#1a0d08;border:1px solid #5c1a0b;color:#ffe9d0}
.bm-skill i{font-style:normal;font-size:22px;filter:drop-shadow(0 0 4px #ff6a1a)}
.bm-skill .f{color:var(--f3);font-size:12px}
.bm-skill .v{color:#fdba74;font-size:11px;opacity:.85}
@keyframes bmDim{to{opacity:.38;filter:grayscale(1)}}
@keyframes bmStrike{to{transform:scaleX(1)}}
@keyframes bmRise{from{opacity:0;transform:translateY(6px);filter:blur(2px)}to{opacity:1;transform:none;filter:none}}
@keyframes bmFlick{0%{text-shadow:0 0 4px #ff6a1a,0 0 9px #ff3d0066}100%{text-shadow:0 0 8px #ffb347,0 0 16px #ff3d00aa}}
.bm-hand{position:absolute;pointer-events:none;transform:translate(-50%,-50%);z-index:4;display:flex;flex-direction:column;align-items:center;font:700 9px/1 system-ui,sans-serif;letter-spacing:1px;color:#ffe08a;text-shadow:0 0 4px #ff3d00}
.bm-hand .orb{width:22px;height:30px;border-radius:50% 50% 45% 45%/60% 60% 40% 40%;background:radial-gradient(60% 55% at 50% 70%,#ffe08a 0%,#ffb347 35%,#ff6a1a 65%,#a8320f00 100%);box-shadow:0 0 14px 4px #ff6a1a88;animation:bmFlame .18s infinite alternate,bmBob 1.6s ease-in-out infinite}
.bm-hand.full .orb{animation:bmFlame .09s infinite alternate;background:radial-gradient(60% 55% at 50% 70%,#fff6c8 0%,#ffd36a 35%,#ff6a1a 65%,#a8320f00 100%)}
.bm-sklink{margin:6px 0;font-size:12px}.bm-sklink .mc-btn{padding:1px 6px}
.bm-hand.chg .orb{box-shadow:0 0 calc(10px + var(--c)*26px) calc(3px + var(--c)*10px) #ff3d00cc}
.bm-hand span{margin-top:2px;background:#1a0d08cc;border:1px solid #a8320f;border-radius:3px;padding:1px 3px}
@keyframes bmFlame{from{transform:scale(1,1) skewX(-3deg)}to{transform:scale(1.06,.94) skewX(3deg)}}
@keyframes bmBob{0%,100%{margin-top:0}50%{margin-top:-4px}}
`;
let cssOn = false;
export function bmCss() {
  if (cssOn || typeof document === 'undefined') return; cssOn = true;
  const s = document.createElement('style'); s.id = 'bm-art-css'; s.textContent = CSS; document.head.appendChild(s);
}

const fmtBm = (k, v) => { const n = BM_NAMES[k]; if (!n) return String(v); const x = k === 'bdmg' ? Math.round(v * 1000) / 10 : Math.round(v * 100) / 100; return `${k === 'force' || k === 'power' ? '+' : ''}${x}${n.unit}`; };
export { fmtBm };
const ORD = { dmgMin: 'Урон (мин)', dmgMax: 'Урон (макс)', hp: 'Здоровье', armor: 'Броня', critPct: 'Крит, %', speedPct: 'Скорость, %', regen: 'Регенерация/с', cdrPct: 'Перезарядка −%', lifestealPct: 'Вампиризм, %', atkSpeedPct: 'Скорость атаки, %', dmgPct: 'Урон, %' };
export const isArtItem = (it) => !!(it && typeof it.id === 'string' && it.id.startsWith('art_'));

/** Обычные параметры, которые даёт снаряжение (их глушит артефакт): сумма статов надетых предметов кроме самого артефакта. */
function ordinaryFromGear(st) {
  const h = st.hero, a = st.account, sum = {};
  const byUid = new Map(a.inv.map((i) => [i.uid, i]));
  for (const slot of SLOT_ORDER) {
    const it = byUid.get(h?.equip?.[slot]); if (!it || isArtItem(it)) continue;
    const d = ITEM_BY_ID[it.id]; for (const [k, v] of Object.entries(d?.stats || {})) if (typeof v === 'number' && v) sum[k] = (sum[k] || 0) + v;
  }
  return sum;
}

/** Вкладка «Артефакты» */
export function rArtifacts(book, st) {
  bmCss();
  const h = st.hero, a = st.account, B = st.bma || {};
  if (!h) return '<p>Сначала выберите оболочку у Алтаря.</p>';
  const arts = a.inv.filter(isArtItem);
  const handUid = h.equip?.weapon && arts.some((i) => i.uid === h.equip.weapon) ? h.equip.weapon : null;
  const selUid = book.artSel && arts.some((i) => i.uid === book.artSel) ? book.artSel : handUid || arts[0]?.uid || null;
  const cards = arts.map((it) => {
    const d = ITEM_BY_ID[it.id], A = d?.art;
    return `<button class="bm-card ${it.uid === selUid ? 'on' : ''} ${it.uid === handUid ? 'hand' : ''}" data-act="artsel" data-v="${it.uid}">
      <b>${esc(d?.name || 'Артефакт')}</b><small>${A ? `${A.ranged ? '🏹 дальний' : '🗡️ ближний'} · 🔥 ${fmtBm('bdmg', A.stats.bdmg)} · 🎲 ${A.stats.bcrit}/100` : 'карточка загружается…'}</small></button>`;
  }).join('');
  const testBtns = book.canTestArt ? `<button class="mc-btn sm" data-act="bmtest" data-v="0" title="Только админ/локальная разработка">＋ тест: огненный (ближний)</button><button class="mc-btn sm" data-act="bmtest" data-v="1">＋ тест: огненный (дальний)</button>` : '';
  let detail = '<p class="mc-dim">Артефактов пока нет. Их собирают из частей чёрного оружия (этап Б). Выбрав артефакт, вы увидите, как обычные параметры глушатся, а чёрные — раскрываются.</p>';
  const it = selUid && arts.find((i) => i.uid === selUid);
  if (it) {
    const d = ITEM_BY_ID[it.id], A = d?.art;
    const ord = ordinaryFromGear(st);
    const ordRows = Object.entries(ord).map(([k, v], i) => `<div class="bm-row" style="--i:${i}"><span>${esc(ORD[k] || k)}</span><b>+${Math.round(v * 10) / 10}</b></div>`).join('')
      || '<div class="bm-row" style="--i:0"><span class="mc-dim">Снаряжение не надето — глушить нечего</span></div>';
    const blkRows = A ? BM_KEYS.map((k, i) => `<div class="bm-row" style="--i:${i}" title="${esc(BM_NAMES[k].hint)}"><span>${BM_NAMES[k].icon} ${esc(BM_NAMES[k].name)}</span><b>${fmtBm(k, A.stats[k] || 0)}</b></div>`).join('') : '';
    const parts = A ? Object.entries(A.parts || {}).map(([t, pid]) => `${BM_PARTS[pid]?.icon || '•'} ${esc(BM_PARTS[pid]?.name || pid)}`).join(' · ') : '';
    const nSk = A ? (A.skills || []).length : 0;
    const inHand = it.uid === handUid;
    detail = `<div class="bm-cols" data-anim="${esc(it.uid)}">
        <div class="bm-col bm-sup"><h4>Обычные параметры ${inHand ? '· заглушены' : '· будут заглушены'}</h4>${ordRows}
          <div class="bm-lock">Снаряжение и комплекты не действуют, пока артефакт в руке; слоты кроме оружия заблокированы.</div></div>
        <div class="bm-col blk bm-unl"><h4 style="color:#ffb347">🔥 Чёрные параметры ${inHand ? '· раскрыты' : '· раскроются'}</h4>${blkRows}
          <div class="bm-keep">Остаются: параметры души, таланты и навыки талантов (их урон режет чёрная броня).</div></div>
      </div>
      ${A ? `<p class="mc-dim">Удар: ${A.ranged ? `дальний, ${Math.round(A.atk.range)} px` : `ближний, ${Math.round(A.atk.range)} px`} · перезарядка ${A.cd} мс · зажмите атаку: полный заряд за ${A.stats.charge} с — удар ${fmtBm('force', A.stats.force || 0)}${A.stats.power ? `, размер ${fmtBm('power', A.stats.power)}` : ''}; отпустили раньше — обычный удар.<br>Части: ${parts}</p>
      ${nSk ? `<p class="bm-sklink">🔥 Навыков артефакта: ${nSk} — <button class="mc-btn sm" data-act="codexart">Кодекс навыков → «Навыки артефактов»</button>, в слоты — <button class="mc-btn sm" data-act="tab" data-v="skills">«Навыки»</button>.</p>` : ''}` : ''}
      <div class="acts" style="margin-top:8px">${inHand ? `<button class="mc-btn" data-act="unequip" data-v="weapon">Убрать из руки</button>` : `<button class="mc-btn gold" data-act="equip" data-v="${it.uid}">🔥 Выбрать чёрную магию (взять в руку)</button>`}</div>`;
  }
  return `<div class="bm-wrap"><div class="bm-head"><span class="bm-cnt">Артефакты: ${arts.length}/${B.maxArtifacts || 30}</span>${testBtns}</div>
    <div class="bm-list">${cards}</div>${detail}</div>`;
}

/** Библиотека → «🔥 Навыки артефактов»: единый список навыков (cls artifact; правки админки приходят в ABILITIES_DEF) */
export function rArtSkillLib() {
  bmCss();
  const list = ABILITIES_DEF.filter((d) => d.cls === 'artifact');
  return `<div class="bm-wrap"><p class="mc-dim">Навыки артефактов — общий список: их получают артефакты (от частей оружия), и админка может назначить их любому мобу. Урон — % от макс. ОЗ цели, мимо обычной брони.</p>
    ${list.map((d) => `<div class="bm-skill"><i>${d.icon}</i><div><b>${esc(d.name)}</b> · перезарядка ${d.cd} с
      <div class="f">урон: ${d.bm?.pct ?? 0}% + ${d.bm?.k ?? 0}×«Чёрный урон» от макс. ОЗ цели${(d.bm?.traits || []).length ? ' · ' + d.bm.traits.map((t) => t.k === 'burn' ? `поджог ${t.chance}%` : esc(t.k)).join(', ') : ''}</div>
      <small>${esc(d.desc || '')}</small>${d.bm?.vfx ? `<div class="v">🎞 ${esc(d.bm.vfx)}</div>` : ''}</div></div>`).join('') || '<p class="mc-dim">Нет навыков.</p>'}</div>`;
}

/** Парящий артефакт у руки героя: отдельный слой поверх сцены (спрайты героя не трогаем). Пока — огненная заглушка. */
export class ArtHand {
  constructor(layer) { this.layer = layer; this.el = null; }
  update(p, on, chg = 0) {
    if (!on || !p) { if (this.el) this.el.style.display = 'none'; return; }
    if (!this.el) { bmCss(); this.el = document.createElement('div'); this.el.className = 'bm-hand'; this.el.innerHTML = '<div class="orb"></div><span>ЗАГЛУШКА</span>'; this.layer.appendChild(this.el); }
    this.el.style.display = '';
    this.el.style.left = `${p.x + 26}px`; this.el.style.top = `${p.y + 18}px`;
    this.el.classList.toggle('chg', chg > 0); this.el.classList.toggle('full', chg >= 1); this.el.style.setProperty('--c', String(Math.min(1, chg)));
  }
}
