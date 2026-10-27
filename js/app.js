// Interfaz de la aplicación: curso, práctica, traductor, tabla y ajustes.
(function () {
  'use strict';

  const { Morse, Course } = window;
  const COURSE = Course.build();
  const player = new Morse.Player();
  const torch = new Morse.Torch();

  // ------------------------------------------------------------ Estado

  const DEFAULTS = {
    v: 2, wpm: 18, eff: 10, freq: 700, volume: 0.85, wave: 'clear', sendWpm: 8,
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

  const OUTPUTS = [
    ['sound', '🔊', 'Sonido'],
    ['vibrate', '📳', 'Vibración'],
    ['flash', '⚡', 'Destello de pantalla'],
    ['torch', '🔦', 'Linterna']
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

  // Barra para activar o desactivar las salidas durante la sesión.
  function outputsBar() {
    return h('div', { class: 'outputs', role: 'group', 'aria-label': 'Salidas' },
      OUTPUTS.map(([key, icon, label]) => h('button', {
        class: 'out-btn', title: label, 'aria-label': label, 'aria-pressed': String(!!S.out[key]),
        onclick: (e) => setOutput(key, !S.out[key], e.currentTarget)
      }, icon)));
  }

  function onCleanup(fn) {
    state.cleanup.push(fn);
  }

  // ------------------------------------------------------------ Progreso

  function starsOf(lesson) {
    return store.progress[lesson.id] || 0;
  }

  function unlocked(lesson) {
    if (S.unlockAll || lesson.index === 0) return true;
    return starsOf(COURSE.lessons[lesson.index - 1]) > 0 || starsOf(lesson) > 0;
  }

  function doneCount() {
    return COURSE.lessons.filter((l) => starsOf(l) > 0).length;
  }

  function learnedItems() {
    const seen = new Set();
    const out = [];
    for (const l of COURSE.lessons) {
      if (!starsOf(l) || l.type !== 'learn') continue;
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
    const st = starsOf(lesson);
    const current = lesson === next;
    const cls = ['node', lesson.type, open ? 'open' : 'locked', st ? 'done' : '', current ? 'current' : ''].join(' ');
    return h('div', { class: 'node-wrap', style: `--x:${PATH[pos % PATH.length]}` },
      current && h('div', { class: 'bubble' }, starsOf(COURSE.lessons[0]) ? 'CONTINUAR' : 'EMPEZAR'),
      h('button', {
        class: cls, disabled: !open, 'aria-label': lesson.title,
        onclick: () => startLesson(lesson)
      }, open ? nodeFace(lesson) : '🔒'),
      st > 0 && starsEl(st),
      h('div', { class: 'node-title' }, lesson.title));
  }

  function renderCourse() {
    const total = COURSE.lessons.length;
    const done = doneCount();
    const starTotal = COURSE.lessons.reduce((a, l) => a + starsOf(l), 0);
    const next = COURSE.lessons.find((l) => !starsOf(l) && unlocked(l));
    view.append(
      h('section', { class: 'stats' },
        h('div', {}, h('strong', {}, done), h('span', {}, 'lecciones')),
        h('div', {}, h('strong', {}, `★ ${starTotal}`), h('span', {}, 'estrellas')),
        h('div', {}, h('strong', {}, `${Math.round((done / total) * 100)} %`), h('span', {}, 'del curso'))));
    COURSE.sections.forEach((sec, si) => {
      const ls = sec.subs.flatMap((s) => s.lessons).concat(sec.challenge);
      const d = ls.filter((l) => starsOf(l) > 0).length;
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
          ]),
          h('div', { class: 'path' }, pathNode(sec.challenge, 0, next))));
    });
    // Llevar a la vista la lección en curso.
    const cur = view.querySelector('.node.current');
    if (cur && done) requestAnimationFrame(() => cur.scrollIntoView({ block: 'center' }));
  }

  // ------------------------------------------------------------ Lección

  function startLesson(lesson) {
    state.run = {
      lesson,
      exs: Course.makeExercises(lesson, { send: S.send }),
      i: 0, correct: 0, scored: 0,
      lives: lesson.type === 'challenge' ? 3 : null,
      finished: false
    };
    go('lesson');
  }

  function renderLesson() {
    const run = state.run;
    if (!run) return go('course');
    const done = run.finished || run.i >= run.exs.length || run.lives === 0;
    view.append(
      h('div', { class: 'lesson-top' },
        h('button', { class: 'icon-btn', 'aria-label': 'Salir', onclick: () => go('course') }, '✕'),
        h('div', { class: 'bar' }, h('div', { style: `width:${(Math.min(run.i, run.exs.length) / run.exs.length) * 100}%` })),
        run.lives !== null && h('span', { class: 'lives' }, '❤'.repeat(run.lives) + '♡'.repeat(3 - run.lives))),
      !done && outputsBar()
    );
    if (done) return renderResult(run);
    const ex = run.exs[run.i];
    const body = h('div', { class: 'exercise' });
    view.append(body);
    ({
      intro: exIntro, 'listen-choose': exListenChoose, 'read-choose': exReadChoose,
      'listen-type': exListenType, send: exSend
    })[ex.type](ex, body);
  }

  function nextExercise() {
    state.run.i++;
    render();
  }

  // Registra la respuesta y muestra el panel de corrección.
  function answer(ex, body, ok, detail) {
    const run = state.run;
    if (body.dataset.answered) return;
    body.dataset.answered = '1';
    run.scored++;
    if (ok) run.correct++;
    else if (run.lives !== null) run.lives--;
    body.querySelectorAll('button.opt, input, .key').forEach((b) => { b.disabled = true; });
    const panel = h('div', { class: `feedback ${ok ? 'ok' : 'bad'}` },
      h('strong', { class: 'fb-title' }, ok ? '✔ ¡Correcto!' : '✘ Incorrecto'),
      detail,
      !ok && h('div', { class: 'solution' },
        h('span', { class: 'big-label small' }, ex.item.text), patternEl(ex.item.morse)),
      ex.item.meaning && h('p', { class: 'muted' }, ex.item.meaning),
      h('button', { class: 'btn primary', onclick: nextExercise }, 'Continuar'));
    body.append(panel);
    panel.querySelector('button').focus({ preventScroll: true });
    if (!ok || ex.type === 'read-choose') playMorse(ex.item.morse);
    if (S.vibrate && navigator.vibrate) navigator.vibrate(ok ? 30 : [60, 60, 60]);
  }

  function playButton(item, big) {
    return h('button', {
      class: 'play-btn' + (big ? ' big' : ''), 'aria-label': 'Reproducir',
      onclick: () => playMorse(item.morse)
    }, '▶');
  }

  function exIntro(ex, body) {
    const it = ex.item;
    body.append(
      h('p', { class: 'prompt' }, 'Nuevo elemento'),
      h('div', { class: 'big-label' }, it.text),
      patternEl(it.morse, 'large'),
      it.meaning && h('p', { class: 'meaning' }, it.meaning),
      h('p', { class: 'muted' }, 'Escúchalo varias veces y fíjate en su ritmo.'),
      playButton(it, true),
      h('div', { class: 'action-bar' }, h('button', { class: 'btn primary', onclick: nextExercise }, 'Entendido')));
    playMorse(it.morse);
  }

  function optionButtons(ex, body, showPattern) {
    return h('div', { class: 'options' + (ex.options.some((o) => o.text.length > 6) ? ' wide' : '') },
      ex.options.map((o) => h('button', {
        class: 'opt',
        onclick: (e) => {
          const ok = o === ex.item;
          e.currentTarget.classList.add(ok ? 'right' : 'wrong');
          body.querySelectorAll('button.opt').forEach((b, i) => {
            if (ex.options[i] === ex.item) b.classList.add('right');
          });
          answer(ex, body, ok);
        }
      }, showPattern ? patternEl(o.morse) : o.text)));
  }

  function exListenChoose(ex, body) {
    body.append(
      h('p', { class: 'prompt' }, '¿Qué has oído?'),
      playButton(ex.item, true),
      optionButtons(ex, body, false));
    playMorse(ex.item.morse);
  }

  function exReadChoose(ex, body) {
    body.append(
      h('p', { class: 'prompt' }, '¿Qué representa este código?'),
      patternEl(ex.item.morse, 'large'),
      optionButtons(ex, body, false));
  }

  function exListenType(ex, body) {
    const single = ex.item.text.length === 1;
    const input = h('input', {
      class: 'answer-input', type: 'text', autocomplete: 'off', autocapitalize: 'characters',
      spellcheck: 'false', placeholder: 'Escribe lo que oyes',
      oninput: () => { if (single && input.value.trim()) check(); },
      onkeydown: (e) => { if (e.key === 'Enter') check(); }
    });
    const check = () => {
      if (!input.value.trim()) return;
      const ok = Course.sameText(input.value, ex.item.text);
      answer(ex, body, ok, !ok && h('p', {}, `Escribiste: ${input.value.toUpperCase()}`));
    };
    body.append(
      h('p', { class: 'prompt' }, 'Escucha y escribe'),
      playButton(ex.item, true),
      input,
      !single && h('div', { class: 'action-bar' }, h('button', { class: 'btn primary', onclick: check }, 'Comprobar')));
    playMorse(ex.item.morse);
    setTimeout(() => input.focus(), 50);
  }

  function exSend(ex, body) {
    const target = ex.item.morse.split(/\s+/).filter((p) => p !== '/').join(' ');
    const hint = h('div', { class: 'hint hidden' }, patternEl(ex.item.morse, 'large'));
    const key = makeKey({
      onIdle: (morse) => {
        const sent = morse.split(/\s+/).filter((p) => p !== '/').join(' ');
        if (!sent) return;
        const ok = sent === target;
        answer(ex, body, ok, !ok && h('div', { class: 'solution' },
          h('span', { class: 'muted' }, 'Enviaste: '), patternEl(morse), ` (${Morse.decode(morse)})`));
      }
    });
    body.append(
      h('p', { class: 'prompt' }, 'Transmite con el manipulador'),
      h('div', { class: 'big-label' }, ex.item.text),
      h('button', { class: 'btn ghost small', onclick: () => hint.classList.toggle('hidden') }, 'Ver pista'),
      hint,
      key.el);
  }

  function renderResult(run) {
    const failed = run.lives === 0;
    const st = failed ? 0 : Course.stars(run.correct, run.scored);
    const pct = run.scored ? Math.round((run.correct / run.scored) * 100) : 0;
    if (!run.finished) {
      run.finished = true;
      if (st > starsOf(run.lesson)) {
        store.progress[run.lesson.id] = st;
        save();
      }
    }
    const next = COURSE.lessons[run.lesson.index + 1];
    view.append(
      h('div', { class: 'exercise result' },
        h('div', { class: 'result-icon' }, st ? '🎉' : '💪'),
        h('h2', {}, st ? '¡Lección superada!' : failed ? 'Te has quedado sin vidas' : 'Casi lo tienes'),
        starsEl(st),
        h('p', {}, `${run.correct} de ${run.scored} aciertos (${pct} %)`),
        !st && h('p', { class: 'muted' }, 'Necesitas un 80 % de aciertos para superar la lección.'),
        st > 0 && next && unlocked(next) && h('button', { class: 'btn primary', onclick: () => startLesson(next) }, 'Siguiente lección'),
        h('button', { class: 'btn' + (st ? '' : ' primary'), onclick: () => startLesson(run.lesson) }, 'Repetir'),
        h('button', { class: 'btn ghost', onclick: () => go('course') }, 'Volver al curso')));
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
    const pad = h('button', { class: 'key', 'aria-label': 'Manipulador' }, h('span', {}, 'TECLA'));
    const down = (e) => {
      if (e) e.preventDefault();
      if (pad.disabled) return;
      pad.classList.add('down');
      if (S.out.sound) player.toneOn(S.freq, S.volume, S.wave);
      if (S.out.vibrate && navigator.vibrate) navigator.vibrate(10000);
      light(true);
      keyer.down(performance.now());
    };
    const up = (e) => {
      if (e) e.preventDefault();
      if (!pad.classList.contains('down')) return;
      pad.classList.remove('down');
      player.toneOff();
      if (S.out.vibrate && navigator.vibrate) navigator.vibrate(0);
      light(false);
      keyer.up(performance.now());
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
      keyer.reset();
    });
    const el = h('div', { class: 'keyer' },
      live, text, pad,
      h('div', { class: 'row' },
        h('button', { class: 'btn ghost small', onclick: () => keyer.reset() }, 'Borrar'),
        h('span', { class: 'muted small' }, `Envío a ${S.sendWpm} ppm · también con la barra espaciadora`)));
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
        choice('theme', 'Tema', [['midnight', 'Medianoche'], ['slate', 'Pizarra'], ['light', 'Claro']], applyTheme)),
      h('section', { class: 'card' },
        h('h2', {}, 'Sonido'),
        choice('wave', 'Timbre', [['clear', 'Nítido (recomendado en móvil)'], ['sine', 'Suave (onda pura)']]),
        slider('wpm', 'Velocidad de caracteres', 5, 40, 1, (v) => `${v} ppm`),
        slider('eff', 'Velocidad efectiva (Farnsworth)', 3, 40, 1, (v) => `${v} ppm`),
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
        slider('sendWpm', 'Velocidad de envío', 4, 30, 1, (v) => `${v} ppm`),
        h('p', { class: 'muted small' }, 'Determina cuánto debe durar una raya y cuánto silencio separa letras y palabras al usar el manipulador.')),
      h('section', { class: 'card' },
        h('h2', {}, 'Curso'),
        toggle('send', 'Ejercicios de envío', 'Incluir ejercicios con el manipulador en las lecciones.'),
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
