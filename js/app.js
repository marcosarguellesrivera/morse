// Interfaz de la aplicación: curso, práctica, traductor, tabla y ajustes.
(function () {
  'use strict';

  const { Morse, Course } = window;
  const COURSE = Course.build();
  const player = new Morse.Player();
  const torch = new Morse.Torch();

  // ------------------------------------------------------------ Estado

  const DEFAULTS = {
    v: 3, wpm: 18, eff: 10, freq: 700, volume: 0.85, wave: 'clear', sendWpm: 12,
    vibrate: false, unlockAll: false, theme: 'midnight', modeFilter: 'both',
    // Salidas activas al reproducir: sonido, vibración, destello de pantalla y linterna.
    out: { sound: true, vibrate: false, flash: false, torch: false }
  };
  const STORE_KEY = 'morse-completo.v1';

  function load() {
    let raw = {};
    try { raw = JSON.parse(localStorage.getItem(STORE_KEY)) || {}; } catch (e) { /* sin almacenamiento */ }
    const saved = raw.settings || {};
    const settings = Object.assign({}, DEFAULTS, saved);
    settings.out = Object.assign({}, DEFAULTS.out, saved.out, { torch: false });
    // Los ajustes de la primera versión tenían un tono más bajo y suave.
    if (raw.settings && !saved.v) {
      settings.v = DEFAULTS.v;
      if (saved.freq === 650) settings.freq = DEFAULTS.freq;
      settings.volume = Math.max(settings.volume, DEFAULTS.volume);
    }
    // La versión 3 parte de un envío más rápido; el temporizador se adapta después.
    if (raw.settings && (saved.v || 1) < 3) {
      settings.v = DEFAULTS.v;
      if (saved.sendWpm === 8 || saved.sendWpm === undefined) settings.sendWpm = DEFAULTS.sendWpm;
    }
    return { settings, progress: raw.progress || {}, streak: raw.streak || null };
  }

  const store = load();
  const S = store.settings;

  function save() {
    try { localStorage.setItem(STORE_KEY, JSON.stringify(store)); } catch (e) { /* sin almacenamiento */ }
  }

  const state = { route: 'course', run: null, practiceTab: 'receive', cleanup: [], sel: undefined };

  // ------------------------------------------------------------ Utilidades DOM

  function h(tag, props, ...kids) {
    const el = document.createElement(tag);
    for (const [k, v] of Object.entries(props || {})) {
      if (v === false || v == null) continue;
      if (k.startsWith('on')) el.addEventListener(k.slice(2).toLowerCase(), v);
      else if (k === 'class') el.className = v;
      else if (k === 'value') el.value = v;
      else if (k === 'checked') el.checked = v;
      else el.setAttribute(k, v === true ? '' : v);
    }
    for (const c of kids.flat(Infinity)) {
      if (c == null || c === false) continue;
      el.append(c.nodeType ? c : document.createTextNode(c));
    }
    return el;
  }

  function patternEl(morse, cls) {
    const wrap = h('span', { class: 'pattern ' + (cls || ''), 'aria-label': morse });
    // Cada letra en su propio bloque para que nunca se parta al saltar de línea.
    morse.split(/\s+/).forEach((tok, i) => {
      if (i > 0) wrap.append(h('span', { class: tok === '/' ? 'gap-word' : 'gap' }));
      if (tok === '/') return;
      wrap.append(h('span', { class: 'letter' }, [...tok].map((el) => h('span', { class: el === '-' ? 'dash' : 'dot' }))));
    });
    return wrap;
  }

  function toast(msg) {
    const t = h('div', { class: 'toast', role: 'status' }, msg);
    document.body.append(t);
    setTimeout(() => t.remove(), 3500);
  }

  // ------------------------------------------------------------ Salidas

  const flashEl = h('div', { class: 'flash-overlay', 'aria-hidden': 'true' });
  document.body.append(flashEl);

  // Enciende o apaga a la vez la pantalla y la linterna, según las salidas activas.
  function light(on) {
    flashEl.classList.toggle('on', on && S.out.flash);
    if (S.out.torch) torch.set(on);
  }

  function playOpts(extra) {
    return Object.assign({
      wpm: S.wpm, eff: S.eff, freq: S.freq, volume: S.volume, wave: S.wave,
      sound: S.out.sound, vibrate: S.out.vibrate,
      onSegment: S.out.flash || S.out.torch ? light : null
    }, extra);
  }

  function playMorse(morse, extra) {
    return player.play(morse, playOpts(extra));
  }

  // Iconos de trazo (24×24), dibujados para esta app.
  const ICONS = {
    close: '<path d="M6 6l12 12M18 6L6 18"/>',
    play: '<path d="M8 5.5v13l10.5-6.5z" fill="currentColor"/>',
    eye: '<path d="M2 12s3.6-6.5 10-6.5S22 12 22 12s-3.6 6.5-10 6.5S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>',
    eyeOff: '<path d="M2 12s3.6-6.5 10-6.5S22 12 22 12s-3.6 6.5-10 6.5S2 12 2 12z"/><circle cx="12" cy="12" r="3"/><path d="M3 3l18 18"/>',
    gear: '<circle cx="12" cy="12" r="8.2" stroke-width="3.6" stroke-dasharray="3.2 3.24" stroke-linecap="butt"/><circle cx="12" cy="12" r="5.6" stroke-width="3.4"/>',
    vibrate: '<rect x="8" y="4" width="8" height="16" rx="1.5"/><path d="M4.5 8v8M2 10v4M19.5 8v8M22 10v4"/>',
    screen: '<rect x="3" y="4" width="18" height="12" rx="1.5"/><path d="M12 16v4M8 20h8"/>',
    sound: '<path d="M4 9.5h3.5L12 5.5v13l-4.5-4H4z" fill="currentColor"/><path d="M15.5 9a4 4 0 010 6M18 6.5a7.5 7.5 0 010 11"/>',
    torch: '<path d="M7 3h10l-2 6v12h-6V9z"/><path d="M12 13v2"/>',
    down: '<path d="M6 9l6 6 6-6"/>',
    up: '<path d="M6 15l6-6 6 6"/>',
    flame: '<path d="M12 2.5c1 3.5 5.5 6 5.5 11a5.5 5.5 0 01-11 0c0-2.6 1.4-4.2 2.6-5.5.2 1.8.9 2.9 2 3.4C11 9 10.8 5.5 12 2.5z" fill="currentColor"/>',
    menu: '<path d="M7 8h10M7 12h10M7 16h10"/>',
    dish: '<path d="M4.5 7.5a10 10 0 0012 12z" fill="currentColor"/><path d="M10.5 13.5l5-5"/><circle cx="16.5" cy="7.5" r="1.6" fill="currentColor"/><path d="M8 19.5l-2.5 2h7"/>',
    tower: '<path d="M12 8.5L7.5 21.5M12 8.5l4.5 13M9.2 16.5h5.6M8.3 19.2h7.4"/><circle cx="12" cy="7" r="1.7" fill="currentColor"/><path d="M8.6 4a5 5 0 000 6M15.4 4a5 5 0 010 6M5.8 2.5a8.5 8.5 0 000 9M18.2 2.5a8.5 8.5 0 010 9"/>',
    crown: '<path d="M3.5 8l4.5 4.5L12 5.5l4 7L20.5 8 19 17.5H5z" fill="currentColor"/><path d="M5 21h14"/>',
    book: '<path d="M2.5 5.5c3-1.2 6.2-1 9.5 1v13c-3.3-1.8-6.5-2-9.5-1z" fill="currentColor"/><path d="M21.5 5.5c-3-1.2-6.2-1-9.5 1v13c3.3-1.8 6.5-2 9.5-1z"/><path d="M14.5 9.5h4.5M14.5 12.5h4.5M14.5 15.5h4.5"/>',
    lock: '<rect x="5" y="11" width="14" height="10" rx="2" fill="currentColor"/><path d="M8 11V8a4 4 0 018 0v3"/>',
    heart: '<path d="M12 20.5S3 15 3 8.8A4.6 4.6 0 0112 7a4.6 4.6 0 019 1.8C21 15 12 20.5 12 20.5z" fill="currentColor"/>'
  };

  function icon(name, cls) {
    const el = h('span', { class: 'ico ' + (cls || ''), 'aria-hidden': 'true' });
    el.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${ICONS[name]}</svg>`;
    return el;
  }

  const OUTPUTS = [
    ['vibrate', 'vibrate', 'Vibración'],
    ['flash', 'screen', 'Destello de pantalla'],
    ['sound', 'sound', 'Sonido'],
    ['torch', 'torch', 'Linterna']
  ];

  function setOutput(key, on, btn) {
    if (key === 'vibrate' && on && !navigator.vibrate) {
      return toast('Este navegador no permite vibrar (en iPhone no está disponible).');
    }
    if (key === 'torch' && on) {
      btn.classList.add('busy');
      torch.enable().then(() => {
        S.out.torch = true;
        btn.classList.remove('busy');
        btn.setAttribute('aria-pressed', 'true');
        toast('Linterna activada');
      }, (err) => {
        btn.classList.remove('busy');
        toast(err && err.name === 'NotAllowedError'
          ? 'Permite el acceso a la cámara para usar la linterna.'
          : 'Este dispositivo o navegador no permite controlar la linterna. Prueba con Chrome en Android.');
      });
      return;
    }
    if (key === 'torch' && !on) torch.release();
    S.out[key] = on;
    if (key !== 'torch') save();
    btn.setAttribute('aria-pressed', String(on));
  }

  function outputButtons() {
    return OUTPUTS.map(([key, ico, label]) => h('button', {
      class: 'tool', title: label, 'aria-label': label, 'aria-pressed': String(!!S.out[key]),
      onclick: (e) => setOutput(key, !S.out[key], e.currentTarget)
    }, icon(ico)));
  }

  // Barra para activar o desactivar las salidas fuera de las lecciones.
  function outputsBar() {
    return h('div', { class: 'outputs', role: 'group', 'aria-label': 'Salidas' }, outputButtons());
  }

  function onCleanup(fn) {
    state.cleanup.push(fn);
  }

  // ------------------------------------------------------------ Progreso

  const MODE_NAME = { receive: 'RECEPCIÓN', send: 'ENVÍO' };
  const MODE_LABEL = { receive: 'Recepción', send: 'Envío' };
  const MODE_ICON = { receive: 'dish', send: 'tower' };
  const FILTERS = [['both', 'Recepción y envío'], ['receive', 'Solo recepción'], ['send', 'Solo envío']];

  function visibleModes() {
    return S.modeFilter === 'receive' || S.modeFilter === 'send' ? [S.modeFilter] : Course.MODES;
  }

  // Mejor porcentaje obtenido en una sesión (undefined si nunca se hizo).
  function best(lesson, mode) {
    return store.progress[`${lesson.id}:${mode}`];
  }

  function done(lesson, mode) {
    return best(lesson, mode) >= Course.PASS;
  }

  function passed(lesson) {
    return Course.MODES.some((m) => done(lesson, m));
  }

  // Recepción y envío avanzan por separado: cada sesión se abre al superar
  // la anterior en ese mismo modo.
  function unlocked(lesson, mode) {
    if (S.unlockAll || lesson.index === 0) return true;
    return done(COURSE.lessons[lesson.index - 1], mode) || done(lesson, mode);
  }

  function learnedItems() {
    const seen = new Set();
    const out = [];
    for (const l of COURSE.lessons) {
      if (!passed(l) || l.type !== 'learn') continue;
      for (const it of l.newItems) if (!seen.has(it)) { seen.add(it); out.push(it); }
    }
    return out;
  }

  // Racha de días seguidos completando al menos una sesión.
  function dayKey(d) {
    d = d || new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }

  function daysBetween(a, b) {
    return Math.round((Date.parse(b) - Date.parse(a)) / 864e5);
  }

  function dayStreak() {
    const st = store.streak;
    if (!st || !st.last) return 0;
    return daysBetween(st.last, dayKey()) <= 1 ? st.count : 0;
  }

  function bumpStreak() {
    const t = dayKey();
    const st = store.streak || { count: 0 };
    if (st.last === t) return;
    st.count = st.last && daysBetween(st.last, t) === 1 ? st.count + 1 : 1;
    st.last = t;
    store.streak = st;
    save();
  }

  // ------------------------------------------------------------ Navegación

  const view = document.getElementById('view');
  const nav = document.getElementById('nav');

  function go(route) {
    state.route = route;
    render();
  }

  function applyTheme() {
    document.documentElement.dataset.theme = S.theme;
    const meta = document.querySelector('meta[name=theme-color]');
    if (meta) meta.content = getComputedStyle(document.documentElement).getPropertyValue('--bg').trim();
  }

  function render() {
    player.stop();
    light(false);
    state.cleanup.forEach((fn) => fn());
    state.cleanup = [];
    view.replaceChildren();
    // La cámara solo se mantiene abierta en las pantallas que reproducen.
    if (!['lesson', 'practice', 'utils'].includes(state.route) && torch.ready) {
      torch.release();
      S.out.torch = false;
    }
    const full = state.route === 'lesson' || state.route === 'sections';
    document.body.classList.toggle('in-lesson', full);
    const tab = state.route === 'sections' ? 'course' : state.route;
    for (const b of nav.querySelectorAll('button')) b.classList.toggle('active', b.dataset.route === tab);
    const r = {
      course: renderCourse, sections: renderSections, lesson: renderLesson, practice: renderPractice,
      utils: renderUtils, settings: renderSettings
    }[state.route];
    r();
    if (state.route !== 'course') window.scrollTo(0, 0);
  }

  nav.addEventListener('click', (e) => {
    const b = e.target.closest('button[data-route]');
    if (b) go(b.dataset.route);
  });

  // ------------------------------------------------------------ Lecciones

  function currentSub() {
    const all = COURSE.sections.flatMap((s) => s.subs);
    if (state.subId) return all.find((s) => s.id === state.subId);
    const first = COURSE.lessons.find((l) => visibleModes().some((m) => !done(l, m)));
    return first ? first.sub : all[all.length - 1];
  }

  // Icono de estado de un modo en la tarjeta: hecho, siguiente, pendiente o bloqueado.
  function statusIcon(lesson, mode, next) {
    if (done(lesson, mode)) return icon(MODE_ICON[mode], 'st done');
    if (!unlocked(lesson, mode)) return icon('lock', 'st locked');
    if (next === lesson) return h('span', { class: 'st dot' });
    return icon(MODE_ICON[mode], 'st open');
  }

  function lessonCard(lesson, nextOf) {
    const selected = state.sel === lesson.id;
    const modes = visibleModes();
    const sub = lesson.type === 'learn'
      ? h('div', { class: 'lc-chars' }, lesson.subtitle)
      : icon(lesson.type === 'review' ? 'book' : 'crown', 'lc-ico ' + lesson.type);
    return h('div', {
      class: 'lcard' + (selected ? ' selected' : ''), id: `l-${lesson.id}`,
      onclick: (e) => {
        if (e.target.closest('.lc-modes')) return;
        state.sel = selected ? null : lesson.id;
        renderCourseKeep();
      }
    },
      h('div', { class: 'lc-top' },
        h('span', { class: 'lc-left' }, modes.includes('receive') && statusIcon(lesson, 'receive', nextOf.receive)),
        h('div', { class: 'lc-mid' }, h('div', { class: 'lc-title' }, lesson.title), sub),
        h('span', { class: 'lc-right' }, modes.includes('send') && statusIcon(lesson, 'send', nextOf.send))),
      selected && h('div', { class: 'lc-modes' }, modes.map((m) => {
        const open = unlocked(lesson, m);
        return h('button', {
          class: 'lc-mode' + (open ? '' : ' locked'), disabled: !open,
          onclick: () => startLesson(lesson, m)
        }, icon(MODE_ICON[m]), MODE_LABEL[m]);
      })));
  }

  // Volver a dibujar la lista sin perder la posición de desplazamiento.
  function renderCourseKeep() {
    const y = window.scrollY;
    render();
    window.scrollTo(0, y);
  }

  function renderCourse() {
    const sub = currentSub();
    const ls = sub.lessons;
    const count = (m) => ls.filter((l) => done(l, m)).length;
    const ch = ls.filter((l) => l.type === 'challenge');
    const nextOf = {};
    for (const m of Course.MODES) nextOf[m] = COURSE.lessons.find((l) => !done(l, m) && unlocked(l, m));
    if (state.sel === undefined) {
      const n = nextOf[visibleModes()[0]];
      state.sel = n && n.sub === sub ? n.id : null;
    }
    const streak = dayStreak();
    view.append(
      h('header', { class: 'home-head' },
        h('button', { class: 'circle-btn', 'aria-label': 'Todas las secciones', onclick: () => go('sections') }, icon('menu')),
        h('div', { class: 'home-titles' },
          h('div', { class: 'home-sec' }, `Sección ${sub.section.num}`),
          h('h1', {}, sub.title)),
        h('button', { class: 'circle-btn', 'aria-label': 'Ayuda', onclick: helpSheet }, h('span', { class: 'q' }, '?'))),
      h('div', { class: 'home-stats' },
        h('span', {}, icon('dish', 'y'), `${count('receive')}/${ls.length}`),
        h('span', {}, icon('crown', 'y'), `${ch.filter(passed).length}/${ch.length}`),
        h('span', {}, icon('tower', 'y'), `${count('send')}/${ls.length}`)),
      h('div', { class: 'home-streak' }, icon('flame', 'fl'),
        streak ? `Racha de ${streak} ${streak === 1 ? 'día' : 'días'}` : 'Empieza hoy tu racha'),
      h('div', { class: 'lcards' }, ls.map((l) => lessonCard(l, nextOf))));
    const subs = COURSE.sections.flatMap((s) => s.subs);
    const nextSub = subs[subs.indexOf(sub) + 1];
    if (nextSub) {
      view.append(h('button', {
        class: 'btn ghost next-sub', onclick: () => { state.subId = nextSub.id; state.sel = undefined; render(); }
      }, `Siguiente: ${nextSub.title} →`));
    }
    const sel = state.sel && document.getElementById(`l-${state.sel}`);
    if (sel && !state.scrolled) {
      state.scrolled = true;
      requestAnimationFrame(() => sel.scrollIntoView({ block: 'center' }));
    }
  }

  function helpSheet() {
    const close = () => sheet.remove();
    const sheet = h('div', { class: 'sheet-back', onclick: (e) => { if (e.target === sheet) close(); } },
      h('div', { class: 'sheet' },
        h('h2', {}, 'Cómo funciona'),
        h('p', {}, h('strong', {}, 'Lecciones'), ': aprendes caracteres nuevos de dos en dos.'),
        h('p', {}, h('strong', {}, 'Repasos'), ': practicas todo lo aprendido en la subsección.'),
        h('p', {}, h('strong', {}, 'Desafíos'), `: ${Course.TOTAL.challenge} preguntas y ${Course.LIVES} vidas.`),
        h('p', {}, 'Cada sesión se hace en ', h('strong', {}, 'recepción'), ' (escuchar e identificar) y en ',
          h('strong', {}, 'envío'), ' (transmitir con la tecla). Los dos modos avanzan por separado y se superan con un ',
          `${Course.PASS} % de aciertos.`),
        h('button', { class: 'btn primary', onclick: close }, 'Entendido')));
    document.body.append(sheet);
    onCleanup(close);
  }

  function renderSections() {
    const cur = currentSub();
    const filterIdx = Math.max(0, FILTERS.findIndex(([v]) => v === (S.modeFilter || 'both')));
    view.append(
      h('header', { class: 'sec-head' },
        h('button', { class: 'close-btn', 'aria-label': 'Cerrar', onclick: () => go('course') }, icon('close')),
        h('h1', {}, 'Todas las secciones')),
      h('div', { class: 'filter-wrap' },
        h('button', {
          class: 'filter', onclick: () => {
            S.modeFilter = FILTERS[(filterIdx + 1) % FILTERS.length][0];
            save();
            render();
          }
        }, h('span', { class: 'muted' }, 'Modo: '), FILTERS[filterIdx][1])),
      h('div', { class: 'sec-list' }, COURSE.sections.map((sec) => {
        const open = state.openSec === sec.id || (!state.openSec && sec === cur.section);
        return h('div', { class: 'sec-card' + (open ? ' open' : '') },
          h('button', {
            class: 'sec-main', onclick: () => { state.openSec = open ? '-' : sec.id; render(); }
          },
            sec === cur.section && h('span', { class: 'st dot' }),
            h('div', { class: 'home-sec' }, `Sección ${sec.num}`),
            h('div', { class: 'sec-title' }, sec.title)),
          open && h('div', { class: 'sec-subs' }, sec.subs.map((s) => {
            const n = s.lessons.filter(passed).length;
            return h('button', {
              class: 'sec-sub' + (s === cur ? ' cur' : ''),
              onclick: () => { state.subId = s.id; state.sel = undefined; state.scrolled = false; go('course'); }
            }, h('span', {}, s.title), h('span', { class: 'muted' }, `${n}/${s.lessons.length}`));
          })));
      })));
  }

  // ------------------------------------------------------------ Sesión

  // Tiempo que se muestra la respuesta antes de pasar a la siguiente.
  const REVEAL_MS = 1500;

  // El cronómetro de envío recuerda la velocidad aprendida entre preguntas.
  let sendTimer = null;

  function startLesson(lesson, mode) {
    state.run = {
      lesson, mode,
      next: Course.questions(lesson),
      intro: lesson.type === 'learn' && mode === 'receive' && !done(lesson, mode) ? lesson.newItems.slice() : [],
      correct: 0, answered: 0, streak: 0,
      lives: lesson.lives,
      finished: false
    };
    state.sel = lesson.id;
    state.subId = lesson.sub.id;
    if (!sendTimer || sendTimer.base !== 1200 / S.sendWpm) sendTimer = new Morse.AdaptiveTimer(1200 / S.sendWpm);
    go('lesson');
  }

  function lessonHeader(run, hearts) {
    const L = run.lesson;
    return h('header', { class: 'lesson-head' },
      h('button', { class: 'close-btn', 'aria-label': 'Salir', onclick: () => go('course') }, icon('close')),
      h('div', { class: 'lesson-titles' },
        h('div', { class: 'lesson-sub' }, `${L.subTitle} | ${L.title}`),
        h('div', { class: 'lesson-mode' }, MODE_NAME[run.mode])),
      hearts || h('span', { class: 'head-spacer' }));
  }

  function renderLesson() {
    const run = state.run;
    if (!run) return go('course');
    if (run.finished) return renderResult(run);
    const L = run.lesson;

    const hearts = run.lives !== null && h('div', { class: 'hearts' });
    const drawHearts = () => {
      if (!hearts) return;
      hearts.replaceChildren(...Array.from({ length: Course.LIVES }, (_, i) => icon('heart', i < run.lives ? 'on' : '')));
    };
    drawHearts();
    // Franja: aciertos/respondidas, barra de preguntas respondidas y racha.
    const count = h('span', { class: 'count' });
    const fill = h('div', {});
    const streak = h('span', { class: 'streak' });
    const drawStrip = () => {
      count.textContent = `${run.correct}/${run.answered}`;
      fill.style.width = `${Math.min(1, run.answered / L.total) * 100}%`;
      streak.replaceChildren(icon('flame'), String(run.streak));
      streak.classList.toggle('hot', run.streak > 0);
    };
    drawStrip();

    const prompt = h('p', { class: 'card-prompt' });
    const big = h('div', { class: 'card-big' });
    const pat = h('div', { class: 'card-pattern' });
    const eyeBtn = h('button', { class: 'round-btn', 'aria-label': 'Mostrar código' });
    const playBtn = h('button', { class: 'round-btn active', 'aria-label': 'Reproducir' }, icon('play'));
    const card = h('div', { class: 'qcard' }, prompt, big, pat, h('div', { class: 'card-actions' }, eyeBtn, playBtn));

    const tools = h('div', { class: 'toolbar' },
      h('button', { class: 'tool', 'aria-label': 'Ajustes rápidos', onclick: quickSettings }, icon('gear')),
      outputButtons(),
      h('button', {
        class: 'tool', 'aria-label': 'Plegar barra', onclick: (e) => {
          const c = tools.classList.toggle('collapsed');
          e.currentTarget.replaceChildren(icon(c ? 'up' : 'down'));
        }
      }, icon('down')));

    const answers = h('div', { class: 'answers' });

    view.append(h('div', { class: 'lesson' },
      lessonHeader(run, hearts),
      h('div', { class: 'strip' }, count, h('div', { class: 'ybar' }, fill), streak),
      h('div', { class: 'stage' }, card),
      tools,
      answers));

    let q = null;
    let busy = false;
    const timers = [];
    const later = (fn, ms) => timers.push(setTimeout(fn, ms));
    onCleanup(() => timers.forEach(clearTimeout));

    const showPattern = (morse, cls) => pat.replaceChildren(patternEl(morse, cls || ''));
    const setEye = (active, off) => {
      eyeBtn.replaceChildren(icon(off ? 'eyeOff' : 'eye'));
      eyeBtn.classList.toggle('active', active);
      eyeBtn.disabled = !active;
    };
    const play = () => q && playMorse(q.item.morse);
    playBtn.onclick = play;
    const sizeBig = (text) => big.classList.toggle('long', text.length > 3);

    // Presentación de los caracteres nuevos (solo la primera vez).
    const intro = () => {
      const it = run.intro.shift();
      card.className = 'qcard';
      prompt.textContent = 'Nuevo carácter';
      big.textContent = it.text;
      sizeBig(it.text);
      showPattern(it.morse);
      setEye(false);
      q = { item: it };
      answers.className = 'answers single';
      answers.replaceChildren(h('button', { class: 'answer', onclick: () => (run.intro.length ? intro() : ask()) }, 'Continuar'));
      later(play, 250);
    };

    const finish = () => {
      run.finished = true;
      render();
    };

    // Registra la respuesta, muestra la solución y pasa a la siguiente.
    const resolve = (ok, sent) => {
      busy = true;
      run.answered++;
      if (ok) {
        run.correct++;
        run.streak++;
      } else {
        run.streak = 0;
        if (run.lives !== null) run.lives--;
      }
      drawStrip();
      drawHearts();
      big.textContent = q.item.text;
      sizeBig(q.item.text);
      big.classList.add('reveal');
      if (run.mode === 'send') {
        card.classList.add(ok ? 'ok' : 'bad');
        if (!ok) pat.replaceChildren(sent ? patternEl(sent, 'bad') : '', patternEl(q.item.morse, 'ok'));
      }
      if (S.vibrate && navigator.vibrate) navigator.vibrate(ok ? 30 : [60, 60, 60]);
      if (!ok) playMorse(q.item.morse);
      const end = run.answered >= L.total || run.lives === 0;
      later(end ? finish : ask, REVEAL_MS);
    };

    const ask = () => {
      busy = false;
      q = run.next();
      card.className = 'qcard';
      big.classList.remove('reveal');
      pat.replaceChildren();
      if (run.mode === 'receive') askReceive();
      else askSend();
    };

    const markChoice = (btn, ok, right) => {
      btn.classList.add(ok ? 'right' : 'wrong');
      if (!ok && right) right.classList.add('right');
    };

    const askReceive = () => {
      const word = q.item.text.length > 1 && !q.item.text.startsWith('<');
      prompt.textContent = word ? 'Identifica la palabra' : 'Identifica el carácter';
      big.textContent = '?';
      big.classList.remove('long');
      setEye(true);
      eyeBtn.onclick = () => { showPattern(q.item.morse, 'muted-pattern'); setEye(false); };
      if (L.kb) {
        // Teclado completo: solo están activas las teclas ya aprendidas.
        const learned = new Set(L.items.map((i) => i.text));
        const keys = {};
        answers.className = 'answers kb';
        answers.replaceChildren(...L.kb.map((row) => h('div', { class: 'kb-row' }, [...row].map((c) => {
          const on = learned.has(c);
          keys[c] = h('button', {
            class: 'key', disabled: !on,
            onclick: (e) => {
              if (busy) return;
              const ok = c === q.item.text;
              markChoice(e.currentTarget, ok, keys[q.item.text]);
              resolve(ok);
            }
          }, c);
          return keys[c];
        }))));
      } else {
        const long = q.options.some((o) => o.text.length > 4);
        const btns = q.options.map((o) => h('button', {
          class: 'answer',
          onclick: (e) => {
            if (busy) return;
            const ok = o === q.item;
            markChoice(e.currentTarget, ok, btns[q.options.indexOf(q.item)]);
            resolve(ok);
          }
        }, o.text));
        answers.className = `answers n${q.options.length}${long ? ' long' : ''}`;
        answers.replaceChildren(...btns);
      }
      later(play, 300);
    };

    const askSend = () => {
      prompt.textContent = 'Enviar señal';
      big.textContent = q.item.text;
      sizeBig(q.item.text);
      const judge = new Morse.SendJudge(q.item.morse);
      let hinted = false;
      let idle = null;
      const sentEl = h('div', { class: 'sent' });
      // Pulso en curso: crece mientras se mantiene pulsado y pasa a raya al
      // superar el umbral, para ver lo que se envía antes de soltar.
      let pulse = null;
      let raf = 0;
      const startPulse = () => {
        const m = judge.morse();
        const row = m ? patternEl(m, 'live') : h('span', { class: 'pattern live' });
        // Mismo carácter: el pulso se añade a la última letra; si no, empieza una nueva.
        const letter = judge.current ? row.lastElementChild : h('span', { class: 'letter' });
        if (!judge.current) {
          if (m) row.append(h('span', { class: 'gap' }));
          row.append(letter);
        }
        pulse = h('span', { class: 'dot pulse' });
        letter.append(pulse);
        (hinted ? sentEl : pat).replaceChildren(row);
        const t0 = performance.now();
        const tick = () => {
          const ms = performance.now() - t0;
          const th = sendTimer.threshold;
          pulse.style.width = `${15 + 31 * Math.min(1, ms / th)}px`;
          pulse.className = ms >= th ? 'dash pulse' : 'dot pulse';
          raf = requestAnimationFrame(tick);
        };
        tick();
      };
      const stopPulse = () => {
        cancelAnimationFrame(raf);
        pulse = null;
      };
      onCleanup(stopPulse);
      const draw = (st) => {
        const m = judge.morse();
        if (!hinted || st) pat.replaceChildren(m ? patternEl(m, st || 'live') : '');
        else pat.replaceChildren(patternEl(q.item.morse, 'muted-pattern'), sentEl);
        if (hinted && !st) sentEl.replaceChildren(m ? patternEl(m, 'live') : '');
      };
      setEye(true, true);
      eyeBtn.onclick = () => { hinted = true; setEye(false); draw(); };
      const pad = h('button', { class: 'pad', 'aria-label': 'Manipulador' }, 'Toca y mantén para enviar');
      answers.className = 'answers single';
      answers.replaceChildren(pad);
      bindKey(pad, {
        enabled: () => !busy,
        down: () => { clearTimeout(idle); startPulse(); },
        up: (ms) => {
          stopPulse();
          const st = judge.feed(sendTimer.classify(ms));
          if (st === 'progress') {
            draw();
            // Si se deja a medias, cuenta como fallo.
            idle = setTimeout(() => { if (!busy) resolve(false, judge.morse()); }, Math.max(1500, 7 * sendTimer.dot));
            timers.push(idle);
          } else if (st === 'ok') {
            draw('ok');
            resolve(true);
          } else {
            resolve(false, judge.morse());
          }
        }
      });
    };

    if (run.intro.length) intro();
    else ask();
  }

  // Ajustes rápidos dentro de la sesión.
  function quickSettings() {
    const slider = (key, label, min, max, step, fmt) => {
      const out = h('span', { class: 'val' }, fmt(S[key]));
      return h('label', { class: 'field' }, h('span', { class: 'row between' }, label, out),
        h('input', {
          type: 'range', min, max, step, value: S[key],
          oninput: (e) => {
            S[key] = +e.target.value;
            if (key === 'wpm' && S.eff > S.wpm) S.eff = S.wpm;
            if (key === 'eff' && S.eff > S.wpm) S.wpm = S.eff;
            out.textContent = fmt(S[key]);
            save();
          }
        }));
    };
    const close = () => sheet.remove();
    const sheet = h('div', { class: 'sheet-back', onclick: (e) => { if (e.target === sheet) close(); } },
      h('div', { class: 'sheet' },
        h('h2', {}, 'Ajustes'),
        slider('wpm', 'Velocidad de caracteres', 5, 60, 1, (v) => `${v} ppm`),
        slider('eff', 'Velocidad efectiva', 3, 60, 1, (v) => `${v} ppm`),
        slider('freq', 'Tono', 300, 1200, 10, (v) => `${v} Hz`),
        slider('volume', 'Volumen', 0.05, 1, 0.05, (v) => `${Math.round(v * 100)} %`),
        h('button', { class: 'btn primary', onclick: close }, 'Listo')));
    document.body.append(sheet);
    onCleanup(close);
  }

  function resultMessage(pct, outOfLives) {
    if (outOfLives) return 'Te has quedado sin vidas. Repasa y vuelve a intentarlo.';
    if (pct === 100) return '¡Perfecto! Lo tienes dominado.';
    if (pct >= 90) return 'Buen trabajo. Repetirla te ayudará a afianzarlo.';
    if (pct >= Course.PASS) return 'Superada. Un poco más de práctica y saldrá solo.';
    return `Necesitas un ${Course.PASS} % para superarla. ¡Inténtalo otra vez!`;
  }

  // Anillo de progreso con el porcentaje de aciertos.
  function ring(pct) {
    const r = 54;
    const c = 2 * Math.PI * r;
    const el = h('div', { class: 'ring' });
    el.innerHTML = `<svg viewBox="0 0 128 128"><circle cx="64" cy="64" r="${r}" class="ring-track"/>` +
      `<circle cx="64" cy="64" r="${r}" class="ring-fill" stroke-dasharray="${(c * pct) / 100} ${c}" transform="rotate(-90 64 64)"/></svg>`;
    return el;
  }

  function renderResult(run) {
    const L = run.lesson;
    const outOfLives = run.lives === 0;
    const pct = Course.percent(run.correct, run.answered);
    const ok = Course.passed(run.correct, run.answered, outOfLives);
    if (!run.saved) {
      run.saved = true;
      const key = `${L.id}:${run.mode}`;
      const score = outOfLives ? Math.min(pct, Course.PASS - 1) : pct;
      if (!(store.progress[key] >= score)) store.progress[key] = score;
      save();
      bumpStreak();
    }
    const next = COURSE.lessons[L.index + 1];
    view.append(h('div', { class: 'lesson result-screen' },
      lessonHeader(run),
      h('div', { class: 'result-body' },
        h('h2', {}, outOfLives ? 'Desafío no superado' : 'Sesión completada'),
        h('div', { class: 'ring-wrap' }, ring(pct),
          h('div', { class: 'ring-text' },
            h('strong', {}, `${pct}%`),
            h('span', {}, `${run.correct} / ${run.answered} Correctas`))),
        h('p', { class: 'result-msg' }, resultMessage(pct, outOfLives))),
      h('div', { class: 'result-actions' },
        h('button', { class: 'answer', onclick: () => startLesson(L, run.mode) }, 'Reintentar'),
        h('button', {
          class: 'answer primary', onclick: () => {
            state.sel = ok && next ? next.id : L.id;
            if (ok && next) state.subId = next.sub.id;
            state.scrolled = false;
            go('course');
          }
        }, 'Continuar'))));
  }

  // Conecta un botón como manipulador: tono y salidas mientras está pulsado,
  // y avisa con la duración de cada pulsación. También con la barra espaciadora.
  function bindKey(pad, opts) {
    let downAt = null;
    const down = (e) => {
      if (e) e.preventDefault();
      if (downAt !== null || (opts.enabled && !opts.enabled())) return;
      downAt = performance.now();
      pad.classList.add('down');
      if (S.out.sound) player.toneOn(S.freq, S.volume, S.wave);
      if (S.out.vibrate && navigator.vibrate) navigator.vibrate(10000);
      light(true);
      if (opts.down) opts.down();
    };
    const up = (e) => {
      if (e) e.preventDefault();
      if (downAt === null) return;
      const ms = performance.now() - downAt;
      downAt = null;
      pad.classList.remove('down');
      player.toneOff();
      if (S.out.vibrate && navigator.vibrate) navigator.vibrate(0);
      light(false);
      opts.up(ms);
    };
    pad.addEventListener('pointerdown', (e) => { pad.setPointerCapture(e.pointerId); down(e); });
    pad.addEventListener('pointerup', up);
    pad.addEventListener('pointercancel', up);
    pad.addEventListener('contextmenu', (e) => e.preventDefault());
    const kd = (e) => {
      if (e.code !== 'Space' || e.repeat || e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
      down(e);
    };
    const ku = (e) => { if (e.code === 'Space') up(e); };
    document.addEventListener('keydown', kd);
    document.addEventListener('keyup', ku);
    onCleanup(() => {
      document.removeEventListener('keydown', kd);
      document.removeEventListener('keyup', ku);
      player.toneOff();
      light(false);
    });
  }

  // ------------------------------------------------------------ Manipulador

  function makeKey(opts) {
    const live = h('div', { class: 'key-live' });
    const text = h('div', { class: 'key-text' });
    const keyer = new Morse.Keyer({
      unitMs: 1200 / S.sendWpm,
      onChange: (st) => {
        live.replaceChildren(st.morse ? patternEl(st.morse) : h('span', { class: 'muted' }, 'Pulsa la tecla'));
        text.textContent = st.text;
        if (opts.onChange) opts.onChange(st);
      },
      onIdle: opts.onIdle
    });
    const pad = h('button', { class: 'pad', 'aria-label': 'Manipulador' }, 'Toca y mantén para enviar');
    bindKey(pad, {
      down: () => keyer.down(performance.now()),
      up: () => keyer.up(performance.now())
    });
    onCleanup(() => keyer.reset());
    const el = h('div', { class: 'keyer' },
      live, text, pad,
      h('div', { class: 'row' },
        h('button', { class: 'btn ghost small', onclick: () => keyer.reset() }, 'Borrar'),
        h('span', { class: 'muted small' }, 'Se adapta a tu velocidad · también con la barra espaciadora')));
    keyer.emit();
    return { el, keyer };
  }

  // ------------------------------------------------------------ Práctica

  const SOURCES = [{ id: 'learned', title: 'Lo aprendido en el curso' }]
    .concat(COURSE.sections.map((s) => ({ id: s.id, title: s.title })));

  function sourceItems(id) {
    if (id === 'learned') {
      const l = learnedItems();
      return l.length ? l : COURSE.sections[0].items.slice(0, 4);
    }
    return COURSE.sections.find((s) => s.id === id).items;
  }

  function renderPractice() {
    const tabs = h('div', { class: 'tabs' },
      [['receive', 'Recepción'], ['groups', 'Grupos'], ['send', 'Envío libre']].map(([id, t]) =>
        h('button', {
          class: state.practiceTab === id ? 'active' : '',
          onclick: () => { state.practiceTab = id; render(); }
        }, t)));
    view.append(h('div', { class: 'title-row' }, h('h1', {}, 'Práctica'), outputsBar()), tabs);
    const card = h('section', { class: 'card' });
    view.append(card);
    ({ receive: practiceReceive, groups: practiceGroups, send: practiceSend })[state.practiceTab](card);
  }

  function sourceSelect(onchange) {
    state.practiceSource = state.practiceSource || 'learned';
    return h('label', { class: 'field' }, 'Contenido',
      h('select', { onchange: (e) => { state.practiceSource = e.target.value; onchange(); } },
        SOURCES.map((s) => h('option', { value: s.id, selected: s.id === state.practiceSource }, s.title))));
  }

  function practiceReceive(card) {
    const stats = { ok: 0, total: 0 };
    let current = null;
    const statEl = h('p', { class: 'muted' });
    const fb = h('div', { class: 'feedback-inline' });
    const input = h('input', {
      class: 'answer-input', type: 'text', autocomplete: 'off', autocapitalize: 'characters',
      spellcheck: 'false', placeholder: 'Escribe lo que oyes',
      onkeydown: (e) => { if (e.key === 'Enter') check(); }
    });
    const updateStats = () => {
      statEl.textContent = `Aciertos: ${stats.ok} / ${stats.total}` +
        (stats.total ? ` (${Math.round((stats.ok / stats.total) * 100)} %)` : '');
    };
    const nextItem = () => {
      const items = sourceItems(state.practiceSource);
      let it;
      do { it = items[Math.floor(Math.random() * items.length)]; } while (items.length > 1 && it === current);
      current = it;
      input.value = '';
      fb.replaceChildren();
      input.focus();
      playMorse(current.morse);
    };
    const check = () => {
      if (!current) return nextItem();
      if (!input.value.trim()) return;
      const ok = Course.sameText(input.value, current.text);
      stats.total++;
      if (ok) stats.ok++;
      updateStats();
      fb.className = 'feedback-inline ' + (ok ? 'ok' : 'bad');
      fb.replaceChildren(ok ? '✔ ' : '✘ ', h('strong', {}, current.text), ' ', patternEl(current.morse));
      current = null;
      if (ok) setTimeout(() => { if (!current && document.body.contains(input)) nextItem(); }, 900);
    };
    updateStats();
    card.append(
      h('p', {}, 'Escucha un elemento al azar y escríbelo. Pulsa Intro para comprobar.'),
      sourceSelect(() => { current = null; }),
      h('div', { class: 'row center' },
        h('button', { class: 'play-btn big', 'aria-label': 'Reproducir', onclick: () => (current ? playMorse(current.morse) : nextItem()) }, '▶')),
      input,
      h('div', { class: 'row' },
        h('button', { class: 'btn primary', onclick: check }, 'Comprobar'),
        h('button', { class: 'btn', onclick: nextItem }, 'Siguiente')),
      fb, statEl);
  }

  function practiceGroups(card) {
    state.groupCount = state.groupCount || 5;
    const out = h('div', {});
    const input = h('textarea', {
      class: 'answer-input', rows: 3, autocomplete: 'off', autocapitalize: 'characters',
      spellcheck: 'false', placeholder: 'Copia aquí los grupos'
    });
    let text = '';
    const generate = () => {
      const chars = sourceItems(state.practiceSource).filter((i) => i.text.length === 1).map((i) => i.text);
      const pool = chars.length ? chars : ['E', 'T', 'A', 'N'];
      const groups = [];
      for (let g = 0; g < state.groupCount; g++) {
        let w = '';
        for (let c = 0; c < 5; c++) w += pool[Math.floor(Math.random() * pool.length)];
        groups.push(w);
      }
      text = groups.join(' ');
      input.value = '';
      out.replaceChildren();
      playMorse(Morse.encode(text));
    };
    const check = () => {
      if (!text) return;
      const want = text.replace(/\s/g, '');
      const got = Morse.normalize(input.value).replace(/\s/g, '');
      let ok = 0;
      const marks = [...want].map((c, i) => {
        const hit = got[i] === c;
        if (hit) ok++;
        return h('span', { class: hit ? 'hit' : 'miss' }, c);
      });
      const spaced = [];
      marks.forEach((m, i) => { if (i && i % 5 === 0) spaced.push(' '); spaced.push(m); });
      out.replaceChildren(
        h('p', { class: 'groups' }, spaced),
        h('p', {}, `${ok} de ${want.length} caracteres correctos (${Math.round((ok / want.length) * 100)} %)`));
    };
    card.append(
      h('p', {}, 'Copia grupos de 5 caracteres aleatorios, como en el método Koch. Solo se usan caracteres sueltos.'),
      sourceSelect(() => {}),
      h('label', { class: 'field' }, 'Número de grupos',
        h('input', { type: 'number', min: 1, max: 20, value: state.groupCount, onchange: (e) => { state.groupCount = Math.max(1, Math.min(20, +e.target.value || 5)); } })),
      h('div', { class: 'row' },
        h('button', { class: 'btn primary', onclick: generate }, 'Nuevos grupos'),
        h('button', { class: 'btn', onclick: () => text && playMorse(Morse.encode(text)) }, 'Repetir'),
        h('button', { class: 'btn ghost', onclick: () => player.stop() }, 'Parar')),
      input,
      h('button', { class: 'btn primary', onclick: check }, 'Corregir'),
      out);
  }

  function practiceSend(card) {
    const key = makeKey({});
    card.append(
      h('p', {}, 'Transmite libremente: el texto se decodifica al momento. Una pausa larga separa palabras.'),
      key.el);
  }

  // ------------------------------------------------------------ Traductor

  function renderTranslator() {
    const output = h('div', { class: 'translation' });
    let morse = '';
    const input = h('textarea', {
      class: 'answer-input', rows: 4, placeholder: 'Escribe texto o código Morse (. - /)',
      value: state.translatorText || '',
      oninput: () => update()
    });
    const update = () => {
      const v = input.value;
      state.translatorText = v;
      output.replaceChildren();
      if (!v.trim()) { morse = ''; return; }
      if (Morse.isMorse(v)) {
        morse = Morse.cleanMorse(v).trim().replace(/\s*[/|]\s*/g, ' / ');
        output.append(h('div', { class: 'out-text' }, Morse.decode(morse)));
      } else {
        morse = Morse.encode(v);
        output.append(h('div', { class: 'out-morse' }, morse), patternEl(morse));
      }
    };
    const playBtn = h('button', {
      class: 'btn primary', onclick: () => {
        if (player.playing) return player.stop();
        if (!morse) return;
        if (!S.out.sound && !S.out.vibrate && !S.out.flash && !S.out.torch) {
          return toast('Activa al menos una salida: sonido, vibración, pantalla o linterna.');
        }
        playBtn.textContent = '⏹ Parar';
        playMorse(morse).then(() => { playBtn.textContent = '▶ Reproducir'; });
      }
    }, '▶ Reproducir');
    view.append(
      h('section', { class: 'card' },
        input,
        output,
        h('p', { class: 'muted small' }, 'Elige cómo transmitir:'),
        outputsBar(),
        h('div', { class: 'row' },
          playBtn,
          h('button', {
            class: 'btn ghost', onclick: (e) => {
              const btn = e.currentTarget;
              const txt = Morse.isMorse(input.value) ? Morse.decode(morse) : morse;
              if (txt && navigator.clipboard) navigator.clipboard.writeText(txt).then(() => { btn.textContent = '✔ Copiado'; });
            }
          }, '📋 Copiar')),
        h('p', { class: 'muted small' }, 'Los prosignos se escriben entre < >, por ejemplo <SK> o <AR>. La linterna funciona en Chrome para Android; en iPhone no está disponible.')));
    update();
  }

  // ------------------------------------------------------------ Utilidades

  function renderUtils() {
    state.utilTab = state.utilTab || 'translator';
    view.append(
      h('h1', {}, 'Utilidades'),
      h('div', { class: 'tabs' }, [['translator', 'Traductor'], ['table', 'Tabla']].map(([id, t]) =>
        h('button', {
          class: state.utilTab === id ? 'active' : '',
          onclick: () => { state.utilTab = id; render(); }
        }, t))));
    (state.utilTab === 'translator' ? renderTranslator : renderTable)();
  }

  // ------------------------------------------------------------ Tabla

  function renderTable() {
    const groups = [
      ['Letras', 'ABCDEFGHIJKLMNÑOPQRSTUVWXYZ'.split('')],
      ['Números', '1234567890'.split('')],
      ['Puntuación', Object.keys(Morse.CHARS).filter((c) => !/[A-ZÑ0-9]/.test(c))],
      ['Prosignos', Object.keys(Morse.PROSIGNS).map((p) => `<${p}>`)]
    ];
    for (const [title, chars] of groups) {
      view.append(h('section', { class: 'card' },
        h('h2', {}, title),
        h('div', { class: 'grid' }, chars.map((c) => {
          const m = Morse.encode(c);
          return h('button', {
            class: 'cell', title: Course.MEANINGS[c] || '',
            onclick: (e) => {
              const cell = e.currentTarget;
              cell.classList.add('playing');
              playMorse(m, { sound: true, vibrate: false, onSegment: null }).then(() => cell.classList.remove('playing'));
            }
          }, h('span', { class: 'cell-char' }, c.replace(/[<>]/g, '')), patternEl(m));
        }))));
    }
    const glossary = (title, keys) => h('section', { class: 'card' },
      h('h2', {}, title),
      h('dl', { class: 'glossary' }, keys.map((k) => [
        h('dt', {}, h('button', { class: 'link', onclick: () => playMorse(Morse.encode(k), { sound: true, vibrate: false, onSegment: null }) }, k.replace(/[<>]/g, ''))),
        h('dd', {}, Course.MEANINGS[k])
      ])));
    const items = Object.keys(Course.MEANINGS);
    view.append(
      glossary('Prosignos', items.filter((k) => k.startsWith('<'))),
      glossary('Códigos Q', items.filter((k) => /^Q[A-Z]{2}$/.test(k))),
      glossary('Abreviaturas CW', ['CQ', 'DE', '73', 'TNX', 'PSE', 'AGN', 'UR', 'RST', 'ES', 'OM', 'YL', 'FB', 'GM', 'GE', 'HI', 'WX', 'RIG', 'ANT']));
  }

  // ------------------------------------------------------------ Ajustes

  function renderSettings() {
    const refs = {};
    const sync = () => {
      for (const [k, r] of Object.entries(refs)) {
        r.input.value = S[k];
        r.out.textContent = r.fmt(S[k]);
      }
    };
    const slider = (key, label, min, max, step, fmt) => {
      const out = h('span', { class: 'val' }, fmt(S[key]));
      const input = h('input', {
        type: 'range', min, max, step, value: S[key],
        oninput: (e) => {
          S[key] = +e.target.value;
          // La velocidad efectiva nunca supera la de caracteres.
          if (key === 'wpm' && S.eff > S.wpm) S.eff = S.wpm;
          if (key === 'eff' && S.eff > S.wpm) S.wpm = S.eff;
          save();
          sync();
        }
      });
      refs[key] = { input, out, fmt };
      return h('label', { class: 'field' }, h('span', { class: 'row between' }, label, out), input);
    };
    const toggle = (key, label, desc) => h('label', { class: 'toggle' },
      h('input', { type: 'checkbox', checked: S[key], onchange: (e) => { S[key] = e.target.checked; save(); } }),
      h('span', {}, h('strong', {}, label), desc && h('small', { class: 'muted' }, desc)));
    const choice = (key, label, opts, after) => h('label', { class: 'field' }, label,
      h('select', {
        onchange: (e) => { S[key] = e.target.value; save(); if (after) after(); }
      }, opts.map(([v, t]) => h('option', { value: v, selected: S[key] === v }, t))));
    view.append(
      h('h1', {}, 'Ajustes'),
      h('section', { class: 'card' },
        h('h2', {}, 'Apariencia'),
        choice('theme', 'Tema', [['midnight', 'Medianoche'], ['slate', 'Pizarra']], applyTheme)),
      h('section', { class: 'card' },
        h('h2', {}, 'Sonido'),
        choice('wave', 'Timbre', [['clear', 'Nítido (recomendado en móvil)'], ['sine', 'Suave (onda pura)']]),
        slider('wpm', 'Velocidad de caracteres', 5, 60, 1, (v) => `${v} ppm`),
        slider('eff', 'Velocidad efectiva (Farnsworth)', 3, 60, 1, (v) => `${v} ppm`),
        h('p', { class: 'muted small' }, 'Aprender con caracteres rápidos y más espacio entre ellos ayuda a reconocer el sonido de cada letra en vez de contar puntos y rayas.'),
        slider('freq', 'Tono', 300, 1200, 10, (v) => `${v} Hz`),
        slider('volume', 'Volumen', 0.05, 1, 0.05, (v) => `${Math.round(v * 100)} %`),
        h('button', { class: 'btn', onclick: () => playMorse(Morse.encode('PARIS')) }, '▶ Probar con «PARIS»'),
        h('p', { class: 'muted small' }, 'En iPhone, el interruptor de silencio también silencia la app.')),
      h('section', { class: 'card' },
        h('h2', {}, 'Salidas'),
        h('p', { class: 'muted small' }, 'Cómo se transmite el Morse. También puedes cambiarlas durante una lección con los botones de arriba.'),
        outputsBar(),
        h('p', { class: 'muted small' }, '🔊 sonido · 📳 vibración · ⚡ destello de pantalla · 🔦 linterna (pide permiso de cámara; solo en Android)')),
      h('section', { class: 'card' },
        h('h2', {}, 'Envío'),
        slider('sendWpm', 'Velocidad de envío inicial', 4, 40, 1, (v) => `${v} ppm`),
        h('p', { class: 'muted small' }, 'Punto de partida para distinguir puntos de rayas. Después la app se adapta sola a tu forma de manipular.')),
      h('section', { class: 'card' },
        h('h2', {}, 'Curso'),
        toggle('vibrate', 'Vibrar al responder', 'Una vibración corta al acertar y tres al fallar.'),
        toggle('unlockAll', 'Desbloquear todo', 'Acceder a cualquier lección sin completar las anteriores.'),
        h('button', {
          class: 'btn danger', onclick: () => {
            if (confirm('¿Borrar todo el progreso del curso?')) { store.progress = {}; save(); render(); }
          }
        }, 'Reiniciar progreso')),
      h('p', { class: 'muted small center' }, 'Código Morse Completo · libre y sin anuncios'));
  }

  // ------------------------------------------------------------ Inicio

  applyTheme();
  render();

  // Apagar la linterna si la app pasa a segundo plano.
  document.addEventListener('visibilitychange', () => {
    if (document.hidden && torch.ready) {
      player.stop();
      torch.release();
      S.out.torch = false;
      document.querySelectorAll('.out-btn[aria-label="Linterna"]').forEach((b) => b.setAttribute('aria-pressed', 'false'));
    }
  });

  if ('serviceWorker' in navigator && location.protocol !== 'file:') {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  }
})();
