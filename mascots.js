'use strict';
// Персонажи: утка Огарь радуется верным ответам (по-русски и по-немецки) и при хорошем результате
// летит учиться в Германию; Крокодильчик радуется ошибкам, а при проваленном уроке метёт улицу
// и поёт свою песню. Рисунки — SVG, анимация — CSS (style.css, раздел «Персонажи»), звук — Web Audio.

/* ---------- Рисунки ---------- */

function ogarSvg(mode = '') {
  // mode: '' — стоит, 'fly' — летит с рюкзаком
  return `<svg class="ogar ${mode}" viewBox="0 0 130 120" aria-hidden="true">
    <g class="o-all">
      <path class="o-tail" d="M24 64 L4 56 L8 74 Z" fill="#262626"/>
      <g class="o-legs" stroke="#3a3a3a" stroke-width="4" stroke-linecap="round" fill="none">
        <path d="M46 88 v12 M60 88 v12"/><path d="M40 101 h10 M54 101 h10"/>
      </g>
      <ellipse cx="52" cy="70" rx="34" ry="23" fill="#cf6a22"/>
      <ellipse cx="57" cy="78" rx="25" ry="13" fill="#e48a44"/>
      <g class="o-pack">
        <path d="M30 52 h24 a4 4 0 0 1 4 4 v14 a4 4 0 0 1 -4 4 h-24 a4 4 0 0 1 -4 -4 v-14 a4 4 0 0 1 4 -4z" fill="#1cb0f6"/>
        <rect x="31" y="60" width="22" height="5" rx="2" fill="#1899d6"/>
        <path d="M54 56 Q62 62 60 74" stroke="#1899d6" stroke-width="3" fill="none"/>
        <rect x="35" y="47" width="5" height="9" fill="#000"/><rect x="40" y="47" width="5" height="9" fill="#dd0000"/><rect x="45" y="47" width="5" height="9" fill="#ffce00"/>
      </g>
      <path d="M68 58 Q73 46 78 40 L90 46 Q84 58 82 66 Z" fill="#e7a25e"/>
      <path d="M69 58 Q77 61 83 64" stroke="#262626" stroke-width="3" fill="none" stroke-linecap="round"/>
      <g class="o-head">
        <circle cx="84" cy="35" r="18" fill="#f3dab1"/>
        <path class="o-beak" d="M98 34 Q116 31 119 38 Q115 46 98 43 Z" fill="#363636"/>
        <circle cx="90" cy="30" r="4.4" fill="#1b1b1b"/><circle cx="91.6" cy="28.4" r="1.5" fill="#fff"/>
        <circle cx="86" cy="41" r="3.6" fill="#f39a8f" opacity=".55"/>
      </g>
      <g class="o-wing">
        <path d="M30 62 Q48 46 72 58 Q62 80 36 80 Q26 72 30 62Z" fill="#b5551b"/>
        <path d="M36 65 Q48 58 61 62 Q54 70 40 72Z" fill="#fff" opacity=".92"/>
        <path d="M31 73 Q24 80 16 84 Q30 85 39 80Z" fill="#262626"/>
      </g>
    </g>
  </svg>`;
}

function crocSvg(mode = '') {
  // mode: '' — радуется, 'sweep' — метёт улицу с метлой
  return `<svg class="croc ${mode}" viewBox="0 0 170 130" aria-hidden="true">
    <g class="c-all">
      <g class="c-tail">
        <path d="M42 96 Q16 102 4 86 Q22 90 44 82Z" fill="#45a845"/>
        <path d="M14 90 l4 -7 l3 8 M24 91 l4 -8 l3 8 M34 89 l4 -8 l3 8" fill="#3a8f3a"/>
      </g>
      <ellipse cx="44" cy="118" rx="9" ry="6" fill="#3f9a3f"/><ellipse cx="80" cy="118" rx="9" ry="6" fill="#3f9a3f"/>
      <ellipse cx="62" cy="96" rx="29" ry="24" fill="#58bb58"/>
      <ellipse cx="66" cy="101" rx="17" ry="15" fill="#d6efa4"/>
      <path d="M54 94 h24 M53 101 h26 M55 108 h22" stroke="#bcdc84" stroke-width="2"/>
      <g class="c-vest">
        <path d="M36 86 Q48 76 58 80 L66 98 L74 80 Q84 76 90 86 L90 106 Q62 116 36 106Z" fill="#ff8a1e"/>
        <path d="M37 98 Q62 106 90 98 L90 103 Q62 111 37 103Z" fill="#ffe45c"/>
      </g>
      <g class="c-head">
        <path d="M56 66 Q54 38 80 38 Q100 38 122 48 Q148 54 148 66 Q148 80 124 82 L80 84 Q58 84 56 66Z" fill="#58bb58"/>
        <circle cx="76" cy="38" r="11" fill="#58bb58"/><circle cx="96" cy="37" r="11" fill="#58bb58"/>
        <g class="c-eyes">
          <circle cx="77" cy="37" r="7.5" fill="#fff"/><circle cx="97" cy="36" r="7.5" fill="#fff"/>
          <circle cx="80" cy="37" r="3.8" fill="#1b1b1b"/><circle cx="100" cy="36" r="3.8" fill="#1b1b1b"/>
          <circle cx="81.3" cy="35.6" r="1.3" fill="#fff"/><circle cx="101.3" cy="34.6" r="1.3" fill="#fff"/>
        </g>
        <ellipse cx="138" cy="56" rx="2.4" ry="1.6" fill="#2d6e2d"/><ellipse cx="144" cy="58" rx="2.4" ry="1.6" fill="#2d6e2d"/>
        <path class="c-mouth" d="M84 70 Q112 82 142 68 Q120 92 84 70Z" fill="#7a2a2a"/>
        <path d="M92 73 l3 5 l3 -4 M104 76 l3 5 l3 -5 M118 76 l3 5 l3 -6 M131 72 l3 5 l2 -6" fill="#fff"/>
        <circle cx="74" cy="68" r="5" fill="#ff8a8a" opacity=".85"/>
      </g>
      <g class="c-broom">
        <path d="M102 58 L124 116" stroke="#9a6a3a" stroke-width="5" stroke-linecap="round"/>
        <path d="M112 112 L138 108 L150 128 L112 130 Z" fill="#e8c35a"/>
        <path d="M118 114 l-2 15 M126 112 l1 17 M134 111 l5 17 M141 112 l7 15" stroke="#c99b33" stroke-width="2"/>
        <path d="M112 110 L138 106 L139 112 L113 116Z" fill="#c0392b"/>
      </g>
      <g class="c-arm">
        <path d="M80 90 Q96 84 106 76" stroke="#4aa64a" stroke-width="9" stroke-linecap="round" fill="none"/>
        <circle cx="107" cy="75" r="6" fill="#58bb58"/>
      </g>
      <g class="c-dust" fill="#c9b89a">
        <circle cx="152" cy="122" r="5"/><circle cx="160" cy="116" r="3.5"/><circle cx="146" cy="114" r="3"/>
      </g>
    </g>
  </svg>`;
}

/* ---------- Фразы ---------- */

const OGAR_PHRASES = [
  ['Молодец!', 'ru'], ['Super!', 'de'], ['Отлично!', 'ru'], ['Wunderbar!', 'de'],
  ['Так держать!', 'ru'], ['Sehr gut!', 'de'], ['Умница!', 'ru'], ['Toll gemacht!', 'de'],
  ['Кря! Верно!', 'ru'], ['Klasse!', 'de'], ['Блестяще!', 'ru'], ['Prima!', 'de'],
  ['Ура!', 'ru'], ['Genau so!', 'de'], ['Великолепно!', 'ru'], ['Spitze!', 'de'],
];
const CROC_PHRASES = [
  'Ха-ха! Ошибочка!', 'Хи-хи, попался!', 'Ура, ошибка! Мне весело!', 'Хе-хе, не угадал!',
  'Ням! Ещё одна ошибка!', 'Ой-ой, а я и рад!', 'Ха! Огарь так не полетит!', 'Хи-хи-хи!',
];
let ogarTurn = Math.floor(Math.random() * OGAR_PHRASES.length);
const pick = arr => arr[Math.floor(Math.random() * arr.length)];

/** Огарь по очереди хвалит по-русски и по-немецки. */
function ogarPhrase() {
  const [text, lang] = OGAR_PHRASES[ogarTurn++ % OGAR_PHRASES.length];
  return { text, lang, flag: lang === 'de' ? '🇩🇪' : '🇷🇺' };
}

/** Персонаж в плашке ответа. */
function mascotMini(ok, sayHtml) {
  return `<div class="mini ${ok ? 'mini-ogar' : 'mini-croc'}">
    ${sayHtml ? `<div class="mini-say">${sayHtml}</div>` : ''}
    ${ok ? ogarSvg() : crocSvg()}
  </div>`;
}
const crocPhrase = () => pick(CROC_PHRASES);

/* ---------- Звук ---------- */

let actx = null;
let songTimers = [];

function audio() {
  if (!db.settings.sounds) return null;
  try {
    actx ||= new (window.AudioContext || window.webkitAudioContext)();
    if (actx.state === 'suspended') actx.resume();
    return actx;
  } catch { return null; }
}

function tone(freq, t0, dur, { type = 'triangle', vol = 0.14, slideTo = 0 } = {}) {
  const a = audio();
  if (!a) return;
  const t = a.currentTime + t0;
  const o = a.createOscillator(), g = a.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, t);
  if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(vol, t + 0.02);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g).connect(a.destination);
  o.start(t);
  o.stop(t + dur + 0.05);
}

const sfx = {
  quack() { tone(620, 0, 0.13, { type: 'square', vol: 0.06, slideTo: 380 }); tone(660, 0.16, 0.15, { type: 'square', vol: 0.06, slideTo: 400 }); },
  croc() { [0, 0.14, 0.28].forEach((t, i) => tone(240 - i * 20, t, 0.11, { type: 'sawtooth', vol: 0.05, slideTo: 170 - i * 15 })); },
  fly() { [523, 659, 784, 1047].forEach((f, i) => tone(f, i * 0.12, 0.25, { vol: 0.1 })); },
};

// «А крокодильчик просто класс, научит многому он вас!» — слоги и мелодия (своя, простая, в до мажоре).
const SONG = [
  ['А ', 392], ['кро', 523], ['ко', 523], ['диль', 587], ['чик ', 659], ['прос', 659], ['то ', 587], ['класс,', 523, 2.2],
  ['на', 440], ['у', 440], ['чит ', 494], ['мно', 523], ['го', 587], ['му ', 659], ['он ', 587], ['вас!', 523, 2.6],
];
const BEAT = 0.34; // чуть медленнее, чтобы синтез речи успевал «петь» строку под свою музыкальную фразу
const SONG_LINES = [[0, 'А крокодильчик просто класс,'], [8, 'научит многому он вас!']]; // [индекс первого слога, текст]

/* ---------- Голоса ---------- */
// Голосом говорит синтез речи телефона. Характер задаём высотой и скоростью:
// Огарь — высокий быстрый голосок, Крокодильчик — низкий смешной бас.
// Реплики встают в очередь после немецкого слова, которое произносится после ответа.

const VOICE = {
  ogar: { pitch: 1.9, rate: 1.12 },
  croc: { pitch: 0.3, rate: 0.92 },
  crocSing: { pitch: 0.55, rate: 0.82 },
};
let ruVoice = null;
function pickRuVoice() {
  const vs = speechSynthesis.getVoices();
  ruVoice = vs.find(v => /^ru[-_]RU/i.test(v.lang)) || vs.find(v => /^ru/i.test(v.lang)) || null;
}
if ('speechSynthesis' in window) { pickRuVoice(); speechSynthesis.addEventListener?.('voiceschanged', pickRuVoice); }

/** Реплика персонажа. who: 'ogar' | 'croc' | 'crocSing', lang: 'ru' | 'de'. Не перебивает уже звучащую речь. */
function charSay(who, text, lang = 'ru') {
  if (!db.settings.voices || !('speechSynthesis' in window)) return;
  const u = new SpeechSynthesisUtterance(text);
  u.lang = lang === 'de' ? 'de-DE' : 'ru-RU';
  const v = lang === 'de' ? deVoice : ruVoice;
  if (v) u.voice = v;
  u.pitch = VOICE[who].pitch;
  u.rate = VOICE[who].rate;
  speechSynthesis.speak(u);
}

function songHtml() {
  return `<div class="song" id="song">🎵 ${SONG.map(([s], i) =>
    `<span data-i="${i}">${esc(s)}</span>${i === 7 ? '<br>' : ''}`).join('')}</div>`;
}

function stopSong() {
  if (songTimers.length && 'speechSynthesis' in window) speechSynthesis.cancel();
  songTimers.forEach(clearTimeout);
  songTimers = [];
}

/** Поёт песню: мелодия + голос Крокодильчика по строкам + подсветка слогов (она работает и без звука). */
function singSong() {
  stopSong();
  if ('speechSynthesis' in window) speechSynthesis.cancel();
  const spans = [...document.querySelectorAll('#song span')];
  spans.forEach(s => s.classList.remove('on'));
  document.querySelector('#song')?.classList.remove('done');
  const starts = [];
  let t = 0;
  SONG.forEach(([, f, len = 1], i) => {
    const d = BEAT * len;
    starts[i] = t;
    tone(f, t, d * 0.95, { type: 'triangle', vol: 0.11 });
    if (i % 2 === 0) tone(f / 4, t, BEAT * 1.6, { type: 'sine', vol: 0.07 }); // бас
    songTimers.push(setTimeout(() => spans[i]?.classList.add('on'), t * 1000));
    t += d;
  });
  for (const [i, line] of SONG_LINES) songTimers.push(setTimeout(() => charSay('crocSing', line), starts[i] * 1000));
  songTimers.push(setTimeout(() => {
    document.querySelector('#song')?.classList.add('done');
    charSay('croc', 'Ха-ха-ха!');
    songTimers = [];
  }, t * 1000 + 200));
}

/* ---------- Сцены итогов ---------- */

/** Какая сцена на экране итогов: 'fly' — Огарь летит в Германию, 'croc' — урок провален, 'mid' — между. */
const sceneFor = pct => (pct >= 80 ? 'fly' : pct < 60 ? 'croc' : 'mid');

function sceneHtml(kind) {
  if (kind === 'fly') {
    return `<div class="scene sky">
      <div class="cloud c1"></div><div class="cloud c2"></div><div class="cloud c3"></div>
      <div class="land"></div>
      <div class="de-school">
        <div class="flag"><i></i><i></i><i></i></div>
        <div class="school"><span>Schule</span></div>
      </div>
      <div class="fly-x"><div class="fly-y">${ogarSvg('fly')}</div></div>
    </div>
    <h1>Огарь полетел учиться в Германию!</h1>
    <p class="muted">🇩🇪 Tschüss! Bis bald! Увидимся на следующем уроке.</p>`;
  }
  if (kind === 'croc') {
    return `<div class="scene street">
      <div class="houses"><i></i><i></i><i></i><i></i></div>
      <div class="sidewalk"></div>
      <div class="leaf l1"></div><div class="leaf l2"></div><div class="leaf l3"></div>
      <div class="sweeper">${crocSvg('sweep')}</div>
    </div>
    ${songHtml()}
    <button class="link" data-act="singAgain">🎵 Спеть ещё раз</button>
    <h1>Крокодильчик доволен: ошибок много!</h1>
    <p class="muted">Поработай над ошибками — и Огарь полетит учиться в Германию.</p>`;
  }
  const ph = midPhrase = ogarPhrase();
  return `<div class="scene meadow">
      <div class="mid-ogar">${ogarSvg()}</div>
      <div class="mid-say">${ph.flag} ${esc(ph.text)}</div>
    </div>
    <h1>Неплохо!</h1>
    <p class="muted">Noch ein bisschen üben — ещё чуть-чуть, и Огарь полетит в Германию.</p>`;
}

let midPhrase = null;

function startScene(kind) {
  if (kind === 'fly') {
    sfx.fly();
    setTimeout(() => sfx.quack(), 900);
    charSay('ogar', 'Ура! Я лечу учиться в Германию!');
    charSay('ogar', 'Tschüss! Bis bald!', 'de');
  } else if (kind === 'croc') {
    singSong();
  } else {
    sfx.quack();
    charSay('ogar', 'Неплохо! Ещё чуть-чуть — и полетим в Германию!');
    if (midPhrase) charSay('ogar', midPhrase.text, midPhrase.lang);
  }
}

/** Реплика в плашке ответа: после немецкого слова. */
function mascotSpeak(ok, phrase) {
  if (ok) charSay('ogar', phrase.text, phrase.lang);
  else charSay('croc', phrase);
}
