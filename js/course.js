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
      id: 'letras', title: 'Alfabeto', icon: '🔤', desc: 'El alfabeto completo, de dos en dos.',
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

  // Preguntas necesarias (aciertos) para completar cada tipo de sesión.
  const GOAL = { learn: 10, review: 15, challenge: 20 };
  const LIVES = 3;
  const MODES = ['receive', 'send'];

  // Cada subsección: lecciones de dos en dos caracteres, un repaso y un
  // desafío con vidas. Todas se juegan en recepción y en envío.
  function build() {
    const sections = [];
    const lessons = [];
    for (const sd of DEF) {
      const section = { id: sd.id, title: sd.title, icon: sd.icon, desc: sd.desc, subs: [], items: [] };
      const learned = [];
      const num = { learn: 0, review: 0, challenge: 0 };
      sd.subs.forEach((sub, si) => {
        const s = { id: `${sd.id}-${si + 1}`, title: sub.title, lessons: [], items: [] };
        const add = (type, extra) => {
          num[type]++;
          const name = { learn: 'Lección', review: 'Repaso', challenge: 'Desafío' }[type];
          const l = Object.assign({
            id: `${s.id}-${type[0]}${num[type]}`, type, section: sd.id, sectionTitle: sd.title,
            num: num[type], title: `${name} ${num[type]}`, goal: GOAL[type]
          }, extra);
          s.lessons.push(l);
        };
        sub.groups.forEach((g) => {
          const newItems = g.map(item);
          learned.push(...newItems);
          s.items.push(...newItems);
          // Con un solo carácter nuevo se repasa junto al anterior.
          const choices = newItems.length > 1 ? newItems : learned.slice(-2);
          add('learn', { newItems, items: choices });
        });
        add('review', { items: s.items.slice() });
        add('challenge', { items: s.items.slice() });
        section.subs.push(s);
        section.items.push(...s.items);
      });
      for (const s of section.subs) lessons.push(...s.lessons);
      sections.push(section);
    }
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

  // Máximo de botones de respuesta en recepción.
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
      let options = pool;
      if (pool.length > MAX_OPTIONS) {
        options = [it, ...shuffle(pool.filter((p) => p !== it), rng).slice(0, MAX_OPTIONS - 1)];
      }
      return { item: it, options: shuffle(options, rng) };
    };
  }

  // Estrellas según la precisión: 3 sin fallos, 2 desde el 90 %, 1 al completar.
  function stars(correct, total, failed) {
    if (failed || !total) return 0;
    const p = correct / total;
    if (p >= 1) return 3;
    if (p >= 0.9) return 2;
    return 1;
  }

  // Compara respuestas escritas: sin tildes, sin < >, espacios normalizados.
  function sameText(a, b) {
    const n = (s) => M.normalize(s).replace(/[<>]/g, '').replace(/\s+/g, ' ').trim();
    return n(a) === n(b);
  }

  const api = { build, questions, sameText, stars, shuffle, GOAL, LIVES, MODES, MEANINGS };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.Course = api;
})(typeof window !== 'undefined' ? window : globalThis);
