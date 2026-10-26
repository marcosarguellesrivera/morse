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

  class Player {
    constructor() {
      this.ctx = null;
      this.current = null;
      this.side = null;
    }

    ensure() {
      if (!this.ctx) {
        const AC = root.AudioContext || root.webkitAudioContext;
        if (!AC) return null;
        this.ctx = new AC();
      }
      if (this.ctx.state === 'suspended') this.ctx.resume();
      return this.ctx;
    }

    get playing() {
      return !!this.current;
    }

    // opts: wpm, eff, freq, volume, sound, onSegment(on), vibrate
    play(morse, opts) {
      this.stop();
      const o = Object.assign({ wpm: 18, eff: 10, freq: 650, volume: 0.6, sound: true }, opts);
      const segs = timeline(morse, timing(o.wpm, o.eff));
      const total = duration(segs);
      const ctx = o.sound ? this.ensure() : null;
      const run = { timers: [], osc: null, resolve: null };
      this.current = run;

      const lead = 0.06;
      if (ctx) {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.value = o.freq;
        gain.gain.value = 0;
        osc.connect(gain).connect(ctx.destination);
        const ramp = Math.min(0.005, (1.2 / o.wpm) / 4);
        let t = ctx.currentTime + lead;
        for (const s of segs) {
          if (s.on) {
            gain.gain.setValueAtTime(0, t);
            gain.gain.linearRampToValueAtTime(o.volume, t + ramp);
            gain.gain.setValueAtTime(o.volume, t + s.d - ramp);
            gain.gain.linearRampToValueAtTime(0, t + s.d);
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
        run.timers.push(setTimeout(() => o.onSegment(false), t * 1000));
      }

      if (o.vibrate && root.navigator && navigator.vibrate) {
        const pattern = segs.map((s) => Math.round(s.d * 1000));
        navigator.vibrate(pattern);
        run.vibrating = true;
      }

      return new Promise((resolve) => {
        run.resolve = resolve;
        run.timers.push(setTimeout(() => this._finish(run), (total + lead) * 1000 + 30));
      });
    }

    _finish(run) {
      run.timers.forEach(clearTimeout);
      if (this.current === run) this.current = null;
      if (run.resolve) run.resolve();
      run.resolve = null;
    }

    stop() {
      const run = this.current;
      if (!run) return;
      if (run.osc) {
        try { run.osc.stop(); } catch (e) { /* ya detenido */ }
      }
      if (run.vibrating && navigator.vibrate) navigator.vibrate(0);
      this._finish(run);
    }

    // Tono lateral para el manipulador.
    toneOn(freq, volume) {
      const ctx = this.ensure();
      if (!ctx) return;
      if (!this.side) {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'sine';
        gain.gain.value = 0;
        osc.connect(gain).connect(ctx.destination);
        osc.start();
        this.side = { osc, gain };
      }
      const { osc, gain } = this.side;
      osc.frequency.setValueAtTime(freq, ctx.currentTime);
      gain.gain.cancelScheduledValues(ctx.currentTime);
      gain.gain.setValueAtTime(gain.gain.value, ctx.currentTime);
      gain.gain.linearRampToValueAtTime(volume, ctx.currentTime + 0.005);
    }

    toneOff() {
      if (!this.side || !this.ctx) return;
      const { gain } = this.side;
      const now = this.ctx.currentTime;
      gain.gain.cancelScheduledValues(now);
      gain.gain.setValueAtTime(gain.gain.value, now);
      gain.gain.linearRampToValueAtTime(0, now + 0.005);
    }
  }

  // ---------------------------------------------------------- Manipulador

  // Decodifica pulsaciones de un manipulador recto. Umbrales en unidades:
  // pulsación < 2 → punto; silencio ≥ 3 → fin de letra; ≥ 7 → fin de palabra.
  class Keyer {
    constructor(opts) {
      this.unit = opts.unitMs;
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
      this.current += d < 2 * this.unit ? '.' : '-';
      this.emit();
      this.letterTimer = setTimeout(() => this.endLetter(), 3 * this.unit);
      this.wordTimer = setTimeout(() => this.endWord(), 7 * this.unit);
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
    isMorse, cleanMorse, timing, timeline, duration, Player, Keyer, decodeTimings
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.Morse = api;
})(typeof window !== 'undefined' ? window : globalThis);
