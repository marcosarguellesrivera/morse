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
    send: true, vibrate: false, unlockAll: false, theme: 'midnight',
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
    return { settings, progress: raw.progress || {} };
  }

  const store = load();
  const S = store.settings;

  function save() {
    try { localStorage.setItem(STORE_KEY, JSON.stringify(store)); } catch (e) { /* sin almacenamiento */ }
  }

  const state = { route: 'course', run: null, practiceTab: 'receive', cleanup: [] };

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

  function starsOf(lesson, mode) {
    return store.progress[`${lesson.id}:${mode}`] || 0;
  }

  function passed(lesson) {
    return Course.MODES.some((m) => starsOf(lesson, m) > 0);
  }

  function complete(lesson) {
    return Course.MODES.every((m) => starsOf(lesson, m) > 0);
  }

  // Una lección se abre al superar la anterior en cualquiera de los dos modos.
  function unlocked(lesson) {
    if (S.unlockAll || lesson.index === 0) return true;
    return passed(COURSE.lessons[lesson.index - 1]) || passed(lesson);
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
    if (!['lesson', 'practice', 'translator'].includes(state.route) && torch.ready) {
      torch.release();
      S.out.torch = false;
    }
    document.body.classList.toggle('in-lesson', state.route === 'lesson');
    for (const b of nav.querySelectorAll('button')) b.classList.toggle('active', b.dataset.route === state.route);
    const r = {
      course: renderCourse, lesson: renderLesson, practice: renderPractice,
      translator: renderTranslator, table: renderTable, settings: renderSettings
    }[state.route];
    r();
    if (state.route !== 'course') window.scrollTo(0, 0);
  }

  nav.addEventListener('click', (e) => {
    const b = e.target.closest('button[data-route]');
    if (b) go(b.dataset.route);
  });

  // ------------------------------------------------------------ Curso

  const TYPE_ICON = { learn: '📖', review: '🔁', challenge: '🏆' };

  function starsEl(n) {
    return h('span', { class: 'stars', 'aria-label': `${n} estrellas` },
      [1, 2, 3].map((i) => h('span', { class: i <= n ? 'on' : '' }, '★')));
  }

  // Contenido del círculo: los caracteres nuevos si son cortos, si no un icono.
  function nodeFace(lesson) {
    if (lesson.type === 'learn') {
      const txt = lesson.newItems.map((i) => i.text.replace(/[<>]/g, '')).join(' ');
      if (txt.length <= 5) return h('span', { class: 'node-chars' }, txt);
    }
    return TYPE_ICON[lesson.type];
  }

  // Desplazamiento horizontal en zigzag, como un camino.
  const PATH = [0, 1, 1.6, 1, 0, -1, -1.6, -1];

  function pathNode(lesson, pos, next) {
    const open = unlocked(lesson);
    const current = lesson === next;
    const cls = ['node', lesson.type, open ? 'open' : 'locked',
      complete(lesson) ? 'done' : passed(lesson) ? 'half' : '', current ? 'current' : ''].join(' ');
    return h('div', { class: 'node-wrap', style: `--x:${PATH[pos % PATH.length]}` },
      current && h('div', { class: 'bubble' }, passed(COURSE.lessons[0]) ? 'CONTINUAR' : 'EMPEZAR'),
      h('button', {
        class: cls, disabled: !open, 'aria-label': lesson.title,
        onclick: () => modeSheet(lesson)
      }, open ? nodeFace(lesson) : '🔒'),
      open && h('div', { class: 'mode-dots' },
        Course.MODES.map((m) => h('span', { class: starsOf(lesson, m) ? 'on' : '', title: MODE_NAME[m] }))),
      h('div', { class: 'node-title' }, lesson.title));
  }

  // Al tocar una lección se elige entre recepción y envío.
  function modeSheet(lesson) {
    const close = () => sheet.remove();
    const sheet = h('div', { class: 'sheet-back', onclick: (e) => { if (e.target === sheet) close(); } },
      h('div', { class: 'sheet', role: 'dialog', 'aria-label': lesson.title },
        h('p', { class: 'sheet-sub' }, lesson.sectionTitle),
        h('h2', {}, lesson.title),
        lesson.newItems && h('p', { class: 'muted' }, 'Caracteres: ', lesson.newItems.map((i) => i.text).join('  ')),
        lesson.type === 'challenge' && h('p', { class: 'muted' }, `${Course.LIVES} vidas · ${lesson.goal} aciertos para superarlo`),
        Course.MODES.map((m) => h('button', {
          class: 'mode-btn', onclick: () => { close(); startLesson(lesson, m); }
        }, h('span', {}, MODE_NAME[m]), starsEl(starsOf(lesson, m)))),
        h('button', { class: 'btn ghost', onclick: close }, 'Cancelar')));
    document.body.append(sheet);
    onCleanup(close);
  }

  function renderCourse() {
    const total = COURSE.lessons.length;
    const done = COURSE.lessons.filter(passed).length;
    const starTotal = COURSE.lessons.reduce((a, l) => a + starsOf(l, 'receive') + starsOf(l, 'send'), 0);
    const next = COURSE.lessons.find((l) => !passed(l) && unlocked(l));
    view.append(
      h('section', { class: 'stats' },
        h('div', {}, h('strong', {}, done), h('span', {}, 'lecciones')),
        h('div', {}, h('strong', {}, `★ ${starTotal}`), h('span', {}, 'estrellas')),
        h('div', {}, h('strong', {}, `${Math.round((done / total) * 100)} %`), h('span', {}, 'del curso'))));
    COURSE.sections.forEach((sec, si) => {
      const ls = sec.subs.flatMap((s) => s.lessons);
      const d = ls.filter(passed).length;
      let pos = 0;
      view.append(
        h('section', { class: `unit unit-${si % 6}`, id: `sec-${sec.id}` },
          h('header', { class: 'unit-banner' },
            h('div', {},
              h('small', {}, `SECCIÓN ${si + 1} · ${d}/${ls.length}`),
              h('h2', {}, sec.title),
              h('p', {}, sec.desc)),
            h('span', { class: 'unit-icon' }, sec.icon),
            h('div', { class: 'bar' }, h('div', { style: `width:${(d / ls.length) * 100}%` }))),
          sec.subs.map((sub) => [
            h('div', { class: 'divider' }, h('span', {}, sub.title)),
            h('div', { class: 'path' }, sub.lessons.map((l) => pathNode(l, pos++, next)))
          ])));
    });
    // Llevar a la vista la lección en curso.
    const cur = view.querySelector('.node.current');
    if (cur && done) requestAnimationFrame(() => cur.scrollIntoView({ block: 'center' }));
  }

  // ------------------------------------------------------------ Lección

  // El cronómetro de envío recuerda la velocidad aprendida entre preguntas.
  let sendTimer = null;

  function startLesson(lesson, mode) {
    state.run = {
      lesson, mode,
      next: Course.questions(lesson),
      intro: lesson.type === 'learn' ? lesson.newItems.slice() : [],
      correct: 0, answered: 0, streak: 0, best: 0,
      lives: lesson.type === 'challenge' ? Course.LIVES : null,
      finished: false
    };
    if (!sendTimer || sendTimer.base !== 1200 / S.sendWpm) sendTimer = new Morse.AdaptiveTimer(1200 / S.sendWpm);
    go('lesson');
  }

  function renderLesson() {
    const run = state.run;
    if (!run) return go('course');
    if (run.finished) return renderResult(run);
    const L = run.lesson;

    // Cabecera
    const hearts = run.lives !== null && h('div', { class: 'hearts' });
    const drawHearts = () => {
      if (!hearts) return;
      hearts.replaceChildren(...Array.from({ length: Course.LIVES }, (_, i) => icon('heart', i < run.lives ? 'on' : '')));
    };
    drawHearts();
    // Franja de progreso: aciertos/respondidas, barra hasta el objetivo y racha.
    const count = h('span', { class: 'count' });
    const fill = h('div', {});
    const streak = h('span', { class: 'streak' });
    const drawStrip = () => {
      count.textContent = `${run.correct}/${run.answered}`;
      fill.style.width = `${Math.min(1, run.correct / L.goal) * 100}%`;
      streak.replaceChildren(icon('flame'), String(run.streak));
      streak.classList.toggle('hot', run.streak > 0);
    };
    drawStrip();

    // Tarjeta central
    const prompt = h('p', { class: 'card-prompt' });
    const big = h('div', { class: 'card-big' });
    const pat = h('div', { class: 'card-pattern' });
    const eyeBtn = h('button', { class: 'round-btn', 'aria-label': 'Mostrar código' });
    const playBtn = h('button', { class: 'round-btn', 'aria-label': 'Reproducir' }, icon('play'));
    const card = h('div', { class: 'qcard' }, prompt, big, pat, h('div', { class: 'card-actions' }, eyeBtn, playBtn));

    // Barra de herramientas
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
      h('header', { class: 'lesson-head' },
        h('button', { class: 'close-btn', 'aria-label': 'Salir', onclick: () => go('course') }, icon('close')),
        h('div', { class: 'lesson-titles' },
          h('div', { class: 'lesson-sub' }, `${L.sectionTitle} | ${L.title}`),
          h('div', { class: 'lesson-mode' }, MODE_NAME[run.mode])),
        hearts || h('span', { class: 'head-spacer' })),
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

    // Presentación de los caracteres nuevos de la lección.
    const intro = () => {
      const it = run.intro.shift();
      card.className = 'qcard intro';
      prompt.textContent = 'Nuevo carácter';
      big.textContent = it.text;
      big.classList.toggle('long', it.text.length > 3);
      showPattern(it.morse);
      setEye(false);
      q = { item: it };
      playBtn.classList.add('active');
      answers.className = 'answers single';
      answers.replaceChildren(h('button', { class: 'answer', onclick: () => (run.intro.length ? intro() : ask()) }, 'Continuar'));
      later(play, 250);
    };

    const finish = () => {
      run.finished = true;
      render();
    };

    // Registra el resultado, actualiza contadores y pasa a la siguiente pregunta.
    const resolve = (ok, sent) => {
      busy = true;
      run.answered++;
      if (ok) {
        run.correct++;
        run.streak++;
        run.best = Math.max(run.best, run.streak);
      } else {
        run.streak = 0;
        if (run.lives !== null) run.lives--;
      }
      drawStrip();
      drawHearts();
      card.classList.add(ok ? 'ok' : 'bad');
      big.textContent = q.item.text;
      if (S.vibrate && navigator.vibrate) navigator.vibrate(ok ? 30 : [60, 60, 60]);
      const end = run.correct >= L.goal || run.lives === 0;
      if (ok) {
        later(end ? finish : ask, 650);
      } else {
        // Al fallar se muestra lo enviado (en rojo) y se oye la respuesta correcta.
        pat.replaceChildren(sent ? patternEl(sent, 'bad') : '', patternEl(q.item.morse, 'ok'));
        playMorse(q.item.morse).then(() => later(end ? finish : ask, 500));
      }
    };

    const ask = () => {
      busy = false;
      q = run.next();
      card.className = 'qcard';
      big.classList.toggle('long', q.item.text.length > 3);
      pat.replaceChildren();
      playBtn.classList.add('active');
      if (run.mode === 'receive') askReceive();
      else askSend();
    };

    const askReceive = () => {
      prompt.textContent = q.item.text.length > 1 && !q.item.text.startsWith('<') ? 'Identifica la palabra' : 'Identifica el carácter';
      big.textContent = '?';
      setEye(true);
      eyeBtn.onclick = () => { showPattern(q.item.morse, 'muted-pattern'); setEye(false); };
      const long = q.options.some((o) => o.text.length > 4);
      answers.className = `answers n${q.options.length}${long ? ' long' : ''}`;
      answers.replaceChildren(...q.options.map((o) => h('button', {
        class: 'answer',
        onclick: (e) => {
          if (busy) return;
          const ok = o === q.item;
          e.currentTarget.classList.add(ok ? 'right' : 'wrong');
          if (!ok) answers.querySelectorAll('.answer')[q.options.indexOf(q.item)].classList.add('right');
          resolve(ok);
        }
      }, o.text)));
      later(play, 300);
    };

    const askSend = () => {
      prompt.textContent = 'Enviar señal';
      big.textContent = q.item.text;
      const judge = new Morse.SendJudge(q.item.morse);
      let hinted = false;
      let idle = null;
      setEye(true, true);
      eyeBtn.onclick = () => { hinted = true; setEye(false); draw(); };
      const sentEl = h('div', { class: 'sent' });
      const draw = (state) => {
        const m = judge.morse();
        if (!hinted || state) pat.replaceChildren(m ? patternEl(m, state || 'live') : '');
        else pat.replaceChildren(patternEl(q.item.morse, 'muted-pattern'), sentEl);
        if (hinted && !state) sentEl.replaceChildren(m ? patternEl(m, 'live') : '');
      };
      const pad = h('button', { class: 'pad', 'aria-label': 'Manipulador' }, 'Toca y mantén para enviar');
      answers.className = 'answers single';
      answers.replaceChildren(pad);
      bindKey(pad, {
        enabled: () => !busy,
        down: () => clearTimeout(idle),
        up: (ms) => {
          const st = judge.feed(sendTimer.classify(ms));
          if (st === 'progress') {
            draw();
            // Si se deja a medias, cuenta como fallo.
            idle = setTimeout(() => {
              if (busy) return;
              resolve(false, judge.morse());
            }, Math.max(1500, 7 * sendTimer.dot));
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

  // Ajustes rápidos dentro de la lección.
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

  function renderResult(run) {
    const L = run.lesson;
    const failed = run.lives === 0;
    const st = Course.stars(run.correct, run.answered, failed);
    const pct = run.answered ? Math.round((run.correct / run.answered) * 100) : 0;
    if (!run.saved) {
      run.saved = true;
      const key = `${L.id}:${run.mode}`;
      if (st > (store.progress[key] || 0)) {
        store.progress[key] = st;
        save();
      }
    }
    const next = COURSE.lessons[L.index + 1];
    view.append(
      h('div', { class: 'result' },
        h('p', { class: 'lesson-sub' }, `${L.sectionTitle} | ${L.title}`),
        h('div', { class: 'lesson-mode' }, MODE_NAME[run.mode]),
        h('div', { class: 'result-icon' }, st ? '🎉' : '💔'),
        h('h2', {}, st ? (L.type === 'challenge' ? '¡Desafío superado!' : '¡Lección completada!') : 'Te has quedado sin vidas'),
        starsEl(st),
        h('div', { class: 'result-stats' },
          h('div', {}, h('strong', {}, `${pct} %`), h('span', {}, 'precisión')),
          h('div', {}, h('strong', {}, `${run.correct}/${run.answered}`), h('span', {}, 'aciertos')),
          h('div', {}, h('strong', {}, run.best), h('span', {}, 'mejor racha'))),
        st > 0 && next && unlocked(next) && h('button', { class: 'btn primary', onclick: () => startLesson(next, run.mode) }, 'Siguiente'),
        h('button', { class: 'btn' + (st ? '' : ' primary'), onclick: () => startLesson(L, run.mode) }, 'Repetir'),
        h('button', { class: 'btn ghost', onclick: () => go('course') }, 'Volver al curso')));
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
      h('h1', {}, 'Traductor'),
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

  // ------------------------------------------------------------ Tabla

  function renderTable() {
    const groups = [
      ['Letras', 'ABCDEFGHIJKLMNÑOPQRSTUVWXYZ'.split('')],
      ['Números', '1234567890'.split('')],
      ['Puntuación', Object.keys(Morse.CHARS).filter((c) => !/[A-ZÑ0-9]/.test(c))],
      ['Prosignos', Object.keys(Morse.PROSIGNS).map((p) => `<${p}>`)]
    ];
    view.append(h('h1', {}, 'Tabla de referencia'));
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
