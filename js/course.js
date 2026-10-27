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
    'TNX QSO 73 <SK>': 'Despedida y fin de contacto',
    'BUENOS DIAS': 'Saludo por la mañana', 'MUY BIEN': 'Respuesta positiva',
    'HASTA LUEGO': 'Despedida', 'POR FAVOR': 'Petición amable',
    'MUCHAS GRACIAS': 'Agradecimiento', 'DE NADA': 'Respuesta al agradecimiento'
  };

  // Secciones y subsecciones del curso. `kb` es el teclado de respuesta de
  // los repasos y desafíos cuando todos los elementos son caracteres sueltos.
  const DEF = [
    {
      id: 'caracteres', title: 'Caracteres',
      subs: [
        {
          id: 'alfabeto', title: 'Alfabeto', kb: ['QWERTYUIOP', 'ASDFGHJKLÑ', 'ZXCVBNM'],
          groups: [['E', 'T'], ['A', 'N'], ['I', 'M'], ['S', 'O'], ['U', 'R'], ['W', 'K'], ['G', 'H'],
            ['L', 'F'], ['D', 'B'], ['P', 'J'], ['C', 'Y'], ['X', 'Z'], ['V', 'Q', 'Ñ']]
        },
        {
          id: 'numeros', title: 'Números', kb: ['12345', '67890'],
          groups: [['1', '2'], ['3', '4'], ['5', '6'], ['7', '8'], ['9', '0']]
        },
        {
          id: 'puntuacion', title: 'Puntuación', kb: ['.,?/=', "-'@:"],
          groups: [['.', ','], ['?', '/'], ['=', '-'], ["'", '@'], [':']]
        }
      ]
    },
    {
      id: 'palabras', title: 'Palabras, frases y oraciones',
      subs: [
        { id: 'palabras', title: 'Palabras', groups: [['SI', 'NO'], ['EL', 'LA'], ['SOL', 'MAR'], ['CASA', 'AGUA'], ['HOLA', 'PAZ']] },
        { id: 'frases', title: 'Frases', groups: [['BUENOS DIAS', 'MUY BIEN'], ['HASTA LUEGO', 'POR FAVOR'], ['MUCHAS GRACIAS', 'DE NADA']] },
        { id: 'oraciones', title: 'Oraciones', groups: [['EL SOL BRILLA', 'HOY HACE FRIO'], ['ME GUSTA LA RADIO', 'ESTOY EN CASA']] }
      ]
    },
    {
      id: 'prosignos', title: 'Prosignos',
      subs: [{ id: 'prosignos', title: 'Prosignos', groups: [['<AR>', '<SK>'], ['<BT>', '<KN>'], ['<AS>', '<SOS>'], ['<HH>', '<KA>']] }]
    },
    {
      id: 'qcodes', title: 'Códigos Q',
      subs: [
        { id: 'q1', title: 'Códigos Q (I)', groups: [['QTH', 'QRZ'], ['QSL', 'QSO'], ['QRM', 'QRN']] },
        { id: 'q2', title: 'Códigos Q (II)', groups: [['QRS', 'QRQ'], ['QSB', 'QSY'], ['QRT', 'QRL', 'QRP']] }
      ]
    },
    {
      id: 'abreviaturas', title: 'Abreviaturas',
      subs: [{
        id: 'abreviaturas', title: 'Abreviaturas',
        groups: [['CQ', 'DE'], ['73', 'TNX'], ['PSE', 'AGN'], ['UR', 'RST'], ['ES', 'OM'], ['YL', 'FB'], ['GM', 'GE'], ['HI', 'WX'], ['RIG', 'ANT']]
      }]
    },
    {
      id: 'qso', title: 'Conceptos básicos del QSO en CW',
      subs: [{
        id: 'qso', title: 'QSO básico',
        groups: [
          ['CQ CQ DE EA4XYZ K', 'EA4XYZ DE EA1ABC K'],
          ['GM OM TNX FER CALL', 'UR RST 599 599'],
          ['NAME JUAN QTH MADRID', 'TNX QSO 73 <SK>']
        ]
      }]
    }
  ];

  const ITEMS = {};
  function item(text) {
    if (!ITEMS[text]) {
      ITEMS[text] = { id: text, text, morse: M.encode(text), meaning: MEANINGS[text] || '' };
    }
    return ITEMS[text];
  }

  // Preguntas por sesión y vidas de los desafíos.
  const TOTAL = { learn: 20, review: 25, challenge: 15 };
  const LIVES = 3;
  const MODES = ['receive', 'send'];
  // Porcentaje de aciertos necesario para superar una sesión.
  const PASS = 80;
  // Hay un desafío tras la lección 3 y después cada dos lecciones.
  const challengeAfter = (n, last) => last || (n >= 3 && n % 2 === 1);

  // Recorrido de cada subsección: Lección 1, Lección 2, Repaso, Lección 3,
  // Repaso, Desafío 1… Los repasos y desafíos usan todo lo aprendido en ella.
  function build() {
    const sections = [];
    const lessons = [];
    DEF.forEach((sd, si) => {
      const section = { id: sd.id, num: si + 1, title: sd.title, subs: [] };
      for (const sub of sd.subs) {
        const s = { id: sub.id, title: sub.title, section, lessons: [], items: [] };
        const num = { learn: 0, challenge: 0 };
        const add = (type, extra) => {
          const names = { learn: 'Lección', review: 'Repaso', challenge: 'Desafío' };
          let title = names[type];
          if (type !== 'review') title += ` ${++num[type]}`;
          const id = `${sub.id}-${s.lessons.length + 1}`;
          const pool = extra.items;
          // Teclado en repasos y desafíos si todos son caracteres sueltos.
          const kb = type !== 'learn' && sub.kb && pool.every((i) => i.text.length === 1) ? sub.kb : null;
          s.lessons.push(Object.assign({
            id, type, title, sub: s, subTitle: sub.title, section,
            total: TOTAL[type], lives: type === 'challenge' ? LIVES : null, kb
          }, extra));
        };
        sub.groups.forEach((g, gi) => {
          const newItems = g.map(item);
          s.items.push(...newItems);
          // Con un solo carácter nuevo se practica junto al anterior.
          const choices = newItems.length > 1 ? newItems : s.items.slice(-2);
          add('learn', { newItems, items: choices, subtitle: newItems.map((i) => i.text).join(' & ') });
          if (gi > 0) add('review', { items: s.items.slice() });
          const last = gi === sub.groups.length - 1;
          if (challengeAfter(gi + 1, last)) add('challenge', { items: s.items.slice() });
        });
        section.subs.push(s);
        lessons.push(...s.lessons);
      }
      sections.push(section);
    });
    lessons.forEach((l, i) => { l.index = i; });
    return { sections, lessons, items: ITEMS };
  }

  // ------------------------------------------------------------ Preguntas

  function shuffle(arr, rng) {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }

  // Máximo de botones de respuesta cuando no hay teclado.
  const MAX_OPTIONS = 4;

  // Devuelve una función que genera la siguiente pregunta de la sesión,
  // sin repetir el mismo elemento dos veces seguidas.
  function questions(lesson, rng) {
    rng = rng || Math.random;
    const pool = lesson.items;
    let last = null;
    return function next() {
      let it;
      do { it = pool[Math.floor(rng() * pool.length)]; } while (pool.length > 1 && it === last);
      last = it;
      if (lesson.kb) return { item: it, options: null };
      let options = pool;
      if (pool.length > MAX_OPTIONS) {
        options = [it, ...shuffle(pool.filter((p) => p !== it), rng).slice(0, MAX_OPTIONS - 1)];
      }
      return { item: it, options: shuffle(options, rng) };
    };
  }

  function percent(correct, total) {
    return total ? Math.round((correct / total) * 100) : 0;
  }

  // Una sesión se supera con el 80 % de aciertos, y sin agotar las vidas.
  function passed(correct, total, outOfLives) {
    return !outOfLives && percent(correct, total) >= PASS;
  }

  // Compara respuestas escritas: sin tildes, sin < >, espacios normalizados.
  function sameText(a, b) {
    const n = (s) => M.normalize(s).replace(/[<>]/g, '').replace(/\s+/g, ' ').trim();
    return n(a) === n(b);
  }

  const api = { build, questions, sameText, percent, passed, shuffle, TOTAL, LIVES, MODES, PASS, MEANINGS };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.Course = api;
})(typeof window !== 'undefined' ? window : globalThis);
