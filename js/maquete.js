// Maquete 3D viva: cena, iluminação, dia/noite, chuva, vida (pessoas, pássaros, borboletas) e construções.
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { CSS2DRenderer, CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import * as M from './modelos.js';
import * as T from './texturas.js';

const META = 72;              // metade do lado da maquete (144 m)
const RAIO_PRACA = 18.6, ANEL_INT = 19.6, ANEL_EXT = 25.2, CALCADA_EXT = 26.6;

export const LOTES = (() => {
  const L = { centro: { x: 0, z: 0, raio: 18 } };
  const defs = [['A1', 22.5, 34], ['A2', 45, 52], ['A3', 67.5, 34], ['B1', 112.5, 34], ['B2', 135, 52], ['B3', 157.5, 34],
    ['C1', 202.5, 34], ['C2', 225, 52], ['C3', 247.5, 34], ['D1', 292.5, 34], ['D2', 315, 52], ['D3', 337.5, 34]];
  for (const [n, ang, r] of defs) { const a = (ang * Math.PI) / 180; L[n] = { x: Math.cos(a) * r, z: Math.sin(a) * r, raio: 8 }; }
  return L;
})();

const QUALIDADES = {
  leve: { pr: 1, sombra: 1024, grama: 7000, flores: 900, pos: false, msaa: 0, arvores: 0.6 },
  alta: { pr: 1.5, sombra: 2048, grama: 18000, flores: 1800, pos: true, msaa: 4, arvores: 1 },
  ultra: { pr: 2, sombra: 4096, grama: 32000, flores: 2600, pos: true, msaa: 4, arvores: 1 },
};

const TiltShiftShader = {
  uniforms: { tDiffuse: { value: null }, resolucao: { value: new THREE.Vector2(1, 1) }, foco: { value: 0.47 }, faixa: { value: 0.4 }, forca: { value: 1.5 } },
  vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
  fragmentShader: `
    uniform sampler2D tDiffuse; uniform vec2 resolucao; uniform float foco, faixa, forca; varying vec2 vUv;
    void main(){
      float d = smoothstep(0.0, faixa, abs(vUv.y - foco) - 0.2) * forca;
      if (d < 0.01) { gl_FragColor = texture2D(tDiffuse, vUv); return; }
      vec4 soma = vec4(0.0); float tot = 0.0;
      for (int x = -2; x <= 2; x++) for (int y = -2; y <= 2; y++) {
        vec2 o = vec2(float(x), float(y));
        float w = 1.0 - length(o) / 3.2;
        soma += texture2D(tDiffuse, vUv + o * d / resolucao * 1.5) * w; tot += w;
      }
      gl_FragColor = soma / tot;
    }`,
};

const lerp = (a, b, t) => a + (b - a) * t;
const smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const easeOutBack = (t) => { const c1 = 1.70158, c3 = c1 + 1; return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2); };
const easeInOut = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

export class Maquete {
  constructor(container, opcoes = {}) {
    this.container = container;
    this.qualidade = opcoes.qualidade || 'alta';
    this.tiltShift = opcoes.tiltShift ?? true;
    this.tempo = 0;
    this.tempoDia = 0.4; this.alvoDia = 0.4; this.velDia = 0;
    this.chuva = false; this.fatorChuva = 0;
    this.construidos = {};
    this.itens = [];
    this.casas = [];
    this.marcadores = {};
    this.animacoes = [];
    this.ind = { verde: 18, agua: 16, residuos: 12, comunidade: 22, economia: 15 };
    this.callbacks = { lote: null, construcao: null, colocar: null };
    this.modoColocar = null;
  }

  // ------------------------------------------------------------ init
  async init() {
    const q = QUALIDADES[this.qualidade];
    const r = (this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' }));
    r.setPixelRatio(Math.min(window.devicePixelRatio || 1, q.pr));
    r.setSize(this.container.clientWidth, this.container.clientHeight);
    r.outputColorSpace = THREE.SRGBColorSpace;
    r.toneMapping = THREE.ACESFilmicToneMapping;
    r.toneMappingExposure = 1.05;
    r.shadowMap.enabled = true;
    r.shadowMap.type = THREE.PCFSoftShadowMap;
    this.container.appendChild(r.domElement);
    T.definirAnisotropia(Math.min(8, r.capabilities.getMaxAnisotropy()));

    this.rotulos = new CSS2DRenderer();
    this.rotulos.setSize(this.container.clientWidth, this.container.clientHeight);
    Object.assign(this.rotulos.domElement.style, { position: 'absolute', inset: '0', pointerEvents: 'none' });
    this.container.appendChild(this.rotulos.domElement);

    const cena = (this.cena = new THREE.Scene());
    this.camera = new THREE.PerspectiveCamera(36, this.container.clientWidth / this.container.clientHeight, 3, 1400);
    this.camera.position.set(118, 112, 150);

    const pm = new THREE.PMREMGenerator(r);
    cena.environment = pm.fromScene(new RoomEnvironment(), 0.04).texture;
    cena.environmentIntensity = 0.45;

    this.controles = new OrbitControls(this.camera, r.domElement);
    Object.assign(this.controles, { enableDamping: true, dampingFactor: 0.07, minDistance: 22, maxDistance: 300, maxPolarAngle: 1.36, minPolarAngle: 0.12, screenSpacePanning: false, autoRotateSpeed: 0.35 });
    this.controles.target.set(0, 0, 0);

    this.criarCeu();
    this.criarLuzes();
    this.criarTerreno();
    this.criarRuas();
    this.criarPraca();
    this.criarLotes();
    this.criarEntorno();
    this.criarGrama();
    this.criarVida();
    this.criarClima();
    this.configurarPos();
    this.configurarEventos();
    this.aplicarIndicadores(this.ind);
    this.atualizarCeu(0);

    this.relogio = new THREE.Clock();
    this.renderer.setAnimationLoop(() => this.quadro());
  }

  // ------------------------------------------------------------ céu e luzes
  criarCeu() {
    this.ceuMat = new THREE.ShaderMaterial({
      uniforms: { uTopo: { value: new THREE.Color() }, uBase: { value: new THREE.Color() }, uSolCor: { value: new THREE.Color() }, uSolDir: { value: new THREE.Vector3(0, 1, 0) }, uSolBrilho: { value: 1 } },
      vertexShader: `varying vec3 vDir; void main(){ vDir = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
      fragmentShader: `uniform vec3 uTopo, uBase, uSolCor, uSolDir; uniform float uSolBrilho; varying vec3 vDir;
        void main(){ float h = vDir.y;
          vec3 c = mix(uBase, uTopo, smoothstep(0.0, 0.42, h));
          c = mix(c, uBase * vec3(0.92, 1.0, 0.98), smoothstep(0.0, -0.5, h));
          float s = max(dot(normalize(vDir), normalize(uSolDir)), 0.0);
          c += uSolCor * (pow(s, 600.0) * 4.0 + pow(s, 10.0) * 0.35) * uSolBrilho;
          gl_FragColor = vec4(c, 1.0);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
        }`,
      side: THREE.BackSide, depthWrite: false, fog: false,
    });
    this.ceu = new THREE.Mesh(new THREE.SphereGeometry(900, 32, 16), this.ceuMat);
    this.ceu.renderOrder = -1;
    this.cena.add(this.ceu);
    this.cena.fog = new THREE.Fog(0xcdeeff, 330, 900);

    // estrelas
    const n = 900, p = new Float32Array(n * 3), rr = T.rng(5);
    for (let i = 0; i < n; i++) {
      const th = rr() * Math.PI * 2, ph = Math.acos(rr() * 0.95);
      p.set([Math.sin(ph) * Math.cos(th) * 850, Math.cos(ph) * 850, Math.sin(ph) * Math.sin(th) * 850], i * 3);
    }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(p, 3));
    this.estrelasMat = new THREE.PointsMaterial({ color: 0xffffff, size: 2.2, sizeAttenuation: false, transparent: true, opacity: 0, fog: false, depthWrite: false });
    this.cena.add(new THREE.Points(g, this.estrelasMat));
  }

  criarLuzes() {
    this.hemi = new THREE.HemisphereLight(0xbfe6ff, 0x6aa84f, 1.1);
    this.cena.add(this.hemi);
    const sol = (this.sol = new THREE.DirectionalLight(0xfff4e0, 3));
    sol.castShadow = true;
    const sc = sol.shadow.camera;
    sc.left = -105; sc.right = 105; sc.top = 105; sc.bottom = -105; sc.near = 10; sc.far = 420;
    sol.shadow.mapSize.set(QUALIDADES[this.qualidade].sombra, QUALIDADES[this.qualidade].sombra);
    sol.shadow.bias = -0.0004; sol.shadow.normalBias = 0.04;
    this.cena.add(sol); this.cena.add(sol.target);
    // luzes pontuais da praça (acendem à noite)
    this.luzesPraca = [];
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
      const l = new THREE.PointLight(0xffc56b, 0, 26, 1.6);
      l.position.set(Math.cos(a) * 16.5, 3.6, Math.sin(a) * 16.5);
      this.cena.add(l); this.luzesPraca.push(l);
    }
  }

  // ------------------------------------------------------------ terreno, rio e ruas
  distRio(x, z) {
    let m = Infinity;
    const P = this.rioPts;
    for (let i = 0; i < P.length - 1; i++) {
      const ax = P[i].x, az = P[i].z, bx = P[i + 1].x, bz = P[i + 1].z;
      const dx = bx - ax, dz = bz - az;
      const t = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / (dx * dx + dz * dz)));
      const d = Math.hypot(x - (ax + dx * t), z - (az + dz * t));
      if (d < m) m = d;
    }
    return m;
  }

  criarTerreno() {
    const curva = (this.rioCurva = new THREE.CatmullRomCurve3([
      new THREE.Vector3(-80, 0, -40), new THREE.Vector3(-70, 0, -12), new THREE.Vector3(-64, 0, 20), new THREE.Vector3(-52, 0, 48), new THREE.Vector3(-26, 0, 80),
    ]));
    this.rioPts = curva.getSpacedPoints(90);

    const seg = 180;
    const geo = new THREE.PlaneGeometry(META * 2, META * 2, seg, seg);
    geo.rotateX(-Math.PI / 2);
    const pos = geo.attributes.position, cores = [];
    const c = new THREE.Color(), rr = T.rng(3);
    const verdes = [new THREE.Color(0x6dbb4a), new THREE.Color(0x7cc95a), new THREE.Color(0x5fae45), new THREE.Color(0x86cf62)];
    const areia = new THREE.Color(0xd8c48f), lama = new THREE.Color(0x7a6a4a);
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i), z = pos.getZ(i);
      const d = this.distRio(x, z);
      let h = 0;
      if (d < 8.5) h -= 1.9 * smooth(8.5, 3.0, d);
      h -= 0.03;
      pos.setY(i, h);
      c.copy(verdes[Math.floor(rr() * 4)]);
      const n = Math.sin(x * 0.05 + 1.3) * Math.cos(z * 0.06) * 0.5 + 0.5;
      c.lerp(verdes[3], n * 0.4);
      if (d < 8.5) c.lerp(areia, smooth(8.5, 5.5, d));
      if (d < 4.5) c.lerp(lama, smooth(4.5, 3, d));
      cores.push(c.r, c.g, c.b);
    }
    geo.setAttribute('color', new THREE.Float32BufferAttribute(cores, 3));
    geo.computeVertexNormals();
    this.terrenoMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95 });
    this.terreno = new THREE.Mesh(geo, this.terrenoMat);
    this.terreno.receiveShadow = true;
    this.cena.add(this.terreno);

    // laterais com estratos do solo
    const est = T.texEstratos();
    est.repeat.set(3, 1);
    const lado = new THREE.MeshStandardMaterial({ map: est, roughness: 1 });
    const fundo = new THREE.MeshStandardMaterial({ color: 0x4a3322, roughness: 1 });
    const invisivel = new THREE.MeshBasicMaterial({ visible: false });
    const base = new THREE.Mesh(new THREE.BoxGeometry(META * 2, 9, META * 2), [lado, lado, invisivel, fundo, lado, lado]);
    base.position.y = -4.5 + 0.02;
    base.receiveShadow = true;
    this.cena.add(base);
    // sombra de contato sob a maquete
    const sombraG = new THREE.CircleGeometry(150, 48);
    const sc = document.createElement('canvas'); sc.width = sc.height = 128;
    const sg = sc.getContext('2d'); const gr = sg.createRadialGradient(64, 64, 10, 64, 64, 64);
    gr.addColorStop(0, 'rgba(0,0,0,.35)'); gr.addColorStop(1, 'rgba(0,0,0,0)'); sg.fillStyle = gr; sg.fillRect(0, 0, 128, 128);
    const somb = new THREE.Mesh(sombraG, new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(sc), transparent: true, depthWrite: false }));
    somb.rotation.x = -Math.PI / 2; somb.position.y = -14; this.cena.add(somb);

    // rio
    const n = 160, L = 9.6;
    const vert = [], uv = [], idx = [];
    for (let i = 0; i <= n; i++) {
      const t = i / n;
      const p = curva.getPointAt(t), tg = curva.getTangentAt(t);
      const nx = -tg.z, nz = tg.x;
      for (const s of [-1, 1]) {
        const x = THREE.MathUtils.clamp(p.x + nx * s * L / 2, -META, META), z = THREE.MathUtils.clamp(p.z + nz * s * L / 2, -META, META);
        vert.push(x, -0.55, z); uv.push(t * 14, s < 0 ? 0 : 1);
      }
      if (i < n) { const a = i * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
    }
    const rg = new THREE.BufferGeometry();
    rg.setAttribute('position', new THREE.Float32BufferAttribute(vert, 3));
    rg.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    rg.setIndex(idx); rg.computeVertexNormals();
    this.rioMat = M.matAgua(0x3fb3e8);
    this.rioMat.normalScale.set(0.7, 0.7);
    this.rioMat.side = THREE.DoubleSide;
    this.rio = new THREE.Mesh(rg, this.rioMat);
    this.rio.receiveShadow = true;
    this.cena.add(this.rio);
    // pedras nas margens
    const rs = T.rng(17);
    const pedraGeo = M.geoFolha();
    const pedras = new THREE.InstancedMesh(pedraGeo, new THREE.MeshStandardMaterial({ color: 0xa8a197, roughness: 0.9 }), 120);
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler();
    for (let i = 0; i < 120; i++) {
      const t = rs();
      const p = curva.getPointAt(t), tg = curva.getTangentAt(t);
      const s = rs() > 0.5 ? 1 : -1, off = 4.4 + rs() * 1.6;
      const x = p.x - tg.z * s * off, z = p.z + tg.x * s * off;
      if (Math.abs(x) > META - 1 || Math.abs(z) > META - 1) { m4.makeScale(0, 0, 0); pedras.setMatrixAt(i, m4); continue; }
      const sc2 = 0.3 + rs() * 0.5;
      q.setFromEuler(e.set(rs(), rs() * 6, rs()));
      m4.compose(new THREE.Vector3(x, -0.6 + sc2 * 0.3, z), q, new THREE.Vector3(sc2, sc2 * 0.6, sc2));
      pedras.setMatrixAt(i, m4);
    }
    pedras.castShadow = true; pedras.receiveShadow = true;
    this.cena.add(pedras);
  }

  naRua(x, z, margem = 0) {
    const r = Math.hypot(x, z);
    if (r > RAIO_PRACA - margem && r < CALCADA_EXT + margem) return true;
    if (r > CALCADA_EXT - 1 && (Math.abs(z) < 4.4 + margem || Math.abs(x) < 4.4 + margem)) return true;
    return false;
  }
  noLote(x, z, margem = 0) {
    for (const k in LOTES) {
      if (k === 'centro') continue;
      const l = LOTES[k];
      if (Math.abs(x - l.x) < 7.6 + margem && Math.abs(z - l.z) < 7.6 + margem) return true;
    }
    return false;
  }
  livre(x, z, margem = 0) {
    if (Math.abs(x) > META - 1.5 - margem * 0.5 || Math.abs(z) > META - 1.5 - margem * 0.5) return false;
    if (Math.hypot(x, z) < CALCADA_EXT + margem) return false;
    if (this.naRua(x, z, margem)) return false;
    if (this.noLote(x, z, margem)) return false;
    if (this.distRio(x, z) < 6.5 + margem) return false;
    return true;
  }

  criarRuas() {
    const asfalto = new THREE.MeshStandardMaterial({ color: 0x454b57, roughness: 0.92, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -2 });
    const calcada = new THREE.MeshStandardMaterial({ color: 0xded6c8, roughness: 0.95 });
    const faixa = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.6, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -4 });
    const amarela = new THREE.MeshStandardMaterial({ color: 0xffd23f, roughness: 0.6, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -4 });
    const anel = new THREE.Mesh(new THREE.RingGeometry(ANEL_INT, ANEL_EXT, 160, 1), asfalto);
    anel.rotation.x = -Math.PI / 2; anel.position.y = 0.05; anel.receiveShadow = true; this.cena.add(anel);
    const ce = new THREE.Mesh(new THREE.RingGeometry(ANEL_EXT, CALCADA_EXT, 160, 1), calcada);
    ce.rotation.x = -Math.PI / 2; ce.position.y = 0.09; ce.receiveShadow = true; this.cena.add(ce);
    for (let i = 0; i < 56; i++) {
      const a = (i / 56) * Math.PI * 2;
      const d = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.02, 1.3), faixa);
      d.position.set(Math.cos(a) * 22.4, 0.07, Math.sin(a) * 22.4); d.rotation.y = -a; this.cena.add(d);
    }
    const comp = META - CALCADA_EXT + 0.5, meio = (META + CALCADA_EXT) / 2;
    for (let k = 0; k < 4; k++) {
      const g = new THREE.Group();
      const via = new THREE.Mesh(new THREE.BoxGeometry(comp, 0.12, 6), asfalto); via.position.set(meio, 0.0, 0); via.receiveShadow = true; g.add(via);
      [-1, 1].forEach((s) => { const c = new THREE.Mesh(new THREE.BoxGeometry(comp, 0.2, 1.4), calcada); c.position.set(meio, 0.05, s * 3.7); c.receiveShadow = true; c.castShadow = true; g.add(c); });
      for (let i = 0; i < 12; i++) { const d = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.02, 0.2), amarela); d.position.set(CALCADA_EXT + 2 + i * 3.8, 0.07, 0); g.add(d); }
      // faixa de pedestres junto ao anel
      for (let i = 0; i < 6; i++) { const z = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.02, 0.55), faixa); z.position.set(CALCADA_EXT + 1.4, 0.07, -2.4 + i * 0.95); g.add(z); }
      g.rotation.y = (k * Math.PI) / 2;
      this.cena.add(g);
    }
    // ponte sobre o rio (via oeste)
    let xc = -64;
    for (let x = -40; x > -META; x -= 0.5) if (this.distRio(x, 0) < 1) { xc = x; break; }
    const ponte = new THREE.Group();
    const deck = new THREE.Mesh(new THREE.BoxGeometry(16, 0.7, 8.8), new THREE.MeshStandardMaterial({ color: 0xb98b5e, roughness: 0.8 }));
    deck.position.set(0, -0.4, 0); deck.castShadow = deck.receiveShadow = true; ponte.add(deck);
    [-1, 1].forEach((s) => {
      for (let i = 0; i < 9; i++) ponte.add(M.cil(0.1, 0.1, 1.1, 0x7a5230, -7.5 + i * 1.875, 0.1, s * 4.3));
      const cor = M.caixa(16, 0.14, 0.16, 0x7a5230, 0, 1.1, s * 4.3);
      ponte.add(cor);
    });
    ponte.position.set(Math.max(xc, -META + 8.1), 0, 0);
    this.cena.add(ponte);
  }

  // ------------------------------------------------------------ praça central
  criarPraca() {
    this.texPracaMorta = T.texPiso(false);
    this.texPracaViva = T.texPiso(true);
    this.pracaMat = new THREE.MeshStandardMaterial({ map: this.texPracaMorta, roughness: 0.85, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -2 });
    const praca = new THREE.Mesh(new THREE.CircleGeometry(RAIO_PRACA + 1, 128), this.pracaMat);
    praca.rotation.x = -Math.PI / 2; praca.position.y = 0.08; praca.receiveShadow = true;
    praca.userData.lote = 'centro';
    this.praca = praca;
    this.cena.add(praca);
    const meio = new THREE.Mesh(new THREE.RingGeometry(RAIO_PRACA + 0.2, ANEL_INT + 0.05, 128), new THREE.MeshStandardMaterial({ color: 0xcfc6b6, roughness: 0.9 }));
    meio.rotation.x = -Math.PI / 2; meio.position.y = 0.1; meio.receiveShadow = true; this.cena.add(meio);
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2 + Math.PI / 8;
      const p = M.poste();
      p.position.set(Math.cos(a) * 17.4, 0.08, Math.sin(a) * 17.4);
      p.rotation.y = -a + Math.PI;
      this.cena.add(p);
    }
    this.pracaDegradada = M.degradado(99, 28);
    this.pracaDegradada.position.y = 0.08;
    const bancoVelho = M.banco(0x8a8580); bancoVelho.position.set(6, 0.08, 9); bancoVelho.rotation.set(0, 0.6, 0.25); this.pracaDegradada.add(bancoVelho);
    this.cena.add(this.pracaDegradada);
  }

  // ------------------------------------------------------------ lotes, marcadores
  criarLotes() {
    this.pads = {};
    const meioFio = new THREE.MeshStandardMaterial({ color: 0xcfc8bb, roughness: 0.9 });
    for (const k in LOTES) {
      const l = LOTES[k];
      const ang = Math.atan2(-l.x, -l.z);
      l.rot = k === 'centro' ? 0 : ang;
      if (k !== 'centro') {
        const g = new THREE.Group();
        const padMat = new THREE.MeshStandardMaterial({ color: 0x8b6b47, roughness: 1 });
        const pad = new THREE.Mesh(new THREE.BoxGeometry(14.6, 0.16, 14.6), padMat);
        pad.position.y = 0.04; pad.receiveShadow = true; pad.userData.lote = k;
        g.add(pad);
        [[0, 7.4, 15.2, 0.4], [0, -7.4, 15.2, 0.4], [7.4, 0, 0.4, 15.2], [-7.4, 0, 0.4, 15.2]].forEach(([x, z, w, d]) => {
          const m = new THREE.Mesh(new THREE.BoxGeometry(w, 0.32, d), meioFio); m.position.set(x, 0.1, z); m.castShadow = m.receiveShadow = true; g.add(m);
        });
        const deg = M.degradado(k.charCodeAt(0) * 7 + k.charCodeAt(1));
        deg.position.y = 0.12;
        g.add(deg);
        g.position.set(l.x, 0, l.z);
        g.rotation.y = l.rot;
        this.cena.add(g);
        this.pads[k] = { grupo: g, pad, padMat, degradado: deg };
      } else {
        this.pads[k] = { grupo: null, pad: this.praca, degradado: this.pracaDegradada };
      }
      // anel pulsante
      const raio = k === 'centro' ? 18.2 : 9.4;
      const anel = new THREE.Mesh(new THREE.RingGeometry(raio - 0.45, raio, 72), new THREE.MeshBasicMaterial({ color: 0xffd23f, transparent: true, opacity: 0.7, depthWrite: false }));
      anel.rotation.x = -Math.PI / 2; anel.position.set(l.x, 0.22, l.z);
      anel.visible = false;
      this.cena.add(anel);
      // rótulo
      const el = document.createElement('button');
      el.className = 'marcador bloqueado';
      el.type = 'button';
      el.innerHTML = '<span class="mk-ico">❔</span><span class="mk-txt"></span>';
      el.addEventListener('click', (ev) => { ev.stopPropagation(); this.callbacks.lote && this.callbacks.lote(k); });
      const caixa = document.createElement('div');
      caixa.className = 'marcador-pos';
      caixa.appendChild(el);
      const obj = new CSS2DObject(caixa);
      obj.position.set(l.x, k === 'centro' ? 13 : 10, l.z);
      this.cena.add(obj);
      this.marcadores[k] = { anel, el, obj };
    }
  }

  definirMarcador(lote, { icone, titulo, estado, cor }) {
    const m = this.marcadores[lote];
    if (!m) return;
    m.el.className = 'marcador ' + estado;
    m.el.querySelector('.mk-ico').textContent = estado === 'bloqueado' ? '🔒' : icone;
    m.el.querySelector('.mk-txt').textContent = titulo;
    m.el.style.setProperty('--cor', cor || '#ffd23f');
    m.el.setAttribute('aria-label', `${titulo} — ${estado === 'concluido' ? 'concluída' : estado === 'bloqueado' ? 'bloqueada' : 'disponível'}`);
    m.anel.visible = estado === 'disponivel';
    m.anel.material.color.set(cor || '#ffd23f');
  }

  mostrarMarcadores(v) { this.marcadoresVisiveis = v; for (const k in this.marcadores) this.marcadores[k].obj.visible = v; }

  // ------------------------------------------------------------ entorno (casas, árvores, prédios)
  criarEntorno() {
    const rr = T.rng(2024);
    const arvores = [];
    const coresCasa = [0xffd6a5, 0xfdffb6, 0xcaffbf, 0x9bf6ff, 0xa0c4ff, 0xffc6ff, 0xffadad, 0xf1faee, 0xffe5b4, 0xe2ece9];
    const coresTelhado = [0xc8553d, 0xb5523b, 0x8d5524, 0x6a4c93, 0x1d6fa3, 0x2a9d8f];
    const passo = 9;
    for (let x = -META + 6; x <= META - 6; x += passo) {
      for (let z = -META + 6; z <= META - 6; z += passo) {
        const px = x + (rr() - 0.5) * 3, pz = z + (rr() - 0.5) * 3;
        if (this.livre(px, pz, 3.6) && rr() > 0.3) {
          const alto = rr() > 0.86;
          let c;
          if (alto) {
            const h = 9 + rr() * 6;
            c = new THREE.Group();
            const fac = T.texFachada({ parede: ['#fef6e4', '#e8f1f2', '#fde2e4'][Math.floor(rr() * 3)], colunas: 3, linhas: Math.round(h / 3), seed: Math.floor(rr() * 99), w: 192, h: 64 * Math.round(h / 3) });
            const mf = M.noturno(new THREE.MeshStandardMaterial({ map: fac.map, emissive: 0xffd28a, emissiveMap: fac.emissivo, roughness: 0.7 }), 1.2);
            const corpo = new THREE.Mesh(new THREE.BoxGeometry(6, h, 6), mf);
            corpo.position.y = h / 2; corpo.castShadow = corpo.receiveShadow = true; c.add(corpo);
            c.add(M.caixa(6.3, 0.4, 6.3, coresTelhado[Math.floor(rr() * coresTelhado.length)], 0, h, 0));
            c.add(M.cil(0.8, 0.8, 1.2, 0x3fa9f5, 1.5, h + 0.4, 1.5));
          } else {
            const w = 4.6 + rr() * 1.6, d = 4.2 + rr() * 1.2, h = 2.8 + rr() * 0.8;
            c = M.casa(w, d, h, coresCasa[Math.floor(rr() * coresCasa.length)], coresTelhado[Math.floor(rr() * coresTelhado.length)], { solar: rr() > 0.75 });
          }
          c.position.set(px, 0, pz);
          let ang = Math.atan2(-px, -pz);
          if (Math.abs(pz) < 13 && Math.abs(px) > CALCADA_EXT) ang = pz > 0 ? Math.PI : 0;
          else if (Math.abs(px) < 13 && Math.abs(pz) > CALCADA_EXT) ang = px > 0 ? -Math.PI / 2 : Math.PI / 2;
          c.rotation.y = ang;
          this.cena.add(c);
          this.casas.push({ x: px, z: pz });
          if (rr() > 0.5) arvores.push([px + (rr() - 0.5) * 7, pz + (rr() - 0.5) * 7, 0.7 + rr() * 0.5]);
        } else if (this.livre(px, pz, 1)) {
          const n = 1 + Math.floor(rr() * 3);
          for (let i = 0; i < n; i++) arvores.push([px + (rr() - 0.5) * 6, pz + (rr() - 0.5) * 6, 0.8 + rr() * 0.7]);
        }
      }
    }
    // mata ciliar ao longo do rio
    for (let i = 0; i < 46; i++) {
      const t = rr();
      const p = this.rioCurva.getPointAt(t), tg = this.rioCurva.getTangentAt(t);
      const s = rr() > 0.5 ? 1 : -1, off = 8 + rr() * 5;
      arvores.push([p.x - tg.z * s * off, p.z + tg.x * s * off, 0.9 + rr() * 0.6]);
    }
    const validas = arvores.filter(([x, z]) => Math.abs(x) < META - 1.5 && Math.abs(z) < META - 1.5 && !this.naRua(x, z, 0.8) && !this.noLote(x, z, 1) && Math.hypot(x, z) > CALCADA_EXT + 1 && this.distRio(x, z) > 5.5 && !this.casas.some((c) => Math.hypot(c.x - x, c.z - z) < 4));
    this.arvoresPos = validas;
    // árvores instanciadas
    const N = validas.length;
    const troncoGeo = new THREE.CylinderGeometry(0.17, 0.3, 2.6, 10); troncoGeo.translate(0, 1.3, 0);
    const troncos = new THREE.InstancedMesh(troncoGeo, new THREE.MeshStandardMaterial({ color: 0x6e4a2c, roughness: 0.9 }), N);
    const copas = new THREE.InstancedMesh(M.geoFolha(), M.matFolha(0xffffff), N * 3);
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), cor = new THREE.Color();
    const palCopa = [0x3fae49, 0x4caf50, 0x2e8b3d, 0x5cb85c, 0x3c9d48, 0x66bb6a];
    validas.forEach(([x, z, s], i) => {
      m4.compose(new THREE.Vector3(x, 0, z), q.identity(), new THREE.Vector3(s, s, s));
      troncos.setMatrixAt(i, m4);
      const especial = rr();
      for (let k = 0; k < 3; k++) {
        const rad = (1.1 + rr() * 0.6) * s;
        m4.compose(new THREE.Vector3(x + (rr() - 0.5) * 1.4 * s, (2.9 + rr() * 1.0) * s, z + (rr() - 0.5) * 1.4 * s), q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), rr() * 6), new THREE.Vector3(rad, rad * 0.9, rad));
        copas.setMatrixAt(i * 3 + k, m4);
        if (especial > 0.9) cor.set(k === 2 ? 0x58a83c : 0xffcf33);
        else if (especial > 0.82) cor.set(k === 2 ? 0x58a83c : 0xe75a9a);
        else cor.set(palCopa[Math.floor(rr() * palCopa.length)]);
        copas.setColorAt(i * 3 + k, cor);
      }
    });
    troncos.castShadow = copas.castShadow = true; troncos.receiveShadow = copas.receiveShadow = true;
    this.cena.add(troncos); this.cena.add(copas);
    this.arvoresInst = { troncos, copas, N };

    // lixo espalhado (diminui com o indicador de resíduos)
    const lixoN = 140;
    this.lixo = new THREE.InstancedMesh(new THREE.DodecahedronGeometry(0.35, 0), new THREE.MeshStandardMaterial({ roughness: 0.6 }), lixoN);
    const palLixo = [0x222222, 0xdddddd, 0x2b4a7a, 0xc0392b, 0x7f8c8d];
    let k = 0, tent = 0;
    while (k < lixoN && tent < 5000) {
      tent++;
      const x = (rr() - 0.5) * META * 2, z = (rr() - 0.5) * META * 2;
      const r = Math.hypot(x, z);
      const pertoRua = (r > CALCADA_EXT && r < CALCADA_EXT + 4) || (r > CALCADA_EXT && (Math.abs(Math.abs(z) - 5.5) < 1.2 || Math.abs(Math.abs(x) - 5.5) < 1.2));
      if (!pertoRua || this.noLote(x, z, 0.5) || this.distRio(x, z) < 5) continue;
      m4.compose(new THREE.Vector3(x, 0.2, z), q.setFromEuler(new THREE.Euler(rr() * 3, rr() * 3, 0)), new THREE.Vector3(1, 0.6, 1).multiplyScalar(0.6 + rr() * 0.8));
      this.lixo.setMatrixAt(k, m4);
      this.lixo.setColorAt(k, cor.set(palLixo[k % palLixo.length]));
      k++;
    }
    this.lixo.count = k; this.lixoMax = k;
    this.lixo.castShadow = true;
    this.cena.add(this.lixo);
  }

  // ------------------------------------------------------------ grama e flores instanciadas
  criarGrama() {
    const q = QUALIDADES.ultra;
    const geo = new THREE.ConeGeometry(0.11, 0.85, 3, 1);
    geo.translate(0, 0.5, 0);
    this.gramaUni = { uSeco: { value: 0.6 } };
    const mat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.9 });
    mat.onBeforeCompile = (sh) => {
      sh.uniforms.uTempo = M.U.tempo; sh.uniforms.uSeco = this.gramaUni.uSeco;
      sh.vertexShader = 'uniform float uTempo;\nvarying float vH;\n' + sh.vertexShader.replace('#include <begin_vertex>', `
        #include <begin_vertex>
        vH = position.y;
        vec4 wp = modelMatrix * instanceMatrix * vec4(0.0,0.0,0.0,1.0);
        float f = wp.x * 0.21 + wp.z * 0.17;
        float curva = vH * vH;
        transformed.x += (sin(uTempo * 2.1 + f) * 0.22 + 0.12) * curva;
        transformed.z += cos(uTempo * 1.7 + f * 1.3) * 0.16 * curva;`);
      sh.fragmentShader = 'uniform float uSeco;\nvarying float vH;\n' + sh.fragmentShader.replace('#include <color_fragment>', `
        #include <color_fragment>
        diffuseColor.rgb *= mix(0.45, 1.18, vH);
        diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.72, 0.6, 0.3) * mix(0.5, 1.1, vH), uSeco);`);
    };
    mat.customProgramCacheKey = () => 'grama';
    const N = q.grama;
    const grama = new THREE.InstancedMesh(geo, mat, N);
    const rr = T.rng(77), m4 = new THREE.Matrix4(), qq = new THREE.Quaternion(), e = new THREE.Euler(), c = new THREE.Color();
    const pal = [0x5aa83c, 0x6cbf4a, 0x4e9c35, 0x7fcf5a, 0x63b347];
    let i = 0, tent = 0;
    while (i < N && tent < N * 6) {
      tent++;
      const x = (rr() - 0.5) * (META * 2 - 2), z = (rr() - 0.5) * (META * 2 - 2);
      if (Math.hypot(x, z) < CALCADA_EXT + 0.4 || this.naRua(x, z, 0.4) || this.noLote(x, z, 0.3)) continue;
      const dr = this.distRio(x, z);
      if (dr < 5.2) continue;
      if (this.casas.some((h) => Math.abs(h.x - x) < 3.3 && Math.abs(h.z - z) < 3.3)) continue;
      const s = 0.45 + rr() * 0.65;
      qq.setFromEuler(e.set((rr() - 0.5) * 0.5, rr() * 6.28, (rr() - 0.5) * 0.5));
      m4.compose(new THREE.Vector3(x, 0, z), qq, new THREE.Vector3(s, s * (0.8 + rr() * 0.6), s));
      grama.setMatrixAt(i, m4);
      grama.setColorAt(i, c.set(pal[Math.floor(rr() * pal.length)]));
      i++;
    }
    this.gramaMax = i;
    grama.count = Math.min(i, QUALIDADES[this.qualidade].grama);
    grama.receiveShadow = true;
    this.grama = grama;
    this.cena.add(grama);

    // flores
    const NF = q.flores;
    const flores = new THREE.InstancedMesh(new THREE.SphereGeometry(0.16, 8, 6), new THREE.MeshStandardMaterial({ roughness: 0.5 }), NF);
    const pf = [0xff4d8d, 0xffd23f, 0xffffff, 0xc77dff, 0xff8a3d, 0x3fa9f5];
    i = 0; tent = 0;
    while (i < NF && tent < NF * 10) {
      tent++;
      const x = (rr() - 0.5) * (META * 2 - 3), z = (rr() - 0.5) * (META * 2 - 3);
      if (Math.hypot(x, z) < CALCADA_EXT + 0.6 || this.naRua(x, z, 0.6) || this.noLote(x, z, 0.4) || this.distRio(x, z) < 6) continue;
      if (this.casas.some((h) => Math.abs(h.x - x) < 3.4 && Math.abs(h.z - z) < 3.4)) continue;
      m4.compose(new THREE.Vector3(x, 0.55 + rr() * 0.4, z), qq.identity(), new THREE.Vector3(1, 0.8, 1));
      flores.setMatrixAt(i, m4);
      flores.setColorAt(i, c.set(pf[i % pf.length]));
      i++;
    }
    this.floresMax = i;
    this.flores = flores;
    this.cena.add(flores);
  }

  // ------------------------------------------------------------ vida: pessoas, pássaros, borboletas, nuvens, vaga-lumes
  criarVida() {
    // pessoas caminhando
    this.pedestres = [];
    const rr = T.rng(31);
    for (let i = 0; i < 52; i++) {
      const p = M.pessoa(i + 1);
      const tipo = i % 5 < 2 ? 'anel' : i % 5 === 2 ? 'praca' : 'radial';
      const d = { obj: p, tipo, dir: rr() > 0.5 ? 1 : -1, vel: 1.1 + rr() * 0.6 };
      if (tipo === 'anel') { d.r = 25.9; d.a = rr() * 6.28; }
      else if (tipo === 'praca') { d.r = 18.9; d.a = rr() * 6.28; }
      else { d.eixo = i % 4; d.lado = rr() > 0.5 ? 3.7 : -3.7; d.s = CALCADA_EXT + rr() * (META - CALCADA_EXT - 2); }
      p.visible = false;
      this.cena.add(p);
      this.pedestres.push(d);
    }
    // pássaros
    this.passaros = [];
    const asaGeo = new THREE.BufferGeometry();
    asaGeo.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, -0.25, 0, 0, 0.25, 1.1, 0, 0], 3));
    asaGeo.computeVertexNormals();
    const pm = new THREE.MeshStandardMaterial({ color: 0x2d3142, side: THREE.DoubleSide, roughness: 0.6 });
    for (let i = 0; i < 18; i++) {
      const b = new THREE.Group();
      const corpo = new THREE.Mesh(new THREE.ConeGeometry(0.16, 0.9, 6), pm); corpo.rotation.x = Math.PI / 2; b.add(corpo);
      const ae = new THREE.Mesh(asaGeo, pm), ad = new THREE.Mesh(asaGeo, pm); ad.scale.x = -1;
      b.add(ae); b.add(ad);
      b.scale.setScalar(1.5);
      b.userData = { ae, ad, r: 26 + rr() * 40, h: 18 + rr() * 16, a: rr() * 6.28, v: (0.12 + rr() * 0.1) * (rr() > 0.5 ? 1 : -1), f: rr() * 6 };
      b.visible = false;
      this.cena.add(b); this.passaros.push(b);
    }
    // borboletas
    this.borboletas = [];
    const bg = new THREE.PlaneGeometry(0.45, 0.35); bg.translate(0.22, 0, 0);
    for (let i = 0; i < 24; i++) {
      const cor = [0xffd23f, 0xff8a3d, 0x3fa9f5, 0xff4d8d, 0xffffff][i % 5];
      const m = new THREE.MeshStandardMaterial({ color: cor, side: THREE.DoubleSide, emissive: cor, emissiveIntensity: 0.15 });
      const b = new THREE.Group();
      const a1 = new THREE.Mesh(bg, m), a2 = new THREE.Mesh(bg, m); a2.scale.x = -1;
      b.add(a1); b.add(a2);
      b.userData = { a1, a2, cx: 0, cz: 0, f: rr() * 6, r: 2 + rr() * 4 };
      b.visible = false;
      this.cena.add(b); this.borboletas.push(b);
    }
    // nuvens
    this.nuvens = [];
    this.nuvemMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 1, emissive: 0xffffff, emissiveIntensity: 0.12 });
    for (let i = 0; i < 8; i++) {
      const g = new THREE.Group();
      const n = 5 + Math.floor(rr() * 4);
      for (let k = 0; k < n; k++) {
        const m = new THREE.Mesh(M.geoFolha(), this.nuvemMat);
        const s = 3 + rr() * 3.5;
        m.scale.set(s * 1.3, s * 0.75, s);
        m.position.set((k - n / 2) * 3.8 + rr() * 2, rr() * 2, (rr() - 0.5) * 5);
        g.add(m);
      }
      g.position.set(-160 + rr() * 320, 55 + rr() * 18, -110 + rr() * 220);
      g.userData.v = 1.5 + rr() * 1.8;
      this.cena.add(g); this.nuvens.push(g);
    }
    // vaga-lumes
    const nv = 260, pv = new Float32Array(nv * 3);
    this.vagaBase = [];
    for (let i = 0; i < nv; i++) {
      let x, z, t = 0;
      do { x = (rr() - 0.5) * 130; z = (rr() - 0.5) * 130; t++; } while (t < 30 && !(this.livre(x, z, 0) || this.distRio(x, z) < 12));
      this.vagaBase.push([x, 0.8 + rr() * 2.5, z, rr() * 6]);
    }
    const gv = new THREE.BufferGeometry(); gv.setAttribute('position', new THREE.BufferAttribute(pv, 3));
    this.vagaMat = new THREE.PointsMaterial({ color: 0xfff27a, size: 1.4, map: T.texBrilho(), transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending });
    this.vagalumes = new THREE.Points(gv, this.vagaMat);
    this.cena.add(this.vagalumes);
  }

  criarClima() {
    const n = 7000, p = new Float32Array(n * 6);
    const rr = T.rng(8);
    this.gotas = [];
    for (let i = 0; i < n; i++) {
      const x = (rr() - 0.5) * 170, y = rr() * 80, z = (rr() - 0.5) * 170;
      this.gotas.push([x, y, z, 40 + rr() * 20]);
    }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(p, 3));
    this.chuvaMat = new THREE.LineBasicMaterial({ color: 0xb8dcff, transparent: true, opacity: 0, depthWrite: false });
    this.chuvaObj = new THREE.LineSegments(g, this.chuvaMat);
    this.chuvaObj.frustumCulled = false;
    this.chuvaObj.visible = false;
    this.cena.add(this.chuvaObj);
  }

  // ------------------------------------------------------------ pós-processamento
  configurarPos() {
    const q = QUALIDADES[this.qualidade];
    const w = this.container.clientWidth, h = this.container.clientHeight;
    if (this.composer) { this.composer.renderTarget1.dispose(); this.composer.renderTarget2.dispose(); this.composer = null; }
    if (!q.pos) return;
    const pr = this.renderer.getPixelRatio();
    const gl = this.renderer.getContext();
    const meiaPrecisao = !!(gl.getExtension('EXT_color_buffer_half_float') || gl.getExtension('EXT_color_buffer_float'));
    const maxAmostras = gl.getParameter(gl.MAX_SAMPLES) || 0;
    const rt = new THREE.WebGLRenderTarget(w * pr, h * pr, { type: meiaPrecisao ? THREE.HalfFloatType : THREE.UnsignedByteType, samples: Math.min(q.msaa, maxAmostras) });
    const c = (this.composer = new EffectComposer(this.renderer, rt));
    c.setPixelRatio(pr);
    c.setSize(w, h);
    c.addPass(new RenderPass(this.cena, this.camera));
    this.bloom = new UnrealBloomPass(new THREE.Vector2(w / 2, h / 2), 0.28, 0.55, 0.88);
    c.addPass(this.bloom);
    this.tilt = new ShaderPass(TiltShiftShader);
    this.tilt.uniforms.resolucao.value.set(w * pr, h * pr);
    this.tilt.enabled = this.tiltShift;
    c.addPass(this.tilt);
    c.addPass(new OutputPass());
  }

  setQualidade(nome) {
    if (!QUALIDADES[nome]) return;
    this.qualidade = nome;
    const q = QUALIDADES[nome];
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, q.pr));
    this.sol.shadow.mapSize.set(q.sombra, q.sombra);
    if (this.sol.shadow.map) { this.sol.shadow.map.dispose(); this.sol.shadow.map = null; }
    this.grama.count = Math.min(this.gramaMax, q.grama);
    this.configurarPos();
    this.aplicarIndicadores(this.ind);
    this.redimensionar();
  }

  setTiltShift(v) { this.tiltShift = v; if (this.tilt) this.tilt.enabled = v; }

  // ------------------------------------------------------------ eventos
  configurarEventos() {
    window.addEventListener('resize', () => this.redimensionar());
    const el = this.renderer.domElement;
    this.raycaster = new THREE.Raycaster();
    this.ponteiro = new THREE.Vector2();
    let ini = null;
    el.addEventListener('pointerdown', (e) => { ini = [e.clientX, e.clientY]; });
    el.addEventListener('pointermove', (e) => {
      if (!this.modoColocar) return;
      this.atualizarFantasma(e);
    });
    el.addEventListener('pointerup', (e) => {
      if (!ini || Math.hypot(e.clientX - ini[0], e.clientY - ini[1]) > 6) return;
      this.clique(e);
    });
  }

  raio(e) {
    const r = this.renderer.domElement.getBoundingClientRect();
    this.ponteiro.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
    this.raycaster.setFromCamera(this.ponteiro, this.camera);
  }

  clique(e) {
    this.raio(e);
    if (this.modoColocar) {
      const hit = this.raycaster.intersectObject(this.terreno, false)[0];
      if (hit && this.podeColocar(hit.point.x, hit.point.z)) {
        const cb = this.modoColocar.cb;
        const tipo = this.modoColocar.tipo;
        cb && cb(tipo, hit.point.x, hit.point.z);
      } else if (hit) {
        this.callbacks.invalido && this.callbacks.invalido();
      }
      return;
    }
    const alvos = [this.praca, ...Object.values(this.pads).map((p) => p.pad).filter(Boolean), ...Object.values(this.construidos)];
    const hit = this.raycaster.intersectObjects(alvos, true)[0];
    if (!hit) return;
    let o = hit.object;
    while (o && !o.userData.lote && !o.userData.loteConstruido) o = o.parent;
    if (!o) return;
    if (o.userData.loteConstruido) this.callbacks.construcao && this.callbacks.construcao(o.userData.loteConstruido);
    else this.callbacks.lote && this.callbacks.lote(o.userData.lote);
  }

  redimensionar() {
    const w = this.container.clientWidth, h = this.container.clientHeight;
    this.camera.aspect = w / h; this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h);
    this.rotulos.setSize(w, h);
    if (this.composer) {
      this.composer.setPixelRatio(this.renderer.getPixelRatio());
      this.composer.setSize(w, h);
      const pr = this.renderer.getPixelRatio();
      this.tilt && this.tilt.uniforms.resolucao.value.set(w * pr, h * pr);
    }
  }

  // ------------------------------------------------------------ câmera
  voarPara(pos, alvo, dur = 1.8) {
    if (this.voo && this.voo.res) this.voo.res();
    this.voo = { p0: this.camera.position.clone(), a0: this.controles.target.clone(), p1: pos.clone(), a1: alvo.clone(), t: 0, dur };
    this.controles.autoRotate = false;
    return new Promise((res) => (this.voo.res = res));
  }
  focarLote(k, perto = false) {
    const l = LOTES[k];
    if (!l) return Promise.resolve();
    if (k === 'centro') return this.voarPara(new THREE.Vector3(0, perto ? 30 : 38, perto ? 38 : 50), new THREE.Vector3(0, 2, 0));
    const dir = new THREE.Vector3(l.x, 0, l.z).normalize();
    const lado = new THREE.Vector3(-dir.z, 0, dir.x);
    const alvo = new THREE.Vector3(l.x, 3, l.z);
    const pos = alvo.clone().addScaledVector(dir, -(perto ? 22 : 28)).addScaledVector(lado, perto ? 9 : 12).add(new THREE.Vector3(0, perto ? 15 : 20, 0));
    return this.voarPara(pos, alvo);
  }
  visaoGeral() { return this.voarPara(new THREE.Vector3(105, 100, 135), new THREE.Vector3(0, 0, 0), 2.2); }
  orbitar(v) { this.controles.autoRotate = v; }

  // ------------------------------------------------------------ construções
  construir(lote, tipo, animar = true) {
    if (this.construidos[lote]) return Promise.resolve();
    const fab = M.MODELOS[tipo];
    if (!fab) return Promise.resolve();
    const l = LOTES[lote];
    const g = fab();
    g.position.set(l.x, lote === 'centro' ? 0.08 : 0.12, l.z);
    g.rotation.y = l.rot || 0;
    g.userData.loteConstruido = lote;
    g.traverse((o) => { if (o.isMesh && o.castShadow === undefined) o.castShadow = true; });
    this.cena.add(g);
    this.construidos[lote] = g;
    if (this.chuva && g.userData.setChuva) g.userData.setChuva(true);
    const pad = this.pads[lote];
    const deg = pad.degradado;
    if (lote === 'centro') { this.pracaMat.map = this.texPracaViva; this.pracaMat.needsUpdate = true; }
    if (!animar) {
      if (deg) deg.visible = false;
      if (pad.padMat) pad.padMat.color.set(0x7cc35a);
      return Promise.resolve();
    }
    // animação: entulho some, peças surgem em sequência
    const pecas = g.children.slice();
    const finais = pecas.map((p) => ({ s: p.scale.clone(), y: p.position.y }));
    pecas.forEach((p) => { p.scale.setScalar(0.0001); p.position.y -= 3; });
    const n = pecas.length;
    const atraso = Math.min(0.09, 3.2 / n);
    const durPeca = 0.75;
    const total = 0.6 + n * atraso + durPeca;
    this.explosao(new THREE.Vector3(l.x, 1, l.z), lote === 'centro' ? 16 : 8);
    return new Promise((res) => {
      this.animacoes.push({
        t: 0,
        passo: (t) => {
          if (deg) { const s = Math.max(0.0001, 1 - t / 0.6); deg.scale.setScalar(s); if (t > 0.6) deg.visible = false; }
          if (pad.padMat) pad.padMat.color.lerpColors(new THREE.Color(0x8b6b47), new THREE.Color(0x7cc35a), Math.min(1, t / total));
          pecas.forEach((p, i) => {
            const ti = (t - 0.6 - i * atraso) / durPeca;
            if (ti <= 0) return;
            const k = ti >= 1 ? 1 : easeOutBack(ti);
            p.scale.copy(finais[i].s).multiplyScalar(Math.max(0.0001, k));
            p.position.y = finais[i].y - 3 * (1 - Math.min(1, ti * 1.2));
          });
          if (t >= total) {
            pecas.forEach((p, i) => { p.scale.copy(finais[i].s); p.position.y = finais[i].y; });
            this.explosao(new THREE.Vector3(l.x, 4, l.z), lote === 'centro' ? 14 : 7, true);
            res();
            return true;
          }
          return false;
        },
      });
    });
  }

  explosao(centro, raio = 8, festa = false) {
    const n = festa ? 220 : 140;
    const p = new Float32Array(n * 3), c = new Float32Array(n * 3), vel = [];
    const pal = [0xffd23f, 0xff4d8d, 0x2fbf71, 0x3fa9f5, 0xff8a3d, 0xffffff, 0xc77dff].map((x) => new THREE.Color(x));
    for (let i = 0; i < n; i++) {
      const a = Math.random() * 6.28, r = Math.random() * raio;
      p.set([centro.x + Math.cos(a) * r, centro.y, centro.z + Math.sin(a) * r], i * 3);
      const cc = festa ? pal[i % pal.length] : new THREE.Color(0xd9c39a).lerp(pal[0], Math.random() * 0.3);
      c.set([cc.r, cc.g, cc.b], i * 3);
      vel.push([Math.cos(a) * (1 + Math.random() * 3), (festa ? 8 : 3) + Math.random() * (festa ? 9 : 4), Math.sin(a) * (1 + Math.random() * 3)]);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(p, 3));
    g.setAttribute('color', new THREE.BufferAttribute(c, 3));
    const m = new THREE.PointsMaterial({ size: festa ? 0.9 : 1.6, vertexColors: true, map: T.texBrilho(), transparent: true, depthWrite: false, blending: festa ? THREE.AdditiveBlending : THREE.NormalBlending, opacity: 1 });
    const pts = new THREE.Points(g, m);
    this.cena.add(pts);
    const dur = festa ? 2.4 : 1.4;
    this.animacoes.push({
      t: 0,
      passo: (t, dt) => {
        const a = g.attributes.position;
        for (let i = 0; i < n; i++) {
          vel[i][1] -= 9.8 * dt * (festa ? 0.8 : 0.5);
          a.setXYZ(i, a.getX(i) + vel[i][0] * dt, Math.max(0.2, a.getY(i) + vel[i][1] * dt), a.getZ(i) + vel[i][2] * dt);
        }
        a.needsUpdate = true;
        m.opacity = 1 - t / dur;
        if (t >= dur) { this.cena.remove(pts); g.dispose(); m.dispose(); return true; }
        return false;
      },
    });
  }

  // ------------------------------------------------------------ itens (ações sustentáveis)
  podeColocar(x, z) {
    if (!this.livre(x, z, 0.4)) return false;
    if (this.casas.some((h) => Math.abs(h.x - x) < 3.6 && Math.abs(h.z - z) < 3.6)) return false;
    if (this.itens.some((i) => Math.hypot(i.x - x, i.z - z) < 2.2)) return false;
    return true;
  }

  iniciarColocacao(tipo, cb) {
    this.cancelarColocacao();
    const fan = M.ITENS[tipo](1);
    fan.traverse((o) => { if (o.isMesh) o.castShadow = false; });
    const ind = new THREE.Mesh(new THREE.RingGeometry(1.4, 1.8, 40), new THREE.MeshBasicMaterial({ color: 0x2fbf71, transparent: true, opacity: 0.85, depthWrite: false }));
    ind.rotation.x = -Math.PI / 2; ind.position.y = 0.3;
    const g = new THREE.Group(); g.add(fan); g.add(ind);
    g.visible = false;
    this.cena.add(g);
    this.modoColocar = { tipo, cb, fantasma: g, ind };
    this.renderer.domElement.style.cursor = 'crosshair';
  }

  atualizarFantasma(e) {
    this.raio(e);
    const hit = this.raycaster.intersectObject(this.terreno, false)[0];
    const m = this.modoColocar;
    if (!hit) { m.fantasma.visible = false; return; }
    m.fantasma.visible = true;
    m.fantasma.position.set(hit.point.x, Math.max(0, hit.point.y), hit.point.z);
    m.ind.material.color.set(this.podeColocar(hit.point.x, hit.point.z) ? 0x2fbf71 : 0xff4d4d);
  }

  cancelarColocacao() {
    if (!this.modoColocar) return;
    this.cena.remove(this.modoColocar.fantasma);
    this.modoColocar = null;
    this.renderer.domElement.style.cursor = '';
  }

  colocarItem(tipo, x, z, animar = true, seed = 1) {
    const fab = M.ITENS[tipo];
    if (!fab) return;
    const o = fab(seed);
    o.position.set(x, 0.02, z);
    o.rotation.y = (seed * 1.37) % 6.28;
    this.cena.add(o);
    this.itens.push({ tipo, x, z, obj: o });
    if (animar) {
      const s0 = o.scale.clone();
      o.scale.setScalar(0.0001);
      this.explosao(new THREE.Vector3(x, 0.5, z), 2.2, true);
      this.animacoes.push({ t: 0, passo: (t) => { const k = Math.min(1, t / 0.7); o.scale.copy(s0).multiplyScalar(Math.max(0.0001, easeOutBack(k))); return k >= 1; } });
    }
  }

  // ------------------------------------------------------------ indicadores → visual
  aplicarIndicadores(ind) {
    this.ind = { ...ind };
    const verde = smooth(12, 75, ind.verde);
    if (this.gramaUni) this.gramaUni.uSeco.value = 0.5 * (1 - verde);
    this.terrenoMat.color.setRGB(lerp(1.0, 1, verde), lerp(0.88, 1, verde), lerp(0.62, 1, verde));
    if (this.flores) this.flores.count = Math.round(this.floresMax * (0.15 + 0.85 * verde) * (QUALIDADES[this.qualidade].flores / QUALIDADES.ultra.flores));
    const agua = smooth(12, 75, ind.agua);
    this.rioMat.color.lerpColors(new THREE.Color(0x8a7a4a), new THREE.Color(0x2fb0e8), agua);
    this.rioMat.opacity = lerp(0.95, 0.84, agua);
    const res = smooth(10, 70, ind.residuos);
    if (this.lixo) this.lixo.count = Math.round(this.lixoMax * (1 - res));
    const nPed = Math.round(lerp(8, 52, smooth(15, 90, ind.comunidade)));
    this.pedestres.forEach((p, i) => (p.obj.visible = i < nPed));
    const nPas = Math.round(lerp(3, 18, verde));
    this.passaros.forEach((b, i) => (b.visible = i < nPas));
    const lotesVerdes = Object.keys(this.construidos);
    const nBor = Math.min(24, Math.round(lerp(0, 24, verde)));
    this.borboletas.forEach((b, i) => {
      b.visible = i < nBor;
      const k = lotesVerdes.length ? lotesVerdes[i % lotesVerdes.length] : null;
      const l = k ? LOTES[k] : { x: (i % 2 ? 40 : -40), z: (i % 3 ? 40 : -40) };
      b.userData.cx = l.x; b.userData.cz = l.z;
    });
  }

  // ------------------------------------------------------------ dia/noite e chuva
  irPara(fase) {
    const alvo = { dia: 0.41, tarde: 0.705, noite: 0.96 }[fase] ?? 0.41;
    this.alvoDia = alvo;
    this.transicaoDia = { de: this.tempoDia, delta: ((alvo - this.tempoDia + 1) % 1) || 0, t: 0, dur: 3 };
  }
  get fase() { const t = this.alvoDia; return t > 0.85 || t < 0.2 ? 'noite' : t > 0.6 ? 'tarde' : 'dia'; }

  setChuva(v) {
    this.chuva = v;
    if (v) this.chuvaObj.visible = true;
    Object.values(this.construidos).forEach((g) => g.userData.setChuva && g.userData.setChuva(v));
  }

  atualizarCeu(dt) {
    if (this.transicaoDia) {
      const tr = this.transicaoDia;
      tr.t += dt;
      const k = easeInOut(Math.min(1, tr.t / tr.dur));
      this.tempoDia = (tr.de + tr.delta * k) % 1;
      if (tr.t >= tr.dur) this.transicaoDia = null;
    }
    this.fatorChuva += ((this.chuva ? 1 : 0) - this.fatorChuva) * Math.min(1, dt * 1.2);
    const ch = this.fatorChuva;
    const th = (this.tempoDia - 0.25) * Math.PI * 2;
    const solDir = new THREE.Vector3(Math.cos(th), Math.sin(th), 0.45).normalize();
    const elev = solDir.y;
    const dia = smooth(-0.05, 0.35, elev);
    const ouro = smooth(-0.12, 0.08, elev) * (1 - smooth(0.12, 0.42, elev));
    const noite = 1 - smooth(-0.18, 0.04, elev);
    this.noite = noite;
    const cTopo = new THREE.Color(0x070b24).lerp(new THREE.Color(0x4a6fd1), smooth(-0.18, 0.05, elev)).lerp(new THREE.Color(0x1f86ea), dia);
    const cBase = new THREE.Color(0x1d2550).lerp(new THREE.Color(0xffb27a), smooth(-0.18, 0.05, elev)).lerp(new THREE.Color(0x8fd8ff), dia);
    cBase.lerp(new THREE.Color(0xffa45c), ouro * 0.6);
    const cinza = new THREE.Color(0x8794a3).multiplyScalar(lerp(1, 0.35, noite));
    cTopo.lerp(cinza, ch * 0.75); cBase.lerp(cinza.clone().multiplyScalar(1.15), ch * 0.7);
    this.ceuMat.uniforms.uTopo.value.copy(cTopo);
    this.ceuMat.uniforms.uBase.value.copy(cBase);
    this.ceuMat.uniforms.uSolDir.value.copy(elev > -0.1 ? solDir : solDir.clone().negate());
    this.ceuMat.uniforms.uSolCor.value.set(elev > -0.1 ? 0xfff0c8 : 0xcfdcff);
    this.ceuMat.uniforms.uSolBrilho.value = (elev > -0.1 ? 1 : 0.35) * (1 - ch * 0.9);
    this.cena.fog.color.copy(cBase);
    this.estrelasMat.opacity = noite * (1 - ch);
    // luz principal: sol ou lua
    const usarLua = elev < -0.06;
    const dir = usarLua ? solDir.clone().negate() : solDir.clone();
    if (dir.y < 0.12) dir.y = 0.12;
    dir.normalize();
    this.sol.position.copy(dir.multiplyScalar(170));
    const corSol = new THREE.Color(0xfff4e0).lerp(new THREE.Color(0xff9a4d), ouro);
    if (usarLua) { this.sol.color.set(0x9fb6ff); this.sol.intensity = 0.55 * (1 - ch * 0.6); }
    else { this.sol.color.copy(corSol); this.sol.intensity = lerp(0.4, 3.1, smooth(-0.06, 0.25, elev)) * (1 - ch * 0.55); }
    this.hemi.intensity = lerp(0.32, 1.15, dia) * (1 - ch * 0.25);
    this.hemi.color.set(0xbfe6ff).lerp(new THREE.Color(0x4a5a9a), noite);
    this.hemi.groundColor.set(0x6aa84f).lerp(new THREE.Color(0x1f2a3a), noite);
    this.cena.environmentIntensity = lerp(0.08, 0.5, dia);
    this.renderer.toneMappingExposure = lerp(1.25, 1.05, dia);
    // luzes noturnas
    M.NOTURNOS.forEach(({ mat, max }) => (mat.emissiveIntensity = noite * max));
    const altaQ = this.qualidade !== 'leve';
    this.luzesPraca.forEach((l) => (l.intensity = altaQ ? noite * 28 : 0));
    this.vagaMat.opacity = noite * 0.95 * (1 - ch);
    if (this.bloom) this.bloom.strength = 0.22 + noite * 0.65;
    this.nuvemMat.color.set(0xffffff).lerp(new THREE.Color(0x6f7a88), ch).lerp(new THREE.Color(0x2a3150), noite * 0.8);
    this.nuvemMat.emissiveIntensity = 0.12 * (1 - noite);
    this.chuvaMat.opacity = ch * 0.5;
    if (!this.chuva && ch < 0.02) this.chuvaObj.visible = false;
  }

  // ------------------------------------------------------------ laço principal
  monitorarDesempenho(dt) {
    // Se a placa de vídeo não acompanhar, reduz a qualidade em vez de deixar a tela travando ou piscando.
    const m = (this.medidor ||= { t: 0, n: 0, espera: 4 });
    if (!this.monitorAtivo || this.qualidade === 'leve' || document.hidden) { m.t = 0; m.n = 0; return; }
    if (m.espera > 0) { m.espera -= dt; return; }
    m.t += dt; m.n++;
    if (m.t < 3) return;
    const fps = m.n / m.t;
    m.t = 0; m.n = 0;
    if (fps < 24) {
      const proxima = this.qualidade === 'ultra' ? 'alta' : 'leve';
      this.setQualidade(proxima);
      m.espera = 4;
      this.callbacks.qualidade && this.callbacks.qualidade(proxima, Math.round(fps));
    }
  }

  quadro() {
    const dtBruto = this.relogio.getDelta();
    this.monitorarDesempenho(dtBruto);
    const dtReal = Math.min(0.25, dtBruto);
    const dt = Math.min(0.05, dtReal);
    this.tempo += dt;
    const t = this.tempo;
    M.U.tempo.value = t;

    if (this.voo) {
      const v = this.voo;
      v.t += dtReal;
      const k = easeInOut(Math.min(1, v.t / v.dur));
      this.camera.position.lerpVectors(v.p0, v.p1, k);
      this.controles.target.lerpVectors(v.a0, v.a1, k);
      if (v.t >= v.dur) { const r = v.res; this.voo = null; r && r(); }
    }
    // limita o alvo da câmera à maquete
    const tg = this.controles.target;
    tg.x = THREE.MathUtils.clamp(tg.x, -70, 70); tg.z = THREE.MathUtils.clamp(tg.z, -70, 70); tg.y = THREE.MathUtils.clamp(tg.y, 0, 20);

    this.atualizarCeu(dtReal);

    // água
    const tn = M.texturaAgua();
    tn.offset.x = (t * 0.03) % 1; tn.offset.y = (t * 0.017) % 1;

    // nuvens
    this.nuvens.forEach((n) => { n.position.x += n.userData.v * dt * (1 + this.fatorChuva); if (n.position.x > 180) n.position.x = -180; });

    // pedestres
    this.pedestres.forEach((p) => {
      if (!p.obj.visible) return;
      const o = p.obj;
      if (p.tipo === 'anel' || p.tipo === 'praca') {
        p.a += (p.vel / p.r) * dt * p.dir;
        o.position.set(Math.cos(p.a) * p.r, 0.1, Math.sin(p.a) * p.r);
        o.rotation.y = Math.atan2(-Math.sin(p.a) * p.dir, Math.cos(p.a) * p.dir);
      } else {
        p.s += p.vel * dt * p.dir;
        if (p.s > META - 2) { p.s = META - 2; p.dir = -1; }
        if (p.s < CALCADA_EXT + 0.5) { p.s = CALCADA_EXT + 0.5; p.dir = 1; }
        const a = (p.eixo * Math.PI) / 2;
        const x = p.s, z = p.lado;
        o.position.set(Math.cos(-a) * x - Math.sin(-a) * z, 0.16, Math.sin(-a) * x + Math.cos(-a) * z);
        o.rotation.y = a + (p.dir > 0 ? Math.PI / 2 : -Math.PI / 2);
      }
      M.animarPessoa(o, t * p.vel, true);
    });

    // pássaros
    this.passaros.forEach((b) => {
      if (!b.visible) return;
      const u = b.userData;
      u.a += u.v * dt;
      b.position.set(Math.cos(u.a) * u.r, u.h + Math.sin(t + u.f) * 2, Math.sin(u.a) * u.r);
      const sg = Math.sign(u.v);
      b.rotation.y = Math.atan2(-Math.sin(u.a) * sg, Math.cos(u.a) * sg);
      const asa = Math.sin(t * 11 + u.f) * 0.65;
      u.ae.rotation.z = asa; u.ad.rotation.z = -asa;
    });

    // borboletas
    this.borboletas.forEach((b, i) => {
      if (!b.visible) return;
      const u = b.userData;
      const a = t * 0.6 + u.f;
      b.position.set(u.cx + Math.cos(a) * u.r + Math.sin(t * 2.3 + i) * 0.6, 1.4 + Math.sin(t * 3 + i) * 0.7, u.cz + Math.sin(a * 1.3) * u.r);
      b.rotation.y = -a;
      const bat = Math.sin(t * 18 + i) * 1.1;
      u.a1.rotation.y = bat; u.a2.rotation.y = -bat;
    });

    // vaga-lumes
    if (this.noite > 0.05) {
      const a = this.vagalumes.geometry.attributes.position;
      this.vagaBase.forEach(([x, y, z, f], i) => a.setXYZ(i, x + Math.sin(t * 0.7 + f) * 1.2, y + Math.sin(t * 1.3 + f * 2) * 0.5, z + Math.cos(t * 0.6 + f) * 1.2));
      a.needsUpdate = true;
    }

    // chuva
    if (this.chuvaObj.visible) {
      const a = this.chuvaObj.geometry.attributes.position;
      this.gotas.forEach((g, i) => {
        g[1] -= g[3] * dt;
        if (g[1] < 0) g[1] += 80;
        a.setXYZ(i * 2, g[0], g[1], g[2]);
        a.setXYZ(i * 2 + 1, g[0] + 0.15, g[1] + 1.1, g[2]);
      });
      a.needsUpdate = true;
    }

    // marcadores pulsantes (rótulos muito próximos da câmera ficam ocultos)
    for (const k in this.marcadores) {
      const m = this.marcadores[k];
      if (this.marcadoresVisiveis) {
        const d = this.camera.position.distanceTo(m.obj.position);
        if (m.obj.visible && d < 30) m.obj.visible = false;
        else if (!m.obj.visible && d > 40) m.obj.visible = true;
      }
      if (m.anel.visible) { const s = 1 + Math.sin(t * 3) * 0.04; m.anel.scale.set(s, s, s); m.anel.material.opacity = 0.45 + Math.sin(t * 3) * 0.25; }
    }

    // construções animadas
    Object.values(this.construidos).forEach((g) => g.userData.atualizar && g.userData.atualizar(t, dt));

    // animações pontuais
    this.animacoes = this.animacoes.filter((a) => { a.t += dtReal; return !a.passo(a.t, dtReal); });

    this.controles.update();
    if (this.composer) this.composer.render();
    else this.renderer.render(this.cena, this.camera);
    this.rotulos.render(this.cena, this.camera);
  }
}
