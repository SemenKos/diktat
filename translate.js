'use strict';
/* global parseWiki, cleanMt, lookupKeys, baseOf */
// Поиск перевода: сначала немецкий Викисловарь (словарные значения + род существительного),
// если статьи там нет — машинный перевод MyMemory. Оба сервиса бесплатные и без ключа.
//
// Викисловарь ограничивает частоту запросов (HTTP 429), поэтому заголовки статей собираются
// в пакеты до 50 штук и запрашиваются по одному пакету за раз, с повтором после паузы.
// Если Викисловарь недоступен, это ошибка «нет связи», а не повод брать машинный перевод.
// Удачные результаты кэшируются в localStorage.

const TKEY = 'diktat.tcache.v1';
let tcache = {};
try { tcache = JSON.parse(localStorage.getItem(TKEY)) || {}; } catch { /* пусто */ }

function tcacheSave() {
  try {
    const keys = Object.keys(tcache);
    if (keys.length > 3000) for (const k of keys.slice(0, keys.length - 3000)) delete tcache[k];
    localStorage.setItem(TKEY, JSON.stringify(tcache));
  } catch { /* кэш не обязателен */ }
}

const sleep = ms => new Promise(r => setTimeout(r, ms));

async function fetchWithTimeout(url, ms = 15000) {
  const c = new AbortController();
  const t = setTimeout(() => c.abort(), ms);
  try { return await fetch(url, { signal: c.signal }); } finally { clearTimeout(t); }
}

function makeLimiter(n) {
  let active = 0;
  const q = [];
  const next = () => {
    if (active >= n || !q.length) return;
    active++;
    const { fn, res, rej } = q.shift();
    fn().then(res, rej).finally(() => { active--; next(); });
  };
  return fn => new Promise((res, rej) => { q.push({ fn, res, rej }); next(); });
}

/* ---------- Викисловарь: пакетные запросы ---------- */

const wikiOne = makeLimiter(1);

/** titles → Map(title → {alts, gender} | null, если статьи нет). Бросает ошибку при сбое сети/сервера. */
function wikiFetch(titles) {
  return wikiOne(async () => {
    const url = 'https://de.wiktionary.org/w/api.php?' + new URLSearchParams({
      action: 'query', prop: 'revisions', rvprop: 'content', rvslots: 'main',
      titles: titles.join('|'), redirects: '1', format: 'json', formatversion: '2', origin: '*',
    });
    for (let attempt = 0; ; attempt++) {
      const r = await fetchWithTimeout(url);
      if ((r.status === 429 || r.status >= 500) && attempt < 3) {
        await sleep(Math.min(10, +r.headers.get('retry-after') || 2 * (attempt + 1)) * 1000);
        continue;
      }
      if (!r.ok) throw new Error('HTTP ' + r.status);
      const d = await r.json();
      if (d.error) throw new Error(d.error.code || 'wiki');
      const q = d.query || {};
      const alias = new Map([...(q.normalized || []), ...(q.redirects || [])].map(n => [n.from, n.to]));
      const pages = new Map();
      for (const p of q.pages || []) {
        const text = p.revisions?.[0]?.slots?.main?.content;
        pages.set(p.title, p.missing || p.invalid || text == null ? null : parseWiki(text));
      }
      const out = new Map();
      for (const t of titles) {
        let k = t;
        for (let i = 0; i < 3 && alias.has(k); i++) k = alias.get(k);
        out.set(t, pages.get(k) ?? null);
      }
      return out;
    }
  });
}

// Запросы статей, пришедшие почти одновременно (например, от всех строк таблицы), собираются в один пакет.
const wikiWaiting = new Map(); // title → [{res, rej}]
let wikiTimer = null;

function wikiPage(title) {
  return new Promise((res, rej) => {
    if (!wikiWaiting.has(title)) wikiWaiting.set(title, []);
    wikiWaiting.get(title).push({ res, rej });
    if (!wikiTimer) wikiTimer = setTimeout(flushWiki, 60);
  });
}

function flushWiki() {
  wikiTimer = null;
  const batch = [...wikiWaiting.entries()].slice(0, 50);
  for (const [t] of batch) wikiWaiting.delete(t);
  if (wikiWaiting.size) wikiTimer = setTimeout(flushWiki, 60);
  wikiFetch(batch.map(([t]) => t)).then(
    map => batch.forEach(([t, cbs]) => cbs.forEach(cb => cb.res(map.get(t) ?? null))),
    err => batch.forEach(([, cbs]) => cbs.forEach(cb => cb.rej(err))),
  );
}

/* ---------- MyMemory: запасной машинный перевод ---------- */

const mtLimit = makeLimiter(2);

function fromMyMemory(q) {
  return mtLimit(async () => {
    const r = await fetchWithTimeout('https://api.mymemory.translated.net/get?' + new URLSearchParams({ q, langpair: 'de|ru' }));
    if (!r.ok) throw new Error('HTTP ' + r.status);
    const d = await r.json();
    if (+d.responseStatus !== 200) throw new Error(d.responseDetails || 'MyMemory');
    return cleanMt(d);
  });
}

/**
 * @returns {Promise<{alts:string[], src:'dict'|'mt'|'none', gender:'m'|'f'|'n'|null}>}
 * Бросает ошибку, если не удалось связаться с сервисом — тогда строку можно «повторить».
 */
async function translateWord(de) {
  const ck = baseOf(de).toLowerCase();
  if (tcache[ck]) return tcache[ck];
  const titles = lookupKeys(de).filter(t => !/[|#<>[\]{}]/.test(t));
  let gender = null, alts = [], src = 'none';
  for (const t of titles) {
    const w = await wikiPage(t); // ошибка сети уходит наверх
    if (!w) continue;
    gender = gender || w.gender;
    if (w.alts.length) { alts = w.alts; src = 'dict'; break; }
  }
  if (!alts.length) {
    alts = await fromMyMemory(baseOf(de));
    if (alts.length) src = 'mt';
  }
  const res = { alts: alts.slice(0, 8), src, gender };
  tcache[ck] = res;
  tcacheSave();
  return res;
}
