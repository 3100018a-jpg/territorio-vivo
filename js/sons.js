// Efeitos sonoros e ambiente sintetizados com Web Audio (nenhum arquivo externo).
export class Sons {
  constructor() {
    this.ctx = null;
    this.efeitos = true;
    this.ambienteAtivo = false;
    this.chuvaAtiva = false;
  }

  garantir() {
    if (!this.ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return false;
      this.ctx = new AC();
      this.mestre = this.ctx.createGain();
      this.mestre.gain.value = 0.55;
      this.mestre.connect(this.ctx.destination);
      this.amb = this.ctx.createGain();
      this.amb.gain.value = 0;
      this.amb.connect(this.mestre);
    }
    if (this.ctx.state === 'suspended') this.ctx.resume();
    return true;
  }

  nota(freq, ini, dur, tipo = 'sine', vol = 0.25, destino) {
    if (!this.garantir()) return;
    const c = this.ctx, o = c.createOscillator(), g = c.createGain();
    o.type = tipo; o.frequency.value = freq;
    const t0 = c.currentTime + ini;
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(vol, t0 + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    o.connect(g); g.connect(destino || this.mestre);
    o.start(t0); o.stop(t0 + dur + 0.05);
  }

  acerto() { if (!this.efeitos) return; [523.25, 659.25, 783.99, 1046.5].forEach((f, i) => this.nota(f, i * 0.08, 0.5, 'triangle', 0.22)); }
  erro() { if (!this.efeitos) return; this.nota(330, 0, 0.25, 'sine', 0.2); this.nota(247, 0.16, 0.4, 'sine', 0.2); }
  clique() { if (!this.efeitos) return; this.nota(880, 0, 0.08, 'sine', 0.08); }
  moeda() { if (!this.efeitos) return; this.nota(987.8, 0, 0.12, 'square', 0.06); this.nota(1318.5, 0.08, 0.3, 'square', 0.06); }
  conquista() {
    if (!this.efeitos) return;
    [[523.25, 0], [659.25, 0.12], [783.99, 0.24], [1046.5, 0.36], [783.99, 0.52], [1046.5, 0.64]].forEach(([f, t]) => this.nota(f, t, 0.45, 'triangle', 0.2));
    [261.6, 329.6, 392].forEach((f) => this.nota(f, 0.64, 1.2, 'sine', 0.1));
  }
  construir() {
    if (!this.efeitos || !this.garantir()) return;
    const c = this.ctx, o = c.createOscillator(), g = c.createGain();
    o.type = 'sawtooth';
    o.frequency.setValueAtTime(110, c.currentTime);
    o.frequency.exponentialRampToValueAtTime(880, c.currentTime + 2.2);
    const f = c.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 1200;
    g.gain.setValueAtTime(0.0001, c.currentTime);
    g.gain.exponentialRampToValueAtTime(0.05, c.currentTime + 0.3);
    g.gain.exponentialRampToValueAtTime(0.0001, c.currentTime + 2.4);
    o.connect(f); f.connect(g); g.connect(this.mestre);
    o.start(); o.stop(c.currentTime + 2.5);
    for (let i = 0; i < 12; i++) this.nota(800 + Math.random() * 1600, 0.4 + i * 0.18, 0.2, 'sine', 0.05);
  }

  ruido(seg = 2) {
    const c = this.ctx, n = c.sampleRate * seg, b = c.createBuffer(1, n, c.sampleRate), d = b.getChannelData(0);
    let ult = 0;
    for (let i = 0; i < n; i++) { const w = Math.random() * 2 - 1; ult = (ult + 0.02 * w) / 1.02; d[i] = ult * 3.5; }
    return b;
  }

  ambiente(ativo) {
    this.ambienteAtivo = ativo;
    if (!this.garantir()) return;
    const c = this.ctx;
    this.amb.gain.cancelScheduledValues(c.currentTime);
    this.amb.gain.linearRampToValueAtTime(ativo ? 0.5 : 0, c.currentTime + 1.2);
    if (ativo && !this.vento) {
      const src = c.createBufferSource(); src.buffer = this.ruido(4); src.loop = true;
      const f = c.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 420; f.Q.value = 0.6;
      const g = c.createGain(); g.gain.value = 0.05;
      src.connect(f); f.connect(g); g.connect(this.amb); src.start();
      this.vento = src;
      const passarinho = () => {
        if (this.ambienteAtivo) {
          const base = 2400 + Math.random() * 1800, t0 = 0;
          const n = 2 + Math.floor(Math.random() * 4);
          for (let i = 0; i < n; i++) {
            const o = c.createOscillator(), gg = c.createGain();
            const ti = c.currentTime + t0 + i * 0.13;
            o.frequency.setValueAtTime(base, ti);
            o.frequency.exponentialRampToValueAtTime(base * (1.3 + Math.random() * 0.4), ti + 0.08);
            gg.gain.setValueAtTime(0.0001, ti); gg.gain.exponentialRampToValueAtTime(0.035, ti + 0.02); gg.gain.exponentialRampToValueAtTime(0.0001, ti + 0.1);
            o.connect(gg); gg.connect(this.amb); o.start(ti); o.stop(ti + 0.12);
          }
        }
        setTimeout(passarinho, 1800 + Math.random() * 5200);
      };
      passarinho();
    }
  }

  chuva(ativo) {
    this.chuvaAtiva = ativo;
    if (!this.garantir()) return;
    const c = this.ctx;
    if (!this.chuvaSrc) {
      const src = c.createBufferSource(); src.buffer = this.ruido(3); src.loop = true;
      const f = c.createBiquadFilter(); f.type = 'highpass'; f.frequency.value = 900;
      this.chuvaGanho = c.createGain(); this.chuvaGanho.gain.value = 0;
      src.connect(f); f.connect(this.chuvaGanho); this.chuvaGanho.connect(this.mestre); src.start();
      this.chuvaSrc = src;
    }
    this.chuvaGanho.gain.cancelScheduledValues(c.currentTime);
    this.chuvaGanho.gain.linearRampToValueAtTime(ativo ? 0.16 : 0, c.currentTime + 1.5);
  }
}
