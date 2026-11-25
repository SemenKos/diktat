// Живая проверка поиска переводов через интернет (Викисловарь + MyMemory).
// Запуск: node tests/translate.live.js [слово ...]   — нужен Node 18+ и доступ в сеть.
const path = require('path');
const fs = require('fs');
const vm = require('vm');

let requests = 0;
const countingFetch = (...a) => { requests++; return fetch(...a); };
const ctx = {
  ...require('../logic.js'), fetch: countingFetch, URLSearchParams, AbortController, setTimeout, clearTimeout, console,
  localStorage: { getItem: () => null, setItem: () => {} },
};
vm.createContext(ctx);
vm.runInContext(fs.readFileSync(path.join(__dirname, '../translate.js'), 'utf8') + ';this.translateWord = translateWord;', ctx);

const words = process.argv.slice(2).length ? process.argv.slice(2)
  : ['der Hund', 'Fahrrad', 'laufen', 'sich freuen', 'die Großeltern', 'verheiratet', 'Hausaufgabe'];
Promise.all(words.map(w => ctx.translateWord(w).then(r => [w, r], e => [w, { error: e.message }])))
  .then(rs => {
    rs.forEach(([w, r]) => console.log(w.padEnd(18), JSON.stringify(r)));
    console.log(`\nслов: ${words.length}, запросов в сеть: ${requests}`);
  });
