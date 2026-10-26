// Estructura del curso (secciones → subsecciones → lecciones) y generador
// de ejercicios para cada lección.
(function (root) {
  'use strict';

  const M = root.Morse || require('./morse.js');

  const MEANINGS = {
    // Palabras y abreviaturas CW
    CQ: 'Llamada general: «¿alguien me escucha?»',
    DE: 'De (antes del indicativo propio)',
    73: 'Saludos cordiales',
    TNX: 'Gracias (thanks)',
    PSE: 'Por favor (please)',
    AGN: 'Otra vez (again)',
    UR: 'Tu / tus (your)',
    RST: 'Reporte: legibilidad, intensidad y tono',
    ES: 'Y (and)',
    OM: 'Colega radioaficionado (old man)',
    YL: 'Colega radioaficionada (young lady)',
    FB: 'Excelente (fine business)',
    GM: 'Buenos días (good morning)',
    GE: 'Buenas tardes (good evening)',
    HI: 'Risa (ja, ja)',
    WX: 'El tiempo meteorológico',
    RIG: 'Equipo de radio',
    ANT: 'Antena',
    EL: 'Artículo «el»', LA: 'Artículo «la»', EN: 'Preposición «en»',
    SI: 'Afirmación', NO: 'Negación', HOLA: 'Saludo', CASA: 'Vivienda',
    AGUA: 'Líquido vital', SOL: 'Estrella del sistema solar', MAR: 'Masa de agua salada',
    PAZ: 'Ausencia de conflicto',
    // Prosignos
    '<AR>': 'Fin de mensaje',
    '<SK>': 'Fin de contacto (QSO)',
    '<BT>': 'Separador / pausa (también «=»)',
    '<KN>': 'Adelante, solo la estación invitada',
    '<AS>': 'Espere',
    '<SOS>': 'Socorro (emergencia)',
    '<HH>': 'Error, corrijo',
    '<KA>': 'Atención / inicio de mensaje',
    // Códigos Q
    QTH: 'Mi ubicación es… / ¿Cuál es tu ubicación?',
    QRZ: '¿Quién me llama?',
    QSL: 'Acuse de recibo / confirmado',
    QSO: 'Contacto entre estaciones',
    QRM: 'Interferencia de otras estaciones',
    QRN: 'Ruido atmosférico (estática)',
    QRS: 'Transmite más despacio',
    QRQ: 'Transmite más rápido',
    QSB: 'Tu señal tiene desvanecimiento',
    QSY: 'Cambia de frecuencia',
    QRT: 'Dejo de transmitir',
    QRL: '¿Está ocupada la frecuencia?',
    QRP: 'Baja potencia',
    // QSO
    'CQ CQ DE EA4XYZ K': 'Llamada general de EA4XYZ',
    'EA4XYZ DE EA1ABC K': 'EA1ABC responde a la llamada',
    'GM OM TNX FER CALL': 'Saludo y agradecimiento por la llamada',
    'UR RST 599 599': 'Reporte de señal',
    'NAME JUAN QTH MADRID': 'Nombre y ubicación',
    'TNX QSO 73 <SK>': 'Despedida y fin de contacto'
  };

  const DEF = [
    {
      id: 'letras', title: 'Letras', icon: '🔤', desc: 'El alfabeto completo, de dos en dos.',
      subs: [
        { title: 'Primeros pasos', groups: [['E', 'T'], ['A', 'N'], ['I', 'M']] },
        { title: 'Cogiendo ritmo', groups: [['S', 'O'], ['U', 'R'], ['W', 'D']] },
        { title: 'Más letras', groups: [['K', 'G'], ['H', 'V'], ['F', 'L']] },
        { title: 'Casi todas', groups: [['P', 'J'], ['B', 'X'], ['C', 'Y']] },
        { title: 'Las últimas', groups: [['Z', 'Q'], ['Ñ']] }
      ]
    },
    {
      id: 'numeros', title: 'Números', icon: '🔢', desc: 'Del 0 al 9.',
      subs: [
        { title: 'Del 1 al 5', groups: [['1', '2'], ['3', '4'], ['5']] },
        { title: 'Del 6 al 0', groups: [['6', '7'], ['8', '9'], ['0']] }
      ]
    },
    {
      id: 'puntuacion', title: 'Puntuación', icon: '❓', desc: 'Signos más usados.',
      subs: [
        { title: 'Básicos', groups: [['.', ','], ['?', '/'], ['=']] },
        { title: 'Otros signos', groups: [['-', "'"], ['(', ')'], ['@', ':']] }
      ]
    },
    {
      id: 'palabras', title: 'Palabras y abreviaturas', icon: '💬', desc: 'Escucha palabras completas y la jerga CW.',
      subs: [
        { title: 'Palabras cortas', groups: [['EL', 'LA'], ['EN', 'DE'], ['SI', 'NO']] },
        { title: 'Palabras comunes', groups: [['HOLA', 'CASA'], ['AGUA', 'SOL'], ['MAR', 'PAZ']] },
        { title: 'Abreviaturas CW', groups: [['CQ', '73'], ['TNX', 'PSE', 'AGN'], ['UR', 'RST', 'ES'], ['OM', 'YL', 'FB'], ['GM', 'GE', 'HI'], ['WX', 'RIG', 'ANT']] }
      ]
    },
    {
      id: 'prosignos', title: 'Prosignos', icon: '📡', desc: 'Señales de procedimiento.',
      subs: [
        { title: 'Prosignos', groups: [['<AR>', '<SK>'], ['<BT>', '<KN>'], ['<AS>', '<SOS>'], ['<HH>', '<KA>']] }
      ]
    },
    {
      id: 'qcodes', title: 'Códigos Q y QSO', icon: '📻', desc: 'Códigos Q y un contacto completo.',
      subs: [
        { title: 'Códigos Q (I)', groups: [['QTH', 'QRZ'], ['QSL', 'QSO'], ['QRM', 'QRN']] },
        { title: 'Códigos Q (II)', groups: [['QRS', 'QRQ'], ['QSB', 'QSY'], ['QRT', 'QRL', 'QRP']] },
        {
          title: 'QSO básico',
          groups: [
            ['CQ CQ DE EA4XYZ K', 'EA4XYZ DE EA1ABC K'],
            ['GM OM TNX FER CALL', 'UR RST 599 599'],
            ['NAME JUAN QTH MADRID', 'TNX QSO 73 <SK>']
          ]
        }
      ]
    }
  ];

  const ITEMS = {};
  function item(text) {
    if (!ITEMS[text]) {
      ITEMS[text] = { id: text, text, morse: M.encode(text), meaning: MEANINGS[text] || '' };
    }
    return ITEMS[text];
  }

  function build() {
    const sections = [];
    const lessons = [];
    for (const sd of DEF) {
      const section = { id: sd.id, title: sd.title, icon: sd.icon, desc: sd.desc, subs: [], items: [] };
      const learned = [];
      sd.subs.forEach((sub, si) => {
        const s = { id: `${sd.id}-${si + 1}`, title: sub.title, lessons: [], items: [] };
        sub.groups.forEach((g, gi) => {
          const newItems = g.map(item);
          learned.push(...newItems);
          s.items.push(...newItems);
          s.lessons.push({
            id: `${s.id}-${gi + 1}`, type: 'learn', section: sd.id,
            title: newItems.map(label).join(' · '), newItems, pool: learned.slice()
          });
        });
        s.lessons.push({
          id: `${s.id}-r`, type: 'review', section: sd.id,
          title: `Repaso: ${sub.title}`, items: s.items.slice(), pool: learned.slice()
        });
        section.subs.push(s);
        section.items.push(...s.items);
      });
      section.challenge = {
        id: `${sd.id}-c`, type: 'challenge', section: sd.id,
        title: `Desafío: ${sd.title}`, items: section.items.slice(), pool: section.items.slice()
      };
      for (const s of section.subs) lessons.push(...s.lessons);
      lessons.push(section.challenge);
      sections.push(section);
    }
    lessons.forEach((l, i) => { l.index = i; });
    return { sections, lessons, items: ITEMS };
  }

  function label(it) {
    return it.text;
  }

  // ------------------------------------------------------------ Ejercicios

  function shuffle(arr, rng) {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }

  function pick(arr, rng) {
    return arr[Math.floor(rng() * arr.length)];
  }

  function symbolCount(it) {
    return it.morse.split(/\s+/).filter((p) => p !== '/').length;
  }

  // Envío solo para elementos de una palabra y pocos símbolos.
  function canSend(it) {
    return !/\s/.test(it.text) && symbolCount(it) <= 4;
  }

  function canRead(it) {
    return symbolCount(it) <= 3;
  }

  function options(it, pool, rng, n = 4) {
    const others = shuffle(pool.filter((p) => p !== it), rng).slice(0, n - 1);
    return shuffle([it, ...others], rng);
  }

  function exercise(type, it, pool, rng) {
    const ex = { type, item: it };
    if (type === 'listen-choose' || type === 'read-choose') ex.options = options(it, pool, rng);
    return ex;
  }

  function drillTypes(it, opts) {
    const t = ['listen-choose', 'listen-type'];
    if (canRead(it)) t.push('read-choose');
    if (opts.send && canSend(it)) t.push('send');
    return t;
  }

  function randomDrill(it, pool, opts, rng) {
    return exercise(pick(drillTypes(it, opts), rng), it, pool, rng);
  }

  // opts: { send: bool, rng: () => number }
  function makeExercises(lesson, opts) {
    const rng = opts.rng || Math.random;
    const pool = lesson.pool;

    if (lesson.type === 'learn') {
      const intros = lesson.newItems.map((it) => ({ type: 'intro', item: it }));
      const drills = [];
      for (const it of lesson.newItems) {
        for (const t of drillTypes(it, opts)) drills.push(exercise(t, it, pool, rng));
        drills.push(exercise('listen-choose', it, pool, rng));
      }
      const extra = Math.min(4, pool.length);
      for (let i = 0; i < extra; i++) drills.push(randomDrill(pick(pool, rng), pool, opts, rng));
      return intros.concat(shuffle(drills, rng));
    }

    const count = lesson.type === 'challenge' ? 20 : 15;
    const drills = [];
    for (let i = 0; i < count; i++) {
      // En los repasos, dos tercios de los ejercicios son de la subsección.
      const src = lesson.type === 'review' && rng() < 0.33 ? pool : lesson.items;
      drills.push(randomDrill(pick(src, rng), pool, opts, rng));
    }
    return drills;
  }

  // Compara respuestas escritas: sin tildes, sin < >, espacios normalizados.
  function sameText(a, b) {
    const n = (s) => M.normalize(s).replace(/[<>]/g, '').replace(/\s+/g, ' ').trim();
    return n(a) === n(b);
  }

  function stars(correct, total) {
    if (!total) return 0;
    const p = correct / total;
    if (p >= 1) return 3;
    if (p >= 0.9) return 2;
    if (p >= 0.8) return 1;
    return 0;
  }

  const api = { build, makeExercises, sameText, stars, canSend, shuffle, MEANINGS };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.Course = api;
})(typeof window !== 'undefined' ? window : globalThis);
