// Texturas procedurais geradas em canvas (sem arquivos externos).
import * as THREE from 'three';

let ANISO = 4;
export function definirAnisotropia(v) { ANISO = v; }

function canvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  return [c, c.getContext('2d')];
}

function tex(c, { repetir = false, srgb = true } = {}) {
  const t = new THREE.CanvasTexture(c);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = ANISO;
  if (repetir) { t.wrapS = t.wrapT = THREE.RepeatWrapping; }
  return t;
}

// Gerador pseudoaleatório determinístico
export function rng(seed = 1) {
  let a = seed >>> 0;
  return () => {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ---------- Piso da praça ----------
export function texPiso(viva = true) {
  const S = 1024;
  const [c, g] = canvas(S, S);
  const r = rng(viva ? 7 : 3);
  const cx = S / 2;
  g.fillStyle = viva ? '#efe2c8' : '#9b9a96';
  g.fillRect(0, 0, S, S);
  const cores = viva ? ['#e9845c', '#f3c969', '#f6ead2', '#5bc0be', '#f6ead2', '#e9845c'] : ['#8d8c88', '#a3a29d', '#7e7d79'];
  // anéis de pedras
  let anel = 0;
  for (let rad = 40; rad < S / 2; rad += 34) {
    const n = Math.floor((2 * Math.PI * rad) / 30);
    for (let i = 0; i < n; i++) {
      const a0 = (i / n) * Math.PI * 2, a1 = ((i + 0.86) / n) * Math.PI * 2;
      g.beginPath();
      g.arc(cx, cx, rad + 14, a0, a1);
      g.arc(cx, cx, rad - 14, a1, a0, true);
      g.closePath();
      let cor = cores[(anel + (viva ? (i % 7 === 0 ? 3 : 0) : 0)) % cores.length];
      if (!viva) cor = cores[Math.floor(r() * cores.length)];
      g.fillStyle = cor;
      g.globalAlpha = 0.85 + r() * 0.15;
      g.fill();
    }
    anel++;
  }
  g.globalAlpha = 1;
  if (viva) {
    // sol central
    g.fillStyle = '#ffd23f';
    g.beginPath(); g.arc(cx, cx, 46, 0, Math.PI * 2); g.fill();
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2;
      g.beginPath();
      g.moveTo(cx + Math.cos(a - 0.12) * 46, cx + Math.sin(a - 0.12) * 46);
      g.lineTo(cx + Math.cos(a) * 92, cx + Math.sin(a) * 92);
      g.lineTo(cx + Math.cos(a + 0.12) * 46, cx + Math.sin(a + 0.12) * 46);
      g.fill();
    }
  } else {
    // rachaduras e manchas
    g.strokeStyle = 'rgba(40,40,40,.55)';
    for (let k = 0; k < 40; k++) {
      g.lineWidth = 1 + r() * 2;
      g.beginPath();
      let x = r() * S, y = r() * S;
      g.moveTo(x, y);
      for (let j = 0; j < 6; j++) { x += (r() - 0.5) * 70; y += (r() - 0.5) * 70; g.lineTo(x, y); }
      g.stroke();
    }
    for (let k = 0; k < 30; k++) {
      g.fillStyle = `rgba(60,50,40,${0.12 + r() * 0.2})`;
      g.beginPath(); g.ellipse(r() * S, r() * S, 20 + r() * 60, 10 + r() * 40, r() * 3, 0, Math.PI * 2); g.fill();
    }
  }
  return tex(c);
}

// ---------- Pintura de urbanismo tático ----------
export function texPintura() {
  const S = 1024;
  const [c, g] = canvas(S, S);
  const r = rng(11);
  g.fillStyle = '#3b4252'; g.fillRect(0, 0, S, S);
  const pal = ['#ff4d8d', '#ffd23f', '#3fa9f5', '#2fbf71', '#ff8a3d', '#8b5cf6', '#00d1c1'];
  for (let i = 0; i < 70; i++) {
    const x = r() * S, y = r() * S * 0.78, rad = 18 + r() * 60;
    g.fillStyle = pal[i % pal.length];
    g.globalAlpha = 0.95;
    g.beginPath(); g.arc(x, y, rad, 0, Math.PI * 2); g.fill();
    if (r() > 0.5) {
      g.fillStyle = '#ffffff'; g.globalAlpha = 0.9;
      g.beginPath(); g.arc(x, y, rad * 0.35, 0, Math.PI * 2); g.fill();
    }
  }
  g.globalAlpha = 1;
  // faixa de pedestres
  g.fillStyle = '#ffffff';
  for (let i = 0; i < 9; i++) g.fillRect(40 + i * 110, S * 0.82, 70, S * 0.15);
  // amarelinha
  g.strokeStyle = '#ffffff'; g.lineWidth = 8;
  const ax = S * 0.72, ay = S * 0.12;
  const casas = [[0, 0], [0, 1], [-0.5, 2], [0.5, 2], [0, 3], [-0.5, 4], [0.5, 4], [0, 5]];
  casas.forEach(([dx, dy], k) => {
    g.fillStyle = pal[k % pal.length];
    g.fillRect(ax + dx * 80 - 40, ay + dy * 80, 80, 80);
    g.strokeRect(ax + dx * 80 - 40, ay + dy * 80, 80, 80);
  });
  return tex(c);
}

// ---------- Fachada com janelas (mapa + emissivo) ----------
export function texFachada({ parede = '#f5f1e8', vidro = '#2d6a8a', colunas = 4, linhas = 6, seed = 5, w = 256, h = 512 } = {}) {
  const [c, g] = canvas(w, h);
  const [ce, ge] = canvas(w, h);
  const r = rng(seed);
  g.fillStyle = parede; g.fillRect(0, 0, w, h);
  ge.fillStyle = '#000'; ge.fillRect(0, 0, w, h);
  const mx = w / colunas, my = h / linhas;
  for (let i = 0; i < colunas; i++) for (let j = 0; j < linhas; j++) {
    const x = i * mx + mx * 0.18, y = j * my + my * 0.2, ww = mx * 0.64, hh = my * 0.55;
    g.fillStyle = 'rgba(0,0,0,.18)'; g.fillRect(x - 3, y - 3, ww + 6, hh + 6);
    const grad = g.createLinearGradient(x, y, x + ww, y + hh);
    grad.addColorStop(0, vidro); grad.addColorStop(1, '#9fd8f0');
    g.fillStyle = grad; g.fillRect(x, y, ww, hh);
    g.fillStyle = 'rgba(255,255,255,.35)'; g.fillRect(x + ww / 2 - 1, y, 2, hh);
    if (r() > 0.45) {
      ge.fillStyle = r() > 0.3 ? '#ffd27a' : '#ffb347';
      ge.fillRect(x, y, ww, hh);
    }
  }
  const map = tex(c, { repetir: true });
  const emissivo = tex(ce, { repetir: true });
  return { map, emissivo };
}

// ---------- Casa simples (janelas e porta) ----------
export function texCasa() {
  const w = 256, h = 128;
  const [c, g] = canvas(w, h);
  const [ce, ge] = canvas(w, h);
  g.fillStyle = '#ffffff'; g.fillRect(0, 0, w, h);
  ge.fillStyle = '#000'; ge.fillRect(0, 0, w, h);
  // janelas
  [[30, 40], [180, 40]].forEach(([x, y]) => {
    g.fillStyle = '#5a4a3a'; g.fillRect(x - 4, y - 4, 54, 50);
    g.fillStyle = '#35556e'; g.fillRect(x, y, 46, 42);
    g.fillStyle = 'rgba(255,255,255,.5)'; g.fillRect(x + 22, y, 2, 42); g.fillRect(x, y + 20, 46, 2);
    ge.fillStyle = '#ffcf70'; ge.fillRect(x, y, 46, 42);
  });
  // porta
  g.fillStyle = '#6b4226'; g.fillRect(110, 50, 36, 78);
  g.fillStyle = '#e8c14a'; g.beginPath(); g.arc(140, 92, 3, 0, 7); g.fill();
  return { map: tex(c), emissivo: tex(ce) };
}

// ---------- Painel solar ----------
export function texSolar() {
  const S = 256;
  const [c, g] = canvas(S, S);
  g.fillStyle = '#c9d2dc'; g.fillRect(0, 0, S, S);
  const n = 6;
  for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) {
    const grad = g.createLinearGradient(0, j * S / n, 0, (j + 1) * S / n);
    grad.addColorStop(0, '#1d3f8f'); grad.addColorStop(1, '#0f2557');
    g.fillStyle = grad;
    g.fillRect(i * S / n + 3, j * S / n + 3, S / n - 6, S / n - 6);
  }
  return tex(c, { repetir: true });
}

// ---------- Toldo listrado ----------
export function texToldo(c1 = '#ff4d8d', c2 = '#ffffff') {
  const [c, g] = canvas(256, 64);
  for (let i = 0; i < 8; i++) { g.fillStyle = i % 2 ? c2 : c1; g.fillRect(i * 32, 0, 32, 64); }
  return tex(c, { repetir: true });
}

// ---------- Mural colorido ----------
export function texMural(seed = 21) {
  const [c, g] = canvas(512, 256);
  const r = rng(seed);
  const pal = ['#ff8a3d', '#ffd23f', '#2fbf71', '#3fa9f5', '#ff4d8d', '#8b5cf6', '#00d1c1'];
  g.fillStyle = '#fff4e0'; g.fillRect(0, 0, 512, 256);
  for (let i = 0; i < 26; i++) {
    g.fillStyle = pal[Math.floor(r() * pal.length)];
    g.beginPath();
    if (r() > 0.5) g.arc(r() * 512, r() * 256, 12 + r() * 50, 0, 7);
    else g.ellipse(r() * 512, r() * 256, 10 + r() * 40, 30 + r() * 60, r() * 3, 0, 7);
    g.fill();
  }
  // figuras humanas estilizadas de mãos dadas
  g.fillStyle = '#5a3e2b';
  for (let i = 0; i < 7; i++) {
    const x = 50 + i * 68, y = 170;
    g.beginPath(); g.arc(x, y - 40, 12, 0, 7); g.fill();
    g.fillRect(x - 8, y - 28, 16, 44);
    g.fillRect(x - 30, y - 22, 60, 6);
  }
  return tex(c);
}

// ---------- Mapa comunitário ----------
export function texMapa() {
  const [c, g] = canvas(512, 384);
  const r = rng(9);
  g.fillStyle = '#fdf6e3'; g.fillRect(0, 0, 512, 384);
  g.fillStyle = '#bfe3b4';
  for (let i = 0; i < 10; i++) { g.beginPath(); g.ellipse(r() * 512, r() * 384, 30 + r() * 50, 20 + r() * 40, r() * 3, 0, 7); g.fill(); }
  g.strokeStyle = '#7cc6f2'; g.lineWidth = 18;
  g.beginPath(); g.moveTo(0, 300); g.bezierCurveTo(140, 220, 260, 380, 512, 260); g.stroke();
  g.strokeStyle = '#9aa0a6'; g.lineWidth = 10;
  g.beginPath(); g.moveTo(256, 0); g.lineTo(256, 384); g.moveTo(0, 170); g.lineTo(512, 170); g.stroke();
  g.beginPath(); g.arc(256, 170, 60, 0, 7); g.stroke();
  const pal = ['#ff4d8d', '#ffd23f', '#2fbf71', '#3fa9f5', '#ff8a3d', '#8b5cf6'];
  for (let i = 0; i < 16; i++) {
    const x = 30 + r() * 450, y = 30 + r() * 320;
    g.fillStyle = pal[i % pal.length];
    g.beginPath(); g.arc(x, y, 11, 0, 7); g.fill();
    g.beginPath(); g.moveTo(x - 8, y + 5); g.lineTo(x, y + 22); g.lineTo(x + 8, y + 5); g.fill();
  }
  g.strokeStyle = '#5a3e2b'; g.lineWidth = 10; g.strokeRect(5, 5, 502, 374);
  return tex(c);
}

// ---------- Placa com texto ----------
export function texPlaca(texto, fundo = '#2fbf71', cor = '#ffffff') {
  const [c, g] = canvas(1024, 256);
  g.fillStyle = fundo;
  const rr = 48;
  g.beginPath();
  g.moveTo(rr, 0); g.lineTo(1024 - rr, 0); g.quadraticCurveTo(1024, 0, 1024, rr);
  g.lineTo(1024, 256 - rr); g.quadraticCurveTo(1024, 256, 1024 - rr, 256);
  g.lineTo(rr, 256); g.quadraticCurveTo(0, 256, 0, 256 - rr);
  g.lineTo(0, rr); g.quadraticCurveTo(0, 0, rr, 0); g.fill();
  g.strokeStyle = 'rgba(255,255,255,.55)'; g.lineWidth = 12; g.stroke();
  g.fillStyle = cor;
  let tam = 120;
  g.font = `800 ${tam}px "Baloo 2", "Nunito", system-ui, sans-serif`;
  while (g.measureText(texto).width > 940 && tam > 40) { tam -= 6; g.font = `800 ${tam}px "Baloo 2", "Nunito", system-ui, sans-serif`; }
  g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillText(texto, 512, 136);
  return tex(c);
}

// ---------- Estratos do solo (laterais da maquete) ----------
export function texEstratos() {
  const [c, g] = canvas(1024, 256);
  const r = rng(4);
  const faixas = [['#4f8f3a', 0, 14], ['#5b3a1e', 14, 70], ['#7a4b26', 70, 130], ['#b5652d', 130, 190], ['#8c8378', 190, 256]];
  faixas.forEach(([cor, y0, y1]) => {
    g.fillStyle = cor; g.fillRect(0, y0, 1024, y1 - y0);
    g.beginPath();
    g.moveTo(0, y1);
    for (let x = 0; x <= 1024; x += 32) g.lineTo(x, y1 + (r() - 0.5) * 10);
    g.lineTo(1024, y1 + 10); g.lineTo(0, y1 + 10); g.fill();
  });
  for (let i = 0; i < 500; i++) {
    const y = 20 + r() * 236;
    g.fillStyle = `rgba(${y > 190 ? '220,220,220' : '30,20,10'},${0.15 + r() * 0.3})`;
    g.beginPath(); g.ellipse(r() * 1024, y, 2 + r() * 7, 1 + r() * 4, r() * 3, 0, 7); g.fill();
  }
  // raízes
  g.strokeStyle = 'rgba(230,200,150,.5)'; g.lineWidth = 2;
  for (let i = 0; i < 40; i++) {
    let x = r() * 1024, y = 14;
    g.beginPath(); g.moveTo(x, y);
    for (let k = 0; k < 5; k++) { x += (r() - 0.5) * 20; y += 8 + r() * 10; g.lineTo(x, y); }
    g.stroke();
  }
  return tex(c, { repetir: true });
}

// ---------- Mapa normal procedural para a água ----------
export function texAguaNormal() {
  const S = 256;
  const [c, g] = canvas(S, S);
  const alt = new Float32Array(S * S);
  const r = rng(13);
  const ondas = Array.from({ length: 14 }, () => ({ kx: Math.round((r() - 0.5) * 16), ky: Math.round((r() - 0.5) * 16), f: r() * 6.28, a: 0.3 + r() }));
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    let h = 0;
    for (const o of ondas) h += Math.sin(((x * o.kx + y * o.ky) / S) * Math.PI * 2 + o.f) * o.a;
    alt[y * S + x] = h;
  }
  const img = g.createImageData(S, S);
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const hL = alt[y * S + ((x - 1 + S) % S)], hR = alt[y * S + ((x + 1) % S)];
    const hD = alt[((y - 1 + S) % S) * S + x], hU = alt[((y + 1) % S) * S + x];
    let nx = (hL - hR) * 0.6, ny = (hD - hU) * 0.6, nz = 1;
    const l = Math.hypot(nx, ny, nz); nx /= l; ny /= l; nz /= l;
    const i = (y * S + x) * 4;
    img.data[i] = (nx * 0.5 + 0.5) * 255; img.data[i + 1] = (ny * 0.5 + 0.5) * 255; img.data[i + 2] = (nz * 0.5 + 0.5) * 255; img.data[i + 3] = 255;
  }
  g.putImageData(img, 0, 0);
  return tex(c, { repetir: true, srgb: false });
}

// ---------- Ponto de luz suave (sprites, vaga-lumes) ----------
export function texBrilho() {
  const [c, g] = canvas(64, 64);
  const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grad.addColorStop(0, 'rgba(255,255,255,1)');
  grad.addColorStop(0.3, 'rgba(255,255,255,.6)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grad; g.fillRect(0, 0, 64, 64);
  return tex(c);
}
