// Сравнение предмета с надетым в том же слоте (чистая логика, без DOM — покрыта тестом).
// Статы — те, что прислал сервер (у проклятых — cstats: база с правками админки × множитель проклятия).
// Урон оружия сравниваем как среднее (мин+макс)/2 и показываем диапазон.
const r1 = (x) => Math.round(x * 10) / 10;
export function diffStats(nst = {}, cst = null) {
  const rows = [];
  const has = (s, k) => s && typeof s[k] === 'number' && s[k] !== 0;
  const dmg = (s) => (s && (s.dmgMin || s.dmgMax) ? { min: s.dmgMin || 0, max: s.dmgMax || 0, avg: ((s.dmgMin || 0) + (s.dmgMax || 0)) / 2 } : null);
  const nd = dmg(nst), cd = dmg(cst);
  if (nd || cd) rows.push({ k: 'dmg', nv: nd, cv: cd, d: r1((nd?.avg || 0) - (cd?.avg || 0)), kind: !cst ? 'base' : !cd ? 'new' : !nd ? 'lost' : 'both' });
  const keys = [...new Set([...Object.keys(nst || {}), ...Object.keys(cst || {})])].filter((k) => k !== 'dmgMin' && k !== 'dmgMax' && (has(nst, k) || has(cst, k)));
  for (const k of keys) {
    const nv = has(nst, k) ? nst[k] : 0, cv = has(cst, k) ? cst[k] : 0;
    rows.push({ k, nv, cv, d: r1(nv - cv), kind: !cst ? 'base' : !has(cst, k) ? 'new' : !has(nst, k) ? 'lost' : 'both' });
  }
  const order = { both: 0, base: 0, new: 1, lost: 2 };
  return rows.sort((a, b) => order[a.kind] - order[b.kind]);
}
