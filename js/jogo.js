// Lógica do jogo Território Vivo: missões, perguntas, narração, pontuação, ações sustentáveis e progresso.
import { Maquete, LOTES, QUALIDADES, qualidadeInicial, ARVORES } from './maquete.js';
import { Narrador } from './voz.js';
import { Sons } from './sons.js';
import { AVATARES } from './avatares.js';

const $ = (s) => document.querySelector(s);
const $$ = (s) => [...document.querySelectorAll(s)];
const CHAVE = 'territorioVivo.v1';
const CHAVE_CFG = 'territorioVivo.config.v1';
const ORDEM_ETAPAS = ['diagnostico', 'priorizacao', 'planejamento', 'implementacao', 'acompanhamento'];
const SEMENTES_DILEMA = { informacao: 2, consulta: 4, cogestao: 8, autonomia: 10 };

let C, E, cfg, maquete, narr, sons;
let emMissao = false;
let ultimaFala = null;
let timerDialogo = null;
const paineisOuvidos = new Set();

// ------------------------------------------------------------ utilidades
const embaralhar = (a) => { const b = a.slice(); for (let i = b.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [b[i], b[j]] = [b[j], b[i]]; } return b; };
const sortear = (a) => a[Math.floor(Math.random() * a.length)];
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

function lerLocal(k) { try { const s = localStorage.getItem(k); return s ? JSON.parse(s) : null; } catch { return null; } }
function gravarLocal(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* armazenamento indisponível */ } }

function estadoInicial() {
  const ind = {};
  for (const k in C.indicadores) ind[k] = C.indicadores[k].inicial;
  return { sementes: 20, concluidas: {}, dilemas: [], ind, itens: [], nome: '', recordeDesafio: 0, introVista: false };
}
const salvar = () => gravarLocal(CHAVE, E);
const cfgPadrao = () => ({ vozes: {}, velocidade: 1, volume: 1, gravadas: true, alternativas: true, ambiente: true, efeitos: true, tilt: true, qualidade: 'auto', qualidadeAuto: null, versaoQualidade: 2, mudo: false });
const salvarCfg = () => gravarLocal(CHAVE_CFG, cfg);

function toast(txt, cor = 'var(--verde)') {
  const d = document.createElement('div');
  d.className = 'toast'; d.style.borderLeftColor = cor; d.textContent = txt;
  $('#toast').appendChild(d);
  setTimeout(() => d.remove(), 3900);
}

function pulso(el) { el.classList.remove('pulso'); void el.offsetWidth; el.classList.add('pulso'); }

// ------------------------------------------------------------ narração na tela
function mostrarFala(p, t) {
  const per = C.personagens[p];
  if (!per) return;
  clearTimeout(timerDialogo);
  const d = $('#dialogo');
  d.classList.remove('oculto', 'inativo');
  d.style.setProperty('--cor', per.cor);
  const av = $('#dlgAvatar');
  if (av.dataset.p !== p) { av.innerHTML = AVATARES[p]; av.dataset.p = p; }
  av.style.setProperty('--cor', per.cor);
  av.classList.add('falando');
  $('#dlgNome').textContent = per.nome;
  $('#dlgPapel').textContent = per.papel;
  $('#dlgTexto').textContent = t;
  ultimaFala = { p, t };
  $$('.ap-card .avatar, .cfg-voz .avatar, .pg-narr .avatar').forEach((a) => a.classList.toggle('falando', a.dataset.p === p));
}
function fimFala() {
  $('#dlgAvatar').classList.remove('falando');
  $$('.avatar.falando').forEach((a) => a.classList.remove('falando'));
  clearTimeout(timerDialogo);
  timerDialogo = setTimeout(() => { if (!narr.atual) $('#dialogo').classList.add('inativo'); }, 4500);
}

const falar = (f) => narr.falar(f.p, f.t);
function falarPainel(nome, sempre = true) {
  const f = C.sistema.paineis[nome];
  if (!f) return Promise.resolve();
  if (!sempre && paineisOuvidos.has(nome)) return Promise.resolve();
  paineisOuvidos.add(nome);
  narr.pararTudo();
  return falar(f);
}

// ------------------------------------------------------------ estado derivado
const missao = (id) => C.missoes.find((m) => m.id === id);
const missaoDoLote = (lote) => C.missoes.find((m) => m.lote === lote);
const nConcluidas = () => Object.keys(E.concluidas).length;

function estadoMissao(m) {
  if (E.concluidas[m.id]) return 'concluido';
  if (m.id === 'escuta') return 'disponivel';
  if (!E.concluidas.escuta) return 'bloqueado';
  // a missão final abre logo depois da missão 11 (Prédio que respira) ou com seis construções prontas
  if (m.final && !E.concluidas.predioVerde && nConcluidas() < (m.minimo || 6)) return 'bloqueado';
  return 'disponivel';
}

function nivelParticipacao() {
  if (!E.dilemas.length) return null;
  const media = E.dilemas.reduce((s, v) => s + v, 0) / E.dilemas.length;
  const idx = Math.min(4, Math.max(1, Math.round(media)));
  const chave = Object.keys(C.niveis).find((k) => C.niveis[k].valor === idx);
  return { chave, media, ...C.niveis[chave] };
}

// ------------------------------------------------------------ HUD e painéis
function atualizarHUD() {
  $('#nSementes').textContent = E.sementes;
  const est = Object.values(E.concluidas).reduce((s, c) => s + c.estrelas, 0);
  $('#nEstrelas').textContent = est;
  $('#nEstrelasMax').textContent = '/' + C.missoes.length * 3;
  const n = nivelParticipacao();
  $('#nivelAtual').textContent = n ? n.nome : 'A descobrir';
  $$('#degraus i').forEach((i, k) => i.classList.toggle('on', n && k < n.valor));
  montarMissoes(); montarItens(); montarIndicadores(); atualizarMarcadores();
}

function montarMissoes() {
  const ol = $('#listaMissoes');
  ol.innerHTML = '';
  C.missoes.forEach((m, i) => {
    const st = estadoMissao(m);
    const li = document.createElement('li');
    const b = document.createElement('button');
    b.className = `missao ${st === 'bloqueado' ? 'bloqueada' : ''} ${m.final ? 'final' : ''}`;
    b.style.setProperty('--cor', m.cor);
    const est = E.concluidas[m.id]?.estrelas || 0;
    b.innerHTML = `<span class="m-ico">${st === 'bloqueado' ? '🔒' : m.icone}</span>
      <span class="m-txt"><b>${i === 0 ? '' : i + '. '}${esc(m.titulo)}</b><small>${esc(m.nomeConstrucao)}</small></span>
      <span class="m-est">${st === 'concluido' ? '⭐'.repeat(est) + '<span style="opacity:.25">' + '⭐'.repeat(3 - est) + '</span>' : st === 'disponivel' ? '▶' : ''}</span>`;
    b.addEventListener('click', () => { sons.clique(); abrirMissao(m.id); });
    li.appendChild(b);
    ol.appendChild(li);
  });
}

function montarItens() {
  const box = $('#listaItens');
  box.innerHTML = '';
  C.itens.forEach((it) => {
    const b = document.createElement('button');
    b.className = 'item' + (E.sementes < it.custo ? ' caro' : '');
    b.innerHTML = `<span class="i-ico">${it.icone}</span><b>${esc(it.nome)}</b><small>🌱 ${it.custo}</small>`;
    b.title = it.fala.t;
    b.addEventListener('click', () => escolherItem(it));
    box.appendChild(b);
  });
}

function montarIndicadores() {
  const box = $('#listaIndicadores');
  box.innerHTML = '';
  for (const k in C.indicadores) {
    const d = C.indicadores[k], v = Math.round(E.ind[k]);
    const el = document.createElement('div');
    el.className = 'ind'; el.style.setProperty('--cor', d.cor);
    el.innerHTML = `<span class="ico">${d.icone}</span><span class="rot">${d.nome}</span><span class="barra"><i style="width:${v}%"></i></span><span class="val">${v}</span>`;
    box.appendChild(el);
  }
  // cobertura arbórea da praça (sombra das copas)
  const cob = maquete ? maquete.coberturaPraca() : 0;
  const sb = document.createElement('div');
  sb.className = 'ind sombra'; sb.style.setProperty('--cor', '#1f8a4c');
  const estado = maquete && maquete.dosselContinuo() ? '<em class="dossel ok">dossel contínuo</em>' : '<em class="dossel">sem dossel</em>';
  sb.innerHTML = `<span class="ico">🌳</span><span class="rot">Sombra na praça ${estado}</span><span class="barra"><i style="width:${cob}%"></i></span><span class="val">${cob}%</span>`;
  sb.title = 'Ouvir explicação';
  sb.addEventListener('click', () => falarPainel('sombraPraca'));
  box.appendChild(sb);
  const n = nivelParticipacao();
  $('#escada').innerHTML = '<h4>🪜 Escada da participação</h4>' + Object.entries(C.niveis).reverse().map(([k, nv]) =>
    `<div class="degrau ${n && n.chave === k ? 'atual' : ''}"><b style="background:${nv.cor}">${nv.nome}</b><span>${nv.descricao}</span></div>`).join('');
  $('#btnCertificado').disabled = !E.concluidas.conselho;
}

function atualizarMarcadores() {
  for (const m of C.missoes) {
    maquete.definirMarcador(m.lote, { icone: m.icone, titulo: m.titulo, estado: estadoMissao(m), cor: m.cor });
  }
}

function trocarAba(nome, narrar = true) {
  $$('.aba').forEach((a) => a.classList.toggle('ativa', a.dataset.aba === nome));
  $$('.conteudo-aba').forEach((c) => c.classList.toggle('oculto', c.id !== 'aba-' + nome));
  if (narrar && !emMissao) falarPainel(nome, false);
}

// ------------------------------------------------------------ missões
async function abrirMissao(id) {
  if (emMissao) return;
  const m = missao(id);
  const st = estadoMissao(m);
  if (st === 'bloqueado') {
    maquete.focarLote(m.lote);
    falarPainel(m.final && E.concluidas.escuta ? 'bloqueadaFinal' : 'bloqueada');
    return;
  }
  emMissao = true;
  maquete.cancelarColocacao(); $('#barraColocar').classList.add('oculto');
  fecharFicha();
  if (innerWidth < 820) $('#painel').classList.add('recolhido');
  narr.pararTudo();
  await maquete.focarLote(m.lote);
  const completa = await narr.sequencia(m.intro);
  void completa;

  let acertos = 0, sementesGanhas = 0, nivelDilema = null;
  const perguntas = m.perguntas;
  for (let i = 0; i < perguntas.length; i++) {
    const r = await perguntar(perguntas[i], { indice: i, total: perguntas.length, modo: 'missao', missao: m });
    if (r.sair) {
      emMissao = false;
      falarPainel('missaoCancelada');
      atualizarHUD();
      return;
    }
    if (r.acertou) acertos++;
    sementesGanhas += r.sementes;
    if (r.nivel) nivelDilema = r.nivel;
  }
  const estrelas = acertos >= 5 ? 3 : acertos >= 4 ? 2 : 1;
  const anterior = E.concluidas[m.id];
  // construção na maquete
  if (!anterior) {
    narr.pararTudo();
    await maquete.focarLote(m.lote, true);
    await falar(C.sistema.paineis.construcaoInicio);
    mostrarFicha(m);
    sons.construir();
    const anim = maquete.construir(m.lote, m.construcao, true);
    const fala = narr.falar('lia', m.ficha.texto);
    await Promise.all([anim, fala]);
    sons.conquista();
    await narr.sequencia(m.encerramento);
  }
  // pontuação e indicadores
  const fator = (s) => 0.6 + 0.2 * s;
  const fAnt = anterior ? fator(anterior.estrelas) : 0;
  const fNovo = Math.max(fAnt, fator(estrelas));
  const deltas = {};
  for (const k in m.indicadores) {
    const d = Math.round(m.indicadores[k] * (fNovo - fAnt));
    deltas[k] = d;
    E.ind[k] = Math.min(100, E.ind[k] + d);
  }
  const bonus = anterior ? 0 : 20;
  E.sementes += bonus;
  sementesGanhas += bonus;
  E.concluidas[m.id] = { estrelas: Math.max(estrelas, anterior?.estrelas || 0), acertos: Math.max(acertos, anterior?.acertos || 0) };
  salvar();
  maquete.aplicarIndicadores(E.ind);
  atualizarHUD();
  await mostrarResumo(m, { acertos, estrelas, sementesGanhas, deltas, nivelDilema });
  fecharFicha();
  emMissao = false;
  if (m.final && !anterior) {
    // primeira decisão do Conselho: o mutirão que planta o dossel contínuo da praça
    await maquete.focarLote('centro');
    await falar(C.sistema.paineis.dosselMutirao);
    sons.construir();
    await maquete.plantarDossel(true);
    sons.conquista();
    const cob = maquete.coberturaPraca();
    if (maquete.dosselContinuo() && !E.dosselFechado) {
      E.dosselFechado = true; salvar();
      toast(`🌳 Dossel fechado: ${cob}% da praça na sombra`, 'var(--verde)');
      atualizarHUD();
      await falar(C.sistema.paineis.dosselFechado);
    }
    await maquete.visaoGeral();
    maquete.explosao({ x: 0, y: 6, z: 0 }, 30, true);
    sons.conquista();
    await narr.sequencia(C.sistema.final);
    abrirCertificado();
  } else if (m.id === 'escuta' && !anterior) {
    trocarAba('missoes', false);
    $('#painel').classList.remove('recolhido');
    await maquete.visaoGeral();
    falarPainel('missoes');
  }
}

function etapasHTML(atual, modo, indice, total) {
  if (modo === 'desafio') return `<span class="etapa atual">⚡ Desafio Relâmpago · ${indice + 1} de ${total}</span>`;
  return ORDEM_ETAPAS.map((e, i) => {
    const et = C.etapas[e];
    const cls = i < indice ? 'feita' : i === indice ? 'atual' : '';
    return `<span class="etapa ${cls}">${i < indice ? '✔' : et.icone} ${et.nome}</span>`;
  }).join('');
}

function perguntar(q, { indice, total, modo }) {
  return new Promise((resolve) => {
    const modal = $('#modalPergunta');
    const etapa = C.etapas[q.etapa];
    const narrador = C.personagens[q.n];
    const dilema = q.tipo === 'Dilema participativo';
    $('#pgEtapas').innerHTML = etapasHTML(q.etapa, modo, indice, total);
    $('#pgTipo').textContent = `${etapa.icone} ${etapa.nome} · ${q.tipo}`;
    $('#pgNarr').innerHTML = `<span class="avatar" data-p="${q.n}" style="--cor:${narrador.cor}">${AVATARES[q.n]}</span>${esc(narrador.nome)}`;
    $('#pgTexto').textContent = q.q;
    const fb = $('#pgFeedback');
    fb.className = 'feedback oculto'; fb.innerHTML = '';
    const cont = $('#pgContinuar');
    cont.disabled = true;
    const alts = embaralhar(q.alt);
    const box = $('#pgAlt');
    box.innerHTML = '';
    let respondida = false;
    const botoes = alts.map((a, i) => {
      const b = document.createElement('button');
      b.className = 'alt';
      b.innerHTML = `<span class="letra">${'ABCD'[i]}</span><span class="txt">${esc(a.t)}</span><span class="alt-ouvir" role="button" tabindex="-1" title="Ouvir alternativa">🔊</span>`;
      b.querySelector('.alt-ouvir').addEventListener('click', (ev) => { ev.stopPropagation(); narr.pararTudo(); narr.sequencia([{ p: q.n, t: C.sistema.letras[i] }, { p: q.n, t: a.t }]); });
      b.addEventListener('click', () => responder(i));
      box.appendChild(b);
      return b;
    });

    const lerPergunta = (comEtapa) => {
      narr.pararTudo();
      const seq = [];
      if (comEtapa && modo === 'missao') seq.push(etapa.fala);
      seq.push({ p: q.n, t: q.q });
      if (cfg.alternativas) alts.forEach((a, i) => { seq.push({ p: q.n, t: C.sistema.letras[i] }); seq.push({ p: q.n, t: a.t }); });
      return narr.sequencia(seq);
    };
    // destaca a alternativa sendo lida
    const antigoInicio = narr.onInicio;
    narr.onInicio = (p, t) => {
      antigoInicio(p, t);
      botoes.forEach((b, i) => b.classList.toggle('falando', !respondida && alts[i].t === t));
    };

    function responder(i) {
      if (respondida) return;
      respondida = true;
      narr.pararTudo();
      botoes.forEach((b) => (b.disabled = true, b.classList.remove('falando')));
      const a = alts[i];
      let acertou, sementes = 0, nivel = null;
      if (dilema) {
        nivel = a.nivel;
        const nv = C.niveis[nivel];
        acertou = nv.valor >= 3;
        sementes = SEMENTES_DILEMA[nivel];
        E.dilemas.push(nv.valor);
        botoes.forEach((b, k) => {
          const n2 = C.niveis[alts[k].nivel];
          const chip = document.createElement('span');
          chip.className = 'nivel'; chip.style.background = n2.cor; chip.textContent = n2.nome;
          b.appendChild(chip);
          if (k === i) b.classList.add(acertou ? 'certa' : 'errada');
        });
      } else {
        acertou = !!a.c;
        sementes = acertou ? (modo === 'desafio' ? 5 : 10) : 0;
        botoes.forEach((b, k) => { if (alts[k].c) b.classList.add('certa'); else if (k === i) b.classList.add('errada'); });
      }
      E.sementes += sementes;
      salvar();
      pulso($('#nSementes').parentElement);
      atualizarHUD();
      acertou ? sons.acerto() : sons.erro();
      if (sementes) setTimeout(() => sons.moeda(), 350);
      const reacao = sortear(acertou ? C.sistema.reacoes.acerto : C.sistema.reacoes.erro);
      fb.className = 'feedback ' + (acertou ? 'ok' : 'nao');
      fb.innerHTML = `<h4>${acertou ? '✅' : '💡'} ${esc(reacao)} ${sementes ? `<small>+${sementes} 🌱</small>` : ''}</h4>` +
        (dilema ? `<p><b style="color:${C.niveis[nivel].cor}">${C.niveis[nivel].nome}.</b> ${esc(C.niveis[nivel].fala.t)}</p>` : '') +
        `<p>${esc(q.e)}</p>`;
      cont.disabled = false;
      cont.focus({ preventScroll: true });
      setTimeout(() => fb.scrollIntoView({ behavior: 'smooth', block: 'nearest' }), 80);
      const seq = [{ p: q.n, t: reacao }];
      if (dilema) seq.push(C.niveis[nivel].fala);
      seq.push({ p: q.n, t: q.e });
      setTimeout(() => narr.sequencia(seq), 120);
      resultado = { acertou, sementes, nivel };
    }
    let resultado = null;

    function fechar(r) {
      narr.pararTudo();
      narr.onInicio = antigoInicio;
      modal.classList.add('oculto');
      document.body.classList.remove('perguntando');
      document.removeEventListener('keydown', teclas);
      cont.onclick = null; $('#pgSair').onclick = null; $('#pgOuvir').onclick = null;
      resolve(r);
    }
    function teclas(e) {
      if (modal.classList.contains('oculto')) return;
      const k = e.key.toLowerCase();
      const mapa = { a: 0, b: 1, c: 2, d: 3, 1: 0, 2: 1, 3: 2, 4: 3 };
      if (!respondida && k in mapa && document.activeElement?.tagName !== 'INPUT') { e.preventDefault(); responder(mapa[k]); }
      else if (respondida && e.key === 'Enter') { e.preventDefault(); fechar(resultado); }
    }
    document.addEventListener('keydown', teclas);
    cont.onclick = () => { sons.clique(); fechar(resultado); };
    $('#pgSair').onclick = () => fechar({ sair: true });
    $('#pgOuvir').onclick = () => lerPergunta(false);
    modal.classList.remove('oculto');
    document.body.classList.add('perguntando');
    modal.scrollTop = 0;
    lerPergunta(true);
  });
}

function mostrarFicha(m) {
  const f = $('#ficha');
  f.style.setProperty('--cor', m.cor);
  $('#fichaIcone').textContent = m.icone;
  $('#fichaTitulo').textContent = m.nomeConstrucao;
  $('#fichaTexto').textContent = m.ficha.texto;
  $('#fichaItens').innerHTML = m.ficha.itens.map((i) => `<li>${esc(i)}</li>`).join('');
  $('#fichaOuvir').onclick = () => { narr.pararTudo(); narr.falar('lia', m.ficha.texto); };
  f.classList.remove('oculto');
}
function fecharFicha() { $('#ficha').classList.add('oculto'); }

function mostrarResumo(m, r) {
  return new Promise((resolve) => {
    $('#rsTitulo').textContent = m.nomeConstrucao;
    $('#rsEstrelas').innerHTML = [0, 1, 2].map((i) => `<span class="${i < r.estrelas ? '' : 'apagada'}" style="animation-delay:${0.2 + i * 0.25}s">⭐</span>`).join('');
    $('#rsAcertos').textContent = `${r.acertos} de 5`;
    $('#rsSementes').textContent = `+${r.sementesGanhas} 🌱`;
    $('#rsNivel').textContent = r.nivelDilema ? C.niveis[r.nivelDilema].nome : '—';
    $('#rsIndicadores').innerHTML = Object.entries(r.deltas).filter(([, v]) => v > 0).map(([k, v]) => `<span>${C.indicadores[k].icone} ${C.indicadores[k].nome} +${v}</span>`).join('') || '<span>Indicadores já conquistados nesta missão</span>';
    const modal = $('#modalResumo');
    modal.classList.remove('oculto');
    falar(C.sistema.paineis.missaoConcluida);
    $('#rsFechar').onclick = () => { sons.clique(); narr.pararTudo(); modal.classList.add('oculto'); resolve(); };
  });
}

// ------------------------------------------------------------ desafio relâmpago
async function desafio() {
  if (emMissao) return;
  emMissao = true;
  const banco = [...C.missoes.flatMap((m) => m.perguntas.filter((q) => q.tipo !== 'Dilema participativo')), ...C.extras];
  const qs = embaralhar(banco).slice(0, 10);
  narr.pararTudo();
  await falar(C.sistema.paineis.desafio);
  let acertos = 0;
  for (let i = 0; i < qs.length; i++) {
    const r = await perguntar(qs[i], { indice: i, total: qs.length, modo: 'desafio' });
    if (r.sair) break;
    if (r.acertou) acertos++;
  }
  E.recordeDesafio = Math.max(E.recordeDesafio || 0, acertos);
  salvar();
  emMissao = false;
  toast(`⚡ Desafio: ${acertos} de ${qs.length} acertos · recorde ${E.recordeDesafio}`, 'var(--roxo)');
  falarPainel('desafioFim');
}

// ------------------------------------------------------------ ações sustentáveis
function escolherItem(it) {
  if (emMissao) return;
  if (E.sementes < it.custo) { sons.erro(); falarPainel('sementesInsuf'); toast('Sementes insuficientes', 'var(--rosa)'); return; }
  sons.clique();
  narr.pararTudo();
  const naPraca = ARVORES.includes(it.id) && maquete.construidos.centro && maquete.vagasLivresPraca() > 0;
  narr.sequencia([it.fala, naPraca ? C.sistema.paineis.plantioPraca : C.sistema.paineis.modoColocar]);
  if (innerWidth < 820) $('#painel').classList.add('recolhido');
  $('#bcTexto').textContent = naPraca
    ? `${it.icone} ${it.nome}: clique em um canteiro circular da praça (${maquete.vagasLivresPraca()} ${maquete.vagasLivresPraca() === 1 ? 'livre' : 'livres'}) ou em um espaço livre do terreno`
    : `${it.icone} ${it.nome}: clique em um espaço livre do terreno`;
  $('#barraColocar').classList.remove('oculto');
  maquete.iniciarColocacao(it.id, (tipo, x, z) => {
    if (E.sementes < it.custo) return;
    E.sementes -= it.custo;
    const seed = Math.floor(Math.random() * 1e5);
    E.itens.push({ tipo, x: +x.toFixed(2), z: +z.toFixed(2), seed });
    for (const k in it.ind) E.ind[k] = Math.min(100, E.ind[k] + it.ind[k]);
    const antes = maquete.coberturaPraca();
    maquete.colocarItem(tipo, x, z, true, seed);
    maquete.aplicarIndicadores(E.ind);
    const depois = maquete.coberturaPraca();
    salvar();
    atualizarHUD();
    sons.moeda();
    narr.pararTudo();
    if (depois > antes) {
      toast(`${it.icone} ${it.nome} plantado na praça! Sombra: ${antes}% → ${depois}% · −${it.custo} 🌱`);
      if ((depois >= 50 || maquete.vagasLivresPraca() === 0) && !E.dosselAmpliado) { E.dosselAmpliado = true; salvar(); falar(C.sistema.paineis.dosselAmpliado); }
      else falar(C.sistema.paineis.itemColocado);
    } else {
      toast(`${it.icone} ${it.nome} adicionado! −${it.custo} 🌱`);
      falar(C.sistema.paineis.itemColocado);
    }
    sairColocacao();
  });
}
function sairColocacao() { maquete.cancelarColocacao(); $('#barraColocar').classList.add('oculto'); }

// ------------------------------------------------------------ configurações
function atualizarInfoQualidade() {
  const el = $('#cfgQualidadeInfo');
  if (!el || !maquete) return;
  const nome = QUALIDADES[maquete.qualidade].nome;
  const fps = maquete.fpsAtual ? ` · ${maquete.fpsAtual} ${maquete.fpsAtual === 1 ? 'quadro' : 'quadros'} por segundo` : '';
  el.textContent = maquete.auto ? `Agora: ${nome}${fps}. O jogo reduz ou melhora os gráficos sozinho conforme o computador acompanha.` : `Fixa em ${nome}${fps}. O ajuste automático está desligado.`;
}

function montarConfig() {
  const modo = narr.modoGravado ? '🎙️ Vozes neurais gravadas ativas: cada apresentador tem uma voz humana própria.' :
    narr.disponiveis.length ? `🗣️ Vozes do navegador: ${narr.vozesPortugues().length} voz(es) em português encontradas. Escolha uma voz diferente para cada apresentador.` :
      '⚠️ Este navegador não oferece vozes sintetizadas. A narração aparecerá como legenda.';
  $('#cfgModoVoz').textContent = modo;
  const box = $('#cfgVozes');
  box.innerHTML = '';
  const lista = [...narr.vozesPortugues(), ...narr.disponiveis.filter((v) => !/^pt/i.test(v.lang))];
  for (const p of Object.keys(C.personagens)) {
    const per = C.personagens[p];
    const linha = document.createElement('div');
    linha.className = 'cfg-voz';
    const opts = lista.map((v) => `<option value="${esc(v.voiceURI)}" ${narr.vozes[p] === v.voiceURI ? 'selected' : ''}>${esc(v.name)} (${v.lang})</option>`).join('');
    linha.innerHTML = `<span class="avatar" data-p="${p}" style="--cor:${per.cor}">${AVATARES[p]}</span>
      <div><b>${per.nome}</b><small>${per.papel} · voz ${per.genero}</small>${lista.length ? `<select aria-label="Voz de ${per.nome}">${opts}</select>` : ''}</div>
      <button class="fantasma">▶ Ouvir</button>`;
    const sel = linha.querySelector('select');
    if (sel) sel.addEventListener('change', () => { narr.definirVoz(p, sel.value); cfg.vozes[p] = sel.value; salvarCfg(); amostra(p); });
    linha.querySelector('button').addEventListener('click', () => amostra(p));
    box.appendChild(linha);
  }
  $('#cfgVelocidade').value = cfg.velocidade;
  $('#cfgVolume').value = cfg.volume;
  $('#cfgGravadas').checked = cfg.gravadas;
  $('#cfgGravadas').disabled = !Object.keys(narr.manifesto).length;
  $('#cfgAlternativas').checked = cfg.alternativas;
  $('#cfgAmbiente').checked = cfg.ambiente;
  $('#cfgEfeitos').checked = cfg.efeitos;
  $('#cfgTilt').checked = cfg.tilt;
  $('#cfgQualidade').value = cfg.qualidade;
  atualizarInfoQualidade();
}
function amostra(p) {
  const f = C.sistema.abertura.find((x) => x.p === p);
  narr.pararTudo();
  if (f) falar(f);
}

function ligarConfig() {
  $('#cfgVelocidade').addEventListener('input', (e) => { cfg.velocidade = +e.target.value; narr.velocidade = cfg.velocidade; salvarCfg(); });
  $('#cfgVolume').addEventListener('input', (e) => { cfg.volume = +e.target.value; narr.volume = cfg.volume; salvarCfg(); });
  $('#cfgGravadas').addEventListener('change', (e) => { cfg.gravadas = e.target.checked; narr.usarGravadas = cfg.gravadas; salvarCfg(); montarConfig(); });
  $('#cfgAlternativas').addEventListener('change', (e) => { cfg.alternativas = e.target.checked; salvarCfg(); });
  $('#cfgAmbiente').addEventListener('change', (e) => { cfg.ambiente = e.target.checked; sons.ambiente(cfg.ambiente); salvarCfg(); });
  $('#cfgEfeitos').addEventListener('change', (e) => { cfg.efeitos = e.target.checked; sons.efeitos = cfg.efeitos; salvarCfg(); });
  $('#cfgTilt').addEventListener('change', (e) => { cfg.tilt = e.target.checked; maquete.setTiltShift(cfg.tilt); salvarCfg(); });
  $('#cfgQualidade').addEventListener('change', (e) => {
    cfg.qualidade = e.target.value;
    if (cfg.qualidade === 'auto') {
      const ini = qualidadeInicial().nivel;
      maquete.auto = true; maquete.teto = ini;
      maquete.setQualidade(ini);
      cfg.qualidadeAuto = ini;
    } else {
      maquete.auto = false;
      maquete.setQualidade(cfg.qualidade);
    }
    salvarCfg();
    atualizarInfoQualidade();
  });
  setInterval(() => { if (!$('#modalConfig').classList.contains('oculto')) atualizarInfoQualidade(); }, 1500);
  $('#cfgReiniciar').addEventListener('click', async () => {
    if (!(await confirmar('Apagar todo o progresso e recomeçar a jornada?'))) return;
    try { localStorage.removeItem(CHAVE); } catch { /* */ }
    location.reload();
  });
}

function confirmar(texto) {
  return new Promise((res) => {
    $('#cfmTexto').textContent = texto;
    abrirModal('modalConfirmar');
    const fim = (v) => { fecharModal('modalConfirmar'); $('#cfmSim').onclick = $('#cfmNao').onclick = null; res(v); };
    $('#cfmSim').onclick = () => fim(true);
    $('#cfmNao').onclick = () => fim(false);
    $('#cfmNao').focus();
  });
}

function abrirModal(id) { $('#' + id).classList.remove('oculto'); }
function fecharModal(id) { $('#' + id).classList.add('oculto'); }

// ------------------------------------------------------------ certificado
function abrirCertificado() {
  const n = nivelParticipacao();
  const est = Object.values(E.concluidas).reduce((s, c) => s + c.estrelas, 0);
  $('#certNome').value = E.nome || '';
  $('#certNomeTxt').textContent = E.nome || '________________';
  $('#certDados').textContent = `${nConcluidas()} missões concluídas · ${est} estrelas · nível de participação: ${n ? n.nome : '—'} · ${E.itens.length} ações sustentáveis · ${maquete.coberturaPraca()}% de sombra na praça`;
  $('#certAssinaturas').innerHTML = Object.entries(C.personagens).map(([p, per]) => `<div><span class="avatar" style="--cor:${per.cor}">${AVATARES[p]}</span><i>${per.nome}</i><small>${per.papel.split(' e ')[0]}</small></div>`).join('');
  $('#certData').textContent = new Date().toLocaleDateString('pt-BR', { day: 'numeric', month: 'long', year: 'numeric' });
  abrirModal('modalCertificado');
  falarPainel('certificado');
}

// ------------------------------------------------------------ clique em construção pronta
function verConstrucao(lote) {
  if (emMissao) return;
  const m = missaoDoLote(lote);
  if (!m) return;
  maquete.focarLote(lote, true);
  mostrarFicha(m);
  narr.pararTudo();
  narr.falar('lia', m.ficha.texto);
}

// ------------------------------------------------------------ início
async function comecar(nova) {
  sons.garantir();
  narr.desbloquear();
  if (cfg.ambiente) sons.ambiente(true);
  sons.efeitos = cfg.efeitos;
  $('#telaInicial').classList.add('oculto');
  ['#hud', '#painel', '#dialogo'].forEach((s) => $(s).classList.remove('oculto'));
  $('#dialogo').classList.add('inativo');
  maquete.mostrarMarcadores(true);
  maquete.orbitar(false);
  maquete.monitorAtivo = true;
  await maquete.visaoGeral();
  if (nova || !E.introVista) {
    const ok = await narr.sequencia(C.sistema.abertura);
    E.introVista = true; salvar();
    if (ok) { maquete.focarLote('centro'); toast('🎯 Clique na Roda de Escuta, na praça central, para começar!', 'var(--laranja)'); }
  } else {
    falar(C.sistema.paineis.dia);
  }
}

function montarInicial() {
  const box = $('#tiApresentadores');
  box.innerHTML = Object.entries(C.personagens).map(([p, per]) => `
    <div class="ap-card"><span class="avatar" data-p="${p}" style="--cor:${per.cor}">${AVATARES[p]}</span>
      <b>${per.nome}</b><small>${per.papel}</small>
      <button class="fantasma ap-ouvir" data-p="${p}">▶ Ouvir voz</button></div>`).join('');
  $$('.ap-ouvir').forEach((b) => b.addEventListener('click', () => { sons.garantir(); narr.desbloquear(); $('#dialogo').classList.remove('oculto'); amostra(b.dataset.p); }));
  const temProgresso = E.introVista || nConcluidas() > 0;
  $('#btnContinuar').classList.toggle('oculto', !temProgresso);
  $('#btnIniciar').textContent = temProgresso ? '✦ Nova jornada' : '▶ Iniciar jornada';
}

function ligarEventos() {
  $('#btnIniciar').addEventListener('click', async () => {
    if (E.introVista || nConcluidas() > 0) {
      if (!(await confirmar('Começar uma nova jornada? O progresso atual será apagado.'))) return;
      try { localStorage.removeItem(CHAVE); sessionStorage.setItem('territorioVivo.iniciar', '1'); } catch { /* */ }
      location.reload();
      return;
    }
    comecar(true);
  });
  $('#btnContinuar').addEventListener('click', () => comecar(false));
  $('#btnConfigInicial').addEventListener('click', () => { montarConfig(); abrirModal('modalConfig'); });
  $('#btnAjudaInicial').addEventListener('click', () => { abrirModal('modalAjuda'); });

  $$('.aba').forEach((a) => a.addEventListener('click', () => { sons.clique(); trocarAba(a.dataset.aba); }));
  $$('.ouvir[data-painel]').forEach((b) => b.addEventListener('click', () => falarPainel(b.dataset.painel)));
  $('#painelToggle').addEventListener('click', () => {
    const p = $('#painel'); p.classList.toggle('recolhido');
    $('#painelToggle').textContent = p.classList.contains('recolhido') ? (innerWidth < 820 ? '▲' : '▶') : (innerWidth < 820 ? '▼' : '◀');
  });
  $('#btnDesafio').addEventListener('click', () => { sons.clique(); desafio(); });
  $('#btnCertificado').addEventListener('click', abrirCertificado);
  $('#btnParticipometro').addEventListener('click', () => { trocarAba('indicadores', false); $('#painel').classList.remove('recolhido'); falarPainel('participometro'); });

  $('#btnDia').addEventListener('click', () => {
    const prox = { dia: 'tarde', tarde: 'noite', noite: 'dia' }[maquete.fase];
    maquete.irPara(prox);
    $('#btnDia').textContent = { dia: '☀️', tarde: '🌇', noite: '🌙' }[prox];
    if (!emMissao) { if (prox === 'noite') falarPainel('noite'); if (prox === 'dia') falarPainel('dia'); }
  });
  $('#btnChuva').addEventListener('click', () => {
    const v = !maquete.chuva;
    maquete.setChuva(v); sons.chuva(v);
    $('#btnChuva').classList.toggle('ativo', v);
    if (v && !emMissao) falarPainel('chuva');
  });
  $('#btnVisao').addEventListener('click', () => maquete.visaoGeral());
  $('#btnSom').addEventListener('click', () => {
    cfg.mudo = !cfg.mudo; narr.mudo = cfg.mudo; salvarCfg();
    $('#btnSom').textContent = cfg.mudo ? '🔇' : '🔊';
    if (cfg.mudo) { narr.pular(); toast('Narração em modo legenda', 'var(--azul)'); } else toast('Narração com voz ligada', 'var(--azul)');
  });
  $('#btnConfig').addEventListener('click', () => { montarConfig(); abrirModal('modalConfig'); falarPainel('configuracoes', false); });
  $('#btnAjuda').addEventListener('click', () => { abrirModal('modalAjuda'); falarPainel('ajuda'); });
  $$('[data-fechar]').forEach((b) => b.addEventListener('click', () => { fecharModal(b.dataset.fechar); }));

  $('#dlgRepetir').addEventListener('click', () => { if (ultimaFala) { narr.pararTudo(); narr.falar(ultimaFala.p, ultimaFala.t); } });
  $('#dlgPular').addEventListener('click', () => narr.pular());
  $('#dlgPularTudo').addEventListener('click', () => narr.pararTudo());
  $('#fichaFechar').addEventListener('click', () => { fecharFicha(); if (!emMissao) narr.pararTudo(); });
  $('#bcCancelar').addEventListener('click', sairColocacao);
  $('#certNome').addEventListener('input', (e) => { E.nome = e.target.value; $('#certNomeTxt').textContent = E.nome || '________________'; salvar(); });
  $('#certImprimir').addEventListener('click', () => window.print());
  let incorporado = false;
  try { incorporado = window.self !== window.top; } catch { incorporado = true; }
  if (incorporado) $('#certImprimir').classList.add('oculto');
  $('#certOuvir').addEventListener('click', () => falarPainel('certificado'));

  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return;
    if (maquete.modoColocar) sairColocacao();
    ['modalConfig', 'modalAjuda', 'modalCertificado', 'modalConfirmar'].forEach(fecharModal);
  });

  maquete.callbacks.lote = (k) => { const m = missaoDoLote(k); if (!m) return; if (E.concluidas[m.id]) verConstrucao(k); else abrirMissao(m.id); };
  maquete.callbacks.construcao = (k) => verConstrucao(k);
  maquete.callbacks.qualidade = (q, fps, direcao) => {
    cfg.qualidadeAuto = q; salvarCfg();
    const nome = QUALIDADES[q].nome;
    if (direcao === 'desceu') toast(`⚙️ Gráficos reduzidos para ${nome} para o jogo ficar fluido (${fps} ${fps === 1 ? 'quadro' : 'quadros'} por segundo).`, 'var(--azul)');
    else toast(`✨ O computador tem folga: gráficos melhorados para ${nome}.`, 'var(--verde)');
    atualizarInfoQualidade();
  };
  maquete.callbacks.invalido = (motivo) => {
    const f = C.sistema.paineis[motivo];
    if (f) { toast(f.t, 'var(--rosa)'); narr.pararTudo(); falar(f); }
    else toast('Escolha um espaço livre de grama, longe de ruas, casas, lotes e do rio.', 'var(--rosa)');
  };
}

async function iniciar() {
  try {
    C = await (await fetch('data/conteudo.json')).json();
  } catch (e) {
    $('#carregandoErro').textContent = 'Não foi possível carregar o conteúdo. Abra o jogo por um servidor (GitHub Pages ou servidor local), e não diretamente pelo arquivo.';
    throw e;
  }
  try { await Promise.race([document.fonts.ready, new Promise((r) => setTimeout(r, 2500))]); } catch { /* */ }
  const cfgSalva = lerLocal(CHAVE_CFG) || {};
  cfg = { ...cfgPadrao(), ...cfgSalva };
  // versões anteriores guardavam uma qualidade fixa; passa a usar o ajuste automático
  if (cfgSalva.versaoQualidade !== 2) { cfg.qualidade = 'auto'; cfg.qualidadeAuto = null; cfg.versaoQualidade = 2; salvarCfg(); }
  E = { ...estadoInicial(), ...(lerLocal(CHAVE) || {}) };
  sons = new Sons();
  sons.efeitos = cfg.efeitos;
  narr = new Narrador(C.personagens, C.pronuncia || {});
  Object.assign(narr, { velocidade: cfg.velocidade, volume: cfg.volume, usarGravadas: cfg.gravadas, mudo: cfg.mudo });
  narr.onInicio = mostrarFala;
  narr.onFim = fimFala;
  $('#btnSom').textContent = cfg.mudo ? '🔇' : '🔊';

  const auto = cfg.qualidade === 'auto' || !QUALIDADES[cfg.qualidade];
  const teto = qualidadeInicial().nivel;
  // no modo automático, começa no nível que funcionou da última vez (sem passar do estimado para a placa)
  const ultimo = cfg.qualidadeAuto && QUALIDADES[cfg.qualidadeAuto] ? cfg.qualidadeAuto : teto;
  const NV = Object.keys(QUALIDADES);
  const inicial = auto ? NV[Math.max(NV.indexOf(teto), NV.indexOf(ultimo))] : cfg.qualidade;
  maquete = new Maquete($('#cena'), { qualidade: inicial, auto, teto, tiltShift: cfg.tilt });
  await maquete.init();
  await narr.init(cfg.vozes);
  // restaura progresso salvo
  for (const id in E.concluidas) { const m = missao(id); if (m) maquete.construir(m.lote, m.construcao, false); }
  if (E.concluidas.conselho) maquete.plantarDossel(false);
  E.itens.forEach((i) => maquete.colocarItem(i.tipo, i.x, i.z, false, i.seed));
  maquete.aplicarIndicadores(E.ind);
  ligarEventos();
  ligarConfig();
  maquete.monitorAtivo = true;
  atualizarHUD();
  montarInicial();
  maquete.mostrarMarcadores(false);
  maquete.orbitar(true);
  $('#carregando').classList.add('sumir');
  setTimeout(() => $('#carregando').remove(), 900);
  let autoIniciar = false;
  try { autoIniciar = sessionStorage.getItem('territorioVivo.iniciar') === '1'; sessionStorage.removeItem('territorioVivo.iniciar'); } catch { /* */ }
  $('#telaInicial').classList.remove('oculto');
  if (autoIniciar) toast('Nova jornada pronta! Clique em “Iniciar jornada”.', 'var(--laranja)');
  window.__territorio = { maquete, narr, get estado() { return E; } };
}

iniciar().catch((e) => {
  console.error(e);
  const el = $('#carregandoErro');
  if (el && !el.textContent) el.textContent = 'Ocorreu um erro ao iniciar o jogo: ' + e.message;
});
