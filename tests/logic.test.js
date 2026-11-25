// Запуск: node tests/logic.test.js
const L = require('../logic.js');
let failed = 0;
const eq = (a,b,m)=>{ const ok=JSON.stringify(a)===JSON.stringify(b); if(!ok) failed++; console.log(ok?'ok  ':'FAIL', m, ok?'':JSON.stringify(a)); };
eq(L.parseLine('der Hund — собака'), {de:'der Hund',ru:'собака'}, 'em dash');
eq(L.parseLine('die E-Mail - письмо'), {de:'die E-Mail',ru:'письмо'}, 'hyphen in word');
eq(L.parseLine('собака - der Hund'), {de:'der Hund',ru:'собака'}, 'swap');
eq(L.parseLine('3. laufen\tбегать'), {de:'laufen',ru:'бегать'}, 'numbered+tab');
eq(L.parseLine('просто текст'), null, 'no sep');
eq(L.parseText('der Hund\n2. laufen\nдом\ndas Rad — колесо').ok, [{de:'der Hund',ru:''},{de:'laufen',ru:''},{de:'das Rad',ru:'колесо'}], 'de-only lines');
eq(L.parseText('дом').bad, ['дом'], 'cyrillic-only is bad');
const c = (g,de,s=true)=>L.checkAnswer(g,de,s);
eq(c('der Hund','der Hund').ok, true, 'exact');
eq(c(' der  Hund. ','der Hund').ok, true, 'spaces/punct');
eq(c('der hund','der Hund').hint.startsWith('Ошибка в заглавных'), true, 'case');
eq(c('der hund','der Hund',false).ok, true, 'case lax');
eq(c('die Hund','der Hund').hint, 'Неверный артикль: нужно «der».', 'article');
eq(c('Hund','der Hund').hint, 'Не забудь артикль «der».', 'missing article');
eq(c('die Grosseltern','die Großeltern').hint, 'Проверь умлауты (ä, ö, ü) и ß.', 'ß');
eq(c('die Mutter','die Mütter').hint, 'Проверь умлауты (ä, ö, ü) и ß.', 'umlaut');
eq(c('die Schwster','die Schwester').hint, 'Почти! Ошибка в одной букве.', 'typo');
eq(c('beginnen','anfangen / beginnen').ok, true, 'variant');
eq(c('der Hund','der Hund (-e)').ok, true, 'parens');
eq(c('','der Hund').ok, false, 'empty');
const [a,b]=L.lcsMarks([...'Schwster'],[...'Schwester']); eq(b.map(x=>x?1:0).join(''), '111101111', 'lcs');
// --- поиск переводов ---
eq(L.lookupKeys('der Hund (-e)'), ['Hund','hund'], 'keys noun');
eq(L.lookupKeys('sich freuen'), ['sich freuen','Sich freuen','freuen','Freuen'], 'keys sich');
eq(L.lookupKeys('anfangen / beginnen'), ['anfangen','Anfangen'], 'keys variant');
const wiki = "== Hund ({{Sprache|Deutsch}}) ==\n=== {{Wortart|Substantiv|Deutsch}}, {{m}} ===\n*{{en}}: {{Ü|en|dog}}\n*{{ru}}: [1] {{Üt|ru|соба́ка|sobaka}} {{f}}, {{Üt|ru|пёс}} {{m}}\n*{{ru}}: {{Üt|ru|собака}}";
eq(L.parseWiki(wiki), {alts:['собака','пёс'], gender:'m'}, 'parseWiki');
eq(L.parseWiki("=== {{Wortart|Verb|Deutsch}} ===\n*{{ru}}: {{Üt|ru|бежать}}, {{Üt|ru|[[идти]]}}").alts, ['бежать','идти'], 'parseWiki verb + link');
eq(L.cleanMt({responseData:{translatedText:'Радоваться'}, matches:[{translation:'радоваться',match:1},{translation:'В Киеве будут рады этому событию.',match:0.9},{translation:'Freude',match:0.9},{translation:'веселиться',match:0.5}]}), ['радоваться'], 'cleanMt');
eq(L.suggestArticle('hund','m'), 'der Hund', 'article m');
eq(L.suggestArticle('Fahrrad','n'), 'das Fahrrad', 'article n');
eq(L.suggestArticle('sich freuen','f'), null, 'article multiword');
eq(L.splitRu('бежать,  бегать; идти'), ['бежать','бегать','идти'], 'splitRu');

// --- фото (OCR) ---
eq(L.fixMixedScript('Наus'), 'Haus', 'mixed → latin');
eq(L.fixMixedScript('сoбака'), 'собака', 'mixed → cyrillic');
eq(L.fixMixedScript('der Hund собака'), 'der Hund собака', 'clean words untouched');
eq(L.cleanOcrLine('• 3. der Hund собака'), 'der Hund — собака', 'ocr two columns');
eq(L.cleanOcrLine('— die Katze - кошка ;'), 'die Katze - кошка', 'ocr bullet + trailing');
eq(L.cleanOcrLine('dіе Ѕсhule'.replace('і','i').replace('Ѕ','S')), 'die Schule', 'ocr plain');
eq(L.cleanOcrLine('12'), null, 'ocr number only');
eq(L.cleanOcrLine(' | — '), null, 'ocr junk');
eq(L.cleanOcrLine('laufen | бегать'), 'laufen — бегать', 'ocr table bar');
eq(L.ocrFlag('Lies den Text und beantworte die Fragen'), 'похоже на предложение', 'flag sentence');
eq(L.ocrFlag('Kapitel 5 Wortschatz'), 'похоже на заголовок', 'flag heading digits');
eq(L.ocrFlag('Wortschatz:'), 'похоже на заголовок', 'flag heading colon');
eq(L.ocrFlag('der Bleistift — карандаш'), '', 'flag ok word');

process.on('exit', () => { if (failed) { console.log(`\n${failed} failed`); process.exitCode = 1; } else console.log('\nall passed'); });
