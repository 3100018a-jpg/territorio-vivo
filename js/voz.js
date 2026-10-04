// Motor de narração: vozes neurais gravadas (MP3) quando disponíveis; caso contrário, vozes do navegador
// (Web Speech API) escolhidas por gênero e qualidade, uma voz diferente para cada apresentador.

const FEMININAS = ['francisca', 'thalita', 'brenda', 'elza', 'giovanna', 'leila', 'leticia', 'letícia', 'manuela', 'yara', 'luciana', 'fernanda', 'joana', 'catarina', 'raquel', 'maria', 'helena', 'heloisa', 'heloísa', 'vitoria', 'vitória', 'camila', 'ines', 'inês', 'female', 'feminina', 'mulher', 'google português do brasil', 'afs', 'pte'];
const MASCULINAS = ['antonio', 'antônio', 'donato', 'fabio', 'fábio', 'humberto', 'julio', 'júlio', 'nicolau', 'valerio', 'valério', 'daniel', 'felipe', 'duarte', 'cristiano', 'ricardo', 'macerio', 'macério', 'male', 'masculina', 'homem', 'ptd'];

function generoDaVoz(v) {
  const n = (v.name + ' ' + (v.voiceURI || '')).toLowerCase();
  if (MASCULINAS.some((k) => n.includes(k))) return 'masculino';
  if (FEMININAS.some((k) => n.includes(k))) return 'feminino';
  return null;
}

function pontuar(v) {
  const lang = (v.lang || '').toLowerCase().replace('_', '-');
  let s = 0;
  if (lang === 'pt-br') s += 40; else if (lang.startsWith('pt')) s += 20;
  if (/natural|neural|online|premium|enhanced|aprimorad/i.test(v.name)) s += 50;
  if (/google/i.test(v.name)) s += 12;
  if (/microsoft/i.test(v.name)) s += 6;
  return s;
}

function dividir(texto, max = 210) {
  const frases = texto.match(/[^.!?…;:]+[.!?…;:]*\s*/g) || [texto];
  const partes = [];
  let atual = '';
  for (const f of frases) {
    if ((atual + f).length > max && atual) { partes.push(atual.trim()); atual = ''; }
    atual += f;
  }
  if (atual.trim()) partes.push(atual.trim());
  return partes;
}

const espera = (ms) => new Promise((r) => setTimeout(r, ms));

export class Narrador {
  constructor(personagens) {
    this.P = personagens;
    this.manifesto = {};
    this.vozes = {};            // personagem -> voiceURI
    this.disponiveis = [];
    this.velocidade = 1;
    this.volume = 1;
    this.mudo = false;
    this.usarGravadas = true;
    this.sessao = 0;
    this.atual = null;
    this.onInicio = null;
    this.onFim = null;
    this.audio = new Audio();
    this.audio.preload = 'auto';
    this.temSintese = 'speechSynthesis' in window;
    this.ajustePitch = {};
  }

  async init(preferidas = {}) {
    try {
      const r = await fetch('audio/manifest.json', { cache: 'no-cache' });
      if (r.ok) this.manifesto = await r.json();
    } catch { /* sem vozes gravadas */ }
    await this.carregarVozes();
    this.atribuir(preferidas);
  }

  get modoGravado() { return this.usarGravadas && Object.keys(this.manifesto).length > 0; }

  carregarVozes() {
    if (!this.temSintese) return Promise.resolve();
    return new Promise((res) => {
      let tentativas = 0;
      const ler = () => {
        const v = speechSynthesis.getVoices();
        if (v.length || tentativas > 25) { this.disponiveis = v; res(); return; }
        tentativas++;
        setTimeout(ler, 100);
      };
      speechSynthesis.onvoiceschanged = () => { this.disponiveis = speechSynthesis.getVoices(); };
      ler();
    });
  }

  vozesPortugues() {
    return this.disponiveis.filter((v) => /^pt/i.test(v.lang)).sort((a, b) => pontuar(b) - pontuar(a));
  }

  atribuir(preferidas = {}) {
    const pt = this.vozesPortugues();
    const base = pt.length ? pt : this.disponiveis.slice().sort((a, b) => pontuar(b) - pontuar(a));
    const usadas = new Set();
    const ordem = ['jurema', 'caio', 'lia', 'teo'];
    this.ajustePitch = {};
    for (const p of ordem) {
      const pref = preferidas[p] && this.disponiveis.find((v) => v.voiceURI === preferidas[p]);
      if (pref) { this.vozes[p] = pref.voiceURI; usadas.add(pref.voiceURI); continue; }
      const gen = this.P[p].genero;
      const doGenero = base.filter((v) => generoDaVoz(v) === gen);
      const neutras = base.filter((v) => generoDaVoz(v) === null);
      let escolhida = doGenero.find((v) => !usadas.has(v.voiceURI)) || neutras.find((v) => !usadas.has(v.voiceURI)) || doGenero[0] || neutras[0] || base[0];
      if (escolhida) {
        this.vozes[p] = escolhida.voiceURI;
        usadas.add(escolhida.voiceURI);
        const g = generoDaVoz(escolhida);
        // Se não houver voz do gênero do apresentador, ajusta o tom para diferenciar.
        if (g && g !== gen) this.ajustePitch[p] = gen === 'masculino' ? 0.72 : 1.25;
      }
    }
  }

  definirVoz(p, uri) { this.vozes[p] = uri; delete this.ajustePitch[p]; }
  vozDe(p) { return this.disponiveis.find((v) => v.voiceURI === this.vozes[p]) || null; }

  desbloquear() {
    try {
      if (this.temSintese) { const u = new SpeechSynthesisUtterance(' '); u.volume = 0; speechSynthesis.speak(u); }
      this.audio.src = 'data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEARKwAAIhYAQACABAAZGF0YQAAAAA=';
      this.audio.play().catch(() => {});
    } catch { /* ignore */ }
  }

  // Interrompe a fala atual (a sequência continua)
  pular() { if (this.atual) this.atual.cancelar(); }

  // Interrompe tudo, inclusive sequências em andamento
  pararTudo() {
    this.sessao++;
    if (this.atual) this.atual.cancelar();
    if (this.temSintese) speechSynthesis.cancel();
    this.audio.pause();
  }

  async sequencia(falas) {
    const s = this.sessao;
    for (const f of falas) {
      if (s !== this.sessao) return false;
      await this.falar(f.p, f.t);
      if (s !== this.sessao) return false;
      await espera(220);
    }
    return s === this.sessao;
  }

  falar(p, texto) {
    if (this.atual) this.atual.cancelar();
    let resolver;
    const prom = new Promise((r) => (resolver = r));
    let encerrado = false;
    const ctrl = {
      cancelar: () => {
        if (encerrado) return;
        encerrado = true;
        if (this.temSintese) speechSynthesis.cancel();
        this.audio.pause();
        clearTimeout(ctrl.timer);
        fim();
      },
    };
    const fim = () => {
      encerrado = true;
      if (this.atual === ctrl) this.atual = null;
      this.onFim && this.onFim(p, texto);
      resolver();
    };
    this.atual = ctrl;
    this.onInicio && this.onInicio(p, texto);

    if (this.mudo || this.volume === 0) {
      ctrl.timer = setTimeout(() => { if (!encerrado) fim(); }, Math.max(1600, (texto.length * 62) / this.velocidade));
      return prom;
    }

    const chave = p + '|' + texto;
    const arquivo = this.usarGravadas && this.manifesto[chave];
    if (arquivo) {
      this.tocarArquivo('audio/' + arquivo, ctrl).then((ok) => {
        if (encerrado) return;
        if (ok) fim(); else this.sintetizar(p, texto, ctrl, fim);
      });
    } else {
      this.sintetizar(p, texto, ctrl, fim);
    }
    return prom;
  }

  tocarArquivo(src, ctrl) {
    return new Promise((res) => {
      const a = this.audio;
      a.onended = () => res(true);
      a.onerror = () => res(false);
      a.src = src;
      a.playbackRate = this.velocidade;
      a.preservesPitch = true;
      a.volume = this.volume;
      a.play().catch(() => res(false));
    });
  }

  sintetizar(p, texto, ctrl, fim) {
    if (!this.temSintese || !this.disponiveis.length) {
      ctrl.timer = setTimeout(() => fim(), Math.max(1600, (texto.length * 62) / this.velocidade));
      return;
    }
    const partes = dividir(texto);
    const per = this.P[p] || {};
    const voz = this.vozDe(p);
    let i = 0;
    const proxima = () => {
      if (ctrl.cancelado) return;
      if (i >= partes.length) { fim(); return; }
      const u = new SpeechSynthesisUtterance(partes[i]);
      ctrl.utter = u; // mantém referência (evita coleta de lixo no Chrome)
      if (voz) u.voice = voz;
      u.lang = voz?.lang || 'pt-BR';
      u.pitch = Math.min(2, Math.max(0, (per.pitch ?? 1) * (this.ajustePitch[p] ?? 1)));
      u.rate = Math.min(2, Math.max(0.5, (per.rate ?? 1) * this.velocidade));
      u.volume = this.volume;
      let passou = false;
      const seguir = () => { if (passou) return; passou = true; clearTimeout(ctrl.timer); i++; proxima(); };
      u.onend = seguir;
      u.onerror = seguir;
      ctrl.timer = setTimeout(seguir, ((partes[i].length * 75) / u.rate) + 5000);
      speechSynthesis.speak(u);
    };
    const cancelarOriginal = ctrl.cancelar;
    ctrl.cancelar = () => { ctrl.cancelado = true; cancelarOriginal(); };
    speechSynthesis.cancel();
    setTimeout(proxima, 60);
  }
}
