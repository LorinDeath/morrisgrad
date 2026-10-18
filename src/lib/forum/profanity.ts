// Форум: фильтр мата и оскорблений (русский, украинский, английский).
// Ловит обходы: латинские «двойники» (xyй, cyka), цифры (3, 0, 4, @), повторы (хуууй), разделители
// внутри слова (х.у.й, х_у_й) и слово, набранное по одной букве через пробел (х у й).
// Словарь редактирует админ (настройка filter_words), по строке на корень:
//   корень    — слово (после снятия приставок по-, за-, на-, вы-, у-, от-…) НАЧИНАЕТСЯ с корня;
//   *корень   — корень где угодно внутри слова;
//   =слово    — слово целиком.

export const DEFAULT_WORDS = [
  // русский / украинский мат
  "хуй", "хуе", "хуё", "хуя", "хуи", "хули", "*пизд", "*пезд", "бля", "блят", "бляд", "еба", "ебл", "ебн", "ебу", "еби", "ебщ", "йоб", "*долбоеб", "*долбоёб",
  "=сука", "=суки", "=суку", "=сукой", "=суке", "сучк", "сучар", "мудак", "мудил", "мудоз", "пидор", "пидар", "пидр", "педик", "гандон", "гондон", "залуп",
  "шлюх", "шалав", "дроч", "=хер", "херн", "курв", "=манда", "мандавош", "срак", "=жопа", "жопу",
  // оскорбления и слюры
  "дебил", "дегенерат", "=чмо", "чмош", "ублюд", "выблядок", "уебан", "уёбок", "уебок", "=даун", "=дауны", "=хохол", "=хохлы", "=хохлам", "москал", "кацап", "=жид", "=жиды", "жидов", "чурк", "=хач", "=хачи", "=ниггер", "=ниггеры", "=нигер", "=нигеры",
  // английский и транслит
  "fuck", "*fuck", "=fck", "=fuk", "shit", "=bitch", "bitche", "=cunt", "asshole", "*motherf", "=dick", "dickhead", "=whore", "=slut", "fagot", "=fag", "nigg", "retard",
  "=hui", "=huy", "=huj", "*pizd", "blyat", "blyad", "=suka", "=cyka", "pidor", "pidar", "=ebat", "eban", "mudak",
];

const PREFIXES = ["недо", "пере", "рас", "раз", "под", "при", "про", "вы", "до", "за", "из", "на", "ни", "об", "от", "по", "съ", "у", "о", "с", "а"];

// латинские/цифровые «двойники» → кириллица
const TO_CYR: Record<string, string> = {
  a: "а", b: "б", c: "с", e: "е", h: "н", k: "к", m: "м", n: "п", o: "о", p: "р", r: "г", t: "т", u: "и", x: "х", y: "у",
  "0": "о", "3": "з", "4": "ч", "6": "б", "@": "а", "ё": "е", "і": "и", "ї": "и", "є": "е", "ґ": "г", "ъ": "", "ь": "ь",
};
// кириллические двойники → латиница
const TO_LAT: Record<string, string> = {
  "а": "a", "в": "b", "с": "c", "е": "e", "ё": "e", "н": "h", "к": "k", "м": "m", "о": "o", "р": "p", "т": "t", "х": "x", "у": "y", "і": "i",
  "0": "o", "1": "i", "3": "e", "4": "a", "5": "s", "@": "a", "$": "s", "!": "i",
};
const LETTER = /[a-zа-яёіїєґ0-9@$!]/;

function collapse(s: string) { return s.replace(/(.)\1+/g, "$1"); }
function onlyLetters(tok: string) { return Array.from(tok.toLowerCase()).filter((c) => LETTER.test(c)).join(""); }
function cyrForm(s: string) { return collapse(Array.from(s).map((c) => (TO_CYR[c] ?? c)).join("").replace(/[^а-яё]/g, "")); }
function latForm(s: string) { return collapse(Array.from(s).map((c) => (TO_LAT[c] ?? c)).join("").replace(/[^a-z]/g, "")); }

interface Rule { mode: "start" | "any" | "exact"; root: string; lat: boolean }
export function compileWords(words: string[]): Rule[] {
  const rules: Rule[] = [];
  for (let w of words) {
    w = String(w || "").trim().toLowerCase();
    if (!w || w.startsWith("#")) continue;
    let mode: Rule["mode"] = "start";
    if (w.startsWith("*")) { mode = "any"; w = w.slice(1); } else if (w.startsWith("=")) { mode = "exact"; w = w.slice(1); }
    const lat = /^[a-z]+$/.test(w);
    const root = lat ? collapse(w) : collapse(w.replace(/ё/g, "е").replace(/[іїєґ]/g, (c) => TO_CYR[c]));
    if (root.length >= 2) rules.push({ mode, root, lat });
  }
  return rules;
}

function hitForm(form: string, rules: Rule[], lat: boolean, strict: boolean): boolean {
  if (!form) return false;
  for (const r of rules) {
    if (r.lat !== lat) continue;
    if (r.mode === "exact") { if (form === r.root) return true; continue; }
    if (r.mode === "any") { if (form.includes(r.root)) return true; continue; }
    if (strict) continue; // форма «из другого алфавита»: только точные/внутренние корни (меньше ложных срабатываний)
    if (form.startsWith(r.root)) return true;
    if (!lat) for (const p of PREFIXES) if (form.length > p.length + 1 && form.startsWith(p) && form.slice(p.length).startsWith(r.root)) return true;
  }
  return false;
}
const HAS_CYR = /[а-яёіїєґ]/, HAS_LAT = /[a-z]/;
const STAR_FILL = ["у", "я", "и", "е", "а", "о", "ю", "ы"];
function tokenBad(raw: string, rules: Rule[]): boolean {
  // звёздочка/решётка ВНУТРИ слова вместо буквы: «бл*ть», «х*й», «п#здец»
  const inner = raw.match(/^[^*#]*[^\s*#][*#]{1,2}[^\s*#]/);
  if (inner && (raw.match(/[*#]/g) || []).length <= 3) {
    for (const ch of STAR_FILL) if (tokenBad1(raw.replace(/(?<=[^\s*#])[*#]{1,2}(?=[^\s*#])/g, ch), rules)) return true;
  }
  return tokenBad1(raw, rules);
}
function tokenBad1(raw: string, rules: Rule[]): boolean {
  const l = onlyLetters(raw);
  if (l.length < 2) return false;
  const chars = Array.from(l);
  const allToCyr = chars.every((c) => HAS_CYR.test(c) || c in TO_CYR);
  const allToLat = chars.every((c) => HAS_LAT.test(c) || c in TO_LAT);
  const cyr = HAS_CYR.test(l), lat = HAS_LAT.test(l);
  if ((cyr || allToCyr) && hitForm(cyrForm(l), rules, false, !cyr)) return true;
  if ((lat || allToLat) && hitForm(latForm(l), rules, true, !lat)) return true;
  return false;
}

// «∗» (U+2217), а не «*»: звёздочки маски не должны превращаться в курсив/жирный разметки
export const MASK = "\u2217";
export interface FilterResult { clean: boolean; text: string; hits: number }

/** Проверяет текст; в режиме mask заменяет плохие слова на «х***». */
export function filterText(text: string, rules: Rule[]): FilterResult {
  const src = String(text ?? "");
  // токены: [начало, конец) непробельных кусков
  const toks: { s: number; e: number; bad: boolean }[] = [];
  const re = /\S+/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(src))) toks.push({ s: m.index, e: m.index + m[0].length, bad: false });
  let hits = 0;
  for (const t of toks) if (tokenBad(src.slice(t.s, t.e), rules)) { t.bad = true; hits++; }
  // слово по одной букве через пробел: «х у й», «f u c k»
  for (let i = 0; i < toks.length; ) {
    let j = i;
    while (j < toks.length && onlyLetters(src.slice(toks[j].s, toks[j].e)).length === 1 && toks[j].e - toks[j].s <= 3) j++;
    if (j - i >= 2) {
      const joined = toks.slice(i, j).map((t) => src.slice(t.s, t.e)).join("");
      if (tokenBad(joined, rules)) { for (let k = i; k < j; k++) toks[k].bad = true; hits++; }
      i = j;
    } else i++;
  }
  if (!hits) return { clean: true, text: src, hits: 0 };
  let out = "", pos = 0;
  for (const t of toks) {
    if (!t.bad) continue;
    // маскируем только «буквенную» часть токена, пунктуация по краям остаётся: «бл*ть.» → «б∗∗∗∗.»
    const w = Array.from(src.slice(t.s, t.e));
    const isL = (c: string) => LETTER.test(c.toLowerCase()) || c === "*" || c === "#";
    let a = 0, b = w.length - 1;
    while (a < w.length && !isL(w[a])) a++;
    while (b > a && !isL(w[b])) b--;
    const core = w.slice(a, b + 1);
    const n = core.length;
    const masked = n <= 1 ? MASK : core[0] + MASK.repeat(Math.max(2, Math.min(6, n - 1)));
    out += src.slice(pos, t.s) + w.slice(0, a).join("") + masked + w.slice(b + 1).join("");
    pos = t.e;
  }
  out += src.slice(pos);
  return { clean: false, text: out, hits };
}
