// Núcleo Morse: tabla de códigos, codificación/decodificación, temporización,
// reproducción de audio (Web Audio) y decodificador de manipulador recto.
(function (root) {
  'use strict';

  const CHARS = {
    A: '.-', B: '-...', C: '-.-.', D: '-..', E: '.', F: '..-.', G: '--.', H: '....',
    I: '..', J: '.---', K: '-.-', L: '.-..', M: '--', N: '-.', 'Ñ': '--.--', O: '---',
    P: '.--.', Q: '--.-', R: '.-.', S: '...', T: '-', U: '..-', V: '...-', W: '.--',
    X: '-..-', Y: '-.--', Z: '--..',
    0: '-----', 1: '.----', 2: '..---', 3: '...--', 4: '....-',
    5: '.....', 6: '-....', 7: '--...', 8: '---..', 9: '----.',
    '.': '.-.-.-', ',': '--..--', '?': '..--..', "'": '.----.', '!': '-.-.--',
    '/': '-..-.', '(': '-.--.', ')': '-.--.-', '&': '.-...', ':': '---...',
    ';': '-.-.-.', '=': '-...-', '+': '.-.-.', '-': '-....-', '_': '..--.-',
    '"': '.-..-.', '$': '...-..-', '@': '.--.-.'
  };

  // Prosignos: se escriben entre < > y se transmiten sin espacio entre letras.
  const PROSIGNS = {
    AR: '.-.-.', SK: '...-.-', BT: '-...-', KN: '-.--.', AS: '.-...',
    SOS: '...---...', HH: '........', KA: '-.-.-', VE: '...-.'
  };

  const REVERSE = {};
  for (const [c, p] of Object.entries(CHARS)) REVERSE[p] = c;
  for (const [n, p] of Object.entries(PROSIGNS)) if (!REVERSE[p]) REVERSE[p] = '<' + n + '>';

  // Mayúsculas y sin tildes, conservando la Ñ.
  function normalize(text) {
    return String(text)
      .toUpperCase()
      .replace(/Ñ/g, '\u0000')
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .replace(/\u0000/g, 'Ñ');
  }

  // Divide una palabra en símbolos: caracteres sueltos o prosignos <XX>.
  function tokenize(word) {
    const tokens = [];
    const re = /<([A-Z]+)>|(.)/g;
    let m;
    while ((m = re.exec(word))) {
      if (m[1] !== undefined) {
        if (PROSIGNS[m[1]]) tokens.push('<' + m[1] + '>');
        else for (const ch of m[1]) tokens.push(ch);
      } else {
        tokens.push(m[2]);
      }
    }
    return tokens;
  }

  function patternOf(token) {
    if (token.length > 2 && token[0] === '<') return PROSIGNS[token.slice(1, -1)] || null;
    return CHARS[token] || null;
  }

  // Texto -> "letras separadas por espacio / palabras separadas por ' / '".
  function encode(text) {
    return normalize(text)
      .trim()
      .split(/\s+/)
      .map((w) => tokenize(w).map(patternOf).filter(Boolean).join(' '))
      .filter(Boolean)
      .join(' / ');
  }

  function decodeLetter(pattern) {
    return REVERSE[pattern] || '*';
  }

  function decode(morse) {
    return String(morse)
      .trim()
      .split(/\s*[/|]\s*/)
      .map((w) => w.split(/\s+/).filter(Boolean).map(decodeLetter).join(''))
      .filter(Boolean)
      .join(' ');
  }

  function isMorse(text) {
    return /^[\s.\-/|·_−–]+$/.test(text) && /[.\-·_−–]/.test(text);
  }

  // Unifica variantes tipográficas de punto y raya.
  function cleanMorse(text) {
    return String(text).replace(/[·]/g, '.').replace(/[_−–]/g, '-');
  }

  // Temporización (segundos). Con Farnsworth, los caracteres van a `wpm`
  // y los espacios se alargan para que la velocidad efectiva sea `eff`.
  function timing(wpm, eff) {
    const unit = 1.2 / wpm;
    if (!eff || eff >= wpm) return { unit, charGap: 3 * unit, wordGap: 7 * unit };
    const ta = (60 * wpm - 37.2 * eff) / (eff * wpm);
    return { unit, charGap: (3 * ta) / 19, wordGap: (7 * ta) / 19 };
  }

  // Lista de tramos {on, d} (d en segundos) para un texto Morse codificado.
  function timeline(morse, t) {
    const segs = [];
    const words = String(morse).trim().split(/\s*\/\s*/).filter(Boolean);
    words.forEach((word, wi) => {
      if (wi > 0) segs.push({ on: false, d: t.wordGap });
      word.split(/\s+/).forEach((letter, li) => {
        if (li > 0) segs.push({ on: false, d: t.charGap });
        [...letter].forEach((el, ei) => {
          if (ei > 0) segs.push({ on: false, d: t.unit });
          segs.push({ on: true, d: el === '-' ? 3 * t.unit : t.unit });
        });
      });
    });
    return segs;
  }

  function duration(segs) {
    return segs.reduce((a, s) => a + s.d, 0);
  }

  // ---------------------------------------------------------------- Audio

  // Armónicos de cada timbre. «clear» añade algo de 3.º y 5.º armónico para
  // que el pitido se distinga mejor en altavoces de móvil.
  const WAVES = { clear: [0, 1, 0, 0.18, 0, 0.06], sine: [0, 1] };

  // Rampa de coseno alzado: sin chasquidos al empezar y acabar cada pitido.
  function ramp(from, to) {
    const n = 64;
    const c = new Float32Array(n);
    for (let i = 0; i < n; i++) c[i] = from + (to - from) * (0.5 - 0.5 * Math.cos((Math.PI * i) / (n - 1)));
    return c;
  }

  class Player {
    constructor() {
      this.ctx = null;
      this.out = null;
      this.waves = {};
      this.current = null;
      this.side = null;
    }

    ensure() {
      if (!this.ctx) {
        const AC = root.AudioContext || root.webkitAudioContext;
        if (!AC) return null;
        this.ctx = new AC({ latencyHint: 'interactive' });
        // Limitador: permite subir el volumen sin distorsionar.
        const comp = this.ctx.createDynamicsCompressor();
        comp.threshold.value = -6;
        comp.knee.value = 4;
        comp.ratio.value = 12;
        comp.attack.value = 0.002;
        comp.release.value = 0.08;
        comp.connect(this.ctx.destination);
        this.out = comp;
      }
      return this.ctx;
    }

    // Se llama de forma síncrona dentro del gesto del usuario.
    _ready() {
      const ctx = this.ensure();
      if (!ctx) return Promise.resolve(null);
      if (ctx.state === 'running') return Promise.resolve(ctx);
      return ctx.resume().then(() => ctx, () => ctx);
    }

    _osc(wave, freq) {
      const ctx = this.ctx;
      const osc = ctx.createOscillator();
      const h = WAVES[wave] || WAVES.clear;
      if (!this.waves[wave]) {
        this.waves[wave] = ctx.createPeriodicWave(new Float32Array(h), new Float32Array(h.length));
      }
      osc.setPeriodicWave(this.waves[wave]);
      osc.frequency.value = freq;
      return osc;
    }

    get playing() {
      return !!this.current;
    }

    // opts: wpm, eff, freq, volume, wave, sound, vibrate, onSegment(on)
    play(morse, opts) {
      this.stop();
      const o = Object.assign({ wpm: 18, eff: 10, freq: 700, volume: 0.8, wave: 'clear', sound: true }, opts);
      const segs = timeline(morse, timing(o.wpm, o.eff));
      const total = duration(segs);
      const run = { timers: [], osc: null, resolve: null, stopped: false, onSegment: o.onSegment };
      this.current = run;
      const done = new Promise((resolve) => { run.resolve = resolve; });
      const ready = o.sound ? this._ready() : Promise.resolve(null);

      ready.then((ctx) => {
        if (run.stopped) return;
        const lead = 0.08;
        if (ctx) {
          const osc = this._osc(o.wave, o.freq);
          const gain = ctx.createGain();
          gain.gain.value = 0;
          osc.connect(gain).connect(this.out);
          const rise = Math.min(0.005, (1.2 / o.wpm) * 0.2);
          const up = ramp(0, o.volume);
          const down = ramp(o.volume, 0);
          let t = ctx.currentTime + lead;
          for (const s of segs) {
            if (s.on) {
              gain.gain.setValueCurveAtTime(up, t, rise);
              gain.gain.setValueCurveAtTime(down, t + s.d - rise, rise);
            }
            t += s.d;
          }
          osc.start(ctx.currentTime);
          osc.stop(t + 0.05);
          run.osc = osc;
        }

        if (o.onSegment) {
          let t = lead;
          for (const s of segs) {
            const on = s.on;
            run.timers.push(setTimeout(() => o.onSegment(on), t * 1000));
            t += s.d;
          }
        }

        if (o.vibrate && root.navigator && navigator.vibrate) {
          const pattern = segs.map((s) => Math.round(s.d * 1000));
          run.timers.push(setTimeout(() => navigator.vibrate(pattern), lead * 1000));
          run.vibrating = true;
        }

        run.timers.push(setTimeout(() => this._finish(run), (total + lead) * 1000 + 30));
      });
      return done;
    }

    _finish(run) {
      run.timers.forEach(clearTimeout);
      if (run.onSegment) run.onSegment(false);
      if (this.current === run) this.current = null;
      if (run.resolve) run.resolve();
      run.resolve = null;
    }

    stop() {
      const run = this.current;
      if (!run) return;
      run.stopped = true;
      if (run.osc) {
        try { run.osc.stop(); } catch (e) { /* ya detenido */ }
      }
      if (run.vibrating && navigator.vibrate) navigator.vibrate(0);
      this._finish(run);
    }

    // Tono lateral para el manipulador.
    toneOn(freq, volume, wave) {
      const ctx = this.ensure();
      if (!ctx) return;
      if (ctx.state !== 'running') ctx.resume();
      if (!this.side || this.side.wave !== wave) {
        if (this.side) this.side.osc.stop();
        const osc = this._osc(wave || 'clear', freq);
        const gain = ctx.createGain();
        gain.gain.value = 0;
        osc.connect(gain).connect(this.out);
        osc.start();
        this.side = { osc, gain, wave };
      }
      const { osc, gain } = this.side;
      const now = ctx.currentTime;
      osc.frequency.setValueAtTime(freq, now);
      gain.gain.cancelScheduledValues(now);
      gain.gain.setValueAtTime(gain.gain.value, now);
      gain.gain.linearRampToValueAtTime(volume, now + 0.004);
    }

    toneOff() {
      if (!this.side || !this.ctx) return;
      const { gain } = this.side;
      const now = this.ctx.currentTime;
      gain.gain.cancelScheduledValues(now);
      gain.gain.setValueAtTime(gain.gain.value, now);
      gain.gain.linearRampToValueAtTime(0, now + 0.004);
    }
  }

  // ------------------------------------------------------------- Linterna

  // Enciende el flash de la cámara trasera (Chrome en Android, con HTTPS).
  class Torch {
    constructor() {
      this.track = null;
      this.pending = null;
      this.state = false;
    }

    static supported() {
      return !!(root.navigator && navigator.mediaDevices && navigator.mediaDevices.getUserMedia);
    }

    get ready() {
      return !!this.track;
    }

    // Pide acceso a la cámara. Rechaza si el dispositivo no tiene linterna.
    enable() {
      if (this.track) return Promise.resolve();
      if (this.pending) return this.pending;
      if (!Torch.supported()) return Promise.reject(new Error('unsupported'));
      this.pending = navigator.mediaDevices
        .getUserMedia({ video: { facingMode: { ideal: 'environment' } } })
        .then((stream) => {
          const track = stream.getVideoTracks()[0];
          const caps = track && track.getCapabilities ? track.getCapabilities() : {};
          if (!caps.torch) {
            stream.getTracks().forEach((t) => t.stop());
            throw new Error('no-torch');
          }
          this.track = track;
        })
        .finally(() => { this.pending = null; });
      return this.pending;
    }

    set(on) {
      if (!this.track || this.state === on) return;
      this.state = on;
      this.track.applyConstraints({ advanced: [{ torch: on }] }).catch(() => {});
    }

    release() {
      if (!this.track) return;
      this.set(false);
      this.track.stop();
      this.track = null;
      this.state = false;
    }
  }

  // ---------------------------------------------------------- Manipulador

  // Aprende la velocidad real de quien manipula. Guarda las últimas
  // pulsaciones y busca el salto natural entre cortas (puntos) y largas
  // (rayas); el umbral queda en medio. Si aún no hay de los dos tipos,
  // usa la última estimación de la duración del punto.
  class AdaptiveTimer {
    constructor(unitMs) {
      this.base = unitMs;
      this.dot = unitMs;
      this.dash = 3 * unitMs;
      this.history = [];
    }

    get threshold() {
      const split = this._split();
      return split ? split.threshold : 2 * this.dot;
    }

    // Divide el historial en dos grupos si hay un salto de al menos ×2.
    _split() {
      const v = this.history.slice().sort((a, b) => a - b);
      let best = null;
      for (let i = 1; i < v.length; i++) {
        const ratio = v[i] / v[i - 1];
        if (ratio >= 2 && (!best || ratio > best.ratio)) best = { ratio, i };
      }
      if (!best) return null;
      const mean = (a) => a.reduce((x, y) => x + y, 0) / a.length;
      const dots = v.slice(0, best.i);
      const dashes = v.slice(best.i);
      return { dot: mean(dots), dash: mean(dashes), threshold: Math.sqrt(v[best.i - 1] * v[best.i]) };
    }

    classify(ms) {
      const el = ms < this.threshold ? '.' : '-';
      this.history.push(ms);
      if (this.history.length > 16) this.history.shift();
      const split = this._split();
      if (split) {
        this.dot = split.dot;
        this.dash = split.dash;
      } else if (el === '.') {
        this.dot += 0.3 * (ms - this.dot);
      } else {
        this.dot += 0.3 * (ms / 3 - this.dot);
      }
      return el;
    }

    // Silencio que separa letras, en ms.
    get letterGap() {
      return 3 * this.dot;
    }
  }

  // Comprueba el envío elemento a elemento contra el objetivo. Las letras se
  // separan siguiendo el objetivo, así que no hace falta esperar a la pausa:
  // en cuanto se completa la última letra se da por buena, y en cuanto un
  // elemento no encaja se marca el fallo.
  class SendJudge {
    constructor(targetMorse) {
      this.target = String(targetMorse).split(/\s+/).filter((p) => p && p !== '/');
      this.reset();
    }

    reset() {
      this.index = 0; // letra del objetivo en curso
      this.current = ''; // elementos enviados de esa letra
      this.sent = []; // letras ya completadas
      this.state = 'progress';
    }

    feed(el) {
      if (this.state !== 'progress') return this.state;
      const want = this.target[this.index];
      this.current += el;
      if (!want.startsWith(this.current)) {
        this.state = 'bad';
      } else if (this.current === want) {
        this.sent.push(this.current);
        this.current = '';
        this.index++;
        if (this.index === this.target.length) this.state = 'ok';
      }
      return this.state;
    }

    // Lo enviado hasta ahora, en formato encode().
    morse() {
      return this.sent.concat(this.current ? [this.current] : []).join(' ');
    }
  }

  // Decodifica pulsaciones de un manipulador recto, adaptándose a la velocidad:
  // silencio ≥ 3 puntos → fin de letra; ≥ 7 → fin de palabra.
  class Keyer {
    constructor(opts) {
      this.timer = new AdaptiveTimer(opts.unitMs);
      this.onChange = opts.onChange || (() => {});
      this.onIdle = opts.onIdle || null;
      this.reset();
    }

    reset() {
      clearTimeout(this.letterTimer);
      clearTimeout(this.wordTimer);
      this.letters = []; // patrones de letras completas, '/' para separar palabras
      this.current = '';
      this.downAt = null;
      this.emit();
    }

    down(now) {
      if (this.downAt !== null) return;
      clearTimeout(this.letterTimer);
      clearTimeout(this.wordTimer);
      this.downAt = now;
    }

    up(now) {
      if (this.downAt === null) return;
      const d = now - this.downAt;
      this.downAt = null;
      this.current += this.timer.classify(d);
      this.emit();
      const dot = this.timer.dot;
      this.letterTimer = setTimeout(() => this.endLetter(), 3 * dot);
      this.wordTimer = setTimeout(() => this.endWord(), 7 * dot);
    }

    endLetter() {
      if (!this.current) return;
      this.letters.push(this.current);
      this.current = '';
      this.emit();
    }

    endWord() {
      this.endLetter();
      if (this.letters.length && this.letters[this.letters.length - 1] !== '/') this.letters.push('/');
      this.emit();
      if (this.onIdle) this.onIdle(this.morse());
    }

    // Morse enviado hasta ahora, en el mismo formato que encode().
    morse() {
      const parts = this.letters.slice();
      if (this.current) parts.push(this.current);
      while (parts[parts.length - 1] === '/') parts.pop();
      return parts.join(' ').replace(/ \/ /g, ' / ');
    }

    emit() {
      this.onChange({ morse: this.morse(), current: this.current, text: decode(this.morse()) });
    }
  }

  // Decodificación sin temporizadores: eventos [{down, up}] en ms.
  function decodeTimings(presses, unitMs) {
    let morse = '';
    presses.forEach((p, i) => {
      if (i > 0) {
        const gap = p.down - presses[i - 1].up;
        if (gap >= 7 * unitMs) morse += ' / ';
        else if (gap >= 3 * unitMs) morse += ' ';
      }
      morse += p.up - p.down < 2 * unitMs ? '.' : '-';
    });
    return { morse, text: decode(morse) };
  }

  const api = {
    CHARS, PROSIGNS, normalize, tokenize, patternOf, encode, decode, decodeLetter,
    isMorse, cleanMorse, timing, timeline, duration, Player, Torch, AdaptiveTimer, SendJudge, Keyer, decodeTimings
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.Morse = api;
})(typeof window !== 'undefined' ? window : globalThis);
