const test = require('node:test');
const assert = require('node:assert');
const Morse = require('../js/morse.js');
const Course = require('../js/course.js');

test('codifica y decodifica texto', () => {
  assert.strictEqual(Morse.encode('SOS'), '... --- ...');
  assert.strictEqual(Morse.encode('hola  mundo'), '.... --- .-.. .- / -- ..- -. -.. ---');
  assert.strictEqual(Morse.encode('Año'), '.- --.-- ---');
  assert.strictEqual(Morse.encode('canción'), Morse.encode('CANCION'));
  assert.strictEqual(Morse.decode('.... --- .-.. .- / -- ..- -. -.. ---'), 'HOLA MUNDO');
});

test('prosignos', () => {
  assert.strictEqual(Morse.encode('<SK>'), '...-.-');
  assert.strictEqual(Morse.encode('73 <SK>'), '--... ...-- / ...-.-');
  assert.strictEqual(Morse.decode('...-.-'), '<SK>');
  assert.strictEqual(Morse.decode('.-.-.'), '+');
});

test('detecta texto Morse', () => {
  assert.ok(Morse.isMorse('... --- ...'));
  assert.ok(Morse.isMorse('.- / -...'));
  assert.ok(!Morse.isMorse('hola'));
  assert.ok(!Morse.isMorse('   '));
});

test('temporización PARIS = 50 unidades', () => {
  const t = Morse.timing(20, 20);
  const segs = Morse.timeline(Morse.encode('PARIS'), t);
  const total = Morse.duration(segs) + t.wordGap;
  assert.ok(Math.abs(total - 3) < 1e-9); // 20 ppm → PARIS dura 3 s
});

test('Farnsworth mantiene la velocidad efectiva', () => {
  const t = Morse.timing(18, 10);
  const segs = Morse.timeline(Morse.encode('PARIS'), t);
  const total = Morse.duration(segs) + t.wordGap;
  assert.ok(Math.abs(total - 6) < 1e-9); // 10 ppm efectivas → 6 s
  assert.ok(t.charGap > 3 * t.unit);
});

test('decodifica pulsaciones del manipulador', () => {
  const u = 100;
  const presses = [];
  let t = 0;
  const key = (len, gapAfter) => { presses.push({ down: t, up: t + len }); t += len + gapAfter; };
  // S (...), pausa de letra, O (---), pausa de palabra, E (.)
  key(u, u); key(u, u); key(u, 3 * u);
  key(3 * u, u); key(3 * u, u); key(3 * u, 7 * u);
  key(u, 0);
  assert.deepStrictEqual(Morse.decodeTimings(presses, u), { morse: '... --- / .', text: 'SO E' });
});

test('Keyer en tiempo real', async () => {
  const u = 10;
  const morse = await new Promise((resolve) => {
    const k = new Morse.Keyer({ unitMs: u, onIdle: resolve });
    k.down(0); k.up(5); // punto
    k.down(15); k.up(50); // raya
  });
  assert.strictEqual(morse, '.-');
});

test('el umbral de punto/raya se adapta a quien manipula', () => {
  const t = new Morse.AdaptiveTimer(150); // empieza esperando puntos de 150 ms
  // Alguien que manipula mucho más rápido: puntos de 60 ms y rayas de 180 ms.
  const seq = [60, 180, 60, 60, 180, 180, 60, 180];
  for (let i = 0; i < 3; i++) seq.forEach((ms) => t.classify(ms));
  assert.strictEqual(seq.map((ms) => t.classify(ms)).join(''), '.-..--.-');
  assert.ok(t.threshold > 60 && t.threshold < 180);
});

test('SendJudge acepta sin esperar pausas y detecta fallos al momento', () => {
  const ok = new Morse.SendJudge(Morse.encode('TNX'));
  const states = [...'--.-..-'].map((e) => ok.feed(e));
  assert.deepStrictEqual(states.slice(0, -1).every((s) => s === 'progress'), true);
  assert.strictEqual(states.at(-1), 'ok');
  assert.strictEqual(ok.morse(), '- -. -..-');

  const bad = new Morse.SendJudge(Morse.encode('A'));
  assert.strictEqual(bad.feed('.'), 'progress');
  assert.strictEqual(bad.feed('.'), 'bad');
});

test('estructura del curso', () => {
  const c = Course.build();
  assert.deepStrictEqual(c.sections.map((s) => s.title), [
    'Caracteres', 'Palabras, frases y oraciones', 'Prosignos', 'Códigos Q', 'Abreviaturas',
    'Conceptos básicos del QSO en CW'
  ]);
  const ids = new Set(c.lessons.map((l) => l.id));
  assert.strictEqual(ids.size, c.lessons.length);
  // Alfabeto: 31 sesiones, 6 desafíos; tras el Desafío 3 viene la Lección 8 (L & F).
  const alfa = c.sections[0].subs[0];
  assert.strictEqual(alfa.title, 'Alfabeto');
  assert.strictEqual(alfa.lessons.length, 31);
  assert.strictEqual(alfa.lessons.filter((l) => l.type === 'challenge').length, 6);
  const i = alfa.lessons.findIndex((l) => l.title === 'Desafío 3');
  assert.strictEqual(alfa.lessons[i + 1].title, 'Lección 8');
  assert.strictEqual(alfa.lessons[i + 1].subtitle, 'L & F');
  assert.strictEqual(alfa.lessons[i + 2].type, 'review');
  // Repasos y desafíos de letras usan teclado; cada subsección acaba en desafío.
  assert.ok(alfa.lessons.filter((l) => l.type !== 'learn').every((l) => l.kb));
  for (const sec of c.sections) for (const sub of sec.subs) assert.strictEqual(sub.lessons.at(-1).type, 'challenge');
  const letters = alfa.lessons.flatMap((l) => l.newItems || []).map((i) => i.text).join('');
  for (const ch of 'ABCDEFGHIJKLMNÑOPQRSTUVWXYZ') assert.ok(letters.includes(ch), ch);
  for (const it of Object.values(c.items)) assert.ok(it.morse && !it.morse.includes('undefined'), it.text);
});

test('preguntas: opciones correctas y sin repetir seguidas', () => {
  const c = Course.build();
  for (const l of c.lessons) {
    const next = Course.questions(l);
    let prev = null;
    for (let i = 0; i < 30; i++) {
      const q = next();
      if (l.kb) {
        assert.strictEqual(q.options, null);
        assert.ok(l.kb.join('').includes(q.item.text));
      } else {
        assert.ok(q.options.includes(q.item));
        assert.ok(q.options.length >= 2 && q.options.length <= 4);
        assert.strictEqual(new Set(q.options).size, q.options.length);
      }
      if (l.items.length > 1) assert.notStrictEqual(q.item, prev);
      prev = q.item;
    }
  }
});

test('comparación de respuestas escritas', () => {
  assert.ok(Course.sameText('sk', '<SK>'));
  assert.ok(Course.sameText(' tnx  qso 73 sk', 'TNX QSO 73 <SK>'));
  assert.ok(Course.sameText('ñ', 'Ñ'));
  assert.ok(!Course.sameText('E', 'T'));
});

test('una sesión se supera con el 80 % y sin agotar vidas', () => {
  assert.strictEqual(Course.percent(23, 25), 92);
  assert.ok(Course.passed(20, 25));
  assert.ok(!Course.passed(19, 25));
  assert.ok(!Course.passed(14, 15, true));
});
