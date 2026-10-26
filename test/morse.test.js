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

test('estructura del curso', () => {
  const c = Course.build();
  assert.strictEqual(c.sections.length, 6);
  const ids = new Set(c.lessons.map((l) => l.id));
  assert.strictEqual(ids.size, c.lessons.length);
  // Todas las letras del alfabeto aparecen en la sección de letras
  const letters = c.sections[0].items.map((i) => i.text).join('');
  for (const ch of 'ABCDEFGHIJKLMNÑOPQRSTUVWXYZ') assert.ok(letters.includes(ch), ch);
  // Todos los elementos se pueden codificar
  for (const it of Object.values(c.items)) assert.ok(it.morse && !it.morse.includes('undefined'), it.text);
});

test('ejercicios: las opciones incluyen la respuesta correcta', () => {
  const c = Course.build();
  for (const l of c.lessons) {
    const exs = Course.makeExercises(l, { send: true });
    assert.ok(exs.length > 0);
    for (const ex of exs) {
      if (ex.options) {
        assert.ok(ex.options.includes(ex.item));
        assert.strictEqual(new Set(ex.options).size, ex.options.length);
      }
      if (ex.type === 'send') assert.ok(Course.canSend(ex.item));
    }
  }
});

test('comparación de respuestas escritas', () => {
  assert.ok(Course.sameText('sk', '<SK>'));
  assert.ok(Course.sameText(' tnx  qso 73 sk', 'TNX QSO 73 <SK>'));
  assert.ok(Course.sameText('ñ', 'Ñ'));
  assert.ok(!Course.sameText('E', 'T'));
});

test('estrellas', () => {
  assert.strictEqual(Course.stars(10, 10), 3);
  assert.strictEqual(Course.stars(9, 10), 2);
  assert.strictEqual(Course.stars(8, 10), 1);
  assert.strictEqual(Course.stars(7, 10), 0);
});
