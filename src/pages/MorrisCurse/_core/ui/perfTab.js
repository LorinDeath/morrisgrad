// Админка → «📊 Нагрузка» (только админ). Рисует JSON с сервера (admin_perf); пиксельные графики на canvas.
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const SUBS = [['server', '🖥 Сервер'], ['online', '👥 Онлайн'], ['players', '🧙 Игроки'], ['economy', '💰 Экономика']];
import { CLASSES } from '../classes.js';
const CLS = new Proxy({}, { get: (_, k) => CLASSES[k]?.name || (k === '?' ? 'не выбран' : k) });
const WORLD = { hellfire: 'Адское пекло', arinar: 'Аринар', hub: 'Город', arena: 'Арена' };
const ECON = { kills: 'Убийств мобов', kills_elite: '…элиты', kills_cursed: '…проклятых', kills_boss: '…боссов', deaths: 'Смертей героев', chests_open: 'Открыто сундуков', items_drop: 'Выпало предметов', cursed_drop: 'Проклятых дропов', quests: 'Сдано квестов' };
const num = (v, d = 1) => (v == null ? '—' : typeof v === 'number' ? (Math.abs(v) >= 1000 ? Math.round(v).toLocaleString('ru-RU') : String(+v.toFixed(d))) : esc(v));
const kb = (b) => (b >= 1048576 ? (b / 1048576).toFixed(2) + ' МБ' : (b / 1024).toFixed(1) + ' КБ');
const dur = (s) => { s = Math.round(s || 0); const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60); return h ? `${h} ч ${m} мин` : m ? `${m} мин ${s % 60} с` : `${s} с`; };
const tbl = (head, rows) => `<table class="pf-t"><tr>${head.map((h) => `<th>${h}</th>`).join('')}</tr>${rows.map((r) => `<tr>${r.map((c) => `<td>${c}</td>`).join('')}</tr>`).join('')}</table>`;
const kv = (pairs) => `<div class="pf-kv">${pairs.map(([k, v, warn]) => `<div${warn ? ' class="warn"' : ''}><span>${k}</span><b>${v}</b></div>`).join('')}</div>`;
const chart = (id, title, unit = '') => `<div class="pf-ch"><div class="pf-ct">${title}</div><canvas data-chart="${id}" data-unit="${unit}" width="300" height="70"></canvas></div>`;
const bars = (obj, names = {}) => { const e = Object.entries(obj || {}).sort((a, b) => b[1] - a[1]); const m = Math.max(1, ...e.map((x) => x[1])); return e.length ? e.map(([k, v]) => `<div class="pf-bar"><span>${esc(names[k] || k)}</span><i style="width:${Math.round((v / m) * 100)}%"></i><b>${v}</b></div>`).join('') : '<p class="pf-m">нет данных</p>'; };
const win = (w) => w ? [['1 мин', w.m1], ['5 мин', w.m5], ['15 мин', w.m15]].map(([n, s]) => [n, num(s.avg, 2), num(s.p50, 2), num(s.p95, 2), num(s.p99, 2), num(s.max, 2), s.n]) : [];
const WH = ['Окно', 'сред', 'p50', 'p95', 'p99', 'макс', 'точек'];

function server(d) {
  const S = d.server, n = S.net, r3 = (x, f = num) => `${f(x.s1m)} / ${f(x.s5m)} / ${f(x.s15m)}`;
  const late = S.lateMs.p95_5m > 50;
  return `${kv([['Цель такта', `${S.target.tickMs} мс (${S.target.tickHz} Гц)`], ['Факт, Гц (1/5/15 мин)', r3(S.tickHz)], ['Опоздание p95 / макс (5 мин)', `${S.lateMs.p95_5m} / ${S.lateMs.max_5m} мс`, late],
    ['Аптайм DO', dur(S.uptime.sec)], ['Запусков DO', S.uptime.boots], ['Ошибок (15 мин / всего)', `${S.errors.s15m} / ${S.errors.total}`, S.errors.s15m > 0]])}
  <p class="pf-m">ⓘ ${esc(S.target.note)}</p>
  <div class="pf-row">${chart('gap', 'Интервал между тактами, мс (5 мин)')}${chart('tick', 'Длительность такта, мс (5 мин)')}${chart('out', 'Исходящие сообщения/с (15 мин)')}${chart('bout', 'Исходящие байты/с (15 мин)')}</div>
  <h4>Такт сервера</h4>${tbl(WH, win(S.tickMs))}
  <h4>Интервал между тактами (цель ${S.target.tickMs} мс)</h4>${tbl(WH, win(S.gapMs))}
  <h4>Обновление миров (zone.update), мс</h4>${tbl(['Мир', 'сред 1м', 'p95 1м', 'p99 5м', 'макс 15м'], Object.entries(S.zones).map(([w, z]) => [esc(WORLD[w] || w), num(z.updateMs.m1.avg, 2), num(z.updateMs.m1.p95, 2), num(z.updateMs.m5.p99, 2), num(z.updateMs.m15.max, 2)]))}
  <h4>Обработка входящих сообщений, мс</h4>${tbl(WH, win(S.handlerMs))}
  <h4>Сеть (в среднем в секунду: 1 / 5 / 15 мин)</h4>${kv([['Входящих сообщ.', r3(n.msgIn)], ['Входящих байт', r3(n.bytesIn, kb)], ['Исходящих сообщ.', r3(n.msgOut)], ['Исходящих байт', r3(n.bytesOut, kb)], ['Рассылок players_state', r3(n.broadcasts)], ['Получателей на рассылку', n.fanoutPerBroadcast]])}
  <h4>WebSocket и запросы (15 мин)</h4>${kv([['Подключений', S.ws.opened15m], ['Отключений', S.ws.closed15m], ['Переподключений (оценка)', Math.max(0, Math.min(S.ws.opened15m, S.ws.closed15m))], ['Запросов к DO', `${S.ws.req15m} (всего ${S.ws.reqTotal})`]])}
  <h4>D1</h4>${kv([['Запросов/мин (1 / 5 мин)', `${S.db.perMin} / ${S.db.perMin5}`], ['Средняя задержка (1 мин)', S.db.avgMs1m + ' мс', S.db.avgMs1m > 100], ['Ошибок D1 (15 мин)', S.db.errors15m, S.db.errors15m > 0]])}
  ${S.db.slow.length ? tbl(['Медленный запрос', 'мс'], S.db.slow.slice(-5).map((q) => [esc(q.sql), q.ms])) : ''}
  <h4>Сущности миров</h4>${tbl(['Мир', 'мобы', 'активные', 'лагеря', 'снаряды', 'AoE/касты', 'DoT'], Object.entries(d.entities).map(([w, e]) => [esc(WORLD[w] || w), e.mobs, e.awake, e.camps, e.projectiles, e.aoe, e.dots]))}
  ${kv([['Сундуков', d.objects.chests], ['Мешков лута', d.objects.lootBags], ['Групп', d.objects.parties], ['Отложенных эффектов', d.objects.fx]])}
  <h4>Частые входящие сообщения</h4>${tbl(['Тип', 'Всего'], n.topIn.map(([t, c]) => [esc(t), c]))}
  ${S.errors.last.length ? `<h4>Последние ошибки</h4>${tbl(['Время', 'Текст'], S.errors.last.map((e) => [new Date(e.at).toLocaleTimeString('ru-RU'), esc(e.m)]))}` : ''}
  <p class="pf-m">ⓘ ${esc(S.cpu.note)}</p>`;
}
function online(d) {
  const O = d.online, L = d.days.length - 1, s = O.sessions;
  const conv = O.guestToRegistered[L] || 0, regs = O.newRegistrations[L] || 0;
  return `${kv([['Онлайн сейчас', `${O.now.total} (вошли ${O.now.registered} · гости ${O.now.guests})`], ['Пик сегодня', O.peakToday], ['Пик за 7 дней', O.peak7d],
    ['DAU (сегодня)', `${O.dau[L]} (вошли ${O.dauRegistered[L]})`], ['WAU (7 дн)', O.wau], ['MAU (30 дн)', O.mau],
    ['Новых регистраций сегодня', regs], ['Гость → аккаунт сегодня', conv], ['Сессий сегодня', O.sessionsPerDay[L]],
    ['Средняя сессия', dur(s.avgSec)], ['Медиана сессии', dur(s.medianSec)], ['Медиана текущих', dur(s.liveMedianSec)]])}
  <div class="pf-row">${chart('hour', 'Онлайн по часам — сегодня (макс)')}${chart('hour7', 'Онлайн по часам — 7 дней')}${chart('dau', 'Уникальных игроков в день (30 дн)')}${chart('regs', 'Регистраций в день (30 дн)')}${chart('sess', 'Сессий в день (30 дн)')}</div>
  <h4>Длительность сессий сегодня</h4>${bars(Object.fromEntries((s.buckets || []).map((n, i) => [n, O.sessionLenBuckets['sl' + i] || 0])))}
  ${d.note ? `<p class="pf-m warn">⚠ ${esc(d.note)}</p>` : ''}
  <p class="pf-m">ⓘ Уникальные — по анонимному хешу аккаунта/гостя, без IP. Сутки — по Киеву.</p>`;
}
function players(d) {
  const P = d.players, T = P.activeToday, C = P.client;
  return `<div class="pf-cols"><div><h4>По мирам (сейчас)</h4>${bars(P.worlds, WORLD)}<h4>По локациям Аринара</h4>${bars(P.zones)}</div>
    <div><h4>Уровни (онлайн)</h4>${bars(P.levels)}<h4>Классы (онлайн)</h4>${bars(P.classes, CLS)}</div>
    <div><h4>Активные сегодня: ${T.heroes} героев (вошли ${T.registered})</h4><h4>Уровни</h4>${bars(T.levels)}<h4>Классы</h4>${bars(T.classes, CLS)}</div></div>
  <h4>Клиенты (отчитались: ${C.reporting})</h4>${kv([['FPS p5 / p50 / p95', `${C.fps.p5} / ${C.fps.p50} / ${C.fps.p95}`, C.reporting && C.fps.p5 < 30], ['Пинг p50 / p95 / макс', `${C.pingMs.p50} / ${C.pingMs.p95} / ${C.pingMs.max} мс`, C.pingMs.p95 > 250], ['ПК / мобильные', `${C.desktop} / ${C.mobile}`]])}
  <h4>Браузеры</h4>${bars(C.browsers)}`;
}
function economy(d) {
  const E = d.economy;
  return `${tbl(['Счётчик', 'Сегодня', 'Вчера', '7 дней'], Object.entries(ECON).map(([k, n]) => { const a = E.perDay[k] || []; return [n, num(E.today[k]), num(a[a.length - 2] || 0), num(a.slice(-7).reduce((x, y) => x + y, 0))]; }))}
  <div class="pf-row">${chart('kills', 'Убийства мобов в день (30 дн)')}${chart('deaths', 'Смерти героев в день')}${chart('chests', 'Сундуки в день')}${chart('cursed', 'Проклятые дропы в день')}${chart('quests', 'Квесты в день')}</div>`;
}
export function perfHtml(d, sub) {
  const head = `<div class="pf-top">${SUBS.map(([k, t]) => `<button data-psub="${k}" class="${k === sub ? 'on' : ''}">${t}</button>`).join('')}
    <span class="pf-sp"></span><label class="pf-m"><input type="checkbox" data-auto checked> авто 5 с</label><button data-prefresh>⟳ Обновить</button><button data-pcopy ${d ? '' : 'disabled'}>📋 Скопировать JSON</button></div>`;
  if (!d) return `<div class="pf">${head}<p>Загрузка…</p></div>`;
  const body = sub === 'online' ? online(d) : sub === 'players' ? players(d) : sub === 'economy' ? economy(d) : server(d);
  return `<div class="pf">${head}<p class="pf-m">Снимок: ${new Date(d.at).toLocaleString('ru-RU', { timeZone: 'Europe/Kiev' })} (Киев) · ${esc(d.privacy)}</p>${body}</div>
  <style>.pf{font-family:inherit;image-rendering:pixelated}.pf h4{margin:10px 0 4px;color:#e9c46a;font-size:12px;text-transform:uppercase;letter-spacing:1px}
  .pf-top{display:flex;gap:4px;flex-wrap:wrap;align-items:center;position:sticky;top:0;background:#14101c;padding:4px 0;z-index:2}.pf-top button{border:2px solid #3b2f52;background:#221a30;color:#ddd;padding:3px 8px;cursor:pointer;font:inherit;font-size:12px}
  .pf-top button.on{background:#5b3a8c;border-color:#c9a2ff;color:#fff}.pf-sp{flex:1}.pf-m{color:#9a90ad;font-size:11px;margin:4px 0}.pf-m.warn,.pf-kv .warn b{color:#ff7a6b}
  .pf-kv{display:grid;grid-template-columns:repeat(auto-fill,minmax(210px,1fr));gap:4px}.pf-kv div{border:2px solid #2c2340;background:#191324;padding:3px 6px;display:flex;justify-content:space-between;gap:6px;font-size:12px}.pf-kv b{color:#9ef01a;font-weight:normal}
  .pf-t{border-collapse:collapse;font-size:11px;width:100%}.pf-t th{color:#c9a2ff;text-align:left;border-bottom:2px solid #3b2f52;padding:2px 4px}.pf-t td{padding:2px 4px;border-bottom:1px solid #241c33;word-break:break-all}
  .pf-row{display:flex;flex-wrap:wrap;gap:6px;margin:6px 0}.pf-ch{border:2px solid #2c2340;background:#0f0b16;padding:3px}.pf-ct{font-size:10px;color:#9a90ad}.pf-ch canvas{display:block;width:300px;height:70px;image-rendering:pixelated}
  .pf-cols{display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:10px}.pf-bar{display:grid;grid-template-columns:110px 1fr 40px;gap:4px;align-items:center;font-size:11px;margin:1px 0}.pf-bar span{overflow:hidden;white-space:nowrap;text-overflow:ellipsis}
  .pf-bar i{display:block;height:8px;background:repeating-linear-gradient(90deg,#9ef01a 0 4px,#70b80f 4px 6px);min-width:2px}.pf-bar b{text-align:right;font-weight:normal}</style>`;
}
/** пиксельный столбчатый график; line — дополнительная пороговая линия */
function draw(cv, vals, { color = '#9ef01a', line = null, labels = null } = {}) {
  const W = 150, H = 35; cv.width = W; cv.height = H; const g = cv.getContext('2d'); g.imageSmoothingEnabled = false;
  g.fillStyle = '#0f0b16'; g.fillRect(0, 0, W, H); const v = (vals || []).map((x) => +x || 0), n = Math.max(1, v.length);
  const m = Math.max(1e-6, line || 0, ...v), bw = Math.max(1, Math.floor((W - 2) / n));
  g.fillStyle = '#241c33'; for (let y = 0; y < H; y += 7) g.fillRect(0, y, W, 1);
  v.forEach((x, i) => { const h = Math.max(x > 0 ? 1 : 0, Math.round((x / m) * (H - 7))); g.fillStyle = line && x > line * 1.5 ? '#ff7a6b' : color; g.fillRect(1 + i * bw, H - h, Math.max(1, bw - 1), h); });
  if (line) { g.fillStyle = '#e9c46a'; const y = H - Math.round((line / m) * (H - 7)); for (let x = 0; x < W; x += 3) g.fillRect(x, y, 2, 1); }
  g.fillStyle = '#c9a2ff'; g.font = '6px monospace'; g.fillText(String(+m.toFixed(m < 10 ? 1 : 0)), 1, 6);
  cv.title = labels ? v.map((x, i) => `${labels[i]}: ${x}`).join('\n') : `макс ${+m.toFixed(2)}`;
}
export function mountPerf(sec, d, on) {
  sec.querySelectorAll('[data-psub]').forEach((b) => (b.onclick = () => on.sub(b.dataset.psub)));
  const r = sec.querySelector('[data-prefresh]'); if (r) r.onclick = () => on.refresh();
  const c = sec.querySelector('[data-pcopy]'); if (c) c.onclick = () => on.copy();
  if (!d) return;
  const S = d.server, O = d.online, E = d.economy?.perDay || {}, days = d.days.map((x) => x.slice(5));
  const H7 = (O.hourly7d || []).flatMap((x) => x.h);
  const map = { gap: [S.hist.gapMs5m, { line: S.target.tickMs }], tick: [S.hist.tickMs5m, { color: '#4cc9f0' }], out: [S.hist.msgOut15m, { color: '#c9a2ff' }], bout: [S.hist.bytesOut15m, { color: '#c9a2ff' }],
    hour: [O.hourlyToday, { labels: O.hourlyToday.map((_, h) => h + ':00') }], hour7: [H7, { color: '#4cc9f0' }], dau: [O.dau, { labels: days }], regs: [O.newRegistrations, { labels: days, color: '#e9c46a' }], sess: [O.sessionsPerDay, { labels: days, color: '#4cc9f0' }],
    kills: [E.kills, { labels: days }], deaths: [E.deaths, { labels: days, color: '#ff7a6b' }], chests: [E.chests_open, { labels: days, color: '#e9c46a' }], cursed: [E.cursed_drop, { labels: days, color: '#c9a2ff' }], quests: [E.quests, { labels: days, color: '#4cc9f0' }] };
  sec.querySelectorAll('canvas[data-chart]').forEach((cv) => { const m = map[cv.dataset.chart]; if (m) draw(cv, m[0], m[1]); });
}
