/* ============================================================
   小王子 · 冷雨夜便利店 3D 世界
   一颗悬浮在夜色中的迷你星球，顶部是一块湿漉漉的街角广场
   ============================================================ */

import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { Reflector } from 'three/addons/objects/Reflector.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';

/* ---------- 世界尺寸 ---------- */
const R = 6.4;                       // 星球半径
const CUT = 0.95;                    // 顶部切角（弧度，从 +Y 起算）
const PLAZA_R = R * Math.sin(CUT) * 0.995;
const PLAZA_Y = R * Math.cos(CUT);   // 广场地面高度 ≈ 3.72

const COL = {
  night:     0x070d18,
  asphalt:   0x161f2b,
  concrete:  0x2a323d,
  storeWall: 0xd9dee2,
  warm:      0xffbe78,
  warmDeep:  0xff8f3c,
  neonPink:  0xff3f9e,
  neonCyan:  0x46dcff,
  coat:      0x2c6049,
  scarf:     0xd7a03a,
  skin:      0xe9bc93,
  hair:      0xd8a445,
  fox:       0xd3622c,
};

/* ============================================================
   基础环境
   ============================================================ */
const app = document.getElementById('app');

const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.outputColorSpace = THREE.LinearSRGBColorSpace; // 色彩编码交给最后的调色 pass
renderer.toneMapping = THREE.NoToneMapping;            // HDR 值直接进 bloom
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
app.appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.fog = new THREE.FogExp2(0x060b14, 0.031);

const camera = new THREE.PerspectiveCamera(38, window.innerWidth / window.innerHeight, 0.1, 500);
const CAM_HOME = new THREE.Vector3(5.0, 8.4, 9.7);
const CAM_TARGET = new THREE.Vector3(0.35, 5.15, 0.9);
camera.position.copy(CAM_HOME);

const controls = new OrbitControls(camera, renderer.domElement);
controls.target.copy(CAM_TARGET);
controls.enableDamping = true;
controls.dampingFactor = 0.055;
controls.minDistance = 7;
controls.maxDistance = 27;
controls.minPolarAngle = 0.34;
controls.maxPolarAngle = 1.5;
controls.autoRotate = true;
controls.autoRotateSpeed = 0.32;
controls.enablePan = false;

/* ============================================================
   程序化贴图工具
   ============================================================ */
function canvasTex(w, h, draw) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}

/* 湿地面：白=沥青干区，黑=积水（露出镜面） */
function makeWetMask() {
  return canvasTex(1024, 1024, (ctx, w, h) => {
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, w, h);
    for (let i = 0; i < 90; i++) {
      const x = Math.random() * w;
      const y = Math.random() * h;
      const r = 24 + Math.random() * 120;
      const g = ctx.createRadialGradient(x, y, 0, x, y, r);
      g.addColorStop(0, 'rgba(0,0,0,0.92)');
      g.addColorStop(0.55, 'rgba(0,0,0,0.55)');
      g.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fill();
    }
    // 细碎湿痕
    for (let i = 0; i < 400; i++) {
      ctx.fillStyle = `rgba(0,0,0,${Math.random() * 0.18})`;
      ctx.beginPath();
      ctx.ellipse(Math.random() * w, Math.random() * h, 3 + Math.random() * 22, 2 + Math.random() * 9, Math.random() * 3, 0, Math.PI * 2);
      ctx.fill();
    }
  });
}

/* 建筑立面：随机亮窗 */
function makeFacade(seedCols = 9, seedRows = 10, warmRatio = 0.45) {
  return canvasTex(256, 256, (ctx, w, h) => {
    ctx.fillStyle = '#0a0f18';
    ctx.fillRect(0, 0, w, h);
    const cw = w / seedCols, ch = h / seedRows;
    for (let r = 0; r < seedRows; r++) {
      for (let c = 0; c < seedCols; c++) {
        const on = Math.random() < warmRatio;
        if (on) {
          const warm = Math.random() < 0.55;
          ctx.fillStyle = warm ? 'rgba(255,196,138,0.95)' : 'rgba(150,205,255,0.82)';
          ctx.globalAlpha = 0.45 + Math.random() * 0.55;
        } else {
          ctx.fillStyle = 'rgba(26,36,50,0.85)';
          ctx.globalAlpha = 1;
        }
        const pad = Math.min(cw, ch) * 0.17;
        ctx.fillRect(c * cw + pad, r * ch + pad, cw - pad * 2, ch - pad * 2);
        ctx.globalAlpha = 1;
      }
    }
  });
}

/* 便利店招牌带：白底 + 色条 + 抽象字块（不出现真实品牌与可读文字） */
function makeStoreSign() {
  return canvasTex(1024, 208, (ctx, w, h) => {
    ctx.fillStyle = '#f6f8f6';
    ctx.fillRect(0, 0, w, h);
    // 顶部细边
    ctx.fillStyle = '#20282e';
    ctx.fillRect(0, 0, w, 10);
    // 底部品牌色条
    ctx.fillStyle = '#2fa564';
    ctx.fillRect(0, h - 34, w, 12);
    ctx.fillStyle = '#f0912f';
    ctx.fillRect(0, h - 18, w, 6);
    // 抽象字块
    const blocks = [
      [70, 62, 74, 62], [162, 62, 34, 62], [208, 62, 74, 62], [292, 62, 34, 62],
    ];
    ctx.fillStyle = '#1d252b';
    blocks.forEach(([x, y, bw, bh]) => ctx.fillRect(x, y, bw, bh));
    // 右侧小块
    ctx.fillStyle = '#2fa564';
    ctx.fillRect(w - 250, 62, 60, 62);
    ctx.fillStyle = '#f0912f';
    ctx.fillRect(w - 178, 62, 60, 62);
    ctx.fillStyle = '#2f7fd0';
    ctx.fillRect(w - 106, 62, 60, 62);
  });
}

/* 竖向霓虹：抽象叠块 */
function makeNeonSign(a, b) {
  return canvasTex(128, 512, (ctx, w, h) => {
    ctx.fillStyle = '#06090f';
    ctx.fillRect(0, 0, w, h);
    ctx.shadowBlur = 26;
    ctx.shadowColor = a;
    ctx.fillStyle = a;
    for (let i = 0; i < 4; i++) {
      const y = 42 + i * 118;
      ctx.globalAlpha = 0.95;
      ctx.fillRect(30, y, 68, 34);
      ctx.fillStyle = b;
      ctx.fillRect(30, y + 46, 68, 14);
      ctx.fillStyle = a;
    }
    ctx.globalAlpha = 1;
    ctx.shadowBlur = 0;
  });
}

/* 径向光晕（假辉光 sprite） */
let _glowTex = null;
function glowTexture() {
  if (_glowTex) return _glowTex;
  _glowTex = canvasTex(256, 256, (ctx, w, h) => {
    const g = ctx.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w / 2);
    g.addColorStop(0, 'rgba(255,255,255,1)');
    g.addColorStop(0.28, 'rgba(255,255,255,0.42)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
  });
  _glowTex.colorSpace = THREE.SRGBColorSpace;
  return _glowTex;
}

function addGlow(parent, color, size, pos) {
  const m = new THREE.SpriteMaterial({
    map: glowTexture(),
    color,
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    opacity: 0.72,
  });
  const s = new THREE.Sprite(m);
  s.scale.set(size, size, 1);
  s.position.copy(pos);
  parent.add(s);
  return s;
}

/* ============================================================
   星球本体 + 广场
   ============================================================ */
const planetGeo = new THREE.SphereGeometry(R, 96, 64, 0, Math.PI * 2, CUT, Math.PI - CUT);
const planetMat = new THREE.MeshStandardMaterial({
  color: 0x1a2431,
  roughness: 0.58,
  metalness: 0.45,
});
const planet = new THREE.Mesh(planetGeo, planetMat);
planet.receiveShadow = true;
scene.add(planet);

// 星球边缘的一圈混凝土挡墙
const rim = new THREE.Mesh(
  new THREE.CylinderGeometry(PLAZA_R, PLAZA_R * 0.995, 0.52, 96, 1, true),
  new THREE.MeshStandardMaterial({ color: COL.concrete, roughness: 0.85, metalness: 0.15 })
);
rim.position.y = PLAZA_Y - 0.26;
scene.add(rim);

// 边缘霓虹灯带
const edgeNeon = new THREE.Mesh(
  new THREE.TorusGeometry(PLAZA_R * 0.998, 0.014, 8, 200),
  new THREE.MeshBasicMaterial({ color: 0x2ea9d6 })
);
edgeNeon.rotation.x = -Math.PI / 2;
edgeNeon.position.y = PLAZA_Y - 0.015;
scene.add(edgeNeon);

// 大气辉光
const atmo = new THREE.Mesh(
  new THREE.SphereGeometry(R * 1.055, 64, 48),
  new THREE.ShaderMaterial({
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    side: THREE.FrontSide,
    uniforms: { uColor: { value: new THREE.Color(0x1f6f9e) } },
    vertexShader: `
      varying vec3 vN; varying vec3 vV;
      void main(){
        vN = normalize(normalMatrix * normal);
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        vV = normalize(-mv.xyz);
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: `
      uniform vec3 uColor; varying vec3 vN; varying vec3 vV;
      void main(){
        float f = pow(1.0 - abs(dot(vN, vV)), 3.0);
        gl_FragColor = vec4(uColor * f * 0.34, f * 0.8);
      }`,
  })
);
scene.add(atmo);

/* ---------- 湿漉漉的地面：镜面 + 沥青层 ---------- */
const mirror = new Reflector(new THREE.CircleGeometry(PLAZA_R, 96), {
  textureWidth: 1024,
  textureHeight: 1024,
  color: 0x7e94a8,
  clipBias: 0.003,
});
mirror.rotation.x = -Math.PI / 2;
mirror.position.y = PLAZA_Y + 0.002;
scene.add(mirror);

const wetMask = makeWetMask();
wetMask.wrapS = wetMask.wrapT = THREE.RepeatWrapping;
wetMask.repeat.set(1, 1);

const wetLayer = new THREE.Mesh(
  new THREE.CircleGeometry(PLAZA_R, 96),
  new THREE.MeshStandardMaterial({
    color: 0x121a24,
    roughness: 0.38,
    metalness: 0.55,
    transparent: true,
    opacity: 0.86,
    alphaMap: wetMask,
    depthWrite: false,
  })
);
wetLayer.rotation.x = -Math.PI / 2;
wetLayer.position.y = PLAZA_Y + 0.012;
wetLayer.receiveShadow = true;
scene.add(wetLayer);

/* ============================================================
   便利店
   ============================================================ */
const store = new THREE.Group();
const SX = 0.2, SZ = 0.6, SW = 4.4, SD = 3.0, SH = 2.66;
store.position.set(SX, PLAZA_Y, SZ);
scene.add(store);

const wallMat = new THREE.MeshStandardMaterial({ color: COL.storeWall, roughness: 0.78, metalness: 0.05 });
const darkMat = new THREE.MeshStandardMaterial({ color: 0x1b2229, roughness: 0.6, metalness: 0.4 });

// 主体：三面墙 + 屋顶 + 地板，正面敞开做玻璃（这样室内才能透出暖光）
const backWall = new THREE.Mesh(new THREE.BoxGeometry(SW, SH, 0.12), wallMat);
backWall.position.set(0, SH / 2, -SD / 2 + 0.06);
store.add(backWall);

[-SW / 2 + 0.06, SW / 2 - 0.06].forEach((x) => {
  const side = new THREE.Mesh(new THREE.BoxGeometry(0.12, SH, SD), wallMat);
  side.position.set(x, SH / 2, 0);
  store.add(side);
});

const roof = new THREE.Mesh(new THREE.BoxGeometry(SW, 0.14, SD), wallMat);
roof.position.set(0, SH - 0.07, 0);
roof.castShadow = true;
store.add(roof);

const storeFloor = new THREE.Mesh(
  new THREE.BoxGeometry(SW, 0.08, SD),
  new THREE.MeshStandardMaterial({ color: 0xcfd4d6, roughness: 0.35, metalness: 0.1 })
);
storeFloor.position.set(0, 0.04, 0);
storeFloor.receiveShadow = true;
store.add(storeFloor);

// 室内顶灯带
[[-1.0, 0.55], [1.0, 0.55]].forEach(([x, z]) => {
  const panel = new THREE.Mesh(
    new THREE.BoxGeometry(1.5, 0.04, 0.16),
    new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xfff0d8, emissiveIntensity: 0.9 })
  );
  panel.position.set(x, SH - 0.16, z);
  store.add(panel);
});

// 屋顶压边
const roofTrim = new THREE.Mesh(new THREE.BoxGeometry(SW + 0.14, 0.1, SD + 0.14), darkMat);
roofTrim.position.set(0, SH + 0.04, 0);
roofTrim.castShadow = true;
store.add(roofTrim);

// 招牌带
const signTex = makeStoreSign();
const signMat = new THREE.MeshStandardMaterial({
  map: signTex,
  emissive: 0xffffff,
  emissiveMap: signTex,
  emissiveIntensity: 0.4,
  roughness: 0.45,
});
const signBand = new THREE.Mesh(new THREE.BoxGeometry(SW + 0.1, 0.62, 0.16), signMat.clone());
signBand.position.set(0, SH - 0.42, SD / 2 + 0.06);
store.add(signBand);
const signFront = new THREE.Mesh(new THREE.PlaneGeometry(SW + 0.06, 0.58), signMat);
signFront.position.set(0, SH - 0.42, SD / 2 + 0.141);
store.add(signFront);
addGlow(store, 0xfff2dd, 4.2, new THREE.Vector3(0, SH - 0.42, SD / 2 + 0.5)).material.opacity = 0.18;

// 玻璃幕墙
const glassMat = new THREE.MeshStandardMaterial({
  color: 0xffffff,
  emissive: 0xffc98d,
  emissiveIntensity: 0.34,
  transparent: true,
  opacity: 0.24,
  roughness: 0.1,
  metalness: 0.0,
  depthWrite: false,
  side: THREE.DoubleSide,
});
const glass = new THREE.Mesh(new THREE.PlaneGeometry(SW - 0.34, SH - 1.02), glassMat);
glass.position.set(0, (SH - 1.02) / 2, SD / 2 + 0.02);
store.add(glass);

// 竖框
for (let i = -1; i <= 1; i++) {
  const mullion = new THREE.Mesh(new THREE.BoxGeometry(0.07, SH - 1.0, 0.09), darkMat);
  mullion.position.set(i * 1.38, (SH - 1.02) / 2, SD / 2 + 0.03);
  store.add(mullion);
}
// 横框 + 门槛
const botRail = new THREE.Mesh(new THREE.BoxGeometry(SW - 0.3, 0.09, 0.1), darkMat);
botRail.position.set(0, 0.06, SD / 2 + 0.03);
store.add(botRail);
const topRail = new THREE.Mesh(new THREE.BoxGeometry(SW - 0.3, 0.1, 0.1), darkMat);
topRail.position.set(0, SH - 1.02, SD / 2 + 0.03);
store.add(topRail);

// 自动门（中段偏右）
const doorFrame = new THREE.Mesh(new THREE.BoxGeometry(1.5, 1.86, 0.06), darkMat);
doorFrame.position.set(0.52, 0.95, SD / 2 + 0.05);
store.add(doorFrame);
const doorGlass = new THREE.Mesh(
  new THREE.PlaneGeometry(1.4, 1.76),
  new THREE.MeshStandardMaterial({
    color: 0xffffff, emissive: 0xffd9a8, emissiveIntensity: 0.5,
    transparent: true, opacity: 0.16, roughness: 0.05, depthWrite: false,
  })
);
doorGlass.position.set(0.52, 0.95, SD / 2 + 0.09);
store.add(doorGlass);

// 店内的货架与商品（贴近玻璃，让街上看得到货）
const shelfMat = new THREE.MeshStandardMaterial({ color: 0xb9bfc4, roughness: 0.7 });
const shelfZ = [0.28, 1.02];
shelfZ.forEach((z) => {
  for (let lvl = 0; lvl < 3; lvl++) {
    const shelf = new THREE.Mesh(new THREE.BoxGeometry(3.4, 0.04, 0.4), shelfMat);
    shelf.position.set(-0.15, 0.44 + lvl * 0.44, z);
    store.add(shelf);
  }
  // 货架竖板
  [-1.85, 1.55].forEach((x) => {
    const upright = new THREE.Mesh(new THREE.BoxGeometry(0.04, 1.36, 0.4), shelfMat);
    upright.position.set(x, 0.9, z);
    store.add(upright);
  });
});

for (let i = 0; i < 150; i++) {
  const hue = Math.random();
  const c = new THREE.Color().setHSL(hue, 0.62, 0.6);
  const bw = 0.05 + Math.random() * 0.06;
  const bh = 0.09 + Math.random() * 0.08;
  const p = new THREE.Mesh(
    new THREE.BoxGeometry(bw, bh, 0.07),
    new THREE.MeshStandardMaterial({ color: c, roughness: 0.5, emissive: c, emissiveIntensity: 0.32 })
  );
  p.position.set(
    -1.75 + Math.random() * 3.2,
    0.49 + Math.floor(Math.random() * 3) * 0.44,
    shelfZ[Math.floor(Math.random() * 2)] + (Math.random() - 0.5) * 0.14
  );
  store.add(p);
}

// 收银台
const counter = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.85, 0.55), new THREE.MeshStandardMaterial({ color: 0x8d949b, roughness: 0.6 }));
counter.position.set(-1.05, 0.46, 1.52);
store.add(counter);
const counterTop = new THREE.Mesh(new THREE.BoxGeometry(1.55, 0.06, 0.6), new THREE.MeshStandardMaterial({ color: 0x2b3037, roughness: 0.4, metalness: 0.3 }));
counterTop.position.set(-1.05, 0.9, 1.52);
store.add(counterTop);

// 玻璃上的海报/贴纸
const posterColors = [0xff8c3a, 0x3fa9f5, 0xff5f8f, 0x5ed07a];
posterColors.forEach((c, i) => {
  const poster = new THREE.Mesh(
    new THREE.PlaneGeometry(0.3, 0.42),
    new THREE.MeshStandardMaterial({ color: c, emissive: c, emissiveIntensity: 0.55, roughness: 0.8 })
  );
  poster.position.set(-1.62 + i * 0.42, 0.72, SD / 2 + 0.045);
  store.add(poster);
});

// 雨棚（做薄，避免俯视时遮住整个玻璃面）
const canopy = new THREE.Mesh(new THREE.BoxGeometry(SW + 0.2, 0.07, 0.34), darkMat);
canopy.position.set(0, SH - 1.0, SD / 2 + 0.19);
canopy.castShadow = true;
store.add(canopy);

// 台阶
const step = new THREE.Mesh(new THREE.BoxGeometry(SW - 0.2, 0.08, 0.42), new THREE.MeshStandardMaterial({ color: 0x424b58, roughness: 0.5, metalness: 0.35 }));
step.position.set(0, 0.04, SD / 2 + 0.21);
step.receiveShadow = true;
store.add(step);

// 屋顶空调外机
[[-1.3, 1], [0.4, 0.55]].forEach(([x, s]) => {
  const ac = new THREE.Mesh(new THREE.BoxGeometry(0.62 * s, 0.4 * s, 0.5 * s), new THREE.MeshStandardMaterial({ color: 0x9aa3ab, roughness: 0.8 }));
  ac.position.set(x, SH + 0.26, -0.6);
  ac.castShadow = true;
  store.add(ac);
});

/* ============================================================
   街角道具
   ============================================================ */
const propMat = new THREE.MeshStandardMaterial({ color: 0x39424e, roughness: 0.65, metalness: 0.5 });

// 自动贩卖机
const vend = new THREE.Group();
const vendBody = new THREE.Mesh(new THREE.BoxGeometry(0.62, 1.34, 0.52), new THREE.MeshStandardMaterial({ color: 0xc8332f, roughness: 0.55, metalness: 0.2 }));
vendBody.castShadow = true;
vend.add(vendBody);
const vendPanel = new THREE.Mesh(
  new THREE.PlaneGeometry(0.5, 0.78),
  new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xa8e4ff, emissiveIntensity: 1.35 })
);
vendPanel.position.set(0, 0.22, 0.268);
vend.add(vendPanel);
addGlow(vend, 0x9fdcff, 1.1, new THREE.Vector3(0, 0.24, 0.42)).material.opacity = 0.2;
vend.position.set(-3.05, PLAZA_Y + 0.67, 2.62);
vend.rotation.y = 0.42;
scene.add(vend);

// 货箱堆
const crateMat = new THREE.MeshStandardMaterial({ color: 0x5b6672, roughness: 0.85 });
const cratePositions = [
  [2.8, 0.13, 1.5, 0.24], [2.8, 0.39, 1.5, 0.24], [3.02, 0.13, 1.78, 0.2],
  [2.56, 0.13, 1.72, 0.2],
];
cratePositions.forEach(([x, y, z, s]) => {
  const c = new THREE.Mesh(new THREE.BoxGeometry(s * 2, s, s * 1.7), crateMat);
  c.position.set(x, PLAZA_Y + y, z);
  c.castShadow = true;
  c.receiveShadow = true;
  scene.add(c);
});

// 自行车
function makeBicycle() {
  const g = new THREE.Group();
  const tyre = new THREE.MeshStandardMaterial({ color: 0x14181e, roughness: 0.9 });
  const frame = new THREE.MeshStandardMaterial({ color: 0x2f6f7a, roughness: 0.4, metalness: 0.7 });
  const wheelGeo = new THREE.TorusGeometry(0.31, 0.022, 8, 28);
  [-0.46, 0.46].forEach((z) => {
    const w = new THREE.Mesh(wheelGeo, tyre);
    w.position.set(0, 0.31, z);
    w.castShadow = true;
    g.add(w);
  });
  const tube = (a, b, r = 0.016, mat = frame) => {
    const av = new THREE.Vector3(...a), bv = new THREE.Vector3(...b);
    const len = av.distanceTo(bv);
    const m = new THREE.Mesh(new THREE.CylinderGeometry(r, r, len, 6), mat);
    m.position.copy(av).add(bv).multiplyScalar(0.5);
    m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), bv.clone().sub(av).normalize());
    g.add(m);
  };
  tube([0, 0.31, -0.46], [0, 0.62, -0.12]);
  tube([0, 0.62, -0.12], [0, 0.33, 0.16]);
  tube([0, 0.33, 0.16], [0, 0.31, 0.46]);
  tube([0, 0.62, -0.12], [0, 0.68, 0.34], 0.014);
  const seat = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.04, 0.2), tyre);
  seat.position.set(0, 0.66, -0.14);
  g.add(seat);
  const bar = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.03, 0.03), frame);
  bar.position.set(0, 0.72, 0.36);
  g.add(bar);
  return g;
}
const bike = makeBicycle();
bike.position.set(-1.95, PLAZA_Y, 2.15);
bike.rotation.y = 1.35;
scene.add(bike);

// 电线杆 + 电线
const poleMat = new THREE.MeshStandardMaterial({ color: 0x39424d, roughness: 0.9 });
const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.075, 0.1, 4.9, 12), poleMat);
pole.position.set(-3.85, PLAZA_Y + 2.45, 1.35);
pole.castShadow = true;
scene.add(pole);
[[4.2, 0.34], [3.85, 0.24]].forEach(([y, w]) => {
  const arm = new THREE.Mesh(new THREE.BoxGeometry(w * 2, 0.05, 0.05), poleMat);
  arm.position.set(-3.85, PLAZA_Y + y, 1.35);
  arm.rotation.y = 0.5;
  scene.add(arm);
});

function wire(a, b, sag = 0.6, r = 0.011) {
  const A = new THREE.Vector3(...a), B = new THREE.Vector3(...b);
  const mid = A.clone().add(B).multiplyScalar(0.5);
  mid.y -= sag;
  const curve = new THREE.CatmullRomCurve3([A, mid, B]);
  const m = new THREE.Mesh(
    new THREE.TubeGeometry(curve, 24, r, 4, false),
    new THREE.MeshStandardMaterial({ color: 0x0d1219, roughness: 0.95 })
  );
  scene.add(m);
}
wire([-3.85, PLAZA_Y + 4.2, 1.35], [2.95, PLAZA_Y + 3.9, -1.6], 0.55);
wire([-3.85, PLAZA_Y + 3.86, 1.35], [2.95, PLAZA_Y + 3.6, -1.6], 0.7);
wire([-3.85, PLAZA_Y + 4.2, 1.35], [-3.9, PLAZA_Y + 2.9, -1.2], 0.35);

/* ============================================================
   背景楼宇
   ============================================================ */
const facadeWarm = makeFacade(9, 11, 0.5);
const facadeCool = makeFacade(7, 13, 0.36);

function building(x, z, w, h, d, tex, rotY = 0) {
  const t = tex.clone();
  t.needsUpdate = true;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(Math.max(2, Math.round(w / 1.1)), Math.max(2, Math.round(h / 1.3)));
  const mat = new THREE.MeshStandardMaterial({
    map: t,
    emissiveMap: t,
    emissive: 0xffffff,
    emissiveIntensity: 0.3,
    color: 0x39404a,
    roughness: 0.85,
    metalness: 0.2,
  });
  const g = new THREE.Group();
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
  m.position.y = h / 2;
  m.castShadow = true;
  m.receiveShadow = true;
  g.add(m);
  const cap = new THREE.Mesh(new THREE.BoxGeometry(w + 0.12, 0.12, d + 0.12), darkMat);
  cap.position.y = h + 0.04;
  g.add(cap);
  g.position.set(x, PLAZA_Y, z);
  g.rotation.y = rotY;
  scene.add(g);
  return g;
}

building(-3.35, -1.05, 2.0, 3.3, 2.0, facadeWarm, 0.16);
building(-0.45, -3.15, 2.3, 2.7, 1.4, facadeCool, 0.0);
building(3.25, -1.6, 1.9, 3.0, 1.8, facadeCool, -0.1);
building(3.72, 0.95, 1.15, 2.1, 1.15, facadeCool, -0.34);
building(-3.62, 1.55, 1.25, 2.35, 1.25, facadeWarm, 0.26);

/* ============================================================
   霓虹招牌
   ============================================================ */
function neonSign(x, y, z, w, h, a, b, rotY = 0, glowSize = 2.4) {
  const tex = makeNeonSign(a, b);
  const mat = new THREE.MeshStandardMaterial({
    map: tex,
    emissiveMap: tex,
    emissive: 0xffffff,
    emissiveIntensity: 1.75,
    color: 0x222222,
    roughness: 0.5,
    side: THREE.DoubleSide,
  });
  const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat);
  m.position.set(x, y, z);
  m.rotation.y = rotY;
  scene.add(m);
  const gl = addGlow(scene, new THREE.Color(a), glowSize, new THREE.Vector3(
    x + Math.sin(rotY) * 0.12, y, z + Math.cos(rotY) * 0.12
  ));
  gl.material.opacity = 0.15;
  return m;
}

const signPink = neonSign(4.02, PLAZA_Y + 2.75, -0.61, 0.44, 1.85, '#ff3f9e', '#ffd0e8', 0, 1.9);
const signCyan = neonSign(-3.55, PLAZA_Y + 2.45, -0.015, 0.38, 1.6, '#46dcff', '#d6f6ff', 0, 1.7);
neonSign(3.25, PLAZA_Y + 1.45, -0.66, 0.82, 0.3, '#ffb14e', '#fff0d0', 0, 1.2);
neonSign(-0.45, PLAZA_Y + 2.15, -2.42, 1.35, 0.34, '#ff6a30', '#ffe0c0', 0, 1.3);
neonSign(-1.15, PLAZA_Y + 3.05, -2.40, 0.3, 1.1, '#ffd166', '#fff4d8', 0, 1.1);

/* ============================================================
   小王子 & 狐狸
   ============================================================ */
const matSkin = new THREE.MeshStandardMaterial({ color: COL.skin, roughness: 0.62, metalness: 0.0 });
const matCoat = new THREE.MeshStandardMaterial({ color: COL.coat, roughness: 0.82, metalness: 0.05 });
const matScarf = new THREE.MeshStandardMaterial({ color: COL.scarf, roughness: 0.72, emissive: 0x3a2408, emissiveIntensity: 0.55 });
const matHair = new THREE.MeshStandardMaterial({ color: COL.hair, roughness: 0.55, metalness: 0.15 });
const matDark = new THREE.MeshStandardMaterial({ color: 0x242a33, roughness: 0.8 });
const matFox = new THREE.MeshStandardMaterial({ color: COL.fox, roughness: 0.68 });
const matFoxLight = new THREE.MeshStandardMaterial({ color: 0xf0e6da, roughness: 0.7 });

function createPrince() {
  const g = new THREE.Group();

  // 腿 + 靴
  [-0.052, 0.052].forEach((x) => {
    const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.038, 0.033, 0.3, 8), matDark);
    leg.position.set(x, 0.155, 0);
    leg.castShadow = true;
    g.add(leg);
    const foot = new THREE.Mesh(new THREE.BoxGeometry(0.075, 0.05, 0.125), matDark);
    foot.position.set(x, 0.025, 0.018);
    g.add(foot);
  });

  // 大衣：上窄下宽的锥筒，但收得比之前紧
  const coat = new THREE.Mesh(new THREE.CylinderGeometry(0.098, 0.172, 0.46, 20, 1), matCoat);
  coat.position.y = 0.52;
  coat.castShadow = true;
  g.add(coat);
  const coatHem = new THREE.Mesh(new THREE.CylinderGeometry(0.173, 0.173, 0.032, 20), matCoat);
  coatHem.position.y = 0.3;
  g.add(coatHem);

  // 肩
  const shoulders = new THREE.Mesh(new THREE.SphereGeometry(0.107, 16, 12), matCoat);
  shoulders.scale.set(1, 0.66, 0.92);
  shoulders.position.y = 0.745;
  shoulders.castShadow = true;
  g.add(shoulders);

  // 手臂 + 手
  [-0.112, 0.112].forEach((x, i) => {
    const arm = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.027, 0.33, 8), matCoat);
    arm.position.set(x, 0.6, 0);
    arm.rotation.z = i === 0 ? 0.12 : -0.12;
    g.add(arm);
    const hand = new THREE.Mesh(new THREE.SphereGeometry(0.031, 10, 8), matSkin);
    hand.position.set(x * 1.06, 0.435, 0.005);
    g.add(hand);
  });

  // 脖子 + 头
  const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.039, 0.044, 0.055, 8), matSkin);
  neck.position.y = 0.787;
  g.add(neck);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.129, 26, 20), matSkin);
  head.position.y = 0.888;
  head.scale.set(1, 1.06, 1);
  head.castShadow = true;
  g.add(head);

  // 头发：贴头皮的帽 + 短刺
  const cap = new THREE.Mesh(new THREE.SphereGeometry(0.132, 20, 16, 0, Math.PI * 2, 0, Math.PI * 0.56), matHair);
  cap.position.y = 0.898;
  cap.scale.set(1.0, 1.04, 1.0);
  g.add(cap);
  for (let i = 0; i < 12; i++) {
    const phi = (i / 12) * Math.PI * 2 + 0.4;
    const theta = 0.22 + (i % 3) * 0.26;
    const rr = 0.118;
    const spike = new THREE.Mesh(new THREE.ConeGeometry(0.026, 0.07 + (i % 4) * 0.018, 5), matHair);
    const px = Math.sin(theta) * Math.cos(phi) * rr;
    const py = 0.898 + Math.cos(theta) * rr;
    const pz = Math.sin(theta) * Math.sin(phi) * rr;
    spike.position.set(px, py, pz);
    spike.lookAt(px * 2.6, 0.898 + (py - 0.898) * 2.8, pz * 2.6);
    spike.rotateX(Math.PI / 2);
    g.add(spike);
  }

  // 眼睛
  [-0.047, 0.047].forEach((x) => {
    const eye = new THREE.Mesh(
      new THREE.SphereGeometry(0.0165, 10, 8),
      new THREE.MeshStandardMaterial({ color: 0x15181e, roughness: 0.22, metalness: 0.3 })
    );
    eye.position.set(x, 0.892, 0.115);
    g.add(eye);
  });

  // 围巾
  const ring = new THREE.Mesh(new THREE.TorusGeometry(0.095, 0.031, 10, 26), matScarf);
  ring.rotation.x = Math.PI / 2;
  ring.position.y = 0.762;
  ring.castShadow = true;
  g.add(ring);

  const tail1 = new THREE.Mesh(new THREE.BoxGeometry(0.072, 0.32, 0.02), matScarf);
  tail1.position.set(0.078, 0.6, -0.09);
  tail1.rotation.z = 0.2;
  tail1.rotation.x = -0.16;
  g.add(tail1);
  const tail2 = new THREE.Mesh(new THREE.BoxGeometry(0.058, 0.21, 0.018), matScarf);
  tail2.position.set(-0.015, 0.645, -0.105);
  tail2.rotation.z = -0.1;
  g.add(tail2);

  return g;
}

function createFox() {
  const g = new THREE.Group();

  // 身体
  const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.082, 0.17, 6, 12), matFox);
  body.rotation.x = Math.PI / 2;
  body.position.set(0, 0.2, 0);
  body.castShadow = true;
  g.add(body);

  // 胸
  const chest = new THREE.Mesh(new THREE.SphereGeometry(0.062, 12, 10), matFoxLight);
  chest.scale.set(0.9, 1.05, 0.7);
  chest.position.set(0, 0.19, 0.13);
  g.add(chest);

  // 头
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.079, 16, 12), matFox);
  head.position.set(0, 0.29, 0.2);
  head.scale.set(1, 0.94, 1.06);
  head.castShadow = true;
  g.add(head);

  // 吻部
  const snout = new THREE.Mesh(new THREE.ConeGeometry(0.042, 0.09, 8), matFoxLight);
  snout.rotation.x = Math.PI / 2;
  snout.position.set(0, 0.272, 0.28);
  g.add(snout);

  // 耳朵
  [-0.045, 0.045].forEach((x) => {
    const ear = new THREE.Mesh(new THREE.ConeGeometry(0.032, 0.095, 5), matFox);
    ear.position.set(x, 0.365, 0.185);
    ear.rotation.z = x > 0 ? -0.22 : 0.22;
    g.add(ear);
    const inner = new THREE.Mesh(new THREE.ConeGeometry(0.018, 0.06, 5), matFoxLight);
    inner.position.set(x, 0.36, 0.202);
    inner.rotation.z = x > 0 ? -0.22 : 0.22;
    g.add(inner);
  });

  // 眼睛
  [-0.034, 0.034].forEach((x) => {
    const e = new THREE.Mesh(new THREE.SphereGeometry(0.012, 8, 6), new THREE.MeshStandardMaterial({ color: 0x14171c, roughness: 0.2 }));
    e.position.set(x, 0.302, 0.268);
    g.add(e);
  });

  // 尾巴
  const curve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(0, 0.22, -0.16),
    new THREE.Vector3(0.03, 0.28, -0.29),
    new THREE.Vector3(0.01, 0.18, -0.4),
  ]);
  const tail = new THREE.Mesh(new THREE.TubeGeometry(curve, 16, 0.05, 8, false), matFox);
  tail.castShadow = true;
  g.add(tail);
  const tip = new THREE.Mesh(new THREE.SphereGeometry(0.05, 10, 8), matFoxLight);
  tip.position.set(0.01, 0.18, -0.4);
  g.add(tip);

  // 四腿
  [[-0.05, 0.11], [0.05, 0.11], [-0.05, -0.09], [0.05, -0.09]].forEach(([x, z]) => {
    const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.016, 0.014, 0.13, 6), matFox);
    leg.position.set(x, 0.065, z);
    g.add(leg);
  });

  return g;
}

const prince = createPrince();
prince.scale.setScalar(1.46);
prince.position.set(2.52, PLAZA_Y + 0.09, 4.02);
prince.rotation.y = -2.65;
scene.add(prince);

const fox = createFox();
fox.scale.setScalar(1.3);
fox.position.set(1.94, PLAZA_Y + 0.09, 3.9);
fox.rotation.y = 1.33;
scene.add(fox);

// 接地阴影
const shadowTex = canvasTex(128, 128, (ctx, w, h) => {
  const g = ctx.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w / 2);
  g.addColorStop(0, 'rgba(0,0,0,0.72)');
  g.addColorStop(0.6, 'rgba(0,0,0,0.28)');
  g.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);
});
function contactShadow(x, z, s) {
  const m = new THREE.Mesh(
    new THREE.PlaneGeometry(s, s),
    new THREE.MeshBasicMaterial({ map: shadowTex, transparent: true, depthWrite: false, color: 0x000000, opacity: 0.85 })
  );
  m.rotation.x = -Math.PI / 2;
  m.position.set(x, PLAZA_Y + 0.03, z);
  scene.add(m);
}
contactShadow(2.52, 4.02, 1.0);
contactShadow(1.94, 3.9, 0.62);

/* ============================================================
   灯光
   ============================================================ */
scene.add(new THREE.HemisphereLight(0x2a4a76, 0x05080e, 0.3));

const moon = new THREE.DirectionalLight(0x8fc0ff, 0.85);
moon.position.set(7, 14, -9);
moon.castShadow = true;
moon.shadow.mapSize.set(2048, 2048);
moon.shadow.camera.near = 1;
moon.shadow.camera.far = 40;
moon.shadow.camera.left = -9;
moon.shadow.camera.right = 9;
moon.shadow.camera.top = 9;
moon.shadow.camera.bottom = -9;
moon.shadow.bias = -0.0006;
moon.shadow.normalBias = 0.02;
scene.add(moon);

// 店内暖光
const storeLight = new THREE.PointLight(0xffb469, 13, 9, 2.0);
storeLight.position.set(SX + 0.2, PLAZA_Y + 1.75, SZ + 0.9);
scene.add(storeLight);

const storeLight2 = new THREE.PointLight(0xffcf9a, 6, 5.5, 2.0);
storeLight2.position.set(SX - 1.15, PLAZA_Y + 1.4, SZ + 1.1);
scene.add(storeLight2);

const doorLight = new THREE.PointLight(0xff9a52, 6, 4.2, 2.0);
doorLight.position.set(SX + 0.5, PLAZA_Y + 1.1, SZ + 2.0);
scene.add(doorLight);

// 雨棚下的灯
const canopyLight = new THREE.PointLight(0xffd9a8, 4, 3.0, 2.0);
canopyLight.position.set(SX + 0.2, PLAZA_Y + 2.0, SZ + 2.55);
scene.add(canopyLight);

// 霓虹溢光
const pinkLight = new THREE.PointLight(COL.neonPink, 2.6, 4.2, 2.0);
pinkLight.position.set(3.9, PLAZA_Y + 2.6, -0.35);
scene.add(pinkLight);

const cyanLight = new THREE.PointLight(COL.neonCyan, 3.4, 4.4, 2.0);
cyanLight.position.set(-3.6, PLAZA_Y + 2.3, 0.15);
scene.add(cyanLight);

// 城市余晖，从星球内部透出来
const underGlow = new THREE.PointLight(0xff9d5c, 8, 9, 2.0);
underGlow.position.set(0, PLAZA_Y - 1.9, 0.4);
scene.add(underGlow);

// 人物前方的冷补光，避免只剩剪影
const fillLight = new THREE.PointLight(0x9fc4e8, 9.5, 6.2, 2.0);
fillLight.position.set(3.0, PLAZA_Y + 2.4, 6.2);
scene.add(fillLight);

// 地面薄雾，拉开空气感
const mistTex = glowTexture();
for (let i = 0; i < 7; i++) {
  const s = new THREE.Sprite(new THREE.SpriteMaterial({
    map: mistTex,
    color: 0x6c9dc4,
    transparent: true,
    opacity: 0.055,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  }));
  const a = Math.random() * Math.PI * 2;
  const r = 1.5 + Math.random() * 3.6;
  s.position.set(Math.cos(a) * r, PLAZA_Y + 0.5 + Math.random() * 0.7, Math.sin(a) * r);
  s.scale.set(6 + Math.random() * 4, 3.2, 1);
  scene.add(s);
}

/* ============================================================
   雨
   ============================================================ */
const RAIN_COUNT = 1900;
const rainSpeed = new Float32Array(RAIN_COUNT);
const rainGeo = new THREE.BufferGeometry();
const rainPos = new Float32Array(RAIN_COUNT * 6);
const RAIN_TOP = PLAZA_Y + 8.2;
const RAIN_BOTTOM = PLAZA_Y - 0.8;

for (let i = 0; i < RAIN_COUNT; i++) {
  const a = Math.random() * Math.PI * 2;
  const r = Math.sqrt(Math.random()) * 6.9;
  const x = Math.cos(a) * r;
  const z = Math.sin(a) * r;
  const y = RAIN_BOTTOM + Math.random() * (RAIN_TOP - RAIN_BOTTOM);
  const len = 0.14 + Math.random() * 0.22;
  rainPos[i * 6 + 0] = x;
  rainPos[i * 6 + 1] = y;
  rainPos[i * 6 + 2] = z;
  rainPos[i * 6 + 3] = x + 0.03;
  rainPos[i * 6 + 4] = y - len;
  rainPos[i * 6 + 5] = z + 0.01;
  rainSpeed[i] = 7.5 + Math.random() * 7.5;
}
rainGeo.setAttribute('position', new THREE.BufferAttribute(rainPos, 3));

const rain = new THREE.LineSegments(
  rainGeo,
  new THREE.LineBasicMaterial({
    color: 0xa9d4f5,
    transparent: true,
    opacity: 0.13,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  })
);
rain.frustumCulled = false;
scene.add(rain);

// 地面溅落的水环
const ripples = [];
const rippleMat = new THREE.MeshBasicMaterial({
  color: 0xa9dcff, transparent: true, opacity: 0.5,
  blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide,
});
for (let i = 0; i < 16; i++) {
  const m = new THREE.Mesh(new THREE.RingGeometry(0.055, 0.072, 20), rippleMat.clone());
  m.rotation.x = -Math.PI / 2;
  respawnRipple(m);
  m.userData.t = Math.random();
  scene.add(m);
  ripples.push(m);
}
function respawnRipple(m) {
  const a = Math.random() * Math.PI * 2;
  const r = Math.sqrt(Math.random()) * (PLAZA_R - 0.8);
  m.position.set(Math.cos(a) * r, PLAZA_Y + 0.028, Math.sin(a) * r);
  m.scale.setScalar(0.6);
  m.material.opacity = 0.55;
  m.userData.t = 0;
  m.userData.life = 0.85 + Math.random() * 0.7;
}

/* ============================================================
   星空 / 浮石
   ============================================================ */
const starCount = 1400;
const starGeo = new THREE.BufferGeometry();
const starPos = new Float32Array(starCount * 3);
const starCol = new Float32Array(starCount * 3);
for (let i = 0; i < starCount; i++) {
  const u = Math.random() * 2 - 1;
  const phi = Math.random() * Math.PI * 2;
  const r = 90 + Math.random() * 90;
  const s = Math.sqrt(1 - u * u);
  starPos[i * 3] = Math.cos(phi) * s * r;
  starPos[i * 3 + 1] = u * r * 0.7 + 20;
  starPos[i * 3 + 2] = Math.sin(phi) * s * r;
  const t = Math.random();
  const c = new THREE.Color().setHSL(0.55 + t * 0.08, 0.35, 0.65 + Math.random() * 0.3);
  starCol[i * 3] = c.r; starCol[i * 3 + 1] = c.g; starCol[i * 3 + 2] = c.b;
}
starGeo.setAttribute('position', new THREE.BufferAttribute(starPos, 3));
starGeo.setAttribute('color', new THREE.BufferAttribute(starCol, 3));
const stars = new THREE.Points(
  starGeo,
  new THREE.PointsMaterial({ size: 0.75, vertexColors: true, transparent: true, opacity: 0.9, depthWrite: false, sizeAttenuation: true })
);
scene.add(stars);

// 漂浮的小石块，强化“世界”悬浮感
const floaters = [];
for (let i = 0; i < 9; i++) {
  const r = 8.5 + Math.random() * 3.5;
  const a = Math.random() * Math.PI * 2;
  const y = PLAZA_Y - 2.5 - Math.random() * 3.5;
  const geo = new THREE.DodecahedronGeometry(0.16 + Math.random() * 0.3, 0);
  const m = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ color: 0x1c2430, roughness: 0.9, metalness: 0.3 }));
  m.position.set(Math.cos(a) * r, y, Math.sin(a) * r);
  m.rotation.set(Math.random(), Math.random(), Math.random());
  scene.add(m);
  floaters.push({ mesh: m, baseY: y, phase: Math.random() * 6.28, speed: 0.3 + Math.random() * 0.3 });
}

/* ============================================================
   后期：bloom + 调色
   ============================================================ */
const composer = new EffectComposer(renderer);
composer.setSize(window.innerWidth, window.innerHeight);
composer.addPass(new RenderPass(scene, camera));

const bloom = new UnrealBloomPass(
  new THREE.Vector2(window.innerWidth, window.innerHeight),
  0.5,   // strength
  0.72,  // radius
  1.05   // threshold
);
composer.addPass(bloom);

const gradePass = new ShaderPass({
  uniforms: {
    tDiffuse: { value: null },
    uExposure: { value: 1.18 },
    uVignette: { value: 0.62 },
    uTime: { value: 0 },
  },
  vertexShader: `
    varying vec2 vUv;
    void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }
  `,
  fragmentShader: `
    uniform sampler2D tDiffuse;
    uniform float uExposure;
    uniform float uVignette;
    uniform float uTime;
    varying vec2 vUv;

    vec3 aces(vec3 x){
      const float a = 2.51, b = 0.03, c = 2.43, d = 0.59, e = 0.14;
      return clamp((x * (a * x + b)) / (x * (c * x + d) + e), 0.0, 1.0);
    }

    float hash(vec2 p){
      return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
    }

    void main(){
      vec3 col = texture2D(tDiffuse, vUv).rgb * uExposure;
      col = aces(col);
      col = mix(col, col * vec3(0.92, 0.98, 1.08), 0.35);
      float d = distance(vUv, vec2(0.5));
      col *= 1.0 - smoothstep(0.34, 0.92, d) * uVignette;
      col = pow(col, vec3(1.0 / 2.2));
      // 细颗粒，压掉塑料感
      float g = hash(vUv * 1024.0 + fract(uTime) * 71.0) - 0.5;
      col += g * 0.022;
      gl_FragColor = vec4(col, 1.0);
    }
  `,
});
composer.addPass(gradePass);

/* ============================================================
   交互
   ============================================================ */
const btnRotate = document.getElementById('btn-rotate');
const btnReset = document.getElementById('btn-reset');
const hint = document.getElementById('hint');

btnRotate.addEventListener('click', () => {
  controls.autoRotate = !controls.autoRotate;
  btnRotate.dataset.on = String(controls.autoRotate);
});

btnReset.addEventListener('click', () => {
  camera.position.copy(CAM_HOME);
  controls.target.copy(CAM_TARGET);
  controls.update();
});

controls.addEventListener('start', () => {
  hint.classList.add('gone');
});

let fadeIn = 0;

/* ============================================================
   尺寸
   ============================================================ */
function onResize() {
  const w = window.innerWidth, h = window.innerHeight;
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
  renderer.setSize(w, h);
  composer.setSize(w, h);
  bloom.setSize(w, h);
}
window.addEventListener('resize', onResize);

/* ============================================================
   主循环
   ============================================================ */
const clock = new THREE.Clock();
let frame = 0;

function animate() {
  requestAnimationFrame(animate);
  const dt = Math.min(clock.getDelta(), 0.05);
  const t = clock.elapsedTime;

  // 开场：镜头轻微推近
  if (fadeIn < 1) {
    fadeIn = Math.min(1, fadeIn + dt * 0.6);
    const e = 1 - Math.pow(1 - fadeIn, 3);
    gradePass.uniforms.uExposure.value = 0.55 + 0.5 * e;
  }

  // 雨
  const pos = rainGeo.attributes.position.array;
  for (let i = 0; i < RAIN_COUNT; i++) {
    const fall = rainSpeed[i] * dt;
    pos[i * 6 + 1] -= fall;
    pos[i * 6 + 4] -= fall;
    if (pos[i * 6 + 4] < RAIN_BOTTOM) {
      const len = pos[i * 6 + 1] - pos[i * 6 + 4];
      pos[i * 6 + 1] = RAIN_TOP;
      pos[i * 6 + 4] = RAIN_TOP - len;
    }
  }
  rainGeo.attributes.position.needsUpdate = true;

  // 水环
  for (const rp of ripples) {
    rp.userData.t += dt;
    const k = rp.userData.t / rp.userData.life;
    if (k >= 1) {
      respawnRipple(rp);
    } else {
      rp.scale.setScalar(0.55 + k * 3.6);
      rp.material.opacity = 0.55 * (1 - k) * (1 - k);
    }
  }

  // 霓虹轻微呼吸
  const pulse = 0.86 + Math.sin(t * 1.6) * 0.09 + Math.sin(t * 7.3) * 0.03;
  if (signPink.material) signPink.material.emissiveIntensity = 1.7 * pulse;
  if (signCyan.material) signCyan.material.emissiveIntensity = 1.7 * (0.9 + Math.sin(t * 1.2 + 1.4) * 0.1);

  // 呼吸 / 漂浮
  prince.position.y = PLAZA_Y + 0.09 + Math.sin(t * 1.1) * 0.006;
  fox.position.y = PLAZA_Y + 0.09 + Math.sin(t * 1.35 + 1.0) * 0.005;
  for (const f of floaters) {
    f.mesh.position.y = f.baseY + Math.sin(t * f.speed + f.phase) * 0.28;
    f.mesh.rotation.y += dt * 0.08;
  }

  controls.update();
  gradePass.uniforms.uTime.value = t;
  composer.render();

  if (++frame === 2) {
    document.getElementById('loader').classList.add('done');
    document.getElementById('hud').classList.add('live');
  }
}

try {
  animate();
} catch (e) {
  const el = document.getElementById('err');
  el.style.display = 'block';
  el.textContent = '场景初始化失败：' + e.message;
  console.error(e);
}
