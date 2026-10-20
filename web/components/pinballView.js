// おみくじ演出「サイバー弾き盤」の 3D の見た目(three.js)。ルールと物理は omikujiPinball.js。
//
// createView(lib, canvas) で組み、毎フレーム render(g, dt) を呼ぶ。lib は three.js と
// 使う追加モジュール(OmikujiPinball.vue が必要な時だけ読み込む):
//   { THREE, RoomEnvironment, EffectComposer, RenderPass, UnrealBloomPass, OutputPass }
//
// 座標: 盤面の (x, y, h) → three の (x - 240, h, y - 440)。盤面は Y = 0 の平面で、
// 玉の中心は Y = 半径 + h。1 単位 = 盤面の 1px。
//
// カメラ:
//   overview : 盤面を手前の上から見下ろす(放つ前)
//   chase    : 玉のすぐ後ろから、進む向きを見る(放ってから最後まで)
//   port     : ポートに入った玉を上から見る(締め)

const P = require("./omikujiPinball");

const TIER_COLORS = {
  超吉: 0xffd24d,
  大吉: 0xff7ad9,
  中吉: 0x6cf0ff,
  小吉: 0x7dff9a,
  末吉: 0x9db7ff,
  凶: 0xb0b0c0,
  大凶: 0xff5a5a,
};
const CYAN = 0x38e8ff;
const MAGENTA = 0xff3df0;
const AMBER = 0xffb02e;
const LIME = 0x8cff5a;

const X = (x) => x - 240;
const Z = (y) => y - 440;

function createView(lib, canvas, opts) {
  const { THREE } = lib;
  const o = Object.assign({ bloom: true, reducedMotion: false }, opts || {});
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: "high-performance" });
  let pixelRatio = Math.min(2, window.devicePixelRatio || 1);
  renderer.setPixelRatio(pixelRatio);
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x04020c);
  scene.fog = new THREE.FogExp2(0x05030f, 0.0011);
  const camera = new THREE.PerspectiveCamera(62, 1, 1, 5000);
  const v3 = (x, y, h) => new THREE.Vector3(X(x), h || 0, Z(y));

  // 映り込み(銀の玉)
  const pmrem = new THREE.PMREMGenerator(renderer);
  const envTex = pmrem.fromScene(new lib.RoomEnvironment(renderer), 0.04).texture;
  pmrem.dispose();

  // 明かり
  scene.add(new THREE.HemisphereLight(0x5068ff, 0x200830, 0.9));
  const sun = new THREE.DirectionalLight(0xc8d8ff, 0.8);
  sun.position.set(-200, 600, 300);
  scene.add(sun);

  const disposables = [];
  const keep = (x) => {
    disposables.push(x);
    return x;
  };
  const neon = (color) => keep(new THREE.MeshBasicMaterial({ color, toneMapped: false }));
  const glowMat = (color, opacity) =>
    keep(new THREE.MeshBasicMaterial({ color, toneMapped: false, transparent: true, opacity: opacity == null ? 1 : opacity, blending: THREE.AdditiveBlending, depthWrite: false }));
  const metal = keep(new THREE.MeshStandardMaterial({ color: 0x1c1834, metalness: 0.85, roughness: 0.32, envMap: envTex, envMapIntensity: 0.6 }));

  // ---- 盤面の床(グリッドと回路の模様) ----
  const floorTex = makeFloorTexture(THREE);
  keep(floorTex);
  const floor = new THREE.Mesh(
    keep(new THREE.PlaneGeometry(P.W, P.H)),
    keep(new THREE.MeshStandardMaterial({ map: floorTex, emissiveMap: floorTex, emissive: 0xffffff, emissiveIntensity: 0.55, roughness: 0.55, metalness: 0.4, envMap: envTex, envMapIntensity: 0.25 }))
  );
  floor.rotation.x = -Math.PI / 2;
  floor.position.set(X(P.W / 2), 0, Z(P.H / 2));
  scene.add(floor);

  // ---- 壁(暗い金属の板 + 上の縁のネオン) ----
  const wallGroup = new THREE.Group();
  scene.add(wallGroup);
  function addBar(ax, ay, bx, by, thick, height, mat, stripColor, y0) {
    const len = Math.hypot(bx - ax, by - ay);
    if (len < 0.5) return null;
    const g = new THREE.Group();
    const body = new THREE.Mesh(keep(new THREE.BoxGeometry(len + thick, height, thick)), mat);
    body.position.y = (y0 || 0) + height / 2;
    g.add(body);
    if (stripColor != null) {
      const strip = new THREE.Mesh(keep(new THREE.BoxGeometry(len + thick, 1.6, thick + 1.2)), neon(stripColor));
      strip.position.y = (y0 || 0) + height + 0.8;
      g.add(strip);
    }
    g.position.set(X((ax + bx) / 2), 0, Z((ay + by) / 2));
    g.rotation.y = -Math.atan2(by - ay, bx - ax);
    wallGroup.add(g);
    return g;
  }
  const sh = (kind) => P_SHAPES.filter((s) => s.kind === kind);
  const P_SHAPES = P.newGame().shapes;
  for (const s of sh("wall")) {
    // 一番下の壁はシュートの所を開けておく(玉が盤の下へ降りていく)
    if (s.ay === P.H && s.by === P.H) {
      addBar(s.ax, s.ay, P.CHUTE.x0, s.by, s.r * 2, 22, metal, CYAN);
      addBar(P.CHUTE.x1, s.ay, s.bx, s.by, s.r * 2, 22, metal, CYAN);
      continue;
    }
    const tall = s.arc || s.ax === 20 || s.ax === P.LANE.outer;
    addBar(s.ax, s.ay, s.bx, s.by, Math.max(4, s.r * 2), tall ? 30 : 20, metal, s.divider ? AMBER : s.laneWall ? MAGENTA : CYAN);
  }
  const gateShape = sh("gate")[0];
  const gate = addBar(gateShape.ax, gateShape.ay, gateShape.bx, gateShape.by, 6, 20, metal, MAGENTA);
  gate.visible = false;

  // スリングショット(蹴る辺が光る)
  const slingBars = sh("sling").map((s) => {
    const g = addBar(s.ax, s.ay, s.bx, s.by, 8, 16, metal, null);
    const strip = new THREE.Mesh(keep(new THREE.BoxGeometry(Math.hypot(s.bx - s.ax, s.by - s.ay), 12, 2)), glowMat(MAGENTA, 0.9));
    strip.position.set(0, 9, 4);
    g.add(strip);
    return { strip, flash: 0 };
  });

  // 結界(真ん中の穴の上の光の膜)
  const barrierMat = glowMat(LIME, 0.75);
  const barrier = new THREE.Mesh(keep(new THREE.BoxGeometry(P.DRAIN.x1 - P.DRAIN.x0, 18, 2)), barrierMat);
  barrier.position.set(X(P.CX), 9, Z(P.DRAIN.y));
  scene.add(barrier);
  // シュートの底の穴(暗い)
  const holeMat = keep(new THREE.MeshBasicMaterial({ color: 0x000000 }));
  const chuteHole = new THREE.Mesh(keep(new THREE.PlaneGeometry(P.CHUTE.x1 - P.CHUTE.x0 - 8, 30)), holeMat);
  chuteHole.rotation.x = -Math.PI / 2;
  chuteHole.position.set(X(P.CX), 0.3, Z(P.H - 14));
  scene.add(chuteHole);

  // ---- バンパー ----
  const bumpers = P.BUMPERS.map((b) => {
    const g = new THREE.Group();
    const base = new THREE.Mesh(keep(new THREE.CylinderGeometry(b.r, b.r + 2, 16, 32)), metal);
    base.position.y = 8;
    g.add(base);
    const ringMat = glowMat(MAGENTA, 1);
    const ring = new THREE.Mesh(keep(new THREE.TorusGeometry(b.r - 3, 2.4, 8, 40)), ringMat);
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 17;
    g.add(ring);
    const capMat = glowMat(0xff9cf6, 0.35);
    const cap = new THREE.Mesh(keep(new THREE.CylinderGeometry(b.r - 6, b.r - 6, 2, 32)), capMat);
    cap.position.y = 18;
    g.add(cap);
    const skirt = new THREE.Mesh(keep(new THREE.TorusGeometry(b.r + 3, 1.4, 6, 40)), glowMat(CYAN, 0.8));
    skirt.rotation.x = -Math.PI / 2;
    skirt.position.y = 1.5;
    g.add(skirt);
    g.position.set(X(b.x), 0, Z(b.y));
    scene.add(g);
    return { g, ring, ringMat, capMat, flash: 0 };
  });

  // ---- フリッパー ----
  const flipShape = new THREE.Shape();
  {
    const { L, r0, r1 } = P.FLIP;
    const a = Math.asin((r0 - r1) / L);
    flipShape.absarc(0, 0, r0, Math.PI / 2 + a, (3 * Math.PI) / 2 - a, false);
    flipShape.absarc(L, 0, r1, -Math.PI / 2 - a + Math.PI * 0, Math.PI / 2 + a, false);
  }
  const flipGeo = keep(new THREE.ExtrudeGeometry(flipShape, { depth: 14, bevelEnabled: true, bevelSize: 1.2, bevelThickness: 1.2, bevelSegments: 2, curveSegments: 16 }));
  flipGeo.rotateX(Math.PI / 2);
  flipGeo.translate(0, 15, 0);
  const flipMat = keep(new THREE.MeshStandardMaterial({ color: 0x0d2a40, emissive: CYAN, emissiveIntensity: 0.55, metalness: 0.6, roughness: 0.3, envMap: envTex }));
  const flippers = P.FLIPPERS.map((f) => {
    const m = new THREE.Mesh(flipGeo, flipMat);
    m.position.set(X(f.x), 0, Z(f.y));
    scene.add(m);
    const edges = new THREE.LineSegments(keep(new THREE.EdgesGeometry(flipGeo, 30)), keep(new THREE.LineBasicMaterial({ color: 0xbaf6ff, toneMapped: false })));
    m.add(edges);
    return m;
  });

  // ---- ドロップターゲット ----
  const drops = P.DROPS.map((d) => {
    const m = new THREE.Mesh(keep(new THREE.BoxGeometry(22, 18, 5)), glowMat(AMBER, 0.95));
    m.position.set(X(d.x), 9, Z(d.y));
    m.rotation.y = -Math.atan2(d.by - d.ay, d.bx - d.ax);
    scene.add(m);
    return { m, y: 9 };
  });

  // ---- 天辺のレーンの文字(B・U・G) ----
  const laneLights = P.LANES.map((l) => {
    const tex = keep(makeLabelTexture(THREE, l.label, { size: 128, font: "900 96px 'IBM Plex Mono', monospace", color: "#ffffff" }));
    const mat = glowMat(AMBER, 0.25);
    mat.map = tex;
    const m = new THREE.Mesh(keep(new THREE.PlaneGeometry(26, 26)), mat);
    m.rotation.x = -Math.PI / 2;
    m.position.set(X(l.x), 0.6, Z(124));
    scene.add(m);
    return { m, mat, on: false, flash: 0 };
  });

  // ---- スピナー ----
  const spinner = new THREE.Mesh(keep(new THREE.BoxGeometry(P.SPINNER.bx - P.SPINNER.ax - 6, 14, 1.5)), glowMat(LIME, 0.85));
  spinner.position.set(X((P.SPINNER.ax + P.SPINNER.bx) / 2), 14, Z(P.SPINNER.ay));
  scene.add(spinner);
  addBar(P.SPINNER.ax - 2, P.SPINNER.ay, P.SPINNER.ax, P.SPINNER.ay, 4, 26, metal, LIME);
  addBar(P.SPINNER.bx, P.SPINNER.ay, P.SPINNER.bx + 2, P.SPINNER.ay, 4, 26, metal, LIME);
  let spinnerSpeed = 0;

  // ---- 磁力の輪 ----
  const magnet = new THREE.Group();
  const magRingMat = glowMat(0x4d7bff, 0.9);
  const magRing = new THREE.Mesh(keep(new THREE.TorusGeometry(P.MAGNET.r, 2, 8, 48)), magRingMat);
  magRing.rotation.x = -Math.PI / 2;
  magRing.position.y = 0.8;
  magnet.add(magRing);
  const magInnerMat = glowMat(0x9fd0ff, 0.6);
  const magInner = new THREE.Mesh(keep(new THREE.TorusGeometry(P.MAGNET.r * 0.6, 1.2, 6, 3)), magInnerMat);
  magInner.rotation.x = -Math.PI / 2;
  magInner.position.y = 1;
  magnet.add(magInner);
  const magBeamMat = glowMat(0x6fa0ff, 0);
  const magBeam = new THREE.Mesh(keep(new THREE.CylinderGeometry(P.MAGNET.r * 0.7, P.MAGNET.r, 140, 24, 1, true)), magBeamMat);
  magBeam.position.y = 70;
  magnet.add(magBeam);
  magnet.position.set(X(P.MAGNET.x), 0, Z(P.MAGNET.y));
  scene.add(magnet);
  let magnetOn = 0;

  // ---- ワープの穴とトンネル ----
  const portal = new THREE.Group();
  const portalHole = new THREE.Mesh(keep(new THREE.CircleGeometry(P.PORTAL.r + 2, 32)), holeMat);
  portalHole.rotation.x = -Math.PI / 2;
  portalHole.position.y = 0.4;
  portal.add(portalHole);
  const portalRingMat = glowMat(MAGENTA, 1);
  const portalRing = new THREE.Mesh(keep(new THREE.TorusGeometry(P.PORTAL.r + 4, 2.2, 8, 40)), portalRingMat);
  portalRing.rotation.x = -Math.PI / 2;
  portalRing.position.y = 1;
  portal.add(portalRing);
  const swirlTex = keep(makeSwirlTexture(THREE));
  const swirlMat = glowMat(0xffffff, 0.9);
  swirlMat.map = swirlTex;
  const swirl = new THREE.Mesh(keep(new THREE.CircleGeometry(P.PORTAL.r + 1, 32)), swirlMat);
  swirl.rotation.x = -Math.PI / 2;
  swirl.position.y = 0.7;
  portal.add(swirl);
  portal.position.set(X(P.PORTAL.x), 0, Z(P.PORTAL.y));
  scene.add(portal);
  let portalFlash = 0;

  const toVec = (p) => new THREE.Vector3(X(p.x), P.R + p.h, Z(p.y));
  const curveOf = (rail) => new THREE.CatmullRomCurve3(rail.pts.map(toVec));
  // トンネル(盤の下。中から見ると、光の輪が流れていく)
  const tunnelTex = keep(makeTunnelTexture(THREE));
  tunnelTex.wrapS = tunnelTex.wrapT = THREE.RepeatWrapping;
  tunnelTex.repeat.set(10, 2);
  const tunnelMat = keep(new THREE.MeshBasicMaterial({ map: tunnelTex, side: THREE.BackSide, toneMapped: false, transparent: true, opacity: 0.95 }));
  const tunnel = new THREE.Mesh(keep(new THREE.TubeGeometry(curveOf(P.TUNNEL), 80, 18, 16, false)), tunnelMat);
  scene.add(tunnel);

  // ---- 左のランプ(透ける坂 + 2 本の光のレール) ----
  const rampCurve = curveOf(P.RAMP);
  const rampTube = new THREE.Mesh(keep(new THREE.TubeGeometry(rampCurve, 120, 15, 12, false)), keep(new THREE.MeshBasicMaterial({ color: CYAN, transparent: true, opacity: 0.08, side: THREE.DoubleSide, depthWrite: false })));
  scene.add(rampTube);
  for (const side of [-1, 1]) {
    const pts = rampCurve.getSpacedPoints(120).map((p, i, arr) => {
      const q = arr[Math.min(arr.length - 1, i + 1)];
      const r = arr[Math.max(0, i - 1)];
      const t = new THREE.Vector3().subVectors(q, r).setY(0).normalize();
      const lat = new THREE.Vector3(-t.z, 0, t.x);
      return p.clone().addScaledVector(lat, side * 11).add(new THREE.Vector3(0, -8, 0));
    });
    const rail = new THREE.Mesh(keep(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 120, 1.3, 6, false)), neon(CYAN));
    scene.add(rail);
  }
  // ランプの支柱
  for (let i = 1; i < 9; i++) {
    const p = rampCurve.getPointAt(i / 9);
    if (p.y < 18) continue;
    const post = new THREE.Mesh(keep(new THREE.CylinderGeometry(1.5, 1.5, p.y - 8, 6)), metal);
    post.position.set(p.x, (p.y - 8) / 2, p.z);
    scene.add(post);
  }
  // ランプの口(光る門)
  const rampGate = new THREE.Mesh(keep(new THREE.TorusGeometry(20, 2, 8, 32, Math.PI)), glowMat(CYAN, 1));
  rampGate.position.set(X(56), 0, Z(462));
  rampGate.rotation.y = 0.12;
  scene.add(rampGate);

  // ---- インレーンのレーザー ----
  const lasers = P.LASERS.map((l) => {
    const mat = glowMat(0xff2b6a, 0);
    const m = new THREE.Mesh(keep(new THREE.BoxGeometry(l.x1 - l.x0, 22, 1)), mat);
    m.position.set(X((l.x0 + l.x1) / 2), 11, Z(l.y));
    scene.add(m);
    addBar(l.x0 - 3, l.y, l.x0, l.y, 3, 24, metal, 0xff2b6a);
    addBar(l.x1, l.y, l.x1 + 3, l.y, 3, 24, metal, 0xff2b6a);
    return { mat, flash: 0 };
  });

  // ---- 盤の下の部屋(ポート) ----
  const chamber = new THREE.Group();
  scene.add(chamber);
  const chFloorTex = keep(makeChamberTexture(THREE));
  const chFloor = new THREE.Mesh(
    keep(new THREE.PlaneGeometry(P.W, 260)),
    keep(new THREE.MeshStandardMaterial({ map: chFloorTex, emissiveMap: chFloorTex, emissive: 0xffffff, emissiveIntensity: 0.5, roughness: 0.6, metalness: 0.3 }))
  );
  chFloor.rotation.x = -Math.PI / 2;
  chFloor.position.set(X(P.W / 2), P.PORT_H, Z(P.H + 130));
  chamber.add(chFloor);
  // バス(横のレール)と、各ポートへの枝
  const busMat = neon(0x2a6cff);
  const busL = P.PORTS[0].x;
  const busR = P.PORTS[P.PORTS.length - 1].x;
  const bus = new THREE.Mesh(keep(new THREE.BoxGeometry(busR - busL, 1.5, 3)), busMat);
  bus.position.set(X((busL + busR) / 2), P.PORT_H + 0.8, Z(P.BUS_Y + 12));
  chamber.add(bus);
  const ports = P.PORTS.map((p) => {
    const color = TIER_COLORS[p.tier];
    const g = new THREE.Group();
    const hole = new THREE.Mesh(keep(new THREE.CircleGeometry(15, 32)), holeMat);
    hole.rotation.x = -Math.PI / 2;
    hole.position.y = 0.4;
    g.add(hole);
    const ringMat = glowMat(color, 0.55);
    const ring = new THREE.Mesh(keep(new THREE.TorusGeometry(17, 2, 8, 40)), ringMat);
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 1;
    g.add(ring);
    const branchMat = glowMat(color, 0.35);
    const branch = new THREE.Mesh(keep(new THREE.BoxGeometry(3, 1.5, 44)), branchMat);
    branch.position.set(0, 0.8, -32);
    g.add(branch);
    // 立て看板(レア度の文字)
    const tex = keep(makeLabelTexture(THREE, p.tier, { size: 256, font: "900 150px 'Hiragino Mincho ProN', 'Yu Mincho', serif", color: "#ffffff", glow: hex(color) }));
    const signMat = glowMat(color, 0.6);
    signMat.map = tex;
    const sign = new THREE.Mesh(keep(new THREE.PlaneGeometry(48, 48)), signMat);
    sign.position.set(0, 30, 34);
    sign.rotation.y = Math.PI;
    g.add(sign);
    const pillarMat = glowMat(color, 0);
    const pillar = new THREE.Mesh(keep(new THREE.CylinderGeometry(14, 18, 600, 24, 1, true)), pillarMat);
    pillar.position.y = 300;
    g.add(pillar);
    g.position.set(X(p.x), P.PORT_H, Z(p.y));
    chamber.add(g);
    return { g, ringMat, branchMat, signMat, pillarMat, color, lit: 0, win: 0 };
  });
  // 盤からポートの部屋へ降りる道(光るレール)
  {
    const pts = [];
    for (let s = 0; s <= 1; s += 0.05) {
      const y = P.DRAIN.y + (955 - P.DRAIN.y) * s;
      const h = P.PORT_H * (s < 0.35 ? (s / 0.35) * 0.35 : Math.min(1, s * 1.05));
      pts.push(new THREE.Vector3(X(P.CX), h + 1, Z(y)));
    }
    const descend = new THREE.Mesh(keep(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 30, 1.4, 6, false)), busMat);
    chamber.add(descend);
  }

  // ---- 背景(星と、遠くの格子の海) ----
  {
    const n = 900;
    const pos = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      const r = 1600 + Math.random() * 1600;
      const th = Math.random() * Math.PI * 2;
      const ph = Math.random() * Math.PI * 0.5;
      pos[i * 3] = Math.cos(th) * Math.cos(ph) * r;
      pos[i * 3 + 1] = Math.sin(ph) * r - 200;
      pos[i * 3 + 2] = Math.sin(th) * Math.cos(ph) * r;
    }
    const geo = keep(new THREE.BufferGeometry());
    geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    scene.add(new THREE.Points(geo, keep(new THREE.PointsMaterial({ color: 0x8fb4ff, size: 2.2, sizeAttenuation: false, fog: false }))));
    const sea = new THREE.GridHelper(6000, 120, 0xff3df0, 0x3a1a8a);
    sea.position.y = -260;
    keep(sea.geometry);
    keep(sea.material);
    scene.add(sea);
  }

  // ---- 玉(銀)・光・尾 ----
  const ball = new THREE.Mesh(keep(new THREE.SphereGeometry(P.R, 32, 24)), keep(new THREE.MeshStandardMaterial({ color: 0xdfe8ff, metalness: 1, roughness: 0.14, envMap: envTex, envMapIntensity: 1.1 })));
  scene.add(ball);
  // 玉の光は玉から離して置く(近すぎると玉の照り返しが強すぎて、にじみの計算があふれて画面が黒くなった)
  const ballLight = new THREE.PointLight(0x7fe9ff, 5000, 320, 2);
  scene.add(ballLight);
  const haloTex = keep(makeHaloTexture(THREE));
  const halo = new THREE.Sprite(keep(new THREE.SpriteMaterial({ map: haloTex, color: 0x9ff4ff, transparent: true, opacity: 0.55, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false })));
  halo.scale.set(30, 30, 1);
  scene.add(halo);
  const TRAIL = 36;
  const trailPos = new Float32Array(TRAIL * 3);
  const trailCol = new Float32Array(TRAIL * 3);
  const trailGeo = keep(new THREE.BufferGeometry());
  trailGeo.setAttribute("position", new THREE.BufferAttribute(trailPos, 3));
  trailGeo.setAttribute("color", new THREE.BufferAttribute(trailCol, 3));
  const trail = new THREE.Line(trailGeo, keep(new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false })));
  trail.frustumCulled = false;
  scene.add(trail);
  let trailReady = false;

  // ---- 火花 ----
  const SPARKS = 360;
  const spPos = new Float32Array(SPARKS * 3);
  const spCol = new Float32Array(SPARKS * 3);
  const spVel = new Float32Array(SPARKS * 3);
  const spLife = new Float32Array(SPARKS);
  const spGeo = keep(new THREE.BufferGeometry());
  spGeo.setAttribute("position", new THREE.BufferAttribute(spPos, 3));
  spGeo.setAttribute("color", new THREE.BufferAttribute(spCol, 3));
  const sparks = new THREE.Points(spGeo, keep(new THREE.PointsMaterial({ size: 4.5, vertexColors: true, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false, map: haloTex })));
  sparks.frustumCulled = false;
  scene.add(sparks);
  let spNext = 0;
  function burst(pos, color, n, speed) {
    const c = new THREE.Color(color);
    for (let i = 0; i < n; i++) {
      const k = spNext;
      spNext = (spNext + 1) % SPARKS;
      spPos[k * 3] = pos.x;
      spPos[k * 3 + 1] = pos.y;
      spPos[k * 3 + 2] = pos.z;
      const th = Math.random() * Math.PI * 2;
      const up = Math.random();
      const sp = (speed || 260) * (0.4 + Math.random() * 0.6);
      spVel[k * 3] = Math.cos(th) * sp * (1 - up * 0.5);
      spVel[k * 3 + 1] = up * sp;
      spVel[k * 3 + 2] = Math.sin(th) * sp * (1 - up * 0.5);
      spLife[k] = 0.5 + Math.random() * 0.4;
      spCol[k * 3] = c.r;
      spCol[k * 3 + 1] = c.g;
      spCol[k * 3 + 2] = c.b;
    }
  }

  // ---- 後処理(光のにじみ) ----
  let composer = null;
  let bloomPass = null;
  function setupBloom() {
    if (!o.bloom || !lib.EffectComposer) return;
    composer = new lib.EffectComposer(renderer);
    composer.addPass(new lib.RenderPass(scene, camera));
    bloomPass = new lib.UnrealBloomPass(new THREE.Vector2(256, 256), 0.6, 0.35, 0.62);
    composer.addPass(bloomPass);
    composer.addPass(new lib.OutputPass());
  }
  setupBloom();

  // ---- カメラ ----
  const cam = {
    mode: "overview",
    blend: 0, // overview → chase の混ぜ具合
    yaw: -Math.PI / 2, // 玉の進む向き(盤面の上の角度。なめらかに追う)
    pitch: 0, // レールの上り下り
    heading: new THREE.Vector3(0, 0, -1),
    pos: new THREE.Vector3(),
    look: new THREE.Vector3(),
    shake: 0,
    portAt: null,
  };
  let width = 1;
  let height = 1;
  function overviewPose() {
    // 盤面全体(と手前のポート)が入る距離
    const aspect = width / height;
    const fov = (camera.fov * Math.PI) / 180;
    const needW = P.W + 40;
    const needH = P.H + 220;
    const distW = needW / 2 / (Math.tan(fov / 2) * aspect);
    const distH = needH / 2 / Math.tan(fov / 2);
    const d = Math.max(distW, distH * 0.82);
    const target = new THREE.Vector3(X(P.CX + 8), 0, Z(500));
    const dir = new THREE.Vector3(0, 0.88, 0.48).normalize();
    return { pos: target.clone().addScaledVector(dir, d), look: target };
  }

  function resize(w, h) {
    width = Math.max(1, w);
    height = Math.max(1, h);
    renderer.setSize(width, height, false);
    camera.aspect = width / height;
    // 縦長の画面では横が狭くなるので、縦の画角を広げる
    camera.fov = camera.aspect < 0.8 ? 74 : 62;
    camera.updateProjectionMatrix();
    if (composer) {
      composer.setSize(width, height);
      composer.setPixelRatio(pixelRatio);
    }
  }

  // ---- 出来事 → 見た目 ----
  let routeLit = false;
  let finaleK = 0; // 結界が開いた後の暗さ
  function ballVec(g) {
    return new THREE.Vector3(X(g.ball.x), P.R + g.ball.h, Z(g.ball.y));
  }
  function onEvent(e, g) {
    const bp = ballVec(g);
    switch (e.type) {
      case "launch":
        burst(bp, CYAN, 30, 200);
        break;
      case "bumper":
        bumpers[e.id].flash = 1;
        burst(bp, MAGENTA, 26, 320);
        cam.shake = Math.max(cam.shake, 5);
        break;
      case "sling":
        slingBars[e.id].flash = 1;
        burst(bp, MAGENTA, 14, 240);
        break;
      case "drop":
        burst(bp, AMBER, 22, 280);
        break;
      case "dropAll":
        drops.forEach((d) => burst(d.m.position, AMBER, 20, 300));
        cam.shake = Math.max(cam.shake, 7);
        break;
      case "lane":
        laneLights[e.id].on = true;
        laneLights[e.id].flash = 1;
        break;
      case "laneAll":
        laneLights.forEach((l) => {
          l.flash = 1.6;
          burst(l.m.position, AMBER, 18, 220);
        });
        setTimeout(() => laneLights.forEach((l) => (l.on = false)), 900);
        break;
      case "spinner":
        spinnerSpeed = Math.min(60, 8 + e.speed / 40);
        break;
      case "laser":
        lasers[e.side === "left" ? 0 : 1].flash = 1;
        break;
      case "magnet":
        magnetOn = 1;
        break;
      case "magnetRelease":
        burst(bp, 0x6fa0ff, 34, 360);
        cam.shake = Math.max(cam.shake, 6);
        break;
      case "portalIn":
        portalFlash = 1;
        burst(bp, MAGENTA, 30, 260);
        break;
      case "portalOut":
        burst(bp, MAGENTA, 30, 260);
        break;
      case "rampIn":
        burst(bp, CYAN, 16, 200);
        break;
      case "rampOut":
        burst(bp, CYAN, 20, 240);
        break;
      case "save":
        burst(bp, LIME, 24, 300);
        break;
      case "finale":
        burst(barrier.position, LIME, 40, 300);
        break;
      case "drain":
        routeLit = true;
        break;
      case "port": {
        const p = ports[e.i];
        p.win = 1;
        burst(new THREE.Vector3(X(P.PORTS[e.i].x), P.PORT_H + 6, Z(P.PORT_Y)), p.color, 90, 420);
        cam.shake = Math.max(cam.shake, 8);
        break;
      }
      default:
    }
  }

  // ---- 毎フレーム ----
  const tmp = new THREE.Vector3();
  let time = 0;
  function render(g, dt) {
    time += dt;
    const b = g.ball;
    const bp = ballVec(g);
    ball.position.copy(bp);
    ball.visible = b.mode !== "gone" || g.phase !== "port" || time - (cam.portAt || time) < 0.3;
    ballLight.position.copy(bp).add(tmp.set(0, 46, 0));
    halo.position.copy(bp);
    ball.rotation.x += dt * Math.hypot(b.vx, b.vy) * 0.02;

    // 尾
    if (!trailReady) {
      for (let i = 0; i < TRAIL; i++) trailPos.set([bp.x, bp.y, bp.z], i * 3);
      trailReady = true;
    }
    trailPos.copyWithin(3, 0, (TRAIL - 1) * 3);
    trailPos.set([bp.x, bp.y, bp.z], 0);
    for (let i = 0; i < TRAIL; i++) {
      const k = 1 - i / TRAIL;
      trailCol.set([0.3 * k, 0.9 * k, 1.0 * k], i * 3);
    }
    trailGeo.attributes.position.needsUpdate = true;
    trailGeo.attributes.color.needsUpdate = true;

    // フリッパー
    g.flippers.forEach((f, i) => {
      flippers[i].rotation.y = f.side === "left" ? -f.a : Math.PI + f.a;
    });
    // 蓋・結界
    gate.visible = g.shapes.find((s) => s.kind === "gate").active;
    const fin = g.phase !== "play" && g.phase !== "ready";
    finaleK += ((fin ? 1 : 0) - finaleK) * Math.min(1, dt * 3);
    barrier.visible = finaleK < 0.98;
    barrierMat.opacity = (0.55 + 0.25 * Math.sin(time * 10)) * (1 - finaleK);
    barrier.scale.y = 1 - finaleK;

    // バンパー・スリング
    for (const bm of bumpers) {
      bm.flash = Math.max(0, bm.flash - dt * 4);
      const s = 1 + bm.flash * 0.18;
      bm.ring.scale.set(s, s, s);
      bm.ringMat.opacity = (0.55 + 0.45 * bm.flash) * (1 - finaleK * 0.7);
      bm.capMat.opacity = 0.25 + bm.flash * 0.75;
    }
    for (const sl of slingBars) {
      sl.flash = Math.max(0, sl.flash - dt * 5);
      sl.strip.material.opacity = 0.45 + sl.flash * 0.55;
    }
    // ドロップターゲット
    drops.forEach((d, i) => {
      const goal = g.drops[i] ? 9 : -12;
      d.y += (goal - d.y) * Math.min(1, dt * 14);
      d.m.position.y = d.y;
    });
    // レーンの文字
    for (const l of laneLights) {
      l.flash = Math.max(0, l.flash - dt * 2);
      l.mat.opacity = (l.on ? 0.95 : 0.22) + l.flash * 0.5;
    }
    // スピナー
    spinner.rotation.x += spinnerSpeed * dt;
    spinnerSpeed *= Math.pow(0.25, dt);
    // 磁力
    magnetOn = b.mode === "hold" ? 1 : Math.max(0, magnetOn - dt * 2);
    magInner.rotation.z += dt * (1.5 + magnetOn * 12);
    magRingMat.opacity = 0.5 + 0.5 * magnetOn + 0.15 * Math.sin(time * 4);
    magBeamMat.opacity = magnetOn * 0.35;
    // ワープ
    portalFlash = Math.max(0, portalFlash - dt * 1.5);
    swirl.rotation.z -= dt * (3 + portalFlash * 10);
    portalRingMat.opacity = 0.6 + 0.4 * Math.max(portalFlash, 0.5 + 0.5 * Math.sin(time * 5));
    tunnelTex.offset.x -= dt * 1.6;
    // レーザー
    for (const l of lasers) {
      l.flash = Math.max(0, l.flash - dt * 3);
      l.mat.opacity = l.flash * 0.8;
    }
    // ポート
    ports.forEach((p, i) => {
      const onRoute = routeLit && g.target === i;
      p.lit += ((onRoute ? 1 : 0) - p.lit) * Math.min(1, dt * 4);
      p.win = Math.max(0, p.win - dt * 0.25);
      const pulse = 0.5 + 0.5 * Math.sin(time * 8);
      p.ringMat.opacity = 0.45 + 0.55 * Math.max(p.lit * pulse, p.win > 0 ? 1 : 0);
      p.branchMat.opacity = 0.25 + 0.75 * p.lit;
      p.signMat.opacity = 0.5 + 0.5 * Math.max(p.lit, p.win > 0 ? 1 : 0);
      p.pillarMat.opacity = p.win > 0 ? Math.min(1, p.win * 1.5) * 0.5 : 0;
    });

    // 火花
    for (let k = 0; k < SPARKS; k++) {
      if (spLife[k] <= 0) continue;
      spLife[k] -= dt;
      spVel[k * 3 + 1] -= 500 * dt;
      spPos[k * 3] += spVel[k * 3] * dt;
      spPos[k * 3 + 1] += spVel[k * 3 + 1] * dt;
      spPos[k * 3 + 2] += spVel[k * 3 + 2] * dt;
      if (spLife[k] <= 0) spPos[k * 3 + 1] = -9999;
    }
    spGeo.attributes.position.needsUpdate = true;

    updateCamera(g, dt, bp);
    if (composer) composer.render(dt);
    else renderer.render(scene, camera);
  }

  // three の座標の点を、盤面の壁の内側へ寄せる(天辺は弧の内側)
  function keepInside(v) {
    let x = v.x + 240;
    let y = v.z + 440;
    x = Math.max(34, Math.min(P.LANE.outer - 12, x));
    y = Math.min(P.H - 10, y);
    if (y < P.ARC.cy) {
      const dx = x - P.ARC.cx;
      const dy = y - P.ARC.cy;
      const d = Math.hypot(dx, dy);
      const lim = P.ARC.r - 16;
      if (d > lim) {
        x = P.ARC.cx + (dx / d) * lim;
        y = P.ARC.cy + (dy / d) * lim;
      }
    }
    v.x = x - 240;
    v.z = y - 440;
  }

  function updateCamera(g, dt, bp) {
    const b = g.ball;
    const ov = overviewPose();
    if (g.phase === "ready" || o.reducedMotion) {
      cam.blend = g.phase === "ready" ? 0 : cam.blend;
      cam.pos.copy(ov.pos);
      cam.look.copy(ov.look);
      if (o.reducedMotion && g.phase === "port") {
        // 締めはポートの真上へ寄る(動きを減らす設定でも結果は大きく見せる)
        const pp = P.PORTS[g.target];
        cam.pos.lerp(new THREE.Vector3(X(pp.x), P.PORT_H + 220, Z(pp.y) + 160), 0.6);
        cam.look.set(X(pp.x), P.PORT_H, Z(pp.y));
      }
    } else {
      cam.blend = Math.min(1, cam.blend + dt / 0.9);
      // 進む向き(レールの上ではレールの向き)
      const dir = tmp;
      if (b.mode === "rail" && g.rail) {
        const p = P.railAt(g.rail.rail, g.rail.s + 20);
        dir.set(p.dx, Math.max(-0.6, Math.min(0.6, p.dh)), p.dy);
      } else if (b.mode === "hold") {
        dir.copy(cam.heading);
      } else {
        dir.set(b.vx, 0, b.vy);
      }
      const sp = Math.hypot(dir.x, dir.z);
      if (sp > (b.mode === "table" ? 120 : 0.01)) {
        // 向きは角度で追う。跳ね返って真逆を向いた時も、ぐるりと回って追いつく
        // (ベクトルを混ぜると途中で長さが 0 になって、カメラが飛んだ)。回る速さに上限
        const want = Math.atan2(dir.z, dir.x);
        let d = want - cam.yaw;
        d = Math.atan2(Math.sin(d), Math.cos(d));
        const rate = b.mode === "rail" ? 7 : 3.6;
        const step = d * Math.min(1, dt * rate);
        const maxStep = (b.mode === "rail" ? 6 : 4.2) * dt;
        cam.yaw += Math.max(-maxStep, Math.min(maxStep, step));
      }
      const wantPitch = b.mode === "rail" ? Math.max(-0.6, Math.min(0.6, dir.y)) : 0;
      cam.pitch += (wantPitch - cam.pitch) * Math.min(1, dt * 5);
      cam.heading.set(Math.cos(cam.yaw), cam.pitch, Math.sin(cam.yaw)).normalize();
      const hd = cam.heading;
      const flat = new THREE.Vector3(hd.x, 0, hd.z);
      if (flat.lengthSq() < 1e-6) flat.set(0, 0, -1);
      flat.normalize();
      // 玉の少し後ろの上から、玉の先の盤面を見下ろす(水平に見ると画面の半分が空になる)
      let back = 78;
      let up = 62;
      let ahead = 95;
      if (g.phase === "route" || g.phase === "port") {
        back = 64;
        up = 52;
        ahead = 80;
      }
      let chasePos = bp.clone().addScaledVector(flat, -back);
      chasePos.y = bp.y + up;
      if (b.mode === "rail" && g.rail) {
        // レールの上では、レールを少し戻った所から追う(真後ろに引くと、曲がった
        // トンネルの外や坂の下に出てしまう)。トンネルの中は低く、筒の中から見る
        const kind = g.rail.kind;
        const lag = kind === "tunnel" ? 46 : kind === "ramp" ? 62 : 58;
        const lift = kind === "tunnel" ? 5 : kind === "ramp" ? 30 : 44;
        const q = P.railAt(g.rail.rail, Math.max(0, g.rail.s - lag));
        const railPos = new THREE.Vector3(X(q.x), P.R + q.h + lift, Z(q.y));
        // 走り始め(まだ戻る道のりが無い)は、盤面の時の位置からなじませる
        const k = Math.min(1, g.rail.s / lag);
        chasePos = chasePos.lerp(railPos, k);
      }
      // 盤面の上では、カメラを壁の内側に置く(壁の外から見ると、壁しか映らない)
      if (b.mode === "table" || b.mode === "hold") keepInside(chasePos);
      const chaseLook = bp.clone().addScaledVector(flat, ahead);
      chaseLook.y = b.mode === "rail" ? bp.y + hd.y * ahead - (g.rail && g.rail.kind === "tunnel" ? 0 : 10) : 0;
      if (g.phase === "port") {
        // 締め: ポートの上へ上がって、光る穴とレア度の文字を見せる
        if (cam.portAt == null) cam.portAt = time;
        const u = Math.min(1, (time - cam.portAt) / 1.4);
        const e = u * u * (3 - 2 * u);
        const pp = P.PORTS[g.target];
        const top = new THREE.Vector3(X(pp.x), P.PORT_H + 150, Z(pp.y) - 110);
        const look = new THREE.Vector3(X(pp.x), P.PORT_H + 18, Z(pp.y) + 20);
        cam.pos.lerp(top, Math.min(1, dt * 3) * e + (1 - e) * 0.0);
        cam.look.lerp(look, Math.min(1, dt * 3));
      } else {
        const k = cam.blend < 1 ? cam.blend * cam.blend * (3 - 2 * cam.blend) : 1;
        const targetPos = ov.pos.clone().lerp(chasePos, k);
        const targetLook = ov.look.clone().lerp(chaseLook, k);
        const follow = Math.min(1, dt * (cam.blend < 1 ? 8 : 9));
        cam.pos.lerp(targetPos, cam.blend < 1 ? 1 : follow);
        cam.look.lerp(targetLook, cam.blend < 1 ? 1 : follow);
        // 壁の外や床の下にカメラが入らない(盤面の上では床より上)
        if (b.mode === "table") cam.pos.y = Math.max(cam.pos.y, 24);
      }
    }
    camera.position.copy(cam.pos);
    if (cam.shake > 0 && !o.reducedMotion) {
      camera.position.x += (Math.random() - 0.5) * cam.shake;
      camera.position.y += (Math.random() - 0.5) * cam.shake;
      cam.shake = Math.max(0, cam.shake - dt * 30);
    }
    camera.lookAt(cam.look);
  }

  // 遅い端末: にじみを止めて、解像度を下げる
  function degrade() {
    if (composer) {
      composer.dispose && composer.dispose();
      composer = null;
    }
    pixelRatio = Math.max(1, pixelRatio * 0.66);
    renderer.setPixelRatio(pixelRatio);
    resize(width, height);
  }

  function dispose() {
    for (const d of disposables) d.dispose && d.dispose();
    envTex.dispose();
    if (composer && composer.dispose) composer.dispose();
    renderer.dispose();
    renderer.forceContextLoss && renderer.forceContextLoss();
  }

  return { render, resize, onEvent, degrade, dispose, renderer, camera, scene, get bloom() {
    return !!composer;
  } };
}

// ---- 模様(canvas で作る) ----
function hex(c) {
  return "#" + c.toString(16).padStart(6, "0");
}

function makeFloorTexture(THREE) {
  const s = 2;
  const c = document.createElement("canvas");
  c.width = P.W * s;
  c.height = P.H * s;
  const g = c.getContext("2d");
  g.scale(s, s);
  const grad = g.createLinearGradient(0, 0, 0, P.H);
  grad.addColorStop(0, "#0b0820");
  grad.addColorStop(0.6, "#070617");
  grad.addColorStop(1, "#120626");
  g.fillStyle = grad;
  g.fillRect(0, 0, P.W, P.H);
  // 格子
  g.strokeStyle = "rgba(56,232,255,0.13)";
  g.lineWidth = 1;
  for (let x = 0; x <= P.W; x += 30) {
    g.beginPath();
    g.moveTo(x, 0);
    g.lineTo(x, P.H);
    g.stroke();
  }
  for (let y = 0; y <= P.H; y += 30) {
    g.beginPath();
    g.moveTo(0, y);
    g.lineTo(P.W, y);
    g.stroke();
  }
  // 回路の線
  let seed = 7;
  const rnd = () => {
    seed = (seed * 16807) % 2147483647;
    return seed / 2147483647;
  };
  g.lineWidth = 1.6;
  for (let i = 0; i < 46; i++) {
    let x = 30 + Math.floor(rnd() * 14) * 30;
    let y = 60 + Math.floor(rnd() * 26) * 30;
    g.strokeStyle = rnd() < 0.5 ? "rgba(255,61,240,0.35)" : "rgba(56,232,255,0.32)";
    g.beginPath();
    g.moveTo(x, y);
    for (let k = 0; k < 4; k++) {
      if (rnd() < 0.5) x += (rnd() < 0.5 ? -1 : 1) * 30 * (1 + Math.floor(rnd() * 3));
      else y += (rnd() < 0.5 ? -1 : 1) * 30 * (1 + Math.floor(rnd() * 3));
      g.lineTo(x, y);
    }
    g.stroke();
    g.fillStyle = g.strokeStyle;
    g.beginPath();
    g.arc(x, y, 2.6, 0, Math.PI * 2);
    g.fill();
  }
  // 真ん中の紋と文字
  g.save();
  g.translate(P.CX, 600);
  g.strokeStyle = "rgba(56,232,255,0.35)";
  g.lineWidth = 2;
  for (const r of [70, 54]) {
    g.beginPath();
    g.arc(0, 0, r, 0, Math.PI * 2);
    g.stroke();
  }
  g.fillStyle = "rgba(255,255,255,0.10)";
  g.font = "900 40px 'Hiragino Mincho ProN', 'Yu Mincho', serif";
  g.textAlign = "center";
  g.textBaseline = "middle";
  g.fillText("神", 0, 0);
  g.restore();
  g.fillStyle = "rgba(56,232,255,0.4)";
  g.font = "700 13px 'IBM Plex Mono', monospace";
  g.textAlign = "center";
  g.fillText("DEBUG SHRINE // CYBER PINBALL", P.CX, 708);
  // ランプ・ワープへの矢印
  const arrow = (x, y, ang, col) => {
    g.save();
    g.translate(x, y);
    g.rotate(ang);
    g.fillStyle = col;
    for (let k = 0; k < 3; k++) {
      g.globalAlpha = 0.25 + k * 0.2;
      g.beginPath();
      g.moveTo(-8, k * 16 + 8);
      g.lineTo(0, k * 16);
      g.lineTo(8, k * 16 + 8);
      g.lineTo(8, k * 16 + 13);
      g.lineTo(0, k * 16 + 5);
      g.lineTo(-8, k * 16 + 13);
      g.closePath();
      g.fill();
    }
    g.restore();
    g.globalAlpha = 1;
  };
  arrow(62, 500, -0.05, "#38e8ff");
  arrow(385, 470, 0, "#ff3df0");
  arrow(P.CX, 515, 0, "#6fa0ff");
  // シュートの縁
  g.fillStyle = "rgba(140,255,90,0.25)";
  g.fillRect(P.CHUTE.x0, 840, P.CHUTE.x1 - P.CHUTE.x0, 3);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  return tex;
}

function makeChamberTexture(THREE) {
  const c = document.createElement("canvas");
  c.width = 512;
  c.height = 280;
  const g = c.getContext("2d");
  g.fillStyle = "#06061a";
  g.fillRect(0, 0, c.width, c.height);
  g.strokeStyle = "rgba(42,108,255,0.35)";
  for (let x = 0; x <= c.width; x += 16) {
    g.beginPath();
    g.moveTo(x, 0);
    g.lineTo(x, c.height);
    g.stroke();
  }
  for (let y = 0; y <= c.height; y += 16) {
    g.beginPath();
    g.moveTo(0, y);
    g.lineTo(c.width, y);
    g.stroke();
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function makeLabelTexture(THREE, text, o) {
  const c = document.createElement("canvas");
  c.width = o.size;
  c.height = o.size;
  const g = c.getContext("2d");
  g.textAlign = "center";
  g.textBaseline = "middle";
  g.font = o.font;
  if (o.glow) {
    g.shadowColor = o.glow;
    g.shadowBlur = o.size * 0.08;
  }
  g.fillStyle = o.color;
  g.fillText(text, o.size / 2, o.size / 2 + o.size * 0.04);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function makeSwirlTexture(THREE) {
  const c = document.createElement("canvas");
  c.width = 128;
  c.height = 128;
  const g = c.getContext("2d");
  g.translate(64, 64);
  for (let i = 0; i < 6; i++) {
    g.rotate((Math.PI * 2) / 6);
    const grad = g.createLinearGradient(0, 0, 60, 0);
    grad.addColorStop(0, "rgba(255,61,240,0.9)");
    grad.addColorStop(1, "rgba(80,40,255,0)");
    g.strokeStyle = grad;
    g.lineWidth = 6;
    g.beginPath();
    g.arc(30, 0, 30, Math.PI, Math.PI * 1.8);
    g.stroke();
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function makeTunnelTexture(THREE) {
  const c = document.createElement("canvas");
  c.width = 128;
  c.height = 64;
  const g = c.getContext("2d");
  g.fillStyle = "#12063a";
  g.fillRect(0, 0, 128, 64);
  // 流れていく光の輪(マゼンタ)と、細い輪(シアン)、筒に沿った線
  g.fillStyle = "rgba(255,61,240,1)";
  g.fillRect(0, 0, 10, 64);
  g.fillStyle = "rgba(56,232,255,0.85)";
  g.fillRect(42, 0, 3, 64);
  g.fillRect(86, 0, 3, 64);
  g.fillStyle = "rgba(56,232,255,0.5)";
  for (let y = 0; y < 64; y += 8) g.fillRect(0, y, 128, 1.5);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function makeHaloTexture(THREE) {
  const c = document.createElement("canvas");
  c.width = 64;
  c.height = 64;
  const g = c.getContext("2d");
  const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grad.addColorStop(0, "rgba(255,255,255,1)");
  grad.addColorStop(0.25, "rgba(255,255,255,0.45)");
  grad.addColorStop(1, "rgba(255,255,255,0)");
  g.fillStyle = grad;
  g.fillRect(0, 0, 64, 64);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

module.exports = { createView, TIER_COLORS };
