'use strict';
/* global parseText, checkAnswer, lcsMarks, norm, splitRu, suggestArticle, translateWord, cleanOcrLine, ocrFlag, Tesseract, errorPositions, clozeMask,
   ogarSvg, mascotMini, ogarPhrase, crocPhrase, sfx, sceneFor, sceneHtml, startScene, stopSong, singSong,
   mascotSpeak, charSay */

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const app = $('#app');
const KEY = 'diktat.v1';
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
const shuffle = a => { a = [...a]; for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
const fmtDay = (d = new Date()) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const fmtTime = ms => { const s = Math.round(ms / 1000); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; };
function plural(n, one, few, many) {
  const a = n % 10, b = n % 100;
  if (a === 1 && b !== 11) return one;
  if (a >= 2 && a <= 4 && (b < 12 || b > 14)) return few;
  return many;
}
const nWords = n => `${n} ${plural(n, 'слово', 'слова', 'слов')}`;

/* ---------- Данные ---------- */

const DEFAULT_SETTINGS = { strictCase: true, autoSpeak: true, rate: 0.9, mascots: true, sounds: true, voices: true };

function newWord(de, ru) { return { id: uid(), de, ru, ok: 0, bad: 0, err: 0, last: 0 }; }

function demoLesson() {
  const words = [
    ['die Familie', 'семья'], ['der Vater', 'отец'], ['die Mutter', 'мать'], ['der Bruder', 'брат'],
    ['die Schwester', 'сестра'], ['die Großeltern', 'бабушка и дедушка'], ['das Kind', 'ребёнок'], ['verheiratet', 'женатый / замужем'],
  ];
  return { id: uid(), name: 'Пример: Семья', created: Date.now(), words: words.map(([d, r]) => newWord(d, r)) };
}

function sanitize(d) {
  if (!d || !Array.isArray(d.lessons)) return null;
  d.lessons = d.lessons.filter(l => l && Array.isArray(l.words)).map(l => ({
    id: String(l.id || uid()), name: String(l.name || 'Урок'), created: +l.created || Date.now(),
    words: l.words.filter(w => w && w.de && w.ru).map(w => ({
      id: String(w.id || uid()), de: String(w.de), ru: String(w.ru),
      ok: +w.ok || 0, bad: +w.bad || 0, err: +w.err || 0, last: +w.last || 0,
    })),
  }));
  d.settings = { ...DEFAULT_SETTINGS, ...(d.settings || {}) };
  d.days = Array.isArray(d.days) ? d.days : [];
  return d;
}

function load() {
  let d = null;
  try { d = sanitize(JSON.parse(localStorage.getItem(KEY))); } catch { /* пусто */ }
  return d || sanitize({ lessons: [demoLesson()], days: [] });
}
let db = load();
function save() {
  try { localStorage.setItem(KEY, JSON.stringify(db)); } catch (e) { toast('Не удалось сохранить: ' + e.message); }
}
navigator.storage?.persist?.().catch(() => {});

const getLesson = id => db.lessons.find(l => l.id === id);
const allWords = () => db.lessons.flatMap(l => l.words);
const isKnown = w => w.ok >= 2 && w.err === 0;
function lessonStats(l) {
  const n = l.words.length;
  const known = l.words.filter(isKnown).length;
  const hard = l.words.filter(w => w.err > 0).length;
  return { n, known, hard, pct: n ? Math.round(known / n * 100) : 0 };
}

function markDay() { const t = fmtDay(); if (!db.days.includes(t)) db.days = [...db.days, t].slice(-400); }
function streak() {
  const set = new Set(db.days); const d = new Date(); let n = 0;
  if (!set.has(fmtDay(d))) d.setDate(d.getDate() - 1);
  while (set.has(fmtDay(d))) { n++; d.setDate(d.getDate() - 1); }
  return n;
}

function toast(msg) {
  const t = document.createElement('div');
  t.className = 'toast'; t.textContent = msg;
  document.body.append(t);
  setTimeout(() => t.remove(), 2600);
}

/* ---------- Озвучка ---------- */

const hasTTS = 'speechSynthesis' in window;
let deVoice = null;
function pickVoice() {
  const vs = speechSynthesis.getVoices();
  deVoice = vs.find(v => /^de[-_]DE/i.test(v.lang)) || vs.find(v => /^de/i.test(v.lang)) || null;
}
if (hasTTS) { pickVoice(); speechSynthesis.addEventListener?.('voiceschanged', pickVoice); }
const speakable = de => String(de).split(/\s*\/\s*/)[0].replace(/\([^)]*\)/g, ' ').replace(/\s+/g, ' ').trim();
function speak(text, slow) {
  if (!hasTTS) return;
  speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(speakable(text));
  u.lang = 'de-DE';
  if (deVoice) u.voice = deVoice;
  u.rate = slow ? 0.55 : db.settings.rate;
  speechSynthesis.speak(u);
}

/* ---------- Роутинг ---------- */

let session = null;
let lastResult = null;

function go(path, replace) {
  const h = '#/' + path;
  if (location.hash === h) render();
  else if (replace) location.replace(h);
  else location.hash = h;
}
window.addEventListener('hashchange', render);

function render() {
  const [r, id] = location.hash.replace(/^#\/?/, '').split('/');
  if (r !== 'session' && hasTTS) speechSynthesis.cancel();
  stopSong();
  if (r !== 'edit') { closePhotos(); draft = null; }
  window.scrollTo(0, 0);
  switch (r) {
    case 'lesson': return viewLesson(id);
    case 'edit': return viewEdit(id);
    case 'settings': return viewSettings();
    case 'session': return session ? viewTask() : go('', true);
    case 'result': return lastResult ? viewResult() : go('', true);
    default: return viewHome();
  }
}

const header = (title, left = '<button class="icon-btn" data-act="back" aria-label="Назад">‹</button>', right = '<span class="icon-btn"></span>') =>
  `<header class="top">${left}<h1 class="title">${title}</h1>${right}</header>`;

/* ---------- Главная ---------- */

function viewHome() {
  const s = streak();
  const hard = allWords().filter(w => w.err > 0);
  const lessons = [...db.lessons].sort((a, b) => b.created - a.created);
  app.innerHTML = `
    <header class="top">
      <div class="logo">Diktat<span>.de</span></div>
      <div class="streak ${s ? '' : 'off'}" title="Дней занятий подряд">🔥 ${s}</div>
      <button class="icon-btn" data-go="settings" aria-label="Настройки">⚙️</button>
    </header>
    ${hard.length ? `
      <button class="card hard" data-act="hardAll">
        <div class="emoji">🎯</div>
        <div class="grow"><b>Трудные слова</b><small>${nWords(hard.length)} с ошибками во всех уроках</small></div>
        <span class="chev">›</span>
      </button>` : ''}
    <h2 class="sec">Мои уроки</h2>
    <div class="list">
      ${lessons.length ? lessons.map(l => {
        const st = lessonStats(l);
        return `<button class="card" data-go="lesson/${l.id}">
          <div class="ring" style="--p:${st.pct}"><span>${st.pct}%</span></div>
          <div class="grow"><b>${esc(l.name)}</b><small>${nWords(st.n)}${st.hard ? ` · <em>${st.hard} с ошибками</em>` : ''}</small></div>
          <span class="chev">›</span>
        </button>`;
      }).join('') : '<p class="empty">Пока нет уроков. Создай первый — вставь список слов к диктанту.</p>'}
    </div>
    <button class="btn primary big" data-go="edit/new">＋ Новый урок</button>`;
}

/* ---------- Урок ---------- */

const MODES = [
  ['de2ru', '🇩🇪→🇷🇺', 'Перевод', 'выбери русский'],
  ['ru2de', '🇷🇺→🇩🇪', 'Выбор слова', 'выбери немецкое'],
  ['write', '✍️', 'Написание', 'пиши сам'],
  ['listen', '🎧', 'Диктант', 'пиши на слух'],
  ['hard', '🎯', 'Ошибки', ''],
  ['exam', '📝', 'Контрольная', 'без подсказок'],
];

function viewLesson(id) {
  const l = getLesson(id);
  if (!l) return go('', true);
  const st = lessonStats(l);
  app.innerHTML = `
    ${header(esc(l.name), '<button class="icon-btn" data-go="" aria-label="Назад">‹</button>',
      `<button class="icon-btn" data-go="edit/${l.id}" aria-label="Редактировать">✏️</button>`)}
    <div class="summary">
      <div><b>${st.n}</b><small>${plural(st.n, 'слово', 'слова', 'слов')}</small></div>
      <div><b>${st.known}</b><small>выучено</small></div>
      <div class="${st.hard ? 'bad' : ''}"><b>${st.hard}</b><small>с ошибками</small></div>
    </div>
    <button class="btn primary big" data-act="start" data-mode="full" ${st.n ? '' : 'disabled'}>
      ▶ Пройти урок<small>выбор перевода → выбор слова → написание → работа над ошибками</small>
    </button>
    <div class="modes">
      ${MODES.map(([m, ic, name, sub]) => {
        const off = !st.n || (m === 'hard' && !st.hard) || (m === 'listen' && !hasTTS);
        const s2 = m === 'hard' ? (st.hard ? nWords(st.hard) : 'ошибок нет') : (m === 'listen' && !hasTTS ? 'нет озвучки' : sub);
        return `<button class="mode" data-act="start" data-mode="${m}" ${off ? 'disabled' : ''}><span class="ic">${ic}</span><b>${name}</b><small>${s2}</small></button>`;
      }).join('')}
    </div>
    <h2 class="sec">Слова</h2>
    <ul class="words">
      ${l.words.map(w => `<li>
        <button class="say" data-act="say" data-text="${esc(w.de)}" aria-label="Произнести">🔊</button>
        <div class="grow"><b>${esc(w.de)}</b><small>${esc(w.ru)}</small></div>
        ${w.err ? `<span class="badge bad" title="Ошибок всего">${w.bad}✗</span>` : isKnown(w) ? '<span class="badge good">✓</span>' : ''}
      </li>`).join('')}
    </ul>
    <button class="btn ghost" data-act="share">📤 Поделиться списком слов</button>`;
}

/* ---------- Настройки ---------- */

function viewSettings() {
  const st = db.settings;
  const voice = !hasTTS ? 'Этот браузер не поддерживает озвучку.'
    : deVoice ? `Голос: ${esc(deVoice.name)}`
    : 'Немецкий голос не найден. Установи немецкий язык в настройках синтеза речи телефона (Настройки → Спец. возможности → Синтез речи).';
  app.innerHTML = `
    ${header('Настройки')}
    <div class="panel">
      <label class="row"><div class="grow"><b>Строгая проверка регистра</b><small>Как на диктанте: «hund» вместо «Hund» — ошибка</small></div>
        <input type="checkbox" class="switch" data-set="strictCase" ${st.strictCase ? 'checked' : ''}></label>
      <label class="row"><div class="grow"><b>Автоозвучка</b><small>Произносить немецкие слова автоматически</small></div>
        <input type="checkbox" class="switch" data-set="autoSpeak" ${st.autoSpeak ? 'checked' : ''}></label>
      <label class="row"><div class="grow"><b>Огарь и Крокодильчик</b><small>Радуются ответам, песня и полёт в Германию в конце урока</small></div>
        <input type="checkbox" class="switch" data-set="mascots" ${st.mascots ? 'checked' : ''}></label>
      <label class="row"><div class="grow"><b>🔔 Звуки животных</b><small>Кряканье Огаря, смех Крокодильчика и музыка песни</small></div>
        <input type="checkbox" class="switch" data-set="sounds" ${st.sounds ? 'checked' : ''}></label>
      <label class="row"><div class="grow"><b>🗣 Голоса животных</b><small>Огарь хвалит по-русски и по-немецки, Крокодильчик хихикает и поёт</small></div>
        <input type="checkbox" class="switch" data-set="voices" ${st.voices ? 'checked' : ''}></label>
      <div class="row voice-test">
        <button class="btn ghost sm" data-act="voiceTest" data-who="ogar">🦆 Послушать Огаря</button>
        <button class="btn ghost sm" data-act="voiceTest" data-who="croc">🐊 Послушать Крокодильчика</button>
      </div>
      <div class="row col">
        <div><b>Скорость речи:</b> <span id="rateV">${st.rate}</span></div>
        <input type="range" min="0.5" max="1.2" step="0.05" value="${st.rate}" data-set="rate">
        <button class="btn ghost sm" data-act="say" data-text="Guten Tag! Wie geht es dir?">🔊 Проверить голос</button>
        <small>${voice}</small>
      </div>
    </div>
    <h2 class="sec">Данные</h2>
    <div class="panel">
      <button class="btn ghost" data-act="export">⬇️ Сохранить резервную копию</button>
      <label class="btn ghost">⬆️ Восстановить из файла<input type="file" accept="application/json,.json" id="importFile" hidden></label>
      <button class="btn danger-ghost" data-act="resetStats">Сбросить статистику ошибок</button>
    </div>
    <p class="about">Все данные хранятся только на этом устройстве. Делай резервную копию перед сменой телефона.</p>`;
  $$('[data-set]').forEach(inp => inp.addEventListener(inp.type === 'checkbox' ? 'change' : 'input', () => {
    const k = inp.dataset.set;
    db.settings[k] = inp.type === 'checkbox' ? inp.checked : +inp.value;
    if (k === 'rate') $('#rateV').textContent = inp.value;
    save();
  }));
  $('#importFile').addEventListener('change', importFile);
}

function importFile(e) {
  const f = e.target.files[0];
  if (!f) return;
  f.text().then(t => {
    const d = sanitize(JSON.parse(t));
    if (!d) throw new Error('bad');
    if (!confirm(`Загрузить ${d.lessons.length} ${plural(d.lessons.length, 'урок', 'урока', 'уроков')}? Текущие данные будут заменены.`)) return;
    db = d; save(); toast('Данные восстановлены'); go('');
  }).catch(() => toast('Не удалось прочитать файл'));
}

/* ---------- Тренировка ---------- */

const TYPE_LABEL = { de2ru: 'Выбери перевод', ru2de: 'Выбери немецкое слово', write: 'Напиши по-немецки', listen: 'Напиши, что слышишь', fill: 'Впиши пропущенные буквы' };
const STAGE = { 1: 'Этап 1 из 3', 2: 'Этап 2 из 3', 3: 'Этап 3 из 3', 4: 'Работа над ошибками' };
const PRAISE = ['Отлично!', 'Верно!', 'Супер!', 'Так держать!', 'Genau!', 'Sehr gut!', 'Prima!'];
const UMLAUTS = ['ä', 'ö', 'ü', 'ß', 'Ä', 'Ö', 'Ü'];

function buildTasks(mode, words) {
  const t = (type, stage = 0) => w => ({ type, wid: w.id, stage });
  const typed = hasTTS ? 'listen' : 'write';
  switch (mode) {
    case 'full': return [
      ...shuffle(words).map(t('de2ru', 1)),
      ...shuffle(words).map(t('ru2de', 2)),
      ...shuffle(words).map(t('write', 3)),
    ];
    case 'hard': return [...shuffle(words).map(t('ru2de')), ...shuffle(words).map(t('write'))];
    case 'exam': return shuffle(words).map(t(typed));
    default: return shuffle(words).map(t(mode));
  }
}

function startSession(mode, words, title, lid) {
  if (!words.length) return toast('Нет слов для тренировки');
  const wmap = new Map(allWords().map(w => [w.id, w]));
  session = {
    mode, title, lid, wmap,
    pool: words,
    queue: buildTasks(mode, words),
    done: 0, good: 0, bad: 0,
    mistakes: new Set(), answers: [],
    exam: mode === 'exam',
    reviewAdded: mode !== 'full',
    start: Date.now(),
    cur: null, fb: null, opts: null,
  };
  nextTask();
}

function nextTask() {
  const s = session;
  if (!s.queue.length && !s.reviewAdded && s.mistakes.size) {
    s.reviewAdded = true;
    s.queue = shuffle([...s.mistakes]).map(wid => ({ type: 'write', wid, stage: 4 }));
  }
  if (!s.queue.length) return finish();
  s.cur = s.queue.shift();
  s.fb = null;
  s.opts = (s.cur.type === 'de2ru' || s.cur.type === 'ru2de') ? makeOptions(s.cur) : null;
  go('session');
}

function makeOptions(task) {
  const s = session, w = s.wmap.get(task.wid);
  const field = task.type === 'de2ru' ? 'ru' : 'de';
  const seen = new Set([w[field].toLowerCase()]);
  const out = [w];
  for (const x of [...shuffle(s.pool), ...shuffle(allWords())]) {
    if (out.length >= 4) break;
    const k = x[field].toLowerCase();
    if (seen.has(k)) continue;
    seen.add(k); out.push(x);
  }
  return shuffle(out).map(x => x[field]);
}

function viewTask() {
  const s = session, t = s.cur, w = s.wmap.get(t.wid);
  const total = s.done + s.queue.length + 1;
  const pct = Math.round(s.done / total * 100);
  const label = [STAGE[t.stage], t.help ? 'Тренируем слово' : t.retry ? 'Повтор' : '', s.exam ? 'Контрольная' : '', TYPE_LABEL[t.type]].filter(Boolean).join(' · ');
  const typed = t.type === 'write' || t.type === 'listen';
  const typing = typed || t.type === 'fill';
  let body = '';

  if (t.type === 'de2ru') {
    body = `<div class="prompt"><span class="de">${esc(w.de)}</span>
      <button class="say" data-act="say" data-text="${esc(w.de)}" aria-label="Произнести">🔊</button></div>`;
  } else if (t.type === 'ru2de' || t.type === 'write') {
    body = `<div class="prompt"><span class="ru">${esc(w.ru)}</span></div>`;
  } else if (t.type === 'fill') {
    body = `<div class="prompt"><span class="ru">${esc(w.ru)}</span>
      <button class="say" data-act="say" data-text="${esc(t.target)}" aria-label="Произнести">🔊</button></div>
      <div class="cloze" id="cloze">${clozeHtml(t)}</div>`;
  } else {
    body = `<div class="prompt listen">
        <button class="say huge" data-act="say" data-text="${esc(w.de)}" aria-label="Произнести">🔊</button>
        <button class="say slow" data-act="saySlow" data-text="${esc(w.de)}" aria-label="Медленно">🐢</button>
      </div>
      ${s.exam ? '' : '<button class="link" data-act="reveal">Показать перевод</button><div id="revealed" class="revealed"></div>'}`;
  }

  if (s.opts) {
    body += `<div class="opts">${s.opts.map((o, i) =>
      `<button class="opt" data-act="pick" data-i="${i}"><span class="num">${i + 1}</span><span>${esc(o)}</span></button>`).join('')}</div>`;
  } else {
    if (t.type !== 'fill') body += `<input id="ans" class="ans" type="text" autocomplete="off" autocorrect="off" autocapitalize="off" spellcheck="false"
        lang="de" enterkeyhint="done" placeholder="по-немецки…">`;
    body += `<div class="umlauts">${UMLAUTS.map(c => `<button type="button" class="key" data-ins="${c}" tabindex="-1">${c}</button>`).join('')}</div>`;
  }

  const footer = typing
    ? `<button class="btn ghost" data-act="skip">Не знаю</button><button class="btn primary" data-act="check">Проверить</button>`
    : '';

  app.innerHTML = `
    <div class="session">
      <div class="sbar">
        <button class="icon-btn" data-act="quit" aria-label="Выйти">✕</button>
        <div class="progress"><i style="width:${pct}%"></i></div>
        <span class="cnt" title="Верных ответов">✓ ${s.good}</span>
      </div>
      <div class="stage">${label}</div>
      ${body}
    </div>
    <div class="footer" id="footer">${footer}</div>`;

  if (typed) $('#ans').focus();
  if (t.type === 'fill') $('.cell')?.focus();
  if (db.settings.autoSpeak && (t.type === 'de2ru' || t.type === 'listen')) setTimeout(() => speak(w.de), 250);
}

function diffHtml(given, target) {
  const g = norm(given);
  const [kg, kt] = lcsMarks([...g], [...target]);
  const mark = (str, keep, cls) => [...str].map((c, i) =>
    keep[i] ? esc(c) : `<mark class="${cls}">${c === ' ' ? '␣' : esc(c)}</mark>`).join('');
  return `<div class="diff">
    <div><span class="lbl">Правильно:</span> <span class="word">${mark(target, kt, 'miss')}</span></div>
    ${g ? `<div><span class="lbl">Твой ответ:</span> <span class="word">${mark(g, kg, 'extra')}</span></div>` : ''}
  </div>`;
}

/** Слово с пропусками: видимые буквы — текст, спрятанные — клетки для ввода. Слова не переносятся посередине. */
function clozeHtml(t) {
  const hidden = new Set(t.mask);
  let k = 0;
  return t.target.split(' ').map(word => {
    const html = [...word].map(c => {
      const i = k++;
      return hidden.has(i)
        ? `<input class="cell" data-k="${i}" maxlength="2" autocomplete="off" autocorrect="off" autocapitalize="off" spellcheck="false" lang="de" enterkeyhint="next" aria-label="буква ${i + 1}">`
        : `<span class="ch">${esc(c)}</span>`;
    }).join('');
    k++; // пробел между словами
    return `<span class="cword">${html}</span>`;
  }).join('');
}

/** Ответ из клеток: видимые буквы + вписанные (пустая клетка — «_»). */
function clozeValue(t) {
  const chars = [...t.target];
  $$('.cell').forEach(c => { chars[+c.dataset.k] = c.value || '_'; });
  return chars.join('');
}

/** После ошибки в написании: два задания с пропусками (сначала меньше, потом больше), затем снова написать целиком. */
function addHelpLadder(t, target, err) {
  const s = session;
  const put = (pos, task) => s.queue.splice(Math.min(pos, s.queue.length), 0, task);
  const fill = level => ({ type: 'fill', wid: t.wid, stage: t.stage, help: true, target, err, level, mask: clozeMask(target, err, level) });
  put(0, fill(1));
  put(2, fill(2));
  put(4, { ...t, retry: true });
}

function settle(ok, info) {
  const s = session, t = s.cur, w = s.wmap.get(t.wid);
  const typed = t.type === 'write' || t.type === 'listen';
  s.done++;
  w.last = Date.now();
  if (ok) {
    s.good++;
    if (t.type !== 'fill') { w.ok++; w.err = Math.max(0, w.err - 1); } // с подсказкой — ещё не «выучил»
  } else {
    s.bad++; w.bad++; w.err = Math.min(9, w.err + (typed ? 2 : 1));
    s.mistakes.add(w.id);
    if (!s.exam) {
      const target = info.r?.target;
      if (typed && target) {
        addHelpLadder(t, target, errorPositions(info.given, target));
      } else if (t.type === 'fill') {
        // снова то же задание, ошибочные клетки остаются спрятанными
        const err = [...new Set([...t.err, ...errorPositions(info.given, t.target)])];
        const pos = Math.min(s.queue.length, 1 + Math.floor(Math.random() * 2));
        s.queue.splice(pos, 0, { ...t, err, mask: clozeMask(t.target, err, t.level), retry: true });
      } else {
        const pos = Math.min(s.queue.length, 2 + Math.floor(Math.random() * 2));
        s.queue.splice(pos, 0, { ...t, retry: true });
      }
    }
  }
  if (s.exam) s.answers.push({ wid: w.id, given: info.given, ok });
  save();
  if (s.exam) return nextTask();

  s.fb = { ok };
  if (t.type !== 'de2ru' || !ok) speak(w.de);
  if (!ok) navigator.vibrate?.(120);

  const mascots = db.settings.mascots;
  const ph = ok && mascots ? ogarPhrase() : null;
  if (mascots) ok ? sfx.quack() : sfx.croc();
  const crocSays = !ok && mascots ? crocPhrase() : '';
  if (mascots) mascotSpeak(ok, ok ? ph : crocSays); // после немецкого слова, в очередь
  let html;
  if (ok) {
    const title = ph ? `${esc(ph.text)} <span class="lang">${ph.flag}</span>` : PRAISE[Math.floor(Math.random() * PRAISE.length)];
    html = `<div class="fb-title">${title}</div>
      ${info.r?.note ? `<div class="fb-note">${esc(info.r.note)}</div>` : ''}
      <div class="fb-pair"><b>${esc(w.de)}</b> — ${esc(w.ru)}</div>`;
  } else if (info.r) {
    html = `<div class="fb-title">${norm(info.given) ? 'Ошибка' : 'Правильный ответ'}</div>
      ${info.r.hint ? `<div class="fb-note">💡 ${esc(info.r.hint)}</div>` : ''}
      ${diffHtml(info.given, info.r.target)}
      <div class="fb-pair">${esc(w.ru)}</div>`;
  } else {
    html = `<div class="fb-title">Неверно</div><div class="fb-pair"><b>${esc(w.de)}</b> — ${esc(w.ru)}</div>`;
  }
  const f = $('#footer');
  f.className = 'footer fb ' + (ok ? 'ok' : 'bad');
  f.innerHTML = `<div class="fb-row"><div class="fb-body">${html}</div>${mascots ? mascotMini(ok, esc(crocSays)) : ''}</div>
    <button class="btn ${ok ? 'success' : 'danger'} big" data-act="next" id="nextBtn">Дальше</button>`;
  const inp = $('#ans');
  if (inp) inp.focus(); else $('#nextBtn').focus();
}

function finish() {
  const s = session;
  markDay(); save();
  lastResult = {
    title: s.title, lid: s.lid, good: s.good, bad: s.bad, exam: s.exam,
    mistakes: [...s.mistakes], answers: s.answers, time: Date.now() - s.start,
  };
  session = null;
  go('result', true);
}

function viewResult() {
  const r = lastResult;
  const total = r.good + r.bad;
  const pct = total ? Math.round(r.good / total * 100) : 0;
  const wm = new Map(allWords().map(w => [w.id, w]));
  const grade = pct >= 95 ? 5 : pct >= 80 ? 4 : pct >= 60 ? 3 : 2;
  const mist = r.mistakes.map(id => wm.get(id)).filter(Boolean);

  let list = '';
  if (r.exam) {
    list = `<h2 class="sec">Ответы</h2><ul class="words">${r.answers.map(a => {
      const w = wm.get(a.wid); if (!w) return '';
      const cr = a.ok ? null : checkAnswer(a.given, w.de, db.settings.strictCase);
      return `<li class="${a.ok ? '' : 'wrongrow'}">
        <span class="badge ${a.ok ? 'good' : 'bad'}">${a.ok ? '✓' : '✗'}</span>
        <div class="grow">${a.ok ? `<b>${esc(w.de)}</b>` : diffHtml(a.given, cr.target)}<small>${esc(w.ru)}${cr?.hint ? ' · ' + esc(cr.hint) : ''}</small></div>
      </li>`;
    }).join('')}</ul>`;
  } else if (mist.length) {
    list = `<h2 class="sec">Слова с ошибками</h2><ul class="words">${mist.map(w => `<li>
        <button class="say" data-act="say" data-text="${esc(w.de)}">🔊</button>
        <div class="grow"><b>${esc(w.de)}</b><small>${esc(w.ru)}</small></div></li>`).join('')}</ul>`;
  }

  const scene = db.settings.mascots ? sceneFor(pct) : null;
  app.innerHTML = `
    <div class="result">
      ${scene ? sceneHtml(scene) : `<div class="trophy">${pct >= 90 ? '🏆' : pct >= 70 ? '🎉' : '💪'}</div>
      <h1>${r.exam ? 'Контрольная завершена' : 'Тренировка завершена!'}</h1>`}
      <p class="muted">${r.exam ? 'Контрольная · ' : ''}${esc(r.title)}</p>
      <div class="stats">
        ${r.exam ? `<div class="stat accent"><b>${grade}</b><small>оценка</small></div>` : ''}
        <div class="stat"><b>${pct}%</b><small>точность</small></div>
        <div class="stat"><b>${r.good}/${total}</b><small>верно</small></div>
        <div class="stat"><b>${fmtTime(r.time)}</b><small>время</small></div>
      </div>
      ${list}
      ${mist.length ? `<button class="btn primary big" data-act="retryMistakes">🎯 Поработать над ошибками (${mist.length})</button>` : ''}
      <button class="btn ghost big" data-go="${r.lid ? 'lesson/' + r.lid : ''}">Готово</button>
    </div>`;
  if (scene && !r.shown) { r.shown = true; startScene(scene); }
}

/* ---------- Действия ---------- */

const actions = {
  back() { history.length > 1 ? history.back() : go(''); },
  singAgain() { singSong(); },
  voiceTest(el) {
    if (!hasTTS) return toast('Этот браузер не умеет говорить');
    if (!db.settings.voices) return toast('Включи «Голоса животных»');
    speechSynthesis.cancel();
    if (el.dataset.who === 'ogar') { charSay('ogar', 'Привет! Я Огарь.'); charSay('ogar', 'Sehr gut!', 'de'); }
    else charSay('croc', 'Ха-ха! А я Крокодильчик! Люблю ошибки!');
  },
  say(el) { speak(el.dataset.text); },
  saySlow(el) { speak(el.dataset.text, true); },
  start(el) {
    const l = getLesson(location.hash.split('/')[2]);
    if (!l) return;
    const mode = el.dataset.mode;
    const words = mode === 'hard' ? l.words.filter(w => w.err > 0) : l.words;
    startSession(mode, words, l.name, l.id);
  },
  hardAll() {
    const words = allWords().filter(w => w.err > 0).sort((a, b) => b.err - a.err).slice(0, 30);
    startSession('hard', words, 'Трудные слова', null);
  },
  retryMistakes() {
    const wm = new Map(allWords().map(w => [w.id, w]));
    const words = lastResult.mistakes.map(id => wm.get(id)).filter(Boolean);
    startSession('hard', words, lastResult.title, lastResult.lid);
  },
  quit() {
    if (session.done && !confirm('Выйти из тренировки? Статистика по словам уже сохранена.')) return;
    const lid = session.lid;
    session = null;
    go(lid ? 'lesson/' + lid : '', true);
  },
  pick(el) {
    const s = session;
    if (s.fb) return;
    const i = +el.dataset.i, t = s.cur, w = s.wmap.get(t.wid);
    const right = t.type === 'de2ru' ? w.ru : w.de;
    const ok = s.opts[i] === right;
    $$('.opt').forEach((b, j) => {
      b.disabled = true;
      if (s.opts[j] === right) b.classList.add('right');
      else if (j === i) b.classList.add('wrong');
    });
    settle(ok, { given: s.opts[i] });
  },
  check() {
    const s = session;
    if (s.fb) return;
    if (s.cur.type === 'fill') return checkFill();
    const inp = $('#ans');
    if (!inp.value.trim()) { inp.focus(); inp.classList.add('shake'); setTimeout(() => inp.classList.remove('shake'), 400); return; }
    const w = s.wmap.get(s.cur.wid);
    const r = checkAnswer(inp.value, w.de, db.settings.strictCase);
    inp.readOnly = true;
    inp.classList.add(r.ok ? 'right' : 'wrong');
    settle(r.ok, { given: inp.value, r });
  },
  skip() {
    const s = session;
    if (s.fb) return;
    const w = s.wmap.get(s.cur.wid);
    if (s.cur.type === 'fill') {
      $$('.cell').forEach(c => { c.readOnly = true; });
      return settle(false, { given: '', r: checkAnswer('', s.cur.target) });
    }
    const inp = $('#ans'); inp.readOnly = true;
    settle(false, { given: '', r: checkAnswer('', w.de) });
  },
  next() { if (session?.fb) nextTask(); },
  reveal(el) {
    const w = session.wmap.get(session.cur.wid);
    el.remove();
    $('#revealed').textContent = w.ru;
    $('#ans')?.focus();
  },
  delLesson(el) {
    if (!confirm('Удалить урок со всеми словами?')) return;
    db.lessons = db.lessons.filter(l => l.id !== el.dataset.id);
    save(); go('', true);
  },
  share() {
    const l = getLesson(location.hash.split('/')[2]);
    if (!l) return;
    const text = `${l.name}\n\n` + l.words.map(w => `${w.de} — ${w.ru}`).join('\n');
    if (navigator.share) navigator.share({ title: l.name, text }).catch(() => {});
    else navigator.clipboard?.writeText(text).then(() => toast('Список скопирован'), () => toast('Не удалось скопировать'));
  },
  export() {
    const blob = new Blob([JSON.stringify(db, null, 1)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `diktat-backup-${fmtDay()}.json`;
    document.body.append(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  },
  resetStats() {
    if (!confirm('Обнулить статистику по всем словам? Слова и уроки останутся.')) return;
    allWords().forEach(w => Object.assign(w, { ok: 0, bad: 0, err: 0, last: 0 }));
    save(); toast('Статистика сброшена'); render();
  },
};

app.addEventListener('click', e => {
  const g = e.target.closest('[data-go]');
  if (g) return go(g.dataset.go);
  const a = e.target.closest('[data-act]');
  if (a && !a.disabled) actions[a.dataset.act]?.(a, e);
});

// Кнопки умлаутов: не забираем фокус у поля, вставляем символ в позицию курсора
/** Проверка задания с пропусками: каждая клетка отдельно (с учётом настройки регистра). */
function checkFill() {
  const t = session.cur;
  const cells = $$('.cell');
  const empty = cells.find(c => !c.value.trim());
  if (empty) { empty.focus(); empty.classList.add('shake'); setTimeout(() => empty.classList.remove('shake'), 400); return; }
  const chars = [...t.target];
  const same = (a, b) => (db.settings.strictCase ? a === b : a.toLowerCase() === b.toLowerCase());
  let allOk = true;
  cells.forEach(c => {
    const ok = same(c.value, chars[+c.dataset.k]);
    if (!ok) allOk = false;
    c.readOnly = true;
    c.classList.add(ok ? 'right' : 'wrong');
  });
  const given = clozeValue(t);
  const r = allOk ? { ok: true } : checkAnswer(given, t.target, db.settings.strictCase);
  settle(allOk, { given, r: allOk ? null : { ...r, target: t.target } });
}

// Клетки: одна буква, после ввода — следующая клетка; Backspace в пустой — предыдущая.
let lastCell = null;
app.addEventListener('focusin', e => { if (e.target.matches?.('.cell')) lastCell = e.target; });
app.addEventListener('input', e => {
  const c = e.target;
  if (!c.matches?.('.cell') || c.readOnly) return;
  if (c.value.length > 1) c.value = c.value.slice(-1);
  if (c.value) {
    const cells = $$('.cell');
    cells[cells.indexOf(c) + 1]?.focus();
  }
});
app.addEventListener('keydown', e => {
  const c = e.target;
  if (!c.matches?.('.cell') || e.key !== 'Backspace' || c.value) return;
  const cells = $$('.cell');
  const prev = cells[cells.indexOf(c) - 1];
  if (prev && !prev.readOnly) { e.preventDefault(); prev.value = ''; prev.focus(); }
});

app.addEventListener('pointerdown', e => {
  const k = e.target.closest('[data-ins]');
  if (!k) return;
  e.preventDefault();
  if ($('#cloze')) { // задание с пропусками: вставляем в текущую клетку
    const c = document.activeElement?.matches?.('.cell') ? document.activeElement : lastCell || $('.cell');
    if (!c || c.readOnly) return;
    c.value = k.dataset.ins;
    c.dispatchEvent(new Event('input', { bubbles: true })); // перейдёт к следующей клетке
    return;
  }
  const inp = $('#ans');
  if (!inp || inp.readOnly) return;
  const focused = document.activeElement === inp;
  const a = focused ? inp.selectionStart : inp.value.length;
  const b = focused ? inp.selectionEnd : inp.value.length;
  inp.value = inp.value.slice(0, a) + k.dataset.ins + inp.value.slice(b);
  inp.focus();
  inp.setSelectionRange(a + 1, a + 1);
});

document.addEventListener('keydown', e => {
  if (!session || !location.hash.startsWith('#/session')) return;
  if (e.key === 'Enter') {
    e.preventDefault();
    if (session.fb) actions.next();
    else if ($('#ans') || $('#cloze')) actions.check();
    return;
  }
  if (!session.fb && session.opts && /^[1-4]$/.test(e.key)) {
    const b = $(`.opt[data-i="${+e.key - 1}"]`);
    if (b) actions.pick(b);
  }
});

/* ---------- Редактор ---------- */
// Два шага: «текст» (вставить список слов) → «таблица» (проверить и поправить переводы).
// Черновик живёт в памяти, пока открыт редактор; переводы подгружаются асинхронно и
// обновляют только свою строку, чтобы не сбивать фокус и клавиатуру.

let draft = null;

const newRow = (de = '', ru = '', wid = null) => ({
  rid: uid(), wid, de, ru, alts: [], gender: null, src: ru ? 'given' : 'pending', checked: !!ru,
});

function viewEdit(id) {
  if (!draft || draft.key !== id) {
    const l = id === 'new' ? null : getLesson(id);
    if (id !== 'new' && !l) return go('', true);
    draft = {
      key: id, id: l?.id || null, name: l?.name || '', text: '',
      rows: l ? l.words.map(w => newRow(w.de, w.ru, w.id)) : [],
      step: l ? 'table' : 'text',
    };
  }
  if (draft.step === 'photo' && !draft.photo) draft.step = 'text';
  ({ text: editText, photo: editPhoto, table: editTable })[draft.step]();
}

/** Добавить разобранные строки в черновик (без дублей по немецкому слову). */
function addParsedRows(ok) {
  const have = new Set(draft.rows.map(r => r.de.trim().toLowerCase()));
  let added = 0;
  for (const p of ok) {
    const k = p.de.toLowerCase();
    if (have.has(k)) continue;
    have.add(k);
    draft.rows.push(newRow(p.de, p.ru));
    added++;
  }
  return added;
}

const photoInput = (id, multiple = true) =>
  `<input type="file" id="${id}" accept="image/*" ${multiple ? 'multiple' : ''} hidden>`;

function editText() {
  const adding = draft.rows.length > 0;
  app.innerHTML = `
    ${header(adding ? 'Добавить слова' : 'Новый урок', '<button class="icon-btn" data-act="editBack" aria-label="Назад">‹</button>')}
    <label class="field"><span>Название</span>
      <input id="lname" type="text" value="${esc(draft.name)}" placeholder="Например: Диктант 12 — Kapitel 5"></label>
    <label class="field"><span>Немецкие слова — по одному на строку</span>
      <textarea id="ltext" rows="12" spellcheck="false" autocapitalize="off" lang="de"
        placeholder="der Hund&#10;die Katze&#10;laufen&#10;das Fahrrad — велосипед">${esc(draft.text)}</textarea></label>
    <div class="hint" id="parseInfo"></div>
    <label class="btn ghost photo-btn">📷 Распознать с фото<small>сфотографируй список в учебнике или тетради</small>${photoInput('photoIn')}</label>
    <details class="help"><summary>Как вводить слова?</summary>
      <ul>
        <li>Можно сфотографировать список: после распознавания лишние строки удаляются, ошибки исправляются руками.</li>
        <li>Достаточно немецкого слова — перевод найду сам, а на следующем шаге ты его проверишь и поправишь.</li>
        <li>Если нужен свой перевод, пиши через тире: <code>der Hund — собака</code>. Подходят <code>—</code>, <code> - </code> (с пробелами), <code>=</code>, <code>;</code>, табуляция — можно копировать из таблицы.</li>
        <li>Пиши существительные с артиклем. Если забудешь, предложу его.</li>
        <li>Несколько правильных вариантов: <code>anfangen / beginnen</code></li>
        <li>Пометки в скобках не обязательно писать на диктанте: <code>der Hund (-e)</code></li>
      </ul>
    </details>
    <button class="btn primary big" data-act="toTable">Далее: проверить переводы ›</button>`;
  const upd = () => {
    draft.text = $('#ltext').value;
    const { ok, bad } = parseText(draft.text);
    const need = ok.filter(p => !p.ru).length;
    $('#parseInfo').innerHTML = `Слов: <b>${ok.length}</b>${need ? ` · переводы найду для ${need}` : ''}` +
      (bad.length ? `<br><span class="warn">Не понял ${bad.length} ${plural(bad.length, 'строку', 'строки', 'строк')}: ${esc(bad.slice(0, 3).join(' · '))}${bad.length > 3 ? '…' : ''}</span>` : '');
  };
  $('#ltext').addEventListener('input', upd);
  $('#lname').addEventListener('input', e => { draft.name = e.target.value; });
  $('#photoIn').addEventListener('change', e => startPhotos(e.target.files));
  upd();
  $(adding || draft.name ? '#ltext' : '#lname').focus();
}

/* ---------- Слова с фото ---------- */
// Распознавание идёт прямо на устройстве (Tesseract.js, немецкий + русский), фото никуда не отправляется.
// Библиотека и языковые данные (~8 МБ) скачиваются с CDN при первом использовании, потом берутся из кэша.

const TESS_URL = 'https://cdn.jsdelivr.net/npm/tesseract.js@5.1.1/dist/tesseract.min.js';
let tessScript = null, tessWorker = null, ocrProgress = null;

function loadTesseract() {
  if (window.Tesseract) return Promise.resolve();
  return tessScript ||= new Promise((res, rej) => {
    const s = document.createElement('script');
    s.src = TESS_URL;
    s.onload = res;
    s.onerror = () => { tessScript = null; s.remove(); rej(new Error('load')); };
    document.head.append(s);
  });
}

function getOcrWorker() {
  return tessWorker ||= (async () => {
    await loadTesseract();
    const w = await Tesseract.createWorker(['deu', 'rus'], 1, { logger: m => ocrProgress?.(m) });
    // 6 = «один блок текста»: строки читаются целиком поперёк колонок, пара «слово — перевод» не разваливается
    await w.setParameters({ tessedit_pageseg_mode: '6', preserve_interword_spaces: '1' });
    return w;
  })().catch(e => { tessWorker = null; throw e; });
}

/** Уменьшаем большие фото и переводим в серый — распознавание быстрее и точнее. */
async function prepImage(url) {
  const img = await new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = url; });
  const k = Math.min(1, 2200 / Math.max(img.naturalWidth, img.naturalHeight));
  const c = document.createElement('canvas');
  c.width = Math.round(img.naturalWidth * k);
  c.height = Math.round(img.naturalHeight * k);
  const g = c.getContext('2d');
  g.filter = 'grayscale(1) contrast(1.25)';
  g.drawImage(img, 0, 0, c.width, c.height);
  return c;
}

const OCR_STATUS = {
  'loading tesseract core': 'Загружаю распознавание…',
  'initializing tesseract': 'Запускаю распознавание…',
  'loading language traineddata': 'Загружаю немецкий и русский (только в первый раз)…',
  'initializing api': 'Готовлюсь…',
  'recognizing text': 'Распознаю текст…',
};

function startPhotos(fileList) {
  const files = [...(fileList || [])].filter(f => f.type.startsWith('image/'));
  if (!files.length) return;
  if (!draft.photo) draft.photo = { shots: [], lines: [], busy: false, error: '' };
  if (document.getElementById('ltext')) draft.text = $('#ltext').value;
  for (const f of files) draft.photo.shots.push({ url: URL.createObjectURL(f), state: 'wait' });
  draft.step = 'photo';
  render();
  runOcr();
}

async function runOcr() {
  const ph = draft?.photo;
  if (!ph || ph.busy) return;
  ph.busy = true; ph.error = '';
  try {
    for (;;) {
      const i = ph.shots.findIndex(s => s.state === 'wait');
      if (i < 0) break;
      const shot = ph.shots[i];
      shot.state = 'work';
      const n = ph.shots.length;
      const label = n > 1 ? ` (фото ${i + 1} из ${n})` : '';
      ocrProgress = m => setOcrStatus((OCR_STATUS[m.status] || 'Работаю…') + label, m.progress);
      setOcrStatus('Готовлю фото…' + label, 0);
      const worker = await getOcrWorker();
      const { data } = await worker.recognize(await prepImage(shot.url));
      if (draft?.photo !== ph) return; // ушли с экрана
      shot.state = 'done';
      const lines = (data.lines || []).map(l => ({ text: cleanOcrLine(l.text), conf: l.confidence }))
        .filter(l => l.text)
        .map(l => ({ pid: uid(), text: l.text, low: l.conf < 65 }));
      shot.found = lines.length;
      ph.lines.push(...lines);
      appendPhotoLines(lines);
    }
  } catch (e) {
    console.error(e);
    ph.shots.forEach(s => { if (s.state === 'work') s.state = 'wait'; });
    ph.error = e?.message === 'load' || !navigator.onLine
      ? 'Не удалось загрузить распознавание. В первый раз нужен интернет.'
      : 'Не удалось распознать фото. Попробуй ещё раз или другое фото.';
  } finally {
    ph.busy = false;
    ocrProgress = null;
    if (draft?.photo === ph) refreshPhotoStatus();
  }
}

function setOcrStatus(msg, p) {
  const el = $('#ocrStatus');
  if (!el) return;
  el.hidden = false;
  el.querySelector('.ocr-msg').textContent = msg;
  el.querySelector('.progress i').style.width = Math.round((p || 0) * 100) + '%';
}

function photoLineHtml(l) {
  const flag = ocrFlag(l.text) || (l.low ? 'плохо видно — проверь' : '');
  return `<div class="pline ${flag ? 'flag' : ''}" data-pid="${l.pid}">
    <input class="pin" type="text" value="${esc(l.text)}" lang="de" autocapitalize="off" autocorrect="off" spellcheck="false" placeholder="слово — перевод">
    <button class="rowdel" data-act="pDel" aria-label="Удалить строку">✕</button>
    ${flag ? `<small class="pflag">⚠ ${flag}</small>` : ''}
  </div>`;
}

function appendPhotoLines(lines) {
  const box = $('#plines');
  if (!box) return;
  box.insertAdjacentHTML('beforeend', lines.map(photoLineHtml).join(''));
  refreshPhotoStatus();
}

function refreshPhotoStatus() {
  const ph = draft?.photo;
  if (!ph) return;
  const st = $('#ocrStatus');
  if (st && !ph.busy) st.hidden = true;
  const err = $('#ocrError');
  if (err) { err.hidden = !ph.error; err.querySelector('span').textContent = ph.error; }
  const n = ph.lines.filter(l => l.text.trim()).length;
  const flagged = ph.lines.filter(l => l.text.trim() && (l.low || ocrFlag(l.text))).length;
  const sum = $('#psum');
  if (sum) {
    sum.innerHTML = ph.busy && !n ? '' : `Строк: <b>${n}</b>` +
      (flagged ? ` · <span class="warn">⚠ проверь ${flagged}</span>` : '') +
      (!ph.busy && !n && !ph.error ? ' · текст не найден, попробуй сфотографировать ближе и ровнее' : '');
  }
  const thumbs = $('#pthumbs');
  if (thumbs) thumbs.innerHTML = ph.shots.map(s => `<div class="pthumb ${s.state}"><img src="${s.url}" alt="">${
    s.state === 'done' ? `<span>${s.found}</span>` : s.state === 'work' ? '<span>…</span>' : ''}</div>`).join('');
  const go2 = $('[data-act="photoDone"]');
  if (go2) { go2.disabled = !n; go2.firstChild.textContent = n ? `Добавить ${nWords(n)} в урок ›` : 'Добавить в урок ›'; }
  const dropFlag = $('[data-act="pDropFlagged"]');
  if (dropFlag) dropFlag.hidden = !flagged;
}

function editPhoto() {
  const ph = draft.photo;
  app.innerHTML = `
    ${header('Слова с фото', '<button class="icon-btn" data-act="photoCancel" aria-label="Назад">‹</button>')}
    <div class="pthumbs" id="pthumbs"></div>
    <div class="ocr-status" id="ocrStatus" hidden>
      <div class="ocr-msg">Готовлю фото…</div>
      <div class="progress"><i style="width:0%"></i></div>
    </div>
    <div class="ocr-error" id="ocrError" hidden><span></span>
      <button class="btn ghost sm" data-act="ocrRetry">Повторить</button></div>
    <p class="hint">Проверь строки: исправь ошибки распознавания, удали лишнее ✕, добавь пропущенное. Формат: <code>слово</code> или <code>слово — перевод</code>.</p>
    <div class="tsum" id="psum"></div>
    <div class="plines" id="plines">${ph.lines.map(photoLineHtml).join('')}</div>
    <div class="trow-actions">
      <button class="btn ghost sm" data-act="pAdd">＋ Строка</button>
      <label class="btn ghost sm">📷 Ещё фото${photoInput('photoMore')}</label>
    </div>
    <button class="btn ghost sm danger-ghost" data-act="pDropFlagged" hidden>Удалить все строки с ⚠</button>
    <button class="btn primary big" data-act="photoDone" disabled><span>Добавить в урок ›</span><small>дальше — проверка переводов</small></button>`;
  $('#photoMore').addEventListener('change', e => startPhotos(e.target.files));
  refreshPhotoStatus();
  if (ph.busy) setOcrStatus('Распознаю…', 0);
}

function closePhotos() {
  draft?.photo?.shots.forEach(s => URL.revokeObjectURL(s.url));
  if (draft) draft.photo = null;
}

const findPLine = el => draft?.photo?.lines.find(l => l.pid === el.closest('.pline')?.dataset.pid);

app.addEventListener('input', e => {
  if (!e.target.matches?.('.pin')) return;
  const l = findPLine(e.target);
  if (!l) return;
  l.text = e.target.value;
  l.low = false; // поправили руками — значит проверили
  const row = e.target.closest('.pline');
  const flag = ocrFlag(l.text);
  row.classList.toggle('flag', !!flag);
  row.querySelector('.pflag')?.remove();
  if (flag) row.insertAdjacentHTML('beforeend', `<small class="pflag">⚠ ${flag}</small>`);
  refreshPhotoStatus();
});

// Enter в строке — новая строка под ней (удобно дописывать пропущенные слова)
app.addEventListener('keydown', e => {
  if (e.key !== 'Enter' || !e.target.matches?.('.pin')) return;
  e.preventDefault();
  actions.pAdd(e.target);
});

const SRC_LABEL = {
  pending: ['', ''],
  loading: ['st', '⏳ ищу перевод…'],
  dict: ['st ok', '✓ Викисловарь'],
  mt: ['st warn', '⚠ машинный перевод — проверь'],
  none: ['st bad', '✗ не нашёл — впиши сам'],
  error: ['st bad', '✗ нет связи'],
};

function rowState(r) {
  if (!r.de.trim() && !r.ru.trim()) return 'empty';
  if (r.src === 'loading') return 'loading';
  if (!r.de.trim() || !r.ru.trim()) return 'need';
  if (r.src === 'mt' && !r.checked) return 'warn';
  return 'ok';
}

function metaHtml(r) {
  let [cls, label] = SRC_LABEL[r.src] || ['', ''];
  if (r.src === 'mt' && r.checked) label = '';
  if ((r.src === 'none' || r.src === 'error') && r.ru.trim()) label = '';
  const parts = label ? [`<span class="${cls}">${label}</span>`] : [];
  const art = r.gender && !/^(der|die|das)\s/i.test(r.de.trim()) ? suggestArticle(r.de, r.gender) : null;
  if (art) parts.push(`<button class="chip art" data-act="addArt" title="Добавить артикль">→ ${esc(art)}</button>`);
  const chosen = splitRu(r.ru).map(s => s.toLowerCase());
  for (const a of r.alts) {
    parts.push(`<button class="chip ${chosen.includes(a.toLowerCase()) ? 'on' : ''}" data-act="chip" data-v="${esc(a)}">${esc(a)}</button>`);
  }
  if (r.src !== 'loading' && !r.alts.length && r.de.trim()) {
    parts.push(`<button class="chip ghost" data-act="lookup">🔍 ${r.src === 'error' ? 'повторить' : 'варианты'}</button>`);
  }
  return parts.join('');
}

function rowHtml(r) {
  return `<div class="trow s-${rowState(r)}" data-rid="${r.rid}">
    <input class="tin de" type="text" data-f="de" value="${esc(r.de)}" lang="de" autocapitalize="off" autocorrect="off" spellcheck="false" placeholder="Wort">
    <input class="tin ru" type="text" data-f="ru" value="${esc(r.ru)}" placeholder="${r.src === 'loading' ? 'ищу…' : 'перевод'}">
    <button class="rowdel" data-act="rowDel" aria-label="Удалить строку">✕</button>
    <div class="tmeta">${metaHtml(r)}</div>
  </div>`;
}

function editTable() {
  const l = draft.id ? getLesson(draft.id) : null;
  app.innerHTML = `
    ${header(l ? 'Редактировать урок' : 'Проверь переводы', '<button class="icon-btn" data-act="editBack" aria-label="Назад">‹</button>')}
    <label class="field"><span>Название</span>
      <input id="lname" type="text" value="${esc(draft.name)}" placeholder="Например: Диктант 12 — Kapitel 5"></label>
    <p class="hint">Нажми на вариант, чтобы добавить его к переводу или убрать. Любое поле можно исправить руками.</p>
    <div class="tsum" id="tsum"></div>
    <div class="tbl">
      <div class="thead"><span>Немецкий</span><span>Перевод</span><span></span></div>
      <div id="trows">${draft.rows.map(rowHtml).join('')}</div>
    </div>
    <div class="trow-actions">
      <button class="btn ghost sm" data-act="addRow">＋ Строка</button>
      <button class="btn ghost sm" data-act="toText">＋ Списком</button>
    </div>
    <button class="btn primary big" data-act="saveDraft">Сохранить урок</button>
    ${l ? `<button class="btn danger-ghost" data-act="delLesson" data-id="${l.id}">Удалить урок</button>` : ''}`;
  $('#lname').addEventListener('input', e => { draft.name = e.target.value; });
  updateSummary();
  draft.rows.filter(r => r.src === 'pending').forEach(lookupRow);
}

function findRow(el) {
  const rid = el.closest('.trow')?.dataset.rid;
  return draft?.rows.find(r => r.rid === rid);
}

function refreshRow(r, { de, ru } = {}) {
  const el = $(`.trow[data-rid="${r.rid}"]`);
  if (!el) return;
  el.className = `trow s-${rowState(r)}`;
  el.querySelector('.tmeta').innerHTML = metaHtml(r);
  const ruIn = el.querySelector('.tin.ru');
  ruIn.placeholder = r.src === 'loading' ? 'ищу…' : 'перевод';
  if (ru) ruIn.value = r.ru;
  if (de) el.querySelector('.tin.de').value = r.de;
  updateSummary();
}

function updateSummary() {
  const el = $('#tsum');
  if (!el || !draft) return;
  const st = draft.rows.map(rowState).filter(s => s !== 'empty');
  const c = s => st.filter(x => x === s).length;
  const bits = [`<b>${nWords(st.length)}</b>`];
  if (c('loading')) bits.push(`⏳ ищу ${c('loading')}`);
  if (c('warn')) bits.push(`<span class="warn">⚠ проверь ${c('warn')}</span>`);
  if (c('need')) bits.push(`<span class="bad">✗ без перевода ${c('need')}</span>`);
  if (!c('loading') && !c('warn') && !c('need') && st.length) bits.push('<span class="ok">✓ всё готово</span>');
  el.innerHTML = bits.join(' · ');
}

async function lookupRow(r) {
  const d = draft;
  if (!r.de.trim()) return;
  const asked = r.de;
  r.src = 'loading';
  refreshRow(r);
  let res;
  try { res = await translateWord(asked); } catch { res = null; }
  if (draft !== d || !d.rows.includes(r) || r.de !== asked) return; // строку удалили или изменили
  if (!res) { r.src = 'error'; refreshRow(r); return; }
  r.alts = res.alts;
  r.gender = res.gender;
  r.src = res.alts.length ? res.src : 'none';
  const fill = !r.ru.trim() && res.alts.length;
  if (fill) { r.ru = res.alts[0]; r.checked = false; }
  refreshRow(r, { ru: fill });
}

app.addEventListener('input', e => {
  const t = e.target;
  if (!t.matches?.('.tin') || !draft) return;
  const r = findRow(t);
  if (!r) return;
  r[t.dataset.f] = t.value;
  if (t.dataset.f === 'ru') r.checked = true;
  else { r.alts = []; r.gender = null; if (r.src !== 'loading') r.src = 'given'; }
  refreshRow(r);
});

// Поменяли немецкое слово и ушли из поля — если перевода нет, ищем его сразу.
app.addEventListener('change', e => {
  const t = e.target;
  if (!t.matches?.('.tin.de') || !draft) return;
  const r = findRow(t);
  if (r && r.de.trim() && !r.ru.trim()) lookupRow(r);
});

Object.assign(actions, {
  editBack() {
    if (draft?.step === 'text' && draft.rows.length) { draft.step = 'table'; return render(); }
    draft = null;
    actions.back();
  },
  toTable() {
    draft.name = $('#lname').value;
    const { ok } = parseText($('#ltext').value);
    if (!ok.length && !draft.rows.length) return toast('Добавь хотя бы одно слово');
    addParsedRows(ok);
    draft.text = '';
    draft.step = 'table';
    render();
  },
  pDel(el) {
    const l = findPLine(el);
    if (!l) return;
    draft.photo.lines = draft.photo.lines.filter(x => x !== l);
    el.closest('.pline').remove();
    refreshPhotoStatus();
  },
  pAdd(el) {
    const ph = draft.photo;
    const l = { pid: uid(), text: '', low: false };
    const after = el?.closest?.('.pline') ? findPLine(el) : null;
    if (after) {
      ph.lines.splice(ph.lines.indexOf(after) + 1, 0, l);
      el.closest('.pline').insertAdjacentHTML('afterend', photoLineHtml(l));
    } else {
      ph.lines.push(l);
      $('#plines').insertAdjacentHTML('beforeend', photoLineHtml(l));
    }
    $(`.pline[data-pid="${l.pid}"] .pin`).focus();
    refreshPhotoStatus();
  },
  pDropFlagged() {
    const ph = draft.photo;
    const bad = ph.lines.filter(l => l.low || ocrFlag(l.text));
    if (!bad.length || !confirm(`Удалить ${bad.length} ${plural(bad.length, 'строку', 'строки', 'строк')} с ⚠?`)) return;
    ph.lines = ph.lines.filter(l => !bad.includes(l));
    bad.forEach(l => $(`.pline[data-pid="${l.pid}"]`)?.remove());
    refreshPhotoStatus();
  },
  ocrRetry() { runOcr(); refreshPhotoStatus(); },
  photoCancel() {
    const n = draft.photo?.lines.filter(l => l.text.trim()).length;
    if (n && !confirm('Выйти? Распознанные строки не сохранятся.')) return;
    closePhotos();
    draft.step = 'text';
    render();
  },
  photoDone() {
    const lines = draft.photo.lines.map(l => l.text.trim()).filter(Boolean);
    const { ok } = parseText(lines.join('\n') + '\n' + draft.text);
    if (!ok.length) return toast('Нет ни одного слова');
    const added = addParsedRows(ok);
    closePhotos();
    draft.text = '';
    draft.step = 'table';
    render();
    if (added < ok.length) toast(`Повторы пропущены: ${ok.length - added}`);
  },
  toText() { draft.step = 'text'; render(); },
  addRow() {
    const r = newRow();
    r.src = 'given';
    draft.rows.push(r);
    $('#trows').insertAdjacentHTML('beforeend', rowHtml(r));
    $(`.trow[data-rid="${r.rid}"] .tin.de`).focus();
    updateSummary();
  },
  rowDel(el) {
    const r = findRow(el);
    if (!r) return;
    draft.rows = draft.rows.filter(x => x !== r);
    el.closest('.trow').remove();
    updateSummary();
  },
  chip(el) {
    const r = findRow(el);
    if (!r) return;
    const v = el.dataset.v;
    const parts = splitRu(r.ru);
    const i = parts.findIndex(p => p.toLowerCase() === v.toLowerCase());
    if (i >= 0) parts.splice(i, 1); else parts.push(v);
    r.ru = parts.join(', ');
    r.checked = true;
    refreshRow(r, { ru: true });
  },
  addArt(el) {
    const r = findRow(el);
    const art = r && suggestArticle(r.de, r.gender);
    if (!art) return;
    r.de = art;
    refreshRow(r, { de: true });
  },
  lookup(el) {
    const r = findRow(el);
    if (r) lookupRow(r);
  },
  saveDraft() {
    const rows = draft.rows.filter(r => rowState(r) !== 'empty');
    if (!rows.length) return toast('Добавь хотя бы одно слово');
    if (rows.some(r => r.src === 'loading')) return toast('Ещё ищу переводы, подожди секунду');
    const need = rows.filter(r => rowState(r) === 'need');
    if (need.length) {
      $(`.trow[data-rid="${need[0].rid}"]`)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      return toast(`Не хватает перевода: ${nWords(need.length)}`);
    }
    const warn = rows.filter(r => rowState(r) === 'warn').length;
    if (warn && !confirm(`${warn} ${plural(warn, 'машинный перевод не проверен', 'машинных перевода не проверены', 'машинных переводов не проверены')}. Сохранить как есть?`)) return;

    let l = draft.id ? getLesson(draft.id) : null;
    const old = new Map((l?.words || []).map(w => [w.id, w]));
    const seen = new Set();
    const words = [];
    for (const r of rows) {
      const de = r.de.trim(), ru = splitRu(r.ru).join(', ') || r.ru.trim();
      const k = de + '\0' + ru;
      if (seen.has(k)) continue;
      seen.add(k);
      const o = r.wid && old.get(r.wid);
      words.push(o ? { ...o, de, ru } : newWord(de, ru));
    }
    const name = draft.name.trim() || 'Урок от ' + new Date().toLocaleDateString('ru');
    if (l) { l.name = name; l.words = words; } else { l = { id: uid(), name, created: Date.now(), words }; db.lessons.push(l); }
    save();
    draft = null;
    go('lesson/' + l.id, true);
  },
});

/* ---------- Старт ---------- */

if (!location.hash) history.replaceState(null, '', '#/');
if (location.hash.startsWith('#/session') || location.hash.startsWith('#/result')) history.replaceState(null, '', '#/');
render();

if ('serviceWorker' in navigator && location.protocol !== 'file:') {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}
