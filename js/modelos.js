// Modelos 3D procedurais das construções sustentáveis, itens e elementos da maquete.
// Convenção: cada construção ocupa um lote de ~14 x 14 m; o eixo +z local aponta para a praça.
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';
import * as T from './texturas.js';

export const U = { tempo: { value: 0 } };
export const NOTURNOS = [];          // materiais que acendem à noite
export const ANIMADOS = [];          // funções chamadas a cada quadro

const geoCache = new Map();
const matCache = new Map();

// ---------------- materiais ----------------
export function mat(cor, o = {}) {
  if (cor && cor.isMaterial) return cor;
  const chave = String(cor) + '|' + JSON.stringify(o);
  if (matCache.has(chave)) return matCache.get(chave);
  const m = new THREE.MeshStandardMaterial({
    color: cor,
    roughness: o.r ?? 0.72,
    metalness: o.m ?? 0,
    flatShading: !!o.flat,
    transparent: o.op !== undefined,
    opacity: o.op ?? 1,
    side: o.ds ? THREE.DoubleSide : THREE.FrontSide,
  });
  if (o.e !== undefined) { m.emissive = new THREE.Color(o.e); m.emissiveIntensity = o.ei ?? 1; }
  matCache.set(chave, m);
  return m;
}

export function noturno(m, max = 1.6) { NOTURNOS.push({ mat: m, max }); m.emissiveIntensity = 0; return m; }

export const matLuz = noturno(new THREE.MeshStandardMaterial({ color: 0xfff3c4, emissive: 0xffc861, emissiveIntensity: 0, roughness: 0.3 }), 4);
export const matTela = noturno(new THREE.MeshStandardMaterial({ color: 0x1b2a3a, emissive: 0x38e1ff, emissiveIntensity: 0, roughness: 0.2 }), 1.4);

function vento(m, forca = 0.06, chave = 'v') {
  m.onBeforeCompile = (sh) => {
    sh.uniforms.uTempo = U.tempo;
    sh.vertexShader = 'uniform float uTempo;\n' + sh.vertexShader.replace('#include <begin_vertex>', `
      #include <begin_vertex>
      vec4 wpV = modelMatrix * vec4(position, 1.0);
      #ifdef USE_INSTANCING
        wpV = modelMatrix * instanceMatrix * vec4(position, 1.0);
      #endif
      float hV = clamp(position.y + 1.0, 0.0, 3.0);
      float faseV = wpV.x * 0.17 + wpV.z * 0.13;
      transformed.x += sin(uTempo * 1.7 + faseV) * ${forca.toFixed(3)} * hV;
      transformed.z += cos(uTempo * 1.3 + faseV * 1.4) * ${(forca * 0.7).toFixed(3)} * hV;
    `);
  };
  m.customProgramCacheKey = () => 'vento-' + chave + forca;
  return m;
}

export function matFolha(cor, forca = 0.05) {
  const chave = 'folha|' + cor + '|' + forca;
  if (matCache.has(chave)) return matCache.get(chave);
  const m = vento(new THREE.MeshStandardMaterial({ color: cor, roughness: 0.82 }), forca, 'f');
  matCache.set(chave, m);
  return m;
}

function matFolhaPlana(cor) {
  const chave = 'folhaPlana|' + cor;
  if (matCache.has(chave)) return matCache.get(chave);
  const m = vento(new THREE.MeshStandardMaterial({ color: cor, roughness: 0.7, side: THREE.DoubleSide }), 0.12, 'p');
  matCache.set(chave, m);
  return m;
}

// ---------------- geometrias ----------------
function gBox(w, h, d, arred = true) {
  const k = `b${w}|${h}|${d}|${arred}`;
  if (!geoCache.has(k)) geoCache.set(k, arred ? new RoundedBoxGeometry(w, h, d, 2, Math.min(w, h, d) * 0.14) : new THREE.BoxGeometry(w, h, d));
  return geoCache.get(k);
}
function gCil(rt, rb, h, seg = 20) {
  const k = `c${rt}|${rb}|${h}|${seg}`;
  if (!geoCache.has(k)) geoCache.set(k, new THREE.CylinderGeometry(rt, rb, h, seg));
  return geoCache.get(k);
}
function gEsf(r, s1 = 20, s2 = 14) {
  const k = `s${r}|${s1}|${s2}`;
  if (!geoCache.has(k)) geoCache.set(k, new THREE.SphereGeometry(r, s1, s2));
  return geoCache.get(k);
}
function gCone(r, h, seg = 20) {
  const k = `k${r}|${h}|${seg}`;
  if (!geoCache.has(k)) geoCache.set(k, new THREE.ConeGeometry(r, h, seg));
  return geoCache.get(k);
}

let _folhaGeo;
export function geoFolha() {
  if (_folhaGeo) return _folhaGeo;
  let g = new THREE.IcosahedronGeometry(1, 3);
  g.deleteAttribute('normal'); g.deleteAttribute('uv');
  g = mergeVertices(g);
  const p = g.attributes.position, v = new THREE.Vector3();
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i);
    const n = 1 + 0.11 * Math.sin(v.x * 4.1 + v.y * 3.3) * Math.cos(v.z * 3.7) + 0.06 * Math.sin(v.y * 9 + v.x * 7) + 0.04 * Math.cos(v.z * 11 - v.x * 5);
    v.multiplyScalar(n);
    p.setXYZ(i, v.x, v.y, v.z);
  }
  g.computeVertexNormals();
  _folhaGeo = g;
  return g;
}

let _folhaBanana;
function geoFolhaBanana(larg = 0.85, comp = 3, queda = 1.2) {
  const k = `fb${larg}|${comp}|${queda}`;
  if (geoCache.has(k)) return geoCache.get(k);
  const g = new THREE.PlaneGeometry(larg, comp, 2, 8);
  g.translate(0, comp / 2, 0);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const y = p.getY(i), x = p.getX(i);
    const t = y / comp;
    p.setX(i, x * Math.sin(Math.PI * Math.min(1, t * 1.15 + 0.08)));
    p.setZ(i, t * t * queda + Math.abs(x) * 0.25);
  }
  g.computeVertexNormals();
  geoCache.set(k, g);
  return g;
}

// ---------------- primitivas posicionadas ----------------
function malha(geo, material) {
  const me = new THREE.Mesh(geo, material);
  me.castShadow = true; me.receiveShadow = true;
  return me;
}
export function caixa(w, h, d, cor, x = 0, y = 0, z = 0, o = {}) {
  const me = malha(gBox(w, h, d, o.arred !== false), mat(cor, o));
  me.position.set(x, y + h / 2, z);
  return me;
}
export function cil(rt, rb, h, cor, x = 0, y = 0, z = 0, o = {}) {
  const me = malha(gCil(rt, rb, h, o.seg || 20), mat(cor, o));
  me.position.set(x, y + h / 2, z);
  return me;
}
export function esf(r, cor, x = 0, y = 0, z = 0, o = {}) {
  const me = malha(gEsf(r, o.seg || 20, o.seg2 || 14), mat(cor, o));
  me.position.set(x, y, z);
  return me;
}
export function cone(r, h, cor, x = 0, y = 0, z = 0, o = {}) {
  const me = malha(gCone(r, h, o.seg || 20), mat(cor, o));
  me.position.set(x, y + h / 2, z);
  return me;
}
function ad(pai, obj) { pai.add(obj); return obj; }
function grupo(...filhos) { const g = new THREE.Group(); filhos.forEach((f) => f && g.add(f)); return g; }
function em(obj, x = 0, y = 0, z = 0, ry = 0, s = 1) { obj.position.set(x, y, z); obj.rotation.y = ry; obj.scale.setScalar(s); return obj; }

const MADEIRA = 0xb07a45, MADEIRA_ESC = 0x7a5230, TRONCO = 0x6e4a2c, CONCRETO = 0xd9d4cc, METAL = 0x5d6670, TERRA = 0x6b4a2b;

// ---------------- vegetação ----------------
export function arvore(tipo = 'redonda', o = {}) {
  const g = new THREE.Group();
  const r = T.rng(o.seed ?? Math.floor(Math.random() * 1e6));
  const s = o.escala ?? 1;
  const folha = (cor, x, y, z, rad, sy = 1) => {
    const f = malha(geoFolha(), matFolha(cor));
    f.scale.set(rad, rad * sy, rad); f.position.set(x, y, z);
    f.rotation.y = r() * 6.28;
    g.add(f);
    return f;
  };
  const variantes = (base) => {
    const c = new THREE.Color(base);
    return [c.getHex(), c.clone().offsetHSL(0.01, 0.02, 0.07).getHex(), c.clone().offsetHSL(-0.01, 0, -0.07).getHex()];
  };
  if (tipo === 'redonda' || tipo === 'frutifera') {
    const h = 2.4 * s;
    g.add(cil(0.17 * s, 0.3 * s, h, TRONCO));
    const cores = variantes(o.cor ?? 0x3fae49);
    const blobs = [];
    for (let i = 0; i < 4; i++) {
      blobs.push(folha(cores[i % 3], (r() - 0.5) * 1.5 * s, h + (0.7 + r() * 1.0) * s, (r() - 0.5) * 1.5 * s, (1.15 + r() * 0.6) * s));
    }
    if (o.frutos) {
      for (let i = 0; i < 16; i++) {
        const b = blobs[i % blobs.length];
        const dir = new THREE.Vector3(r() - 0.5, r() * 0.8 - 0.2, r() - 0.5).normalize();
        const p = b.position.clone().addScaledVector(dir, b.scale.x * 0.95);
        g.add(esf(0.13 * s, o.frutos, p.x, p.y, p.z, { r: 0.35, seg: 10, seg2: 8 }));
      }
    }
  } else if (tipo === 'ipe') {
    const h = 2.8 * s;
    const t1 = cil(0.16 * s, 0.32 * s, h, TRONCO); t1.rotation.z = 0.05; g.add(t1);
    const galho = cil(0.08 * s, 0.13 * s, 1.6 * s, TRONCO, 0.5 * s, h - 0.6 * s, 0); galho.rotation.z = -0.7; g.add(galho);
    const amarelos = [0xffcf33, 0xffdd55, 0xf7b801];
    for (let i = 0; i < 6; i++) {
      folha(amarelos[i % 3], (r() - 0.5) * 2.4 * s, h + (0.5 + r() * 1.1) * s, (r() - 0.5) * 2.4 * s, (0.9 + r() * 0.6) * s, 0.8);
    }
    folha(0x58a83c, 0.3 * s, h + 0.2 * s, -0.4 * s, 0.7 * s, 0.7);
  } else if (tipo === 'araucaria') {
    const h = 7.5 * s;
    g.add(cil(0.14 * s, 0.32 * s, h, 0x5b3a22));
    for (let i = 0; i < 7; i++) {
      const a = (i / 7) * Math.PI * 2;
      const br = cil(0.05 * s, 0.07 * s, 1.9 * s, 0x5b3a22, 0, 0, 0);
      br.position.set(Math.cos(a) * 0.8 * s, h - 0.4 * s, Math.sin(a) * 0.8 * s);
      br.rotation.set(Math.sin(a) * 0.9, 0, -Math.cos(a) * 0.9);
      g.add(br);
      folha(0x2d6a3e, Math.cos(a) * 1.6 * s, h + 0.45 * s, Math.sin(a) * 1.6 * s, 0.8 * s, 0.35);
    }
    folha(0x2f7442, 0, h + 0.6 * s, 0, 1.0 * s, 0.4);
  } else if (tipo === 'bananeira') {
    const h = 2.1 * s;
    g.add(cil(0.2 * s, 0.3 * s, h, 0x8b9a3e));
    const n = 7;
    for (let i = 0; i < n; i++) {
      const f = malha(geoFolhaBanana(0.85 * s, 2.8 * s, 1.3 * s), matFolhaPlana(i % 2 ? 0x5cb85c : 0x4aa54a));
      f.position.y = h - 0.1 * s;
      f.rotation.order = 'YXZ';
      f.rotation.y = (i / n) * Math.PI * 2 + r() * 0.3;
      f.rotation.x = 0.5 + r() * 0.35;
      g.add(f);
    }
    if (o.cacho !== false) {
      for (let i = 0; i < 8; i++) g.add(esf(0.12 * s, 0xc9d64a, 0.35 * s + Math.cos(i) * 0.12, h - 0.4 * s - (i % 4) * 0.12 * s, Math.sin(i) * 0.12, { seg: 8, seg2: 6 }));
      const flor = cone(0.12 * s, 0.35 * s, 0x7b2d59, 0.35 * s, h - 1.25 * s, 0); flor.rotation.x = Math.PI; g.add(flor);
    }
  } else if (tipo === 'palmeira') {
    let x = 0, y = 0;
    const seg = 5, hs = 1.25 * s;
    for (let i = 0; i < seg; i++) {
      const c = cil(0.15 * s, 0.18 * s, hs, 0x8a7a5c, x, y, 0, { seg: 12 });
      c.rotation.z = -0.05 * i;
      g.add(c);
      x += Math.sin(0.05 * i) * hs; y += Math.cos(0.05 * i) * hs * 0.98;
    }
    for (let i = 0; i < 10; i++) {
      const f = malha(geoFolhaBanana(0.45 * s, 3.2 * s, 1.9 * s), matFolhaPlana(i % 2 ? 0x3f9a45 : 0x4cae4f));
      f.position.set(x, y, 0);
      f.rotation.order = 'YXZ';
      f.rotation.y = (i / 10) * Math.PI * 2;
      f.rotation.x = 0.85 + r() * 0.35;
      g.add(f);
    }
    for (let i = 0; i < 6; i++) g.add(esf(0.1 * s, 0xff8c1a, x + Math.cos(i) * 0.25, y - 0.4, Math.sin(i) * 0.25, { seg: 8, seg2: 6 }));
  } else if (tipo === 'arbusto') {
    const cores = variantes(o.cor ?? 0x4caf50);
    for (let i = 0; i < 3; i++) folha(cores[i], (r() - 0.5) * 0.9 * s, (0.45 + r() * 0.2) * s, (r() - 0.5) * 0.9 * s, (0.5 + r() * 0.3) * s, 0.85);
    if (o.flores) for (let i = 0; i < 8; i++) g.add(esf(0.08 * s, o.flores, (r() - 0.5) * 1.3 * s, (0.6 + r() * 0.4) * s, (r() - 0.5) * 1.3 * s, { seg: 8, seg2: 6 }));
  } else if (tipo === 'morta') {
    g.add(cil(0.12 * s, 0.25 * s, 2.6 * s, 0x6b6560));
    for (let i = 0; i < 3; i++) {
      const b = cil(0.04 * s, 0.08 * s, 1.3 * s, 0x6b6560, 0, 1.6 * s + i * 0.35 * s, 0);
      b.rotation.set((r() - 0.5) * 1.6, r() * 6, (r() - 0.5) * 1.8);
      g.add(b);
    }
  }
  return g;
}

export function canteiroFlores(w = 2.4, d = 1.2, seed = 1, o = {}) {
  const g = new THREE.Group();
  const r = T.rng(seed);
  g.add(caixa(w, 0.3, d, o.borda ?? MADEIRA, 0, 0, 0));
  g.add(caixa(w - 0.2, 0.06, d - 0.2, TERRA, 0, 0.28, 0, { arred: false }));
  const pal = o.cores ?? [0xff4d8d, 0xffd23f, 0xff8a3d, 0xc77dff, 0xffffff, 0x3fa9f5];
  const n = Math.round(w * d * 9);
  for (let i = 0; i < n; i++) {
    const x = (r() - 0.5) * (w - 0.35), z = (r() - 0.5) * (d - 0.35);
    const hh = 0.18 + r() * 0.25;
    g.add(cil(0.015, 0.02, hh, 0x3c8d2f, x, 0.3, z, { seg: 5 }));
    g.add(esf(0.09, pal[i % pal.length], x, 0.3 + hh + 0.04, z, { seg: 8, seg2: 6, r: 0.5 }));
  }
  for (let i = 0; i < 3; i++) {
    const f = malha(geoFolha(), matFolha(0x4caf50, 0.03));
    f.scale.set(0.25, 0.18, 0.25); f.position.set((r() - 0.5) * (w - 0.5), 0.38, (r() - 0.5) * (d - 0.5));
    g.add(f);
  }
  return g;
}

// ---------------- pessoas ----------------
const PELES = [0x5c3a21, 0x8d5524, 0xc68642, 0xe0ac69, 0xf1c27d, 0x7a4a2a, 0x3f2a1d];
const ROUPAS = [0xff4d8d, 0xffd23f, 0x3fa9f5, 0x2fbf71, 0xff8a3d, 0x8b5cf6, 0x00b4d8, 0xffffff, 0xe63946, 0x06d6a0];
const CALCAS = [0x2b2d42, 0x3d5a80, 0x6c584c, 0x1d3557, 0x8d99ae, 0x4a4e69];
const CABELOS = [0x1b1b1b, 0x3b2314, 0x6b4423, 0xd8c3a5, 0x9e9e9e, 0xb5651d];

export function pessoa(seed = 1, o = {}) {
  const r = T.rng(seed * 7919 + 3);
  const pick = (a) => a[Math.floor(r() * a.length)];
  const g = new THREE.Group();
  const pele = pick(PELES), roupa = o.roupa ?? pick(ROUPAS), calca = pick(CALCAS), cabelo = pick(CABELOS);
  const perna = (x) => { const p = new THREE.Group(); p.position.set(x, 0.8, 0); p.add(cil(0.085, 0.075, 0.8, calca, 0, -0.8, 0, { seg: 10 })); g.add(p); return p; };
  const pernaE = perna(-0.12), pernaD = perna(0.12);
  const vestido = r() > 0.7;
  if (vestido) g.add(cone(0.36, 0.8, roupa, 0, 0.55, 0, { seg: 14 }));
  g.add(cil(0.19, 0.24, 0.72, roupa, 0, 0.82, 0, { seg: 14 }));
  g.add(esf(0.2, pele, 0, 1.78, 0, { seg: 16, seg2: 12 }));
  const estilo = r();
  if (estilo < 0.35) { const c = esf(0.27, cabelo, 0, 1.86, -0.03, { seg: 14, seg2: 10, r: 0.95 }); g.add(c); }
  else if (estilo < 0.75) { const c = esf(0.21, cabelo, 0, 1.84, -0.03, { seg: 14, seg2: 10, r: 0.9 }); c.scale.y = 0.82; g.add(c); }
  else { const c = esf(0.21, cabelo, 0, 1.83, -0.02, { seg: 14, seg2: 10 }); c.scale.y = 0.7; g.add(c); g.add(esf(0.11, cabelo, 0, 1.95, -0.16, { seg: 10, seg2: 8 })); }
  if (o.chapeu) { g.add(cil(0.34, 0.34, 0.04, 0xe9c46a, 0, 1.9, 0)); g.add(cil(0.17, 0.2, 0.16, 0xe9c46a, 0, 1.92, 0)); }
  const braco = (x) => { const b = new THREE.Group(); b.position.set(x, 1.48, 0); b.add(cil(0.06, 0.055, 0.62, r() > 0.5 ? roupa : pele, 0, -0.62, 0, { seg: 8 })); g.add(b); return b; };
  const bracoE = braco(-0.27), bracoD = braco(0.27);
  g.userData = { pernaE, pernaD, bracoE, bracoD, fase: r() * 6.28 };
  g.scale.setScalar(o.escala ?? 1.25);
  return g;
}

export function animarPessoa(p, t, andando = true) {
  const u = p.userData;
  const a = andando ? Math.sin(t * 7 + u.fase) * 0.55 : Math.sin(t * 1.5 + u.fase) * 0.05;
  u.pernaE.rotation.x = a; u.pernaD.rotation.x = -a;
  u.bracoE.rotation.x = -a * 0.8; u.bracoD.rotation.x = a * 0.8;
}

// ---------------- mobiliário e pequenos elementos ----------------
export function poste(o = {}) {
  const g = new THREE.Group();
  g.add(cil(0.07, 0.1, 4.2, 0x2f3540, 0, 0, 0, { m: 0.6, r: 0.4 }));
  const braco = caixa(0.9, 0.08, 0.08, 0x2f3540, 0.4, 4.1, 0, { m: 0.6 });
  g.add(braco);
  const cup = cone(0.28, 0.25, 0x2f3540, 0.8, 3.85, 0, { m: 0.6 });
  g.add(cup);
  ad(g, malha(gEsf(0.17, 14, 10), matLuz)).position.set(0.8, 3.86, 0);
  if (o.solar) {
    const p = caixa(1.1, 0.06, 0.7, new THREE.MeshStandardMaterial({ map: texturaSolar(), roughness: 0.25, metalness: 0.6 }), 0, 4.35, 0, { arred: false });
    p.rotation.x = -0.4; g.add(p);
  }
  return g;
}

let _solar;
function texturaSolar() { if (!_solar) _solar = T.texSolar(); return _solar; }

export function banco(cor = MADEIRA) {
  const g = new THREE.Group();
  for (let i = 0; i < 3; i++) g.add(caixa(1.9, 0.08, 0.16, cor, 0, 0.45, -0.2 + i * 0.2));
  for (let i = 0; i < 2; i++) g.add(caixa(1.9, 0.14, 0.06, cor, 0, 0.7 + i * 0.2, -0.32));
  [-0.8, 0.8].forEach((x) => g.add(caixa(0.12, 0.45, 0.6, MADEIRA_ESC, x, 0, -0.05)));
  return g;
}

export function placa(texto, fundo = '#2fbf71', larg = 3.2) {
  const g = new THREE.Group();
  const alt = larg / 4;
  [-larg / 2 + 0.2, larg / 2 - 0.2].forEach((x) => g.add(cil(0.06, 0.07, 1.2 + alt, MADEIRA_ESC, x, 0, -0.03)));
  const t = T.texPlaca(texto, fundo);
  const lado = mat(fundo);
  const frente = new THREE.MeshStandardMaterial({ map: t, roughness: 0.5 });
  const geo = new THREE.BoxGeometry(larg, alt, 0.1);
  const b = malha(geo, [lado, lado, lado, lado, frente, lado]);
  b.position.set(0, 1.15 + alt / 2, 0);
  g.add(b);
  return g;
}

export function lixeira(cor) {
  const g = new THREE.Group();
  g.add(caixa(0.55, 0.85, 0.55, cor, 0, 0, 0, { r: 0.5 }));
  g.add(caixa(0.6, 0.1, 0.6, new THREE.Color(cor).multiplyScalar(0.75).getHex(), 0, 0.85, 0));
  return g;
}

export function bicicleta(cor = 0xff4d8d) {
  const g = new THREE.Group();
  const roda = (x) => { const m = malha(new THREE.TorusGeometry(0.33, 0.04, 8, 24), mat(0x222222)); m.position.set(x, 0.37, 0); g.add(m); };
  roda(-0.55); roda(0.55);
  const q = caixa(1.1, 0.06, 0.06, cor, 0, 0.62, 0, { m: 0.3 }); g.add(q);
  const d = caixa(0.7, 0.06, 0.06, cor, -0.25, 0.48, 0, { m: 0.3 }); d.rotation.z = 0.9; g.add(d);
  g.add(caixa(0.3, 0.06, 0.12, 0x222222, -0.3, 0.8, 0));
  g.add(caixa(0.06, 0.06, 0.5, 0x333333, 0.45, 0.9, 0));
  return g;
}

function telhado(w, d, h, cor, o = {}) {
  const k = `tel${w}|${d}|${h}`;
  let geo = geoCache.get(k);
  if (!geo) {
    const sh = new THREE.Shape();
    sh.moveTo(-d / 2, 0); sh.lineTo(d / 2, 0); sh.lineTo(0, h); sh.closePath();
    geo = new THREE.ExtrudeGeometry(sh, { depth: w, bevelEnabled: false });
    geo.translate(0, 0, -w / 2);
    geo.rotateY(Math.PI / 2);
    geo.computeVertexNormals();
    geoCache.set(k, geo);
  }
  return malha(geo, mat(cor, { r: 0.65, ...o }));
}

let _casaTex;
const casaMats = new Map();
function matCasa(cor) {
  if (!_casaTex) _casaTex = T.texCasa();
  if (casaMats.has(cor)) return casaMats.get(cor);
  const frente = noturno(new THREE.MeshStandardMaterial({ color: cor, map: _casaTex.map, emissive: 0xffc870, emissiveMap: _casaTex.emissivo, roughness: 0.85 }), 1.3);
  const lado = mat(cor, { r: 0.85 });
  const arr = [lado, lado, lado, lado, frente, frente];
  casaMats.set(cor, arr);
  return arr;
}

export function casa(w = 5, d = 4.5, h = 3, cor = 0xffd6a5, corTelhado = 0xc8553d, o = {}) {
  const g = new THREE.Group();
  const paredes = malha(new THREE.BoxGeometry(w, h, d), matCasa(cor));
  paredes.position.y = h / 2;
  g.add(paredes);
  const t = telhado(w + 0.5, d + 0.7, h * 0.45, corTelhado);
  t.position.y = h;
  g.add(t);
  if (o.solar) {
    const p = caixa(1.6, 0.06, 1.0, new THREE.MeshStandardMaterial({ map: texturaSolar(), roughness: 0.25, metalness: 0.6 }), w * 0.18, h + h * 0.22, d * 0.22, { arred: false });
    p.rotation.x = 0.42; g.add(p);
    const tq = cil(0.28, 0.28, 1.4, 0xf2f2f2, w * 0.18, h + h * 0.38, -d * 0.02, { r: 0.3, m: 0.3 });
    tq.rotation.z = Math.PI / 2; g.add(tq);
  }
  if (o.floreira) { const f = canteiroFlores(1.6, 0.4, o.seed ?? 3, { borda: 0x7a5230 }); f.position.set(-w * 0.27, 1.0, d / 2 + 0.25); f.scale.set(0.8, 0.7, 0.8); g.add(f); }
  return g;
}

function pallet(cor = 0xc9a26b) {
  const g = new THREE.Group();
  for (let i = 0; i < 5; i++) g.add(caixa(1.2, 0.03, 0.14, cor, 0, 0.13, -0.42 + i * 0.21, { arred: false }));
  for (let i = 0; i < 3; i++) g.add(caixa(1.2, 0.1, 0.1, MADEIRA_ESC, 0, 0.03, -0.42 + i * 0.42, { arred: false }));
  return g;
}

function tenda(cor = 0xff4d8d, w = 2.6, d = 2) {
  const g = new THREE.Group();
  [[-1, -1], [1, -1], [-1, 1], [1, 1]].forEach(([a, b]) => g.add(cil(0.04, 0.04, 2, 0xdddddd, a * w / 2, 0, b * d / 2, { m: 0.5 })));
  const tt = telhado(w + 0.3, d + 0.4, 0.8, cor, { ds: true });
  tt.position.y = 2;
  g.add(tt);
  g.add(caixa(w * 0.85, 0.08, d * 0.5, 0xf5f0e6, 0, 0.8, 0));
  [-1, 1].forEach((a) => g.add(caixa(0.08, 0.8, 0.08, MADEIRA_ESC, a * w * 0.38, 0, 0)));
  return g;
}

function bandeirolas(de, ate, n = 10, seed = 1) {
  const g = new THREE.Group();
  const r = T.rng(seed);
  const pal = [0xff4d8d, 0xffd23f, 0x3fa9f5, 0x2fbf71, 0xff8a3d, 0x8b5cf6];
  const pts = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const p = new THREE.Vector3().lerpVectors(de, ate, t);
    p.y -= Math.sin(t * Math.PI) * 0.9;
    pts.push(p);
  }
  const curva = new THREE.CatmullRomCurve3(pts);
  g.add(malha(new THREE.TubeGeometry(curva, 24, 0.02, 4), mat(0xffffff)));
  const tri = new THREE.BufferGeometry();
  tri.setAttribute('position', new THREE.Float32BufferAttribute([-0.22, 0, 0, 0.22, 0, 0, 0, -0.45, 0], 3));
  tri.computeVertexNormals();
  for (let i = 1; i < n * 2; i++) {
    const p = curva.getPoint(i / (n * 2));
    const m = malha(tri, mat(pal[Math.floor(r() * pal.length)], { ds: true }));
    m.position.copy(p);
    m.lookAt(p.clone().add(new THREE.Vector3(ate.z - de.z, 0, de.x - ate.x)));
    g.add(m);
  }
  return g;
}

// ---------------- água animada (lagoas) ----------------
let _aguaNormal;
export function texturaAgua() { if (!_aguaNormal) _aguaNormal = T.texAguaNormal(); return _aguaNormal; }
export function matAgua(cor = 0x3fb3e8) {
  const m = new THREE.MeshStandardMaterial({ color: cor, roughness: 0.08, metalness: 0.15, normalMap: texturaAgua(), normalScale: new THREE.Vector2(0.5, 0.5), transparent: true, opacity: 0.86 });
  return m;
}

// ================================================================
// CONSTRUÇÕES
// ================================================================
function rodaEscuta() {
  const g = new THREE.Group();
  g.add(arvore('ipe', { escala: 2.0, seed: 3 }));
  g.add(cil(2.3, 2.4, 0.5, MADEIRA));
  const gap = 0.95;
  const degraus = [[5.6, 7.0, 0.45, 0xe9845c], [7.0, 8.4, 0.9, 0xf3c969], [8.4, 9.8, 1.35, 0x5bc0be]];
  degraus.forEach(([r1, r2, h, cor]) => {
    const pts = [new THREE.Vector2(r1, 0), new THREE.Vector2(r2, 0), new THREE.Vector2(r2, h), new THREE.Vector2(r1, h), new THREE.Vector2(r1, 0)];
    g.add(malha(new THREE.LatheGeometry(pts, 72, gap / 2, Math.PI * 2 - gap), mat(cor, { r: 0.8 })));
    const ps = [new THREE.Vector2(r1, h), new THREE.Vector2(r1 + 0.95, h), new THREE.Vector2(r1 + 0.95, h + 0.1), new THREE.Vector2(r1, h + 0.1), new THREE.Vector2(r1, h)];
    g.add(malha(new THREE.LatheGeometry(ps, 72, gap / 2, Math.PI * 2 - gap), mat(MADEIRA, { r: 0.6 })));
  });
  // tenda de diálogo
  const tt = new THREE.Group();
  [[-1, -1], [1, -1], [-1, 1], [1, 1]].forEach(([a, b]) => tt.add(cil(0.07, 0.07, 2.6, 0xf5f0e6, a * 1.7, 0, b * 1.7)));
  const teto = cone(3.0, 1.7, 0xff8a3d, 0, 2.6, 0, { seg: 4 }); teto.rotation.y = Math.PI / 4; tt.add(teto);
  tt.add(cil(1.0, 1.0, 0.08, 0xf5f0e6, 0, 0.75, 0)); tt.add(cil(0.1, 0.1, 0.75, MADEIRA_ESC));
  g.add(em(tt, 12.5, 0, -7.5));
  // varal de ideias
  const varal = new THREE.Group();
  [-2.6, 2.6].forEach((x) => varal.add(cil(0.06, 0.07, 2.3, MADEIRA_ESC, x, 0, 0)));
  ad(varal, em(cil(0.015, 0.015, 5.2, 0xffffff), 0, 2.1, 0)).rotation.z = Math.PI / 2;
  const pal = [0xff4d8d, 0xffd23f, 0x3fa9f5, 0x2fbf71, 0xff8a3d, 0xc77dff, 0xffffff];
  for (let i = 0; i < 9; i++) varal.add(caixa(0.36, 0.46, 0.02, pal[i % pal.length], -2.2 + i * 0.55, 1.6, 0, { arred: false, ds: true }));
  g.add(em(varal, -12.5, 0, -7, 0.5));
  // bandeirolas
  const topo = new THREE.Vector3(0, 7.2, 0);
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2 + 0.5;
    const p = new THREE.Vector3(Math.cos(a) * 12.2, 3.3, Math.sin(a) * 12.2);
    g.add(cil(0.07, 0.08, 3.4, 0xf5f0e6, p.x, 0, p.z));
    g.add(bandeirolas(topo, p, 9, i + 1));
  }
  // canteiros
  [Math.PI / 4, (3 * Math.PI) / 4, (5 * Math.PI) / 4, (7 * Math.PI) / 4].forEach((a, i) => {
    const c = canteiroFlores(3.4, 1.3, 20 + i);
    c.position.set(Math.cos(a) * 14.6, 0, Math.sin(a) * 14.6);
    c.rotation.y = -a + Math.PI / 2;
    g.add(c);
  });
  // pessoas na roda
  for (let i = 0; i < 9; i++) {
    const a = gap / 2 + 0.3 + (i / 9) * (Math.PI * 2 - gap - 0.6);
    const tier = i % 3;
    const rr = [6.1, 7.5, 8.9][tier], hh = [0.55, 1.0, 1.45][tier];
    const p = pessoa(100 + i);
    p.position.set(Math.sin(a) * rr, hh, Math.cos(a) * rr);
    p.rotation.y = a + Math.PI;
    g.add(p);
  }
  return g;
}

function agrofloresta() {
  const g = new THREE.Group();
  g.add(caixa(13.4, 0.18, 13.4, 0x5a3b22, 0, 0, 0, { arred: false, r: 1 }));
  const r = T.rng(42);
  for (let i = 0; i < 40; i++) ad(g, esf(0.25 + r() * 0.2, i % 2 ? 0x7a5a2e : 0x9c7a3c, (r() - 0.5) * 12.5, 0.18, (r() - 0.5) * 12.5, { seg: 8, seg2: 6, r: 1 })).scale.y = 0.35;
  g.add(em(arvore('redonda', { escala: 1.7, seed: 1, cor: 0x2e8b3d }), -4, 0.15, -4.2));
  g.add(em(arvore('ipe', { escala: 1.5, seed: 2 }), 4.2, 0.15, -4.8));
  g.add(em(arvore('palmeira', { escala: 1.15, seed: 3 }), 0, 0.15, -1.5));
  [[-5, 1.5], [-1.8, 4.6], [3.6, 2.4], [5.4, -0.8]].forEach(([x, z], i) => g.add(em(arvore('bananeira', { escala: 1.05, seed: 10 + i }), x, 0.15, z, i)));
  [[-2.5, -0.5, 0xff8c1a], [1.6, 4.6, 0xe63946], [-5.2, -1.6, 0xffc300]].forEach(([x, z, f], i) => g.add(em(arvore('frutifera', { escala: 0.85, seed: 20 + i, cor: 0x43a047, frutos: f }), x, 0.15, z)));
  for (let i = 0; i < 10; i++) g.add(em(arvore('arbusto', { escala: 0.8, seed: 30 + i, cor: 0x5cb85c, flores: i % 3 ? null : 0xffffff }), (r() - 0.5) * 11, 0.15, (r() - 0.5) * 11));
  // mandioca e abóboras (estrato baixo)
  for (let i = 0; i < 8; i++) {
    const x = -5.5 + i * 1.5, z = 6;
    g.add(cil(0.03, 0.04, 1.1, 0x9b5b3a, x, 0.15, z, { seg: 5 }));
    const f = malha(geoFolha(), matFolha(0x3d9a40, 0.04)); f.scale.set(0.45, 0.25, 0.45); f.position.set(x, 1.3, z); g.add(f);
  }
  for (let i = 0; i < 5; i++) { const a = esf(0.35, 0xff9f1c, -4 + i * 2.1, 0.4, 4.6, { r: 0.45 }); a.scale.y = 0.7; g.add(a); }
  const pl = placa('AGROFLORESTA', '#2e7d32', 3.4); pl.position.set(3.6, 0.1, 6.7); g.add(pl);
  const p1 = pessoa(201, { chapeu: true }); p1.position.set(-1, 0.15, 2.4); p1.rotation.y = 0.8; g.add(p1);
  const p2 = pessoa(202); p2.position.set(1.6, 0.15, 1); p2.rotation.y = -2; g.add(p2);
  return g;
}

function residuos() {
  const g = new THREE.Group();
  g.add(caixa(13.4, 0.2, 13.4, CONCRETO, 0, 0, 0, { arred: false }));
  // galpão
  [[-5.5, -5.5], [5.5, -5.5], [-5.5, -1.5], [5.5, -1.5]].forEach(([x, z]) => g.add(cil(0.14, 0.14, 3.6, 0x2a9d8f, x, 0.2, z, { m: 0.3 })));
  const teto = caixa(12.2, 0.18, 5.2, 0x2a9d8f, 0, 3.75, -3.5, { m: 0.2, r: 0.5 }); teto.rotation.x = 0.08; g.add(teto);
  g.add(caixa(12, 2.4, 0.15, 0xe9f5f2, 0, 0.2, -6, { arred: false }));
  const cores = [0x2a6fdb, 0xe63946, 0x2a9d8f, 0xffc300, 0x8d5524];
  cores.forEach((c, i) => {
    const l = lixeira(c); l.scale.set(2.0, 2.0, 2.0); l.position.set(-4.4 + i * 2.2, 0.2, -3.6); g.add(l);
  });
  // composteira
  for (let i = 0; i < 3; i++) {
    const b = new THREE.Group();
    for (let k = 0; k < 4; k++) b.add(caixa(1.8, 0.12, 0.08, MADEIRA, 0, 0.1 + k * 0.22, -0.9, { arred: false }));
    for (let k = 0; k < 4; k++) [-0.9, 0.9].forEach((x) => b.add(caixa(0.08, 0.12, 1.8, MADEIRA, x, 0.1 + k * 0.22, 0, { arred: false })));
    const m = esf(0.85, i === 2 ? 0x3e2a1a : 0x5a3b22, 0, 0.2, 0, { r: 1 }); m.scale.y = 0.55; b.add(m);
    if (i === 0) for (let k = 0; k < 6; k++) b.add(esf(0.12, [0xff8c1a, 0x8bc34a, 0xe63946][k % 3], (k - 3) * 0.2, 0.55, (k % 2) * 0.2, { seg: 8, seg2: 6 }));
    b.position.set(-4.4 + i * 2.1, 0.2, 2.6); g.add(b);
  }
  // carroça do catador
  const car = new THREE.Group();
  car.add(caixa(2.2, 0.9, 1.3, 0x3fa9f5, 0, 0.55, 0, { r: 0.6 }));
  [-0.7, 0.7].forEach((z) => { const w = cil(0.45, 0.45, 0.12, 0x222222, 0, 0, z); w.rotation.x = Math.PI / 2; w.position.y = 0.45; car.add(w); });
  car.add(caixa(1.4, 0.06, 0.06, METAL, 1.6, 0.9, 0.4)); car.add(caixa(1.4, 0.06, 0.06, METAL, 1.6, 0.9, -0.4));
  for (let k = 0; k < 4; k++) car.add(esf(0.42, 0xf5f5f5, -0.5 + (k % 2) * 0.9, 1.6, (k > 1 ? 0.3 : -0.3), { r: 0.9 }));
  g.add(em(car, 3.6, 0.2, 3.2, -0.4));
  // painel do mapa colaborativo
  const quad = new THREE.Group();
  [-1.2, 1.2].forEach((x) => quad.add(cil(0.06, 0.07, 2.6, MADEIRA_ESC, x, 0, 0)));
  const mp = malha(new THREE.BoxGeometry(2.6, 1.8, 0.08), [mat(MADEIRA), mat(MADEIRA), mat(MADEIRA), mat(MADEIRA), new THREE.MeshStandardMaterial({ map: T.texMapa(), roughness: 0.6 }), mat(MADEIRA)]);
  mp.position.y = 1.9; quad.add(mp);
  g.add(em(quad, 0.4, 0.2, 5.4));
  const pl = placa('ECOPONTO', '#f4a300', 3); pl.position.set(-3.8, 0.2, 6.2); g.add(pl);
  g.add(em(arvore('redonda', { escala: 0.9, seed: 51 }), 6, 0.2, 5.6));
  const p = pessoa(301, { roupa: 0x2a9d8f }); p.position.set(2.3, 0.2, 2.4); p.rotation.y = 0.4; g.add(p);
  const p2 = pessoa(302); p2.position.set(-1.5, 0.2, -1.5); g.add(p2);
  return g;
}

function ecomuseu() {
  const g = new THREE.Group();
  g.add(caixa(13.4, 0.15, 13.4, 0x8fc965, 0, 0, 0, { arred: false }));
  g.add(caixa(10.5, 0.35, 7, 0xb5835a, 0, 0.1, -2.6, { r: 0.8 }));
  const parede = malha(new THREE.BoxGeometry(8.6, 3.3, 5), [mat(0xc0603b), mat(0xc0603b), mat(0xc0603b), mat(0xc0603b), new THREE.MeshStandardMaterial({ map: T.texMural(5), roughness: 0.8 }), mat(0xc0603b)]);
  parede.position.set(0, 0.45 + 1.65, -3.2); parede.castShadow = parede.receiveShadow = true; g.add(parede);
  // telhado de palha (quatro águas)
  const geoTel = new THREE.ConeGeometry(6.6, 3.0, 4, 1); geoTel.rotateY(Math.PI / 4); geoTel.translate(0, 1.5, 0); geoTel.computeVertexNormals();
  const tel = malha(geoTel, mat(0xd9a441, { r: 1, flat: true })); tel.position.set(0, 3.75, -3.2); tel.scale.set(0.98, 1, 0.66); g.add(tel);
  // varanda
  for (let i = 0; i < 5; i++) g.add(cil(0.14, 0.16, 3.2, MADEIRA_ESC, -4.2 + i * 2.1, 0.45, 0.6));
  const v = caixa(10, 0.18, 2.3, MADEIRA, 0, 3.55, 0.1, { r: 0.6 }); v.rotation.x = -0.12; g.add(v);
  // porta e janelas
  g.add(caixa(1.2, 2.1, 0.1, 0x5a3420, 0, 0.45, -0.66));
  // trilha de pedras
  for (let i = 0; i < 9; i++) { const s = cil(0.42, 0.45, 0.1, 0xcfc8bc, Math.sin(i * 0.8) * 1.6, 0.12, 1.8 + i * 0.55, { seg: 10 }); g.add(s); }
  // forno da antiga olaria
  const forno = esf(1.5, 0xa0522d, 5, 0.15, 2.6, { r: 0.95 }); forno.scale.y = 0.95; g.add(forno);
  g.add(caixa(0.7, 0.8, 0.3, 0x2b1a12, 5, 0.15, 3.9));
  g.add(cil(0.25, 0.3, 1.6, 0x8b4513, 5.6, 1.2, 2.2));
  // potes de cerâmica
  const perfil = [new THREE.Vector2(0, 0), new THREE.Vector2(0.25, 0), new THREE.Vector2(0.38, 0.25), new THREE.Vector2(0.3, 0.55), new THREE.Vector2(0.18, 0.7), new THREE.Vector2(0.22, 0.8), new THREE.Vector2(0, 0.8)];
  const geoPote = new THREE.LatheGeometry(perfil, 18);
  [[-4.6, 2.6, 0xc8553d], [-3.6, 3.4, 0xe9845c], [-4.8, 4.2, 0x8d5524]].forEach(([x, z, c]) => {
    g.add(caixa(0.7, 0.6, 0.7, 0xf5efe6, x, 0.15, z));
    const p = malha(geoPote, mat(c, { r: 0.6 })); p.position.set(x, 0.75, z); g.add(p);
  });
  // bandeirinhas
  [[-6, 6], [6, 6], [-6, -6.2]].forEach(([x, z], i) => {
    g.add(cil(0.04, 0.05, 2.6, 0xffffff, x, 0.15, z));
    const b = caixa(0.8, 0.5, 0.02, [0xff4d8d, 0xffd23f, 0x2fbf71][i], x + 0.4, 2.2, z, { arred: false, ds: true }); g.add(b);
  });
  const pl = placa('ECOMUSEU', '#c0603b', 3); pl.position.set(-2.8, 0.15, 6.3); g.add(pl);
  g.add(em(arvore('araucaria', { escala: 0.9, seed: 61 }), -5.6, 0.15, -6.2));
  const guia = pessoa(401, { roupa: 0xff8a3d, chapeu: true }); guia.position.set(0.4, 0.15, 3.2); guia.rotation.y = Math.PI; g.add(guia);
  for (let i = 0; i < 3; i++) { const p = pessoa(402 + i); p.position.set(-0.8 + i * 0.9, 0.15, 4.6 + (i % 2) * 0.4); g.add(p); }
  return g;
}

function urbanismo() {
  const g = new THREE.Group();
  const piso = malha(new THREE.BoxGeometry(13.6, 0.1, 13.6), [mat(0x3b4252), mat(0x3b4252), new THREE.MeshStandardMaterial({ map: T.texPintura(), roughness: 0.8 }), mat(0x3b4252), mat(0x3b4252), mat(0x3b4252)]);
  piso.position.y = 0.05; g.add(piso);
  // vasos que estreitam a pista
  for (let i = 0; i < 6; i++) {
    const vaso = new THREE.Group();
    vaso.add(caixa(1.3, 0.75, 0.8, [0xff4d8d, 0xffd23f, 0x3fa9f5][i % 3], 0, 0, 0, { r: 0.6 }));
    const f = malha(geoFolha(), matFolha(0x43a047, 0.04)); f.scale.set(0.6, 0.45, 0.4); f.position.y = 0.95; vaso.add(f);
    for (let k = 0; k < 5; k++) vaso.add(esf(0.08, [0xffffff, 0xff8a3d, 0xc77dff][k % 3], -0.4 + k * 0.2, 1.25, 0.1, { seg: 8, seg2: 6 }));
    vaso.position.set(-5.6 + i * 2.25, 0.1, -1.2);
    g.add(vaso);
  }
  // parklet
  const pk = new THREE.Group();
  pk.add(caixa(6, 0.3, 2.6, MADEIRA, 0, 0, 0, { r: 0.6 }));
  for (let i = 0; i < 7; i++) pk.add(caixa(0.08, 0.9, 0.08, MADEIRA_ESC, -2.9 + i * 0.97, 0.3, -1.25));
  pk.add(caixa(6, 0.08, 0.1, MADEIRA_ESC, 0, 1.2, -1.25));
  const b1 = banco(0xc9a26b); b1.position.set(-1.6, 0.3, -0.6); pk.add(b1);
  const b2 = banco(0xc9a26b); b2.position.set(1.6, 0.3, -0.6); pk.add(b2);
  pk.add(cil(0.05, 0.05, 2.4, 0xffffff, 0, 0.3, 0.6));
  pk.add(cone(1.5, 0.7, 0xff4d8d, 0, 2.6, 0.6, { seg: 10 }));
  pk.add(cil(0.45, 0.45, 0.06, 0xffffff, 0, 1.0, 0.6)); pk.add(cil(0.06, 0.06, 0.7, 0xffffff, 0, 0.3, 0.6));
  g.add(em(pk, 0, 0.1, -4.8));
  // balizadores coloridos
  for (let i = 0; i < 7; i++) g.add(cil(0.14, 0.14, 0.9, [0xff8a3d, 0x2fbf71, 0x8b5cf6][i % 3], -6 + i * 2, 0.1, 2.4, { r: 0.4 }));
  // bicicletas e crianças
  g.add(em(bicicleta(0x00d1c1), 5, 0.1, -2.6, 0.3));
  for (let i = 0; i < 4; i++) { const c = pessoa(501 + i); c.scale.setScalar(0.85); c.position.set(-4 + i * 2.4, 0.1, 4 - (i % 2) * 1.5); c.rotation.y = i * 1.3; g.add(c); }
  const pl = placa('RUA DE BRINCAR', '#ff4d8d', 3.4); pl.position.set(-4.8, 0.1, -6.3); g.add(pl);
  return g;
}

function jardimChuva() {
  const g = new THREE.Group();
  g.add(caixa(13.4, 0.15, 13.4, 0x7cc35a, 0, 0, 0, { arred: false }));
  // casa com calha
  const c = casa(5.5, 3.6, 3, 0xa8dadc, 0x1d6fa3, { seed: 7 }); c.position.set(-3, 0.15, -4.6); g.add(c);
  g.add(cil(0.1, 0.1, 3.1, METAL, -0.15, 0.15, -2.75, { m: 0.6 }));
  for (let i = 0; i < 5; i++) g.add(caixa(0.6, 0.12, 0.5, 0x9aa0a6, -0.15 + i * 0.12, 0.15, -2.3 + i * 0.5));
  // canteiro rebaixado
  const solo = malha(new THREE.CircleGeometry(1, 48), mat(0x4a321d, { r: 1 })); solo.rotation.x = -Math.PI / 2; solo.scale.set(4.6, 3.1, 1); solo.position.set(0.6, 0.17, 1.4); g.add(solo);
  const agua = malha(new THREE.CircleGeometry(1, 48), matAgua(0x58b9e8)); agua.rotation.x = -Math.PI / 2; agua.scale.set(2.2, 1.3, 1); agua.position.set(0.8, 0.2, 1.3); agua.receiveShadow = true; agua.castShadow = false; g.add(agua);
  for (let i = 0; i < 34; i++) {
    const a = (i / 34) * Math.PI * 2;
    const s = esf(0.32 + (i % 3) * 0.06, i % 2 ? 0xb8b2a7 : 0x9b958c, 0.6 + Math.cos(a) * 4.7, 0.2, 1.4 + Math.sin(a) * 3.2, { seg: 10, seg2: 8, r: 0.9 });
    s.scale.y = 0.6; g.add(s);
  }
  const r = T.rng(77);
  for (let i = 0; i < 26; i++) {
    const a = r() * 6.28, d = 1.7 + r() * 2.2;
    const x = 0.6 + Math.cos(a) * d * 0.95, z = 1.4 + Math.sin(a) * d * 0.62;
    const tipo = i % 3;
    if (tipo === 0) for (let k = 0; k < 5; k++) { const fo = cone(0.05, 1.1 + r() * 0.5, 0x5a9e3a, x + (k - 2) * 0.08, 0.15, z, { seg: 4 }); fo.rotation.z = (k - 2) * 0.12; g.add(fo); }
    else if (tipo === 1) { g.add(cil(0.02, 0.02, 0.9, 0x3c8d2f, x, 0.15, z, { seg: 5 })); g.add(cil(0.08, 0.05, 0.45, 0x8b5cf6, x, 1.0, z, { seg: 8 })); }
    else { const f = malha(geoFolha(), matFolha(0x3f9a45, 0.04)); f.scale.set(0.4, 0.3, 0.4); f.position.set(x, 0.4, z); g.add(f); g.add(esf(0.1, 0xffd23f, x, 0.75, z, { seg: 8, seg2: 6 })); }
  }
  // corte didático das camadas
  const corte = new THREE.Group();
  const cam = [[0x4caf50, 0.25], [0x4a321d, 0.6], [0xe6c88e, 0.45], [0x8f8f8f, 0.5]];
  let y = 0;
  [...cam].reverse().forEach(([cor, h]) => { corte.add(caixa(1.2, h, 2.2, cor, 0, y, 0, { arred: false })); y += h; });
  g.add(em(corte, 5.6, 0.15, -1.2));
  const pl = placa('JARDIM DE CHUVA', '#1d6fa3', 3.4); pl.position.set(4.2, 0.15, 6.2); g.add(pl);
  g.add(em(arvore('redonda', { escala: 0.95, seed: 71, cor: 0x3b9d4a }), 5, 0.15, -5.2));
  const p = pessoa(601); p.position.set(-4.2, 0.15, 3.8); p.rotation.y = 0.9; g.add(p);
  g.userData.setChuva = (on) => { g.userData.alvoAgua = on ? 1.75 : 1; };
  g.userData.alvoAgua = 1;
  g.userData.atualizar = (t, dt) => {
    const s = agua.scale.x / 2.2;
    const ns = s + (g.userData.alvoAgua - s) * Math.min(1, dt * 0.6);
    agua.scale.set(2.2 * ns, 1.3 * ns, 1);
  };
  return g;
}

function horta() {
  const g = new THREE.Group();
  g.add(caixa(13.4, 0.15, 13.4, 0xc9a77c, 0, 0, 0, { arred: false, r: 1 }));
  const r = T.rng(88);
  for (let i = 0; i < 6; i++) {
    const cx = -3.4 + (i % 2) * 5.2, cz = -1.6 + Math.floor(i / 2) * 2.7;
    const b = new THREE.Group();
    b.add(caixa(4.2, 0.5, 1.7, MADEIRA, 0, 0, 0, { r: 0.7 }));
    b.add(caixa(4.0, 0.08, 1.5, 0x3d2817, 0, 0.47, 0, { arred: false, r: 1 }));
    const tipo = i % 6;
    for (let k = 0; k < 10; k++) {
      const x = -1.7 + (k % 5) * 0.85, z = k < 5 ? -0.38 : 0.38;
      if (tipo === 0 || tipo === 3) { const a = esf(0.26, tipo === 0 ? 0x8bc34a : 0x6aa84f, x, 0.66, z, { seg: 12, seg2: 8, r: 0.8 }); a.scale.y = 0.65; b.add(a); }
      else if (tipo === 1) { b.add(cil(0.012, 0.015, 0.8, 0x7a5230, x, 0.5, z, { seg: 4 })); for (let q = 0; q < 3; q++) b.add(esf(0.1, 0xe63946, x + (q - 1) * 0.1, 0.8 + q * 0.12, z + 0.06, { seg: 8, seg2: 6, r: 0.35 })); const f = malha(geoFolha(), matFolha(0x3f8f3a, 0.04)); f.scale.set(0.22, 0.3, 0.22); f.position.set(x, 0.85, z); b.add(f); }
      else if (tipo === 2) { b.add(cil(0.04, 0.05, 1.7, 0x9bbf4a, x, 0.5, z, { seg: 6 })); b.add(cil(0.07, 0.06, 0.32, 0xf2c94c, x + 0.08, 1.6, z, { seg: 8 })); }
      else if (tipo === 4) { b.add(esf(0.06, 0xff8c1a, x, 0.52, z, { seg: 8, seg2: 6 })); for (let q = 0; q < 3; q++) { const fo = cone(0.03, 0.4, 0x4caf50, x + (q - 1) * 0.05, 0.52, z, { seg: 4 }); fo.rotation.z = (q - 1) * 0.3; b.add(fo); } }
      else { const a = esf(0.28, 0x2e7d5b, x, 0.68, z, { seg: 12, seg2: 8 }); a.scale.y = 0.75; b.add(a); }
    }
    b.position.set(cx, 0.15, cz);
    g.add(b);
  }
  // banca da cooperativa
  const banca = new THREE.Group();
  banca.add(caixa(4.4, 1.0, 1.3, MADEIRA, 0, 0, 0, { r: 0.6 }));
  [-2, 2].forEach((x) => banca.add(cil(0.07, 0.07, 2.6, MADEIRA_ESC, x, 0, -0.55)));
  const toldo = malha(new THREE.BoxGeometry(4.8, 0.08, 1.9), new THREE.MeshStandardMaterial({ map: T.texToldo('#2fbf71', '#ffffff'), roughness: 0.7 }));
  toldo.position.set(0, 2.55, 0.1); toldo.rotation.x = 0.2; banca.add(toldo);
  for (let k = 0; k < 4; k++) {
    banca.add(caixa(0.8, 0.35, 0.6, MADEIRA_ESC, -1.5 + k, 1.0, 0.1));
    for (let q = 0; q < 6; q++) banca.add(esf(0.1, [0xe63946, 0xff8c1a, 0x8bc34a, 0xffd23f][k], -1.75 + k + (q % 3) * 0.22, 1.42, (q > 2 ? 0.1 : -0.12) + 0.1, { seg: 8, seg2: 6 }));
  }
  const plc = placa('COOPERATIVA', '#2e7d32', 2.6); plc.position.set(0, 1.55, -0.6); plc.scale.setScalar(0.75); banca.add(plc);
  g.add(em(banca, 0, 0.15, -5.6));
  // caixa d'água e espantalho
  g.add(cil(0.9, 0.9, 1.4, 0x2a6fdb, 5.4, 1.9, -4.8, { r: 0.4 }));
  [[-0.6, -0.6], [0.6, -0.6], [-0.6, 0.6], [0.6, 0.6]].forEach(([a, b]) => g.add(cil(0.06, 0.06, 1.8, MADEIRA_ESC, 5.4 + a, 0.15, -4.8 + b)));
  const esp = new THREE.Group();
  esp.add(cil(0.05, 0.05, 2.2, MADEIRA_ESC)); esp.add(em(caixa(1.4, 0.06, 0.06, MADEIRA_ESC), 0, 1.6, 0));
  esp.add(caixa(0.7, 0.75, 0.3, 0xe63946, 0, 1.1, 0)); esp.add(esf(0.2, 0xf1d18a, 0, 2.15, 0));
  esp.add(cil(0.4, 0.4, 0.04, 0xe9c46a, 0, 2.3, 0)); esp.add(cil(0.16, 0.2, 0.2, 0xe9c46a, 0, 2.32, 0));
  g.add(em(esp, 5.7, 0.15, 5.2));
  for (let i = 0; i < 3; i++) { const p = pessoa(701 + i, { chapeu: i === 0 }); p.position.set(-1 + i * 1.7, 0.15, 5 - i * 0.6); p.rotation.y = r() * 6; g.add(p); }
  return g;
}

function circular() {
  const g = new THREE.Group();
  g.add(caixa(13.4, 0.15, 13.4, 0xe8dcc8, 0, 0, 0, { arred: false }));
  // pavilhão circular
  const pav = new THREE.Group();
  pav.add(cil(3, 3, 3, 0xf5f0e6, 0, 0, 0, { seg: 40 }));
  for (let i = 0; i < 8; i++) { const a = (i / 8) * Math.PI * 2; const j = caixa(0.9, 1.2, 0.1, 0x7fd1e8, Math.sin(a) * 3.02, 1.2, Math.cos(a) * 3.02, { arred: false, r: 0.15, m: 0.2 }); j.rotation.y = a; pav.add(j); }
  pav.add(caixa(1.2, 2.2, 0.15, 0x00b4d8, 0, 0, 3.0));
  pav.add(cone(3.7, 2.4, 0x00b4d8, 0, 3, 0, { seg: 40 }));
  g.add(em(pav, -2.2, 0.15, -2.4));
  // anel de setas girando (símbolo da circularidade)
  const anel = new THREE.Group();
  anel.add(malha(new THREE.TorusGeometry(2.4, 0.16, 12, 64, Math.PI * 1.7), mat(0x2fbf71, { r: 0.4, e: 0x2fbf71, ei: 0.2 })));
  for (let i = 0; i < 3; i++) {
    const sub = new THREE.Group();
    const a = (i / 3) * Math.PI * 2;
    const ar = malha(new THREE.TorusGeometry(2.4, 0.16, 12, 24, 1.6), mat([0x2fbf71, 0xffd23f, 0x3fa9f5][i], { r: 0.4 }));
    const ponta = cone(0.38, 0.7, [0x2fbf71, 0xffd23f, 0x3fa9f5][i], 0, 0, 0);
    ponta.position.set(Math.cos(1.6) * 2.4, Math.sin(1.6) * 2.4 - 0.35, 0); ponta.rotation.z = 1.6 + Math.PI / 2 - Math.PI / 2;
    sub.add(ar); sub.add(ponta);
    sub.rotation.z = a;
    anel.add(sub);
  }
  anel.children[0].visible = false;
  anel.position.set(-2.2, 7.3, -2.4);
  g.add(anel);
  g.userData.atualizar = (t) => { anel.rotation.y = t * 0.6; anel.position.y = 7.3 + Math.sin(t * 1.5) * 0.25; };
  // feira de trocas
  [[3.6, -4, 0xff4d8d], [4.6, 0.4, 0xffd23f], [3.4, 4.6, 0x8b5cf6]].forEach(([x, z, c], i) => {
    const tn = tenda(c); tn.position.set(x, 0.15, z); tn.rotation.y = -Math.PI / 2 + 0.2 * i; g.add(tn);
    for (let k = 0; k < 4; k++) g.add(caixa(0.35, 0.3, 0.35, [0xffffff, 0x3fa9f5, 0xff8a3d, 0x2fbf71][k], x - 0.5 + (k % 2) * 0.7, 1.0, z - 0.6 + Math.floor(k / 2) * 1.0));
  });
  // arara de roupas
  const arara = new THREE.Group();
  [-1, 1].forEach((x) => arara.add(cil(0.04, 0.04, 1.8, METAL, x, 0, 0, { m: 0.6 })));
  ad(arara, em(cil(0.03, 0.03, 2.1, METAL, 0, 0, 0, { m: 0.6 }), 0, 1.75, 0)).rotation.z = Math.PI / 2;
  for (let k = 0; k < 7; k++) arara.add(caixa(0.25, 0.9, 0.5, [0xff4d8d, 0x3fa9f5, 0xffd23f, 0x2fbf71, 0xff8a3d, 0xffffff, 0x8b5cf6][k], -0.8 + k * 0.27, 0.75, 0, { arred: false }));
  g.add(em(arara, -3.5, 0.15, 3.8));
  // mesa de reparos
  const mesa = new THREE.Group();
  mesa.add(caixa(2.4, 0.1, 1.1, MADEIRA, 0, 0.85, 0));
  [[-1.1, -0.45], [1.1, -0.45], [-1.1, 0.45], [1.1, 0.45]].forEach(([x, z]) => mesa.add(caixa(0.08, 0.85, 0.08, MADEIRA_ESC, x, 0, z)));
  mesa.add(caixa(0.6, 0.4, 0.4, 0xe63946, -0.6, 0.95, 0)); mesa.add(caixa(0.3, 0.06, 0.06, METAL, 0.3, 0.95, 0.2));
  const roda = malha(new THREE.TorusGeometry(0.35, 0.04, 8, 24), mat(0x222222)); roda.position.set(0.6, 1.3, -0.1); mesa.add(roda);
  g.add(em(mesa, -0.2, 0.15, 5.2));
  const pl = placa('CAFÉ DE REPAROS', '#00b4d8', 3.4); pl.position.set(-5.2, 0.15, 6.3); pl.rotation.y = 0.3; g.add(pl);
  for (let i = 0; i < 3; i++) { const p = pessoa(801 + i); p.position.set(0.8 + i * 1.1, 0.15, 3.8 - i * 1.6); p.rotation.y = 1.5 + i; g.add(p); }
  return g;
}

function saneamento() {
  const g = new THREE.Group();
  g.add(caixa(13.4, 0.15, 13.4, 0x86c95f, 0, 0, 0, { arred: false }));
  const c = casa(4.6, 3.8, 2.8, 0xffe8a3, 0xb5523b, { seed: 9 }); c.position.set(-3.8, 0.15, -4.4); g.add(c);
  // tubulações
  const t1 = cil(0.1, 0.1, 3.0, 0x8d99ae, -1.2, 0.3, -2.6, { m: 0.4 }); t1.rotation.z = Math.PI / 2; t1.position.y = 0.35; g.add(t1);
  // TEVAP
  const tev = new THREE.Group();
  tev.add(caixa(5.4, 0.7, 2.8, 0xb5523b, 0, 0, 0, { r: 0.9 }));
  tev.add(caixa(5.0, 0.1, 2.4, 0x4a321d, 0, 0.66, 0, { arred: false, r: 1 }));
  [[-1.7, 0], [0, -0.4], [1.7, 0.2]].forEach(([x, z], i) => tev.add(em(arvore('bananeira', { escala: 0.9, seed: 900 + i }), x, 0.7, z)));
  for (let i = 0; i < 6; i++) { const tb = malha(geoFolha(), matFolha(0x2e7d32, 0.05)); tb.scale.set(0.5, 0.18, 0.35); tb.position.set(-2.2 + i * 0.85, 0.95, 0.85); tb.rotation.z = 0.4; tev.add(tb); }
  g.add(em(tev, 1.6, 0.15, -2.6));
  // círculo de bananeiras
  const circ = new THREE.Group();
  const cova = esf(1.1, 0x6b4a2b, 0, 0.05, 0, { r: 1 }); cova.scale.y = 0.35; circ.add(cova);
  for (let i = 0; i < 6; i++) { const a = (i / 6) * Math.PI * 2; circ.add(em(arvore('bananeira', { escala: 0.8, seed: 910 + i, cacho: i % 2 === 0 }), Math.cos(a) * 1.9, 0, Math.sin(a) * 1.9, a)); }
  g.add(em(circ, -3, 0.15, 3.2));
  // banheiro seco
  const bs = new THREE.Group();
  bs.add(caixa(2, 0.9, 2, 0xb08968, 0, 0, 0, { r: 0.8 }));
  bs.add(caixa(1.8, 2.2, 1.8, 0xd4a373, 0, 0.9, 0, { r: 0.7 }));
  bs.add(caixa(0.7, 1.6, 0.06, 0x7a5230, 0, 1.0, 0.92));
  const tt = caixa(2.3, 0.12, 2.3, 0x6c584c, 0, 3.1, 0); tt.rotation.x = 0.12; bs.add(tt);
  bs.add(cil(0.12, 0.12, 2.2, 0x222222, 0.6, 1.8, -0.6, { m: 0.3 }));
  for (let i = 0; i < 3; i++) bs.add(caixa(0.9, 0.3, 0.35, 0x8d6e63, 0, i * 0.3, 1.2 + (2 - i) * 0.35));
  g.add(em(bs, 4, 0.15, 3.2, -0.3));
  const pl = placa('SANEAMENTO ECOLÓGICO', '#f4a261', 3.6); pl.position.set(0.6, 0.15, 6.4); g.add(pl);
  for (let i = 0; i < 2; i++) { const p = pessoa(1001 + i); p.position.set(0.6 + i * 1.2, 0.15, 2 + i); p.rotation.y = 2 + i; g.add(p); }
  return g;
}

function moradia() {
  const g = new THREE.Group();
  g.add(caixa(13.4, 0.15, 13.4, 0x8fd16a, 0, 0, 0, { arred: false }));
  const casas = [[-4.2, -3.2, 0xff6b6b, 0x2b2d42, 3.1], [1.2, -4.0, 0x2ec4b6, 0xc8553d, 5.2], [5.0, 1.0, 0xffd23f, 0x6a4c93, 3.0]];
  casas.forEach(([x, z, cor, tel, h], i) => {
    const cs = casa(4.2, 4.0, h, cor, tel, { solar: true, floreira: true, seed: 40 + i });
    cs.position.set(x, 0.15, z);
    cs.rotation.y = i === 2 ? -Math.PI / 2 : 0;
    g.add(cs);
  });
  // janelas grandes (ventilação cruzada)
  g.add(caixa(1.8, 1.3, 0.08, 0x9fe3ff, -4.2, 1.2, -1.15, { arred: false, r: 0.1, m: 0.3 }));
  g.add(caixa(1.8, 1.3, 0.08, 0x9fe3ff, 1.2, 3.1, -1.95, { arred: false, r: 0.1, m: 0.3 }));
  // varal
  [-5.5, -1.5].forEach((x) => g.add(cil(0.05, 0.05, 2, MADEIRA_ESC, x, 0.15, 3.6)));
  ad(g, em(cil(0.012, 0.012, 4, 0xffffff), -3.5, 2, 3.6)).rotation.z = Math.PI / 2;
  for (let k = 0; k < 6; k++) g.add(caixa(0.45, 0.6, 0.02, [0xff4d8d, 0xffffff, 0x3fa9f5, 0xffd23f, 0x2fbf71, 0xff8a3d][k], -5.1 + k * 0.62, 1.4, 3.6, { arred: false, ds: true }));
  // cerca baixa
  for (let i = 0; i < 12; i++) g.add(caixa(0.12, 0.7, 0.12, 0xffffff, -6 + i * 1.08, 0.15, 6.2));
  g.add(caixa(12, 0.08, 0.06, 0xffffff, 0, 0.6, 6.2));
  g.add(em(arvore('frutifera', { escala: 0.85, seed: 1100, frutos: 0xff8c1a }), -1.2, 0.15, 3.4));
  const pl = placa('ASSISTÊNCIA TÉCNICA', '#ff6b6b', 3.4); pl.position.set(3.4, 0.15, 5.3); g.add(pl);
  for (let i = 0; i < 3; i++) { const p = pessoa(1101 + i); p.position.set(-2 + i * 1.6, 0.15, 1.6 + (i % 2)); p.rotation.y = i * 2; g.add(p); }
  return g;
}

function oficina() {
  const g = new THREE.Group();
  g.add(caixa(13.4, 0.15, 13.4, 0xd8c3a5, 0, 0, 0, { arred: false }));
  // galpão
  const gal = new THREE.Group();
  [[-4, -2.6], [4, -2.6], [-4, 2.6], [4, 2.6]].forEach(([x, z]) => gal.add(caixa(0.3, 3.2, 0.3, MADEIRA_ESC, x, 0, z)));
  gal.add(caixa(8.3, 3.2, 0.2, 0xc77dff, 0, 0, -2.7, { arred: false }));
  const tel = telhado(9, 6.4, 1.6, 0x5a6b7d, { m: 0.5, r: 0.4 }); tel.position.y = 3.2; gal.add(tel);
  // bancada e ferramentas
  gal.add(caixa(5, 0.15, 1.2, MADEIRA, 0, 0.95, -1.8));
  [[-2.3, -2.2], [2.3, -2.2], [-2.3, -1.4], [2.3, -1.4]].forEach(([x, z]) => gal.add(caixa(0.1, 0.95, 0.1, MADEIRA_ESC, x, 0, z)));
  for (let k = 0; k < 6; k++) gal.add(caixa(0.12, 0.6, 0.04, [METAL, 0xe63946, 0xffd23f][k % 3], -2 + k * 0.6, 1.5, -2.55, { m: 0.4 }));
  gal.add(caixa(0.8, 0.4, 0.5, 0xffc300, -1.5, 1.1, -1.8)); gal.add(cil(0.25, 0.25, 0.06, METAL, 1.4, 1.1, -1.7, { m: 0.7 }));
  // mesa de costura
  gal.add(caixa(2, 0.1, 1, 0xffffff, 2.2, 0.85, 1.2));
  for (let k = 0; k < 4; k++) { const rolo = cil(0.18, 0.18, 0.9, [0xff4d8d, 0x3fa9f5, 0xffd23f, 0x2fbf71][k], 1.6 + k * 0.4, 0.95, 1.2); rolo.rotation.x = Math.PI / 2; rolo.position.y = 1.15; gal.add(rolo); }
  g.add(em(gal, 0, 0.15, -2.4));
  // pilhas de pallets
  for (let s = 0; s < 2; s++) for (let i = 0; i < 4; i++) { const p = pallet(); p.position.set(-5.3 + s * 1.5, 0.15 + i * 0.17, 3); p.rotation.y = (i % 2) * 0.1; g.add(p); }
  // sofá de pallet pronto
  const sofa = new THREE.Group();
  [0, 0.17].forEach((y) => { const p = pallet(0xd9b380); p.position.y = y; p.scale.set(2, 1, 1); sofa.add(p); });
  const enc = pallet(0xd9b380); enc.scale.set(2, 1, 0.6); enc.rotation.x = -Math.PI / 2 + 0.2; enc.position.set(0, 0.6, -0.45); sofa.add(enc);
  for (let k = 0; k < 3; k++) sofa.add(caixa(0.75, 0.2, 0.85, [0xff8a3d, 0x00b4d8, 0xff4d8d][k], -0.8 + k * 0.8, 0.36, 0.05, { r: 0.9 }));
  g.add(em(sofa, 2.4, 0.15, 3.8));
  // serragem
  const ser = cone(0.8, 0.5, 0xe9d8a6, 0, 0, 0, { r: 1 }); g.add(em(ser, -2, 0.15, 5.4));
  const pl = placa('OFICINA DE REAPROVEITAMENTO', '#9d4edd', 3.8); pl.position.set(3.8, 0.15, 6.3); g.add(pl);
  for (let i = 0; i < 3; i++) { const p = pessoa(1201 + i); p.position.set(-1 + i * 1.4, 0.15, 0.3 + (i % 2) * 0.8); p.rotation.y = Math.PI + i * 0.4; g.add(p); }
  return g;
}

function predioVerde() {
  const g = new THREE.Group();
  g.add(caixa(13.4, 0.15, 13.4, 0xcfd8dc, 0, 0, 0, { arred: false }));
  const W = 10, H = 15, D = 7;
  const f = T.texFachada({ parede: '#f2efe8', colunas: 5, linhas: 5, seed: 3 });
  const fl = T.texFachada({ parede: '#f2efe8', colunas: 3, linhas: 5, seed: 8 });
  f.map.repeat.set(1, 1); fl.map.repeat.set(1, 1);
  const mFrente = noturno(new THREE.MeshStandardMaterial({ map: f.map, emissive: 0xffd28a, emissiveMap: f.emissivo, roughness: 0.6 }), 1.4);
  const mLado = noturno(new THREE.MeshStandardMaterial({ map: fl.map, emissive: 0xffd28a, emissiveMap: fl.emissivo, roughness: 0.6 }), 1.4);
  const corpo = malha(new THREE.BoxGeometry(W, H, D), [mLado, mLado, mat(0xe0e0e0), mat(0xe0e0e0), mFrente, mFrente]);
  corpo.position.set(0, 0.15 + H / 2, -2.6);
  g.add(corpo);
  // brises verticais
  for (let i = 0; i < 9; i++) g.add(caixa(0.12, H - 1, 0.7, 0xc8a27a, -4.6 + i * 1.15, 1.0, 1.25, { r: 0.6 }));
  // jardim vertical lateral
  const jv = new THREE.Group();
  jv.add(caixa(0.3, H - 2, D - 1, 0x2e7d32, 0, 0, 0, { r: 0.9 }));
  const r = T.rng(13);
  for (let i = 0; i < 40; i++) { const fo = malha(geoFolha(), matFolha([0x43a047, 0x66bb6a, 0x2e7d32][i % 3], 0.02)); fo.scale.setScalar(0.35 + r() * 0.2); fo.position.set(0.25, 0.6 + r() * (H - 3), (r() - 0.5) * (D - 1.6)); jv.add(fo); }
  for (let i = 0; i < 25; i++) jv.add(esf(0.1, [0xff4d8d, 0xffd23f, 0xffffff][i % 3], 0.45, 0.6 + r() * (H - 3), (r() - 0.5) * (D - 1.6), { seg: 8, seg2: 6 }));
  g.add(em(jv, W / 2 + 0.15, 1.15, -2.6));
  // telhado verde
  g.add(caixa(W - 0.3, 0.35, D - 0.3, 0x5cae4f, 0, 0.15 + H, -2.6, { r: 1 }));
  for (let i = 0; i < 6; i++) g.add(em(arvore('arbusto', { escala: 0.75, seed: 1300 + i, flores: i % 2 ? 0xffd23f : null }), -4 + (i % 3) * 1.6, 0.5 + H, -4.8 + Math.floor(i / 3) * 1.4));
  // painéis solares
  const mSolar = new THREE.MeshStandardMaterial({ map: texturaSolar(), roughness: 0.25, metalness: 0.6 });
  for (let i = 0; i < 4; i++) for (let k = 0; k < 2; k++) {
    const p = caixa(1.2, 0.06, 1.6, mSolar, 0.3 + i * 1.3, 0.9 + H, -3.6 + k * 2.1, { arred: false });
    p.rotation.x = -0.45; g.add(p);
    g.add(caixa(0.06, 0.55, 0.06, METAL, 0.3 + i * 1.3, 0.5 + H, -3.0 + k * 2.1, { m: 0.6 }));
  }
  // mini turbina eólica
  const tur = new THREE.Group();
  tur.add(cil(0.06, 0.09, 3.4, 0xffffff, 0, 0, 0, { m: 0.3 }));
  const rotor = new THREE.Group(); rotor.position.set(0, 3.4, 0.2);
  for (let i = 0; i < 3; i++) { const p = caixa(0.14, 1.5, 0.04, 0xffffff, 0, 0, 0, { arred: false }); p.geometry = p.geometry.clone(); p.geometry.translate(0, 0.75, 0); p.position.set(0, 0, 0); p.rotation.z = (i / 3) * Math.PI * 2; rotor.add(p); }
  rotor.add(esf(0.14, 0xdddddd));
  tur.add(rotor);
  g.add(em(tur, -4.1, 0.5 + H, -0.6));
  // cisterna e entrada
  g.add(cil(1.2, 1.2, 2.4, 0x3fa9f5, -4.8, 0.15, 3.8, { r: 0.4 }));
  g.add(cil(1.25, 1.25, 0.15, 0x2a6fdb, -4.8, 2.55, 3.8));
  g.add(caixa(4, 0.15, 2.2, 0x06d6a0, 0, 3.3, 2.1, { r: 0.4 }));
  [-1.8, 1.8].forEach((x) => g.add(cil(0.08, 0.08, 3.2, METAL, x, 0.15, 3.0, { m: 0.6 })));
  // painel de monitoramento
  const tela = malha(new THREE.BoxGeometry(1.6, 1, 0.08), matTela); tela.position.set(2.8, 1.5, 3.4); g.add(tela);
  g.add(cil(0.05, 0.05, 1, METAL, 2.8, 0.15, 3.35));
  g.add(em(bicicleta(0x06d6a0), 4.6, 0.15, 4.6, 0.2)); g.add(em(bicicleta(0xffd23f), 4.6, 0.15, 5.4, 0.2));
  const pl = placa('PRÉDIO VERDE', '#06a77d', 3); pl.position.set(-1.4, 0.15, 6.2); g.add(pl);
  for (let i = 0; i < 3; i++) { const p = pessoa(1301 + i); p.position.set(-1 + i * 1.2, 0.15, 4.4 + (i % 2) * 0.7); p.rotation.y = i * 2.1; g.add(p); }
  g.userData.atualizar = (t) => { rotor.rotation.z = t * 3; };
  return g;
}

function conselho() {
  const g = new THREE.Group();
  g.add(caixa(13.4, 0.15, 13.4, 0x8fd16a, 0, 0, 0, { arred: false }));
  g.add(cil(5.8, 6.0, 0.45, 0xe9dcc9, 0, 0.15, -0.6, { seg: 48 }));
  const rampa = caixa(2.2, 0.12, 3, 0xd6c6ad, 0, 0.18, 6.0); rampa.rotation.x = 0.13; rampa.position.y = 0.35; g.add(rampa);
  for (let i = 0; i < 10; i++) { const a = (i / 10) * Math.PI * 2; g.add(cil(0.17, 0.2, 3.8, MADEIRA, Math.cos(a) * 5.1, 0.6, -0.6 + Math.sin(a) * 5.1)); }
  // cobertura com gomos coloridos
  const geoTeto = new THREE.ConeGeometry(6.4, 2.6, 12, 1, false);
  const pal = [0xffd23f, 0xff8a3d, 0xff4d8d, 0x8b5cf6, 0x3fa9f5, 0x2fbf71].map((c) => new THREE.Color(c));
  const cores = [];
  const pos = geoTeto.attributes.position;
  const ng = geoTeto.toNonIndexed(); const pn = ng.attributes.position;
  for (let i = 0; i < pn.count; i += 3) {
    const cx = (pn.getX(i) + pn.getX(i + 1) + pn.getX(i + 2)) / 3, cz = (pn.getZ(i) + pn.getZ(i + 1) + pn.getZ(i + 2)) / 3;
    const ang = Math.atan2(cz, cx) + Math.PI;
    const c = pal[Math.floor((ang / (Math.PI * 2)) * 12) % pal.length];
    for (let k = 0; k < 3; k++) cores.push(c.r, c.g, c.b);
  }
  ng.setAttribute('color', new THREE.Float32BufferAttribute(cores, 3));
  ng.computeVertexNormals();
  const teto = malha(ng, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.6 }));
  teto.position.set(0, 4.4 + 1.3, -0.6); g.add(teto);
  ad(g, malha(new THREE.TorusGeometry(6.4, 0.12, 8, 48), mat(0xffffff))).position.set(0, 4.4, -0.6);
  g.children[g.children.length - 1].rotation.x = Math.PI / 2;
  // mesa redonda e cadeiras
  g.add(cil(1.8, 1.8, 0.12, MADEIRA, 0, 1.4, -0.6, { seg: 36 }));
  g.add(cil(0.3, 0.4, 0.8, MADEIRA_ESC, 0, 0.6, -0.6));
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    const x = Math.cos(a) * 2.6, z = -0.6 + Math.sin(a) * 2.6;
    g.add(caixa(0.6, 0.5, 0.6, pal[i % pal.length].getHex(), x, 0.6, z));
    if (i % 2 === 0) { const p = pessoa(1401 + i); p.position.set(x, 0.6, z); p.rotation.y = -a - Math.PI / 2; g.add(p); }
  }
  // mapa interdisciplinar
  const quad = new THREE.Group();
  [-1.5, 1.5].forEach((x) => quad.add(cil(0.06, 0.07, 3, MADEIRA_ESC, x, 0, 0)));
  const mp = malha(new THREE.BoxGeometry(3.2, 2.2, 0.08), [mat(MADEIRA), mat(MADEIRA), mat(MADEIRA), mat(MADEIRA), new THREE.MeshStandardMaterial({ map: T.texMapa(), roughness: 0.6 }), mat(MADEIRA)]);
  mp.position.y = 2.1; quad.add(mp);
  g.add(em(quad, -3.4, 0.6, 2.4, 0.5));
  // brinquedoteca ao ar livre
  const esc = new THREE.Group();
  esc.add(caixa(1.2, 1.6, 1.2, 0xff4d8d, 0, 0, 0));
  const esco = caixa(0.9, 0.08, 2.6, 0xffd23f, 0, 0.8, 1.7, { r: 0.4 }); esco.rotation.x = 0.55; esc.add(esco);
  const gang = caixa(0.25, 0.08, 2.6, 0x3fa9f5, 0, 0.4, 0, { r: 0.4 }); esc.add(gang);
  g.add(em(esc, 5, 0.15, 3.6, -0.6));
  const gang2 = new THREE.Group();
  gang2.add(cil(0.15, 0.2, 0.5, 0x8b5cf6)); const tab = caixa(3, 0.1, 0.35, 0x2fbf71, 0, 0.5, 0); tab.rotation.z = 0.2; gang2.add(tab);
  g.add(em(gang2, 4.6, 0.15, -5, 0.3));
  // mastro com bandeiras
  g.add(cil(0.06, 0.07, 6, 0xffffff, -5.4, 0.15, -5.2, { m: 0.4 }));
  [0xff4d8d, 0xffd23f, 0x2fbf71].forEach((c, i) => g.add(caixa(1.2, 0.5, 0.02, c, -4.8, 5.4 - i * 0.6, -5.2, { arred: false, ds: true })));
  const pl = placa('CASA DO CONSELHO', '#e09f00', 3.4); pl.position.set(-3, 0.15, 6.4); g.add(pl);
  return g;
}

export const MODELOS = { rodaEscuta, agrofloresta, residuos, ecomuseu, urbanismo, jardimChuva, horta, circular, saneamento, moradia, oficina, predioVerde, conselho };

// ================================================================
// ITENS DAS AÇÕES SUSTENTÁVEIS
// ================================================================
export const ITENS = {
  ipe: (s) => arvore('ipe', { escala: 0.95, seed: s }),
  pitangueira: (s) => arvore('frutifera', { escala: 0.75, seed: s, cor: 0x3c9a46, frutos: 0xd62828 }),
  flores: (s) => canteiroFlores(2.2, 1.2, s),
  colmeia: () => {
    const g = new THREE.Group();
    g.add(cil(0.05, 0.05, 1, MADEIRA_ESC, -0.3, 0, 0)); g.add(cil(0.05, 0.05, 1, MADEIRA_ESC, 0.3, 0, 0));
    g.add(caixa(0.9, 0.55, 0.6, 0xffc300, 0, 1, 0, { r: 0.5 }));
    g.add(caixa(1.0, 0.08, 0.7, MADEIRA, 0, 1.55, 0));
    g.add(caixa(0.9, 0.08, 0.62, 0x5a3420, 0, 1.2, 0, { arred: false }));
    for (let i = 0; i < 4; i++) g.add(esf(0.05, 0x222222, Math.cos(i) * 0.6, 1.4 + i * 0.1, Math.sin(i * 2) * 0.6, { seg: 6, seg2: 4 }));
    return g;
  },
  banco: () => banco(0xc9a26b),
  lixeiras: () => { const g = new THREE.Group(); [0x2a6fdb, 0xe63946, 0x2a9d8f, 0xffc300].forEach((c, i) => { const l = lixeira(c); l.position.x = -0.95 + i * 0.63; g.add(l); }); return g; },
  composteira: () => {
    const g = new THREE.Group();
    for (let k = 0; k < 4; k++) { g.add(caixa(1.5, 0.12, 0.08, MADEIRA, 0, k * 0.2, -0.7, { arred: false })); g.add(caixa(1.5, 0.12, 0.08, MADEIRA, 0, k * 0.2, 0.7, { arred: false })); g.add(caixa(0.08, 0.12, 1.4, MADEIRA, -0.75, k * 0.2, 0, { arred: false })); g.add(caixa(0.08, 0.12, 1.4, MADEIRA, 0.75, k * 0.2, 0, { arred: false })); }
    const m = esf(0.7, 0x4a321d, 0, 0.1, 0, { r: 1 }); m.scale.y = 0.6; g.add(m);
    return g;
  },
  cisterna: () => {
    const g = new THREE.Group();
    g.add(cil(0.85, 0.85, 1.7, 0x3fa9f5, 0, 0, 0, { r: 0.35 }));
    g.add(cil(0.9, 0.9, 0.12, 0x2a6fdb, 0, 1.7, 0));
    g.add(cil(0.06, 0.06, 0.6, METAL, 0.95, 0.3, 0, { m: 0.6 }));
    const c = cil(0.06, 0.06, 1.2, METAL, 0.4, 2.2, 0, { m: 0.6 }); c.rotation.z = Math.PI / 2; g.add(c);
    return g;
  },
  poste: () => poste({ solar: true }),
  bicicletario: () => {
    const g = new THREE.Group();
    for (let i = 0; i < 4; i++) { const a = malha(new THREE.TorusGeometry(0.4, 0.04, 8, 20, Math.PI), mat(METAL, { m: 0.7, r: 0.3 })); a.position.set(-0.9 + i * 0.6, 0, 0); a.rotation.y = Math.PI / 2; g.add(a); }
    g.add(em(bicicleta(0xff4d8d), -0.6, 0, 0, Math.PI / 2)); g.add(em(bicicleta(0x2fbf71), 0.6, 0, 0, Math.PI / 2));
    return g;
  },
};

// ================================================================
// LOTE DEGRADADO (estado inicial)
// ================================================================
export function degradado(seed = 1, tamanho = 13.6) {
  const g = new THREE.Group();
  const r = T.rng(seed);
  const meio = tamanho / 2 - 1;
  for (let i = 0; i < 9; i++) { const s = esf(0.4 + r() * 0.25, i % 3 ? 0x1f1f1f : 0x2b4a7a, (r() - 0.5) * 2 * meio, 0.25, (r() - 0.5) * 2 * meio, { r: 0.35, seg: 10, seg2: 8 }); s.scale.y = 0.75; g.add(s); }
  for (let i = 0; i < 3; i++) { const t = malha(new THREE.TorusGeometry(0.45, 0.18, 10, 20), mat(0x1a1a1a, { r: 0.9 })); t.rotation.x = Math.PI / 2; t.position.set((r() - 0.5) * 2 * meio, 0.2, (r() - 0.5) * 2 * meio); g.add(t); }
  for (let i = 0; i < 6; i++) { const b = caixa(0.5 + r() * 0.7, 0.3 + r() * 0.3, 0.4 + r() * 0.5, 0x9e9a93, (r() - 0.5) * 2 * meio, 0, (r() - 0.5) * 2 * meio, { r: 1 }); b.rotation.y = r() * 3; g.add(b); }
  g.add(em(arvore('morta', { seed }), (r() - 0.5) * meio, 0, (r() - 0.5) * meio));
  for (let i = 0; i < 4; i++) { const t = caixa(1.6, 0.06, 0.15, 0x8d6e63, (r() - 0.5) * 2 * meio, 0.05 + i * 0.07, (r() - 0.5) * 2 * meio, { arred: false }); t.rotation.y = r() * 3; g.add(t); }
  return g;
}
