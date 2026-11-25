// Чистая логика без DOM: разбор списка слов, проверка ответа, подсветка ошибок.
'use strict';

const CYR = /[а-яё]/i;

/** «der Hund — собака», «der Hund - собака», «der Hund = собака», «der Hund<TAB>собака» */
function parseLine(line) {
  const l = line.trim().replace(/^\d+\s*[.)]\s*/, '');
  const m = l.match(/^(.+?)(?:\s*[\t=;]\s*|\s*[—–]\s*|\s+-\s+|\s*:\s+)(.+)$/);
  if (!m) return null;
  let a = m[1].trim(), b = m[2].trim();
  if (CYR.test(a) && !CYR.test(b)) [a, b] = [b, a]; // ввели «собака — der Hund»
  if (!a || !b) return null;
  return { de: a, ru: b };
}

/** Строка без разделителя и без кириллицы — немецкое слово без перевода (ru: ''), перевод найдём сами. */
function parseText(text) {
  const ok = [], bad = [];
  for (const raw of String(text).split(/\r?\n/)) {
    const l = raw.trim();
    if (!l) continue;
    const p = parseLine(l);
    if (p) ok.push(p);
    else if (!CYR.test(l)) ok.push({ de: l.replace(/^\d+\s*[.)]\s*/, '').trim(), ru: '' });
    else bad.push(l);
  }
  return { ok: ok.filter(p => p.de), bad };
}

/* ---------- Задание «впиши пропущенные буквы» ---------- */

const isLetter = c => /[A-Za-zÄÖÜäöüßẞ]/.test(c);

/**
 * Позиции букв правильного слова, в которых ученик ошибся (индексы в [...target]).
 * Пропущенная или неверная буква — её позиция; лишняя вставленная буква — соседние позиции.
 */
function errorPositions(given, target) {
  const g = [...norm(given)], t = [...target];
  if (!g.length) return [];
  const [kg, kt] = lcsMarks(g, t);
  const err = new Set(kt.map((k, i) => (k ? -1 : i)).filter(i => i >= 0));
  if (!err.size) {
    // только лишние буквы: отмечаем соседей места вставки
    const matched = kt.map((k, i) => (k ? i : -1)).filter(i => i >= 0);
    let m = 0;
    g.forEach((_, i) => {
      if (kg[i]) { m++; return; }
      if (matched[m] !== undefined) err.add(matched[m]);
      if (m > 0) err.add(matched[m - 1]);
    });
  }
  // перепутан или пропущен артикль — прячем его целиком, а не одну букву
  const mt = target.match(ART), mg = g.join('').match(/^(\S+)\s/);
  if (mt && (!mg || lower(mg[1]) !== lower(mt[1]))) for (let i = 0; i < mt[1].length; i++) err.add(i);
  return [...err].filter(i => isLetter(t[i])).sort((a, b) => a - b);
}

/** «Коварные» места немецкого написания: умлауты, ß, заглавные, двойные буквы, ie/ei, немое h. */
function trickyPositions(target) {
  const c = [...target], out = [];
  c.forEach((ch, i) => {
    const p = c[i - 1] || '', n = c[i + 1] || '';
    if (!isLetter(ch)) return;
    if (/[äöüßÄÖÜẞ]/.test(ch) || /[A-ZÄÖÜ]/.test(ch) || ch === p || ch === n ||
      (ch === 'h' && /[aeiouäöü]/i.test(p)) ||
      (ch === 'e' && (p === 'i' || n === 'i')) || (ch === 'i' && (p === 'e' || n === 'e'))) out.push(i);
  });
  return out;
}

/**
 * Какие буквы спрятать. level 1 — около трети букв, level 2 — около 60%.
 * Буквы с ошибками прячутся всегда, потом «коварные», потом случайные. Одна буква остаётся видна.
 */
function clozeMask(target, errPos = [], level = 1, rnd = Math.random) {
  const chars = [...target];
  const letters = chars.map((c, i) => (isLetter(c) ? i : -1)).filter(i => i >= 0);
  if (!letters.length) return [];
  const want = Math.max(1, Math.ceil(letters.length * (level >= 2 ? 0.6 : 0.35)));
  const hide = new Set(errPos.filter(i => isLetter(chars[i])));
  const mix = arr => arr.map(v => [rnd(), v]).sort((a, b) => a[0] - b[0]).map(x => x[1]);
  for (const i of [...mix(trickyPositions(target)), ...mix(letters)]) {
    if (hide.size >= want) break;
    hide.add(i);
  }
  if (letters.length > 1 && hide.size >= letters.length) {
    hide.delete(letters.find(i => !errPos.includes(i)) ?? letters[0]);
  }
  return [...hide].sort((a, b) => a - b);
}

/* ---------- Поиск перевода ---------- */

const ARTICLE_BY_GENDER = { m: 'der', f: 'die', n: 'das' };

/** Основная форма для поиска: первый вариант, без скобок и того, что после запятой. */
function baseOf(de) {
  return String(de).split(/\s*\/\s*/)[0].replace(/\([^)]*\)/g, ' ').split(',')[0].replace(/\s+/g, ' ').trim();
}

/** Заголовки статей Викисловаря, которые стоит попробовать: без артикля, без «sich», с большой/маленькой буквы. */
function lookupKeys(de) {
  const b = baseOf(de).replace(/^(der|die|das)\s+/i, '');
  const s = b.replace(/^sich\s+/i, '');
  const out = [];
  for (const k of [b, s]) {
    if (!k) continue;
    out.push(k);
    const cap = k[0].toUpperCase() + k.slice(1);
    const low = k[0].toLowerCase() + k.slice(1);
    out.push(cap === k ? low : cap);
  }
  return [...new Set(out)].slice(0, 4);
}

function cleanAlt(s) {
  s = String(s ?? '')
    .replace(/&apos;|&#39;/g, "'").replace(/&quot;/g, '"').replace(/&amp;/g, '&')
    .replace(/́/g, '') // знаки ударения из Викисловаря
    .replace(/\s+/g, ' ').trim()
    .replace(/[.!?…]+$/, '').trim();
  if (/^[А-ЯЁ][а-яё]/.test(s)) s = s[0].toLowerCase() + s.slice(1);
  return s;
}

function pushUnique(arr, s) {
  if (s && !arr.some(x => x.toLowerCase() === s.toLowerCase())) arr.push(s);
}

/** Разбор вики-разметки статьи de.wiktionary: русские переводы из «Übersetzungen» и род существительного. */
function parseWiki(text) {
  const alts = [];
  for (const line of String(text).split('\n')) {
    if (!/^\*\s*\{\{ru\}\}/.test(line)) continue;
    for (const m of line.matchAll(/\{\{Ü(?:t|xx\d*)?\|ru\|([^|}]+)/g)) {
      pushUnique(alts, cleanAlt(m[1].replace(/\[\[(?:[^|\]]*\|)?([^\]]*)\]\]/g, '$1')));
    }
  }
  const g = String(text).match(/\{\{Wortart\|Substantiv\|Deutsch\}\},\s*\{\{([mfn])\}\}/);
  return { alts, gender: g ? g[1] : null };
}

/** Ответ MyMemory → короткие варианты перевода (длинные фразы-примеры отбрасываем). */
function cleanMt(d) {
  const out = [];
  const add = s => {
    s = cleanAlt(s);
    if (s && CYR.test(s) && s.split(' ').length <= 4) pushUnique(out, s);
  };
  add(d?.responseData?.translatedText);
  for (const m of d?.matches || []) if ((+m.match || 0) >= 0.8) add(m.translation);
  return out.slice(0, 5);
}

/** «Hund» + род m → «der Hund». null, если артикль уже есть, это не одно слово или род неизвестен. */
function suggestArticle(de, gender) {
  const art = ARTICLE_BY_GENDER[gender];
  const w = String(de).trim();
  if (!art || !w || /\s/.test(w)) return null;
  return `${art} ${w[0].toUpperCase()}${w.slice(1)}`;
}

/* ---------- Распознавание фото ---------- */

// Похожие буквы: OCR с двумя языками сразу часто путает «Haus» и «Наus» (кириллическая Н).
const CYR2LAT = { а: 'a', е: 'e', о: 'o', р: 'p', с: 'c', у: 'y', х: 'x', к: 'k', А: 'A', В: 'B', Е: 'E', К: 'K', М: 'M', Н: 'H', О: 'O', Р: 'P', С: 'C', Т: 'T', Х: 'X' };
const LAT2CYR = Object.fromEntries(Object.entries(CYR2LAT).map(([c, l]) => [l, c]));

/** В каждом слове приводит буквы к той письменности, которой в нём больше. */
function fixMixedScript(line) {
  return line.replace(/[A-Za-zÄÖÜäöüßА-Яа-яЁё]+/g, w => {
    const cyr = (w.match(/[А-Яа-яЁё]/g) || []).length;
    const lat = w.length - cyr;
    if (!cyr || !lat) return w;
    const map = lat >= cyr ? CYR2LAT : LAT2CYR;
    const fixed = [...w].map(ch => map[ch] || ch).join('');
    // если однозначно привести не вышло (есть буквы без пары), оставляем как было
    const c2 = (fixed.match(/[А-Яа-яЁё]/g) || []).length;
    return c2 === 0 || c2 === fixed.length ? fixed : w;
  });
}

/**
 * Чистит строку, распознанную с фото: маркеры списка, номера, мусор.
 * «der Hund собака» (две колонки без разделителя) → «der Hund — собака».
 * @returns {string|null} null — строка без букв, выбрасываем.
 */
function cleanOcrLine(raw) {
  let s = String(raw ?? '')
    .replace(/[“”„«»]/g, '"').replace(/[‘’‚]/g, "'")
    .replace(/[|¦]/g, ' ')
    .replace(/\s+/g, ' ').trim()
    .replace(/^(?:[•·*●○▪■□>~_\-–—]+\s*)+/, '')
    .replace(/^\(?\d{1,3}\s*[.):]\s*/, '')
    .replace(/[\s,;.·•_\-–—]+$/, '')
    .trim();
  s = fixMixedScript(s);
  if (!/[A-Za-zÄÖÜäöüßА-Яа-яЁё]{2,}/.test(s)) return null;
  if (!parseLine(s)) {
    const m = s.match(/^([^А-Яа-яЁё]*[A-Za-zÄÖÜäöüß][^А-Яа-яЁё]*?)\s+([А-Яа-яЁё].*)$/);
    if (m) s = `${m[1].trim()} — ${m[2].trim()}`;
  }
  return s;
}

/** Почему строка с фото, возможно, лишняя: '' — похожа на обычное слово из списка. */
function ocrFlag(line) {
  const s = String(line).trim();
  if (!s) return '';
  const p = parseLine(s);
  const de = p ? p.de : s;
  if (/\d/.test(de) || /:$/.test(s)) return 'похоже на заголовок';
  if (de.split(/\s+/).length > 4 || /[.!?]\s+\S/.test(de)) return 'похоже на предложение';
  return '';
}

/** Варианты, уже выбранные в поле перевода («бежать, бегать»). */
function splitRu(ru) {
  return String(ru).split(/\s*[,;]\s*/).map(s => s.trim()).filter(Boolean);
}

function norm(s) {
  return String(s).normalize('NFC')
    .replace(/[’‘`´]/g, "'")
    .replace(/\s+/g, ' ').trim()
    .replace(/[.!?]+$/, '').trim();
}

/** Допустимые варианты: «anfangen / beginnen», «der Hund (-e)» → «der Hund» */
function variants(de) {
  const out = new Set();
  for (const v of String(de).split(/\s*\/\s*/)) {
    out.add(norm(v.replace(/\([^)]*\)/g, ' ')));
    out.add(norm(v));
    out.add(norm(v.replace(/[()]/g, '')));
  }
  out.delete('');
  return [...out];
}

const lower = s => s.toLocaleLowerCase('de');
const flatUml = s => lower(s)
  .replace(/ä/g, 'a').replace(/ö/g, 'o').replace(/ü/g, 'u').replace(/ß/g, 'ss')
  .replace(/ae/g, 'a').replace(/oe/g, 'o').replace(/ue/g, 'u');
const ART = /^(der|die|das|den|dem|des)\s+(.+)$/i;

function lev(a, b) {
  a = [...a]; b = [...b];
  let prev = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    for (let j = 1; j <= b.length; j++) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
    prev = cur;
  }
  return prev[b.length];
}

/**
 * @returns {{ok:boolean, target?:string, hint?:string, note?:string}}
 */
function checkAnswer(given, de, strictCase = true) {
  const g = norm(given);
  const vs = variants(de);
  if (vs.includes(g)) return { ok: true };
  if (!g) return { ok: false, target: vs[0], hint: '' };

  const caseHit = vs.find(v => lower(v) === lower(g));
  if (caseHit) {
    if (!strictCase) return { ok: true, note: 'Засчитано, но проверь заглавные буквы: ' + caseHit };
    return { ok: false, target: caseHit, hint: 'Ошибка в заглавных/строчных буквах. Существительные в немецком пишутся с большой буквы.' };
  }

  const target = vs.reduce((best, v) => (lev(lower(v), lower(g)) < lev(lower(best), lower(g)) ? v : best), vs[0]);
  let hint = '';
  const mt = target.match(ART), mg = g.match(ART);
  if (mt && mg && lower(mt[2]) === lower(mg[2])) hint = `Неверный артикль: нужно «${mt[1].toLowerCase()}».`;
  else if (mt && !mg && lower(mt[2]) === lower(g)) hint = `Не забудь артикль «${mt[1].toLowerCase()}».`;
  else if (!mt && mg && lower(mg[2]) === lower(target)) hint = 'Здесь артикль не нужен.';
  else if (flatUml(target) === flatUml(g)) hint = 'Проверь умлауты (ä, ö, ü) и ß.';
  else {
    const d = lev(lower(target), lower(g));
    if (d === 1) hint = 'Почти! Ошибка в одной букве.';
    else if (d === 2) hint = 'Почти! Ошибка в двух буквах.';
  }
  return { ok: false, target, hint };
}

/** Какие символы a и b входят в общую подпоследовательность (остальные — ошибки). */
function lcsMarks(a, b) {
  const n = a.length, m = b.length;
  const dp = Array.from({ length: n + 1 }, () => new Uint16Array(m + 1));
  for (let i = n - 1; i >= 0; i--)
    for (let j = m - 1; j >= 0; j--)
      dp[i][j] = a[i] === b[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
  const ka = new Array(n).fill(false), kb = new Array(m).fill(false);
  let i = 0, j = 0;
  while (i < n && j < m) {
    if (a[i] === b[j]) { ka[i] = kb[j] = true; i++; j++; }
    else if (dp[i + 1][j] >= dp[i][j + 1]) i++;
    else j++;
  }
  return [ka, kb];
}

if (typeof module !== 'undefined') {
  module.exports = {
    parseLine, parseText, norm, variants, checkAnswer, lev, lcsMarks,
    baseOf, lookupKeys, cleanAlt, parseWiki, cleanMt, suggestArticle, splitRu,
    fixMixedScript, cleanOcrLine, ocrFlag,
    errorPositions, trickyPositions, clozeMask,
  };
}
