// おみくじ演出「弾き玉」(3D)の見た目(three.js)。ルールと物理は omikujiSlingshot.js。
//
// createView(lib, canvas, opts) で組み、毎フレーム render(g, dt, ui) を呼ぶ。
// lib: { THREE, RoomEnvironment }(OmikujiSlingshot.vue がこの演出の時だけ読み込む)。
// ui: { reveal: { u, flip, tier } | null } — 結果の木札の見せ方(画面の側が進める)
//
// 場面: 秋の夕方の神社の境内。手前に Y 字の台、奥に木札と絵馬を積んだ朱の櫓、その奥に鳥居。
// カメラ: aim(台の後ろから櫓を見る)→ flight(玉の後ろについて飛ぶ)→ impact(横から引いて崩れを見る)
//        → reveal(浮き上がった木札の正面)
//        外れた時は flight → miss(落ちて転がる玉を追う)→ reveal(割れた玉から出た木札の正面)

const S = require("./omikujiSlingshot");

const {
  TIER_COLORS,
  canvasTex,
  makeSkyTexture,
  makeGroundTexture,
  makePathTexture,
  makeWoodTexture,
  makeLeafTexture,
  makeSoftTexture,
} = require("./shrineTextures");

function createView(lib, canvas, opts) {
  const { THREE } = lib;
  const o = Object.assign({ reducedMotion: false, shadows: true }, opts || {});
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: "high-performance" });
  try {
    return build();
  } catch (e) {
    renderer.dispose();
    renderer.forceContextLoss && renderer.forceContextLoss();
    throw e;
  }

  function build() {
    let pixelRatio = Math.min(2, window.devicePixelRatio || 1);
    renderer.setPixelRatio(pixelRatio);
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.0;
    renderer.shadowMap.enabled = !!o.shadows;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    const disposables = [];
    const keep = (x) => {
      disposables.push(x);
      return x;
    };

    const scene = new THREE.Scene();
    const skyTex = keep(makeSkyTexture(THREE));
    scene.background = skyTex;
    scene.fog = new THREE.Fog(0xc8a088, 30, 95);
    const camera = new THREE.PerspectiveCamera(55, 1, 0.1, 400);

    // 映り込み(御神玉の照り)
    const pmrem = new THREE.PMREMGenerator(renderer);
    const room = new lib.RoomEnvironment(renderer);
    const envRT = pmrem.fromScene(room, 0.04);
    const envTex = envRT.texture;
    pmrem.dispose();
    if (room.dispose) room.dispose();

    // ---- 明かり(夕日) ----
    scene.add(new THREE.HemisphereLight(0xffd9b0, 0x5a4030, 0.75));
    const sun = new THREE.DirectionalLight(0xffc890, 2.2);
    sun.position.set(-14, 18, 10);
    sun.target.position.set(0, 0, S.TOWER.z + 4);
    sun.castShadow = !!o.shadows;
    sun.shadow.mapSize.set(1024, 1024);
    sun.shadow.camera.left = -14;
    sun.shadow.camera.right = 14;
    sun.shadow.camera.top = 14;
    sun.shadow.camera.bottom = -14;
    sun.shadow.camera.near = 1;
    sun.shadow.camera.far = 60;
    sun.shadow.bias = -0.0008;
    scene.add(sun);
    scene.add(sun.target);

    // ---- 地面(石畳と砂利) ----
    const groundTex = keep(makeGroundTexture(THREE));
    groundTex.wrapS = groundTex.wrapT = THREE.RepeatWrapping;
    groundTex.repeat.set(8, 8);
    groundTex.anisotropy = 8;
    const ground = new THREE.Mesh(keep(new THREE.PlaneGeometry(240, 240)), keep(new THREE.MeshStandardMaterial({ map: groundTex, roughness: 0.95, color: 0xa8a49c })));
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = true;
    scene.add(ground);
    // 参道の石畳(台から櫓へ)
    const pathTex = keep(makePathTexture(THREE));
    pathTex.wrapS = pathTex.wrapT = THREE.RepeatWrapping;
    pathTex.repeat.set(1, 10);
    const path = new THREE.Mesh(keep(new THREE.PlaneGeometry(3.4, 44)), keep(new THREE.MeshStandardMaterial({ map: pathTex, roughness: 0.85 })));
    path.rotation.x = -Math.PI / 2;
    path.position.set(0, 0.01, -14);
    path.receiveShadow = true;
    scene.add(path);

    const woodTex = keep(makeWoodTexture(THREE, "#b8854f", "#8a5a30"));
    const lightWoodTex = keep(makeWoodTexture(THREE, "#e6c9a0", "#c9a070"));
    const mat = {
      vermilion: keep(new THREE.MeshStandardMaterial({ color: 0xd8401f, roughness: 0.55 })),
      black: keep(new THREE.MeshStandardMaterial({ color: 0x1c1816, roughness: 0.6 })),
      wood: keep(new THREE.MeshStandardMaterial({ map: woodTex, roughness: 0.75 })),
      lightWood: keep(new THREE.MeshStandardMaterial({ map: lightWoodTex, roughness: 0.7 })),
      stone: keep(new THREE.MeshStandardMaterial({ color: 0x9a948a, roughness: 0.95 })),
      leafRed: keep(new THREE.MeshStandardMaterial({ color: 0xc8381c, roughness: 0.9 })),
      leafOrange: keep(new THREE.MeshStandardMaterial({ color: 0xe0802a, roughness: 0.9 })),
      leafGreen: keep(new THREE.MeshStandardMaterial({ color: 0x2f4a2a, roughness: 0.95 })),
      trunk: keep(new THREE.MeshStandardMaterial({ color: 0x4a3426, roughness: 0.95 })),
    };
    const box = (w, h, d) => keep(new THREE.BoxGeometry(w, h, d));
    const cyl = (r0, r1, h, n) => keep(new THREE.CylinderGeometry(r0, r1, h, n || 16));
    const add = (geo, m, x, y, z, shadow) => {
      const mesh = new THREE.Mesh(geo, m);
      mesh.position.set(x, y, z);
      if (shadow !== false) {
        mesh.castShadow = true;
        mesh.receiveShadow = true;
      }
      scene.add(mesh);
      return mesh;
    };

    // ---- 鳥居(櫓の奥) ----
    {
      // 柱は物理にもある(外れた玉が通り抜けない。位置は S.TORII)
      const tz = S.TORII.z;
      for (const sx of [-1, 1]) add(cyl(S.TORII.r - 0.05, S.TORII.r, S.TORII.h, 20), mat.vermilion, sx * S.TORII.x, S.TORII.h / 2, tz);
      add(box(12.5, 0.7, 1.0), mat.black, 0, 11.3, tz); // 笠木
      add(box(11.5, 0.5, 0.8), mat.vermilion, 0, 10.6, tz);
      add(box(10.6, 0.5, 0.6), mat.vermilion, 0, 8.9, tz); // 貫
      add(box(0.9, 1.6, 0.5), mat.black, 0, 9.8, tz); // 額束
    }
    // ---- 石灯籠(参道の両脇) ----
    // 手前は台の脇、奥は櫓の向こう(カメラが回り込む道と、横から引いて櫓を見る線にかからない)
    // 物理にもある(位置は S.LANTERN)
    for (const z of S.LANTERN.zs) {
      for (const sx of [-1, 1]) {
        const x = sx * S.LANTERN.x;
        add(box(0.9, 0.3, 0.9), mat.stone, x, 0.15, z);
        add(cyl(0.16, 0.2, 1.3, 10), mat.stone, x, 0.95, z);
        add(box(0.8, 0.6, 0.8), mat.stone, x, 1.9, z);
        const roof = add(keep(new THREE.ConeGeometry(0.8, 0.55, 4)), mat.stone, x, 2.45, z);
        roof.rotation.y = Math.PI / 4;
        // 灯り
        const lamp = new THREE.Mesh(box(0.4, 0.3, 0.82), keep(new THREE.MeshBasicMaterial({ color: 0xffd080 })));
        lamp.position.set(x, 1.9, z);
        scene.add(lamp);
      }
    }
    // ---- 木(紅葉と杉) ----
    {
      let seed = 3;
      const rnd = () => {
        seed = (seed * 16807) % 2147483647;
        return seed / 2147483647;
      };
      const leafGeo = keep(new THREE.IcosahedronGeometry(1, 1));
      for (let i = 0; i < 26; i++) {
        // カメラが通る所(台の後ろ・櫓の横の引きの位置・結果の木札の前)には木を置かない
        // (引きの位置が紅葉の中に入って、崩れが葉で隠れた)
        const side = i % 2 ? 1 : -1;
        const x = side * (15 + rnd() * 14);
        const z = 8 - rnd() * 50;
        const maple = rnd() < 0.6;
        add(cyl(0.18, 0.28, maple ? 2.4 : 5, 8), mat.trunk, x, maple ? 1.2 : 2.5, z, false);
        if (maple) {
          for (let k = 0; k < 4; k++) {
            const m = add(leafGeo, rnd() < 0.5 ? mat.leafRed : mat.leafOrange, x + (rnd() - 0.5) * 2, 3 + rnd() * 1.6, z + (rnd() - 0.5) * 2, false);
            m.scale.setScalar(1.1 + rnd() * 0.9);
          }
        } else {
          const c = add(keep(new THREE.ConeGeometry(1.8, 7, 8)), mat.leafGreen, x, 7, z, false);
          c.scale.setScalar(0.8 + rnd() * 0.5);
        }
      }
    }

    // ---- 舞う紅葉 ----
    const LEAVES = 160;
    const leafPos = new Float32Array(LEAVES * 3);
    const leafVel = new Float32Array(LEAVES * 3);
    for (let i = 0; i < LEAVES; i++) {
      leafPos[i * 3] = (Math.random() - 0.5) * 40;
      leafPos[i * 3 + 1] = Math.random() * 14;
      leafPos[i * 3 + 2] = 6 - Math.random() * 40;
      leafVel[i * 3] = 0.3 + Math.random() * 0.5;
      leafVel[i * 3 + 1] = -(0.4 + Math.random() * 0.5);
      leafVel[i * 3 + 2] = (Math.random() - 0.5) * 0.3;
    }
    const leafGeom = keep(new THREE.BufferGeometry());
    leafGeom.setAttribute("position", new THREE.BufferAttribute(leafPos, 3));
    const leafTex = keep(makeLeafTexture(THREE));
    const leaves = new THREE.Points(leafGeom, keep(new THREE.PointsMaterial({ map: leafTex, size: 0.2, transparent: true, alphaTest: 0.3, color: 0xffffff })));
    leaves.frustumCulled = false;
    scene.add(leaves);

    // ---- Y 字の台 ----
    const sling = new THREE.Group();
    scene.add(sling);
    const forkL = new THREE.Vector3(-0.5, 2.05, 0.05);
    const forkR = new THREE.Vector3(0.5, 2.05, 0.05);
    {
      const stem = new THREE.Mesh(cyl(0.12, 0.15, 1.3, 12), mat.wood);
      stem.position.set(0, 0.65, 0);
      const armL = new THREE.Mesh(cyl(0.09, 0.11, 1.05, 12), mat.wood);
      armL.position.set(-0.27, 1.6, 0.03);
      armL.rotation.z = 0.5;
      const armR = armL.clone();
      armR.position.x = 0.27;
      armR.rotation.z = -0.5;
      [stem, armL, armR].forEach((m) => {
        m.castShadow = true;
        sling.add(m);
      });
      // しめ縄の紙垂(飾り)
      const rope = new THREE.Mesh(keep(new THREE.TorusGeometry(0.16, 0.035, 8, 20)), keep(new THREE.MeshStandardMaterial({ color: 0xe0d0a0 })));
      rope.position.set(0, 1.22, 0);
      rope.rotation.x = Math.PI / 2;
      sling.add(rope);
    }
    // ゴム(2 本の線)
    const bandMat = keep(new THREE.LineBasicMaterial({ color: 0x5a2a1a }));
    const bandGeo = keep(new THREE.BufferGeometry());
    bandGeo.setAttribute("position", new THREE.BufferAttribute(new Float32Array(9), 3));
    const bands = new THREE.Line(bandGeo, bandMat);
    bands.frustumCulled = false;
    scene.add(bands);

    // ---- 御神玉 ----
    const ballMesh = new THREE.Mesh(
      keep(new THREE.SphereGeometry(S.BALL.r, 32, 24)),
      keep(new THREE.MeshStandardMaterial({ color: 0xd8a830, metalness: 0.9, roughness: 0.22, envMap: envTex, envMapIntensity: 1.2, emissive: 0x401800, emissiveIntensity: 0.3 }))
    );
    ballMesh.castShadow = true;
    scene.add(ballMesh);
    // 外れた玉が割れた殻(左右の半球。内側も見えるように両面)
    const shellMat = keep(ballMesh.material.clone());
    shellMat.side = THREE.DoubleSide;
    const shellGeo = keep(new THREE.SphereGeometry(S.BALL.r, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2));
    const shells = [1, -1].map((side) => {
      const m = new THREE.Mesh(shellGeo, shellMat);
      m.castShadow = true;
      m.visible = false;
      scene.add(m);
      return { m, side, v: new THREE.Vector3(), spin: 0, rest: false };
    });
    // 尾
    const TRAIL = 40;
    const trailPos = new Float32Array(TRAIL * 3);
    const trailGeo = keep(new THREE.BufferGeometry());
    trailGeo.setAttribute("position", new THREE.BufferAttribute(trailPos, 3));
    const trail = new THREE.Line(trailGeo, keep(new THREE.LineBasicMaterial({ color: 0xffe090, transparent: true, opacity: 0.8 })));
    trail.frustumCulled = false;
    trail.visible = false;
    scene.add(trail);
    let trailInit = false;

    // 予測の軌道(引き絞り中)
    const AIM_N = 26;
    const aimPos = new Float32Array(AIM_N * 3);
    const aimGeo = keep(new THREE.BufferGeometry());
    aimGeo.setAttribute("position", new THREE.BufferAttribute(aimPos, 3));
    const aimDots = new THREE.Points(aimGeo, keep(new THREE.PointsMaterial({ color: 0xffffff, size: 0.16, transparent: true, opacity: 0.85, depthWrite: false })));
    aimDots.frustumCulled = false;
    scene.add(aimDots);

    // ---- 櫓 ----
    const plaqueBackTex = keep(makePlaqueTexture(THREE, null));
    const emaTex = keep(makeEmaTexture(THREE));
    const plaqueSide = mat.lightWood;
    const plaqueBack = keep(new THREE.MeshStandardMaterial({ map: plaqueBackTex, roughness: 0.75 }));
    const emaFace = keep(new THREE.MeshStandardMaterial({ map: emaTex, roughness: 0.7 }));
    const partMeshes = S.towerLayout().map((p) => {
      const geo = box(p.half[0] * 2, p.half[1] * 2, p.half[2] * 2);
      let m;
      if (p.kind === "pillar") m = mat.vermilion;
      else if (p.kind === "beam" || p.kind === "ridge") m = mat.black;
      else if (p.kind === "plank") m = mat.wood;
      else if (p.kind === "plaque") m = [plaqueSide, plaqueSide, plaqueSide, plaqueSide, plaqueBack, plaqueBack];
      else m = [mat.wood, mat.wood, mat.wood, mat.wood, emaFace, emaFace];
      const mesh = new THREE.Mesh(geo, m);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      mesh.position.set(p.pos[0], p.pos[1], p.pos[2]);
      scene.add(mesh);
      return mesh;
    });
    // 櫓の上のしめ縄(飾り。崩れたら消す)
    const shimenawa = add(keep(new THREE.TorusGeometry(1.7, 0.08, 8, 40, Math.PI)), keep(new THREE.MeshStandardMaterial({ color: 0xe8d8a8 })), 0, 4.6, S.TOWER.z + S.TOWER.halfD + 0.05, false);
    shimenawa.rotation.z = Math.PI;

    // ---- 粉塵と木っ端 ----
    const DUST = 240;
    const dPos = new Float32Array(DUST * 3);
    const dVel = new Float32Array(DUST * 3);
    const dLife = new Float32Array(DUST);
    const dGeo = keep(new THREE.BufferGeometry());
    dGeo.setAttribute("position", new THREE.BufferAttribute(dPos, 3));
    const dustTex = keep(makeSoftTexture(THREE));
    const dust = new THREE.Points(dGeo, keep(new THREE.PointsMaterial({ map: dustTex, color: 0xe8d0b0, size: 0.5, transparent: true, opacity: 0.7, depthWrite: false })));
    dust.frustumCulled = false;
    scene.add(dust);
    let dNext = 0;
    function puff(p, n, speed) {
      for (let i = 0; i < n; i++) {
        const k = dNext;
        dNext = (dNext + 1) % DUST;
        dPos.set([p.x, p.y, p.z], k * 3);
        const th = Math.random() * Math.PI * 2;
        const sp = speed * (0.3 + Math.random() * 0.7);
        dVel.set([Math.cos(th) * sp, Math.random() * sp * 0.8, Math.sin(th) * sp], k * 3);
        dLife[k] = 0.8 + Math.random() * 0.8;
      }
    }

    // ---- 結果の木札(表のレア度) ----
    // 結果の木札の後ろの光の輪(細く。太いと白い円盤になって場面が隠れた)
    const revealGlow = new THREE.Mesh(keep(new THREE.RingGeometry(1.08, 1.2, 64)), keep(new THREE.MeshBasicMaterial({ color: 0xffe9a0, transparent: true, opacity: 0, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending })));
    scene.add(revealGlow);
    const SPARK = 120;
    const spPos = new Float32Array(SPARK * 3);
    const spVel = new Float32Array(SPARK * 3);
    const spLife = new Float32Array(SPARK);
    const spGeo = keep(new THREE.BufferGeometry());
    spGeo.setAttribute("position", new THREE.BufferAttribute(spPos, 3));
    const sparks = new THREE.Points(spGeo, keep(new THREE.PointsMaterial({ map: dustTex, color: 0xffe080, size: 0.22, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending })));
    sparks.frustumCulled = false;
    scene.add(sparks);
    let spNext = 0;
    let tierFace = null;
    let tierShown = null;

    // ---- カメラ ----
    const cam = { pos: new THREE.Vector3(), look: new THREE.Vector3(), shake: 0, mode: "aim", wideAt: null };
    const AIM_POS = new THREE.Vector3(0.9, 2.7, 4.6);
    const AIM_LOOK = new THREE.Vector3(0, 2.2, S.TOWER.z);
    const WIDE_POS = new THREE.Vector3(8.2, 3.9, S.TOWER.z + 8.5);
    const WIDE_LOOK = new THREE.Vector3(0, 1.6, S.TOWER.z - 0.5);
    cam.pos.copy(AIM_POS);
    cam.look.copy(AIM_LOOK);
    let width = 1;
    let height = 1;
    function resize(w, h) {
      width = Math.max(1, w);
      height = Math.max(1, h);
      renderer.setSize(width, height, false);
      camera.aspect = width / height;
      camera.fov = camera.aspect < 0.8 ? 68 : 55;
      camera.updateProjectionMatrix();
    }

    // ---- 出来事 ----
    let time = 0;
    function onEvent(e, g) {
      const b = g.ball.position;
      if (e.type === "launch") {
        trail.visible = true;
        trailInit = false;
        aimDots.visible = false;
      } else if (e.type === "impact") {
        puff({ x: b.x, y: b.y, z: b.z }, 70, 5);
        cam.shake = 0.35;
        shimenawa.visible = false;
      } else if (e.type === "break") {
        // 外れた玉が割れる: 殻が左右へ飛び、光の粒と土煙
        for (const sh of shells) {
          sh.m.visible = true;
          sh.m.position.set(e.x, e.y, e.z);
          sh.m.rotation.set(0, 0, -sh.side * Math.PI / 2); // 丸い側を外へ向ける
          sh.v.set(sh.side * (1.4 + Math.random() * 0.4), 2.4, 0.6);
          sh.spin = sh.side * 5;
          sh.rest = false;
        }
        puff({ x: e.x, y: e.y, z: e.z }, 40, 2.2);
        burst({ x: e.x, y: e.y + 0.1, z: e.z }, 60, 1.6);
        cam.shake = 0.15;
      } else if (e.type === "reveal" && e.id != null) {
        const p = g.parts[e.id];
        puff({ x: p.body.position.x, y: p.body.position.y, z: p.body.position.z }, 30, 2);
      }
    }

    // ---- 毎フレーム ----
    const tmp = new THREE.Vector3();
    function render(g, dt, ui) {
      time += dt;
      // 部品を物理に合わせる(結果の木札は画面の側が動かす)
      g.parts.forEach((p, i) => {
        if (g.chosen && g.chosen.id === p.id && ui && ui.reveal) return;
        const m = partMeshes[i];
        m.position.copy(p.body.position);
        m.quaternion.copy(p.body.quaternion);
      });
      ballMesh.position.copy(g.ball.position);
      ballMesh.quaternion.copy(g.ball.quaternion);
      ballMesh.visible = !g.broke; // 外れて割れたら殻に替わる
      for (const sh of shells) {
        if (!sh.m.visible || sh.rest) continue;
        sh.v.y -= 9.8 * dt;
        sh.m.position.addScaledVector(sh.v, dt);
        sh.m.rotation.z += sh.spin * dt;
        // 横倒しの半球は、縁が地面に着く高さ(玉の半径)で止める(めり込まない)
        if (sh.m.position.y < S.BALL.r) {
          sh.m.position.y = S.BALL.r;
          sh.rest = true;
        }
      }

      // ゴム
      const bp = g.phase === "aim" ? g.ball.position : new THREE.Vector3(0, S.SLING.y, 0.05);
      const arr = bandGeo.attributes.position.array;
      arr.set([forkL.x, forkL.y, forkL.z, bp.x, bp.y, bp.z, forkR.x, forkR.y, forkR.z]);
      bandGeo.attributes.position.needsUpdate = true;

      // 予測の軌道
      if (g.phase === "aim") {
        aimDots.visible = g.aim.power > 0.05;
        const pts = S.trajectory(g.aim, AIM_N - 1);
        pts.forEach((p, i) => aimPos.set([p.x, p.y, p.z], i * 3));
        aimGeo.attributes.position.needsUpdate = true;
        aimDots.material.opacity = 0.35 + 0.5 * g.aim.power;
      }
      // 尾
      if (trail.visible) {
        const p = g.ball.position;
        if (!trailInit) {
          for (let i = 0; i < TRAIL; i++) trailPos.set([p.x, p.y, p.z], i * 3);
          trailInit = true;
        }
        trailPos.copyWithin(3, 0, (TRAIL - 1) * 3);
        trailPos.set([p.x, p.y, p.z], 0);
        trailGeo.attributes.position.needsUpdate = true;
        if (g.phase === "reveal") trail.visible = false;
      }
      // 紅葉
      for (let i = 0; i < LEAVES; i++) {
        leafPos[i * 3] += (leafVel[i * 3] + Math.sin(time * 1.3 + i) * 0.4) * dt;
        leafPos[i * 3 + 1] += leafVel[i * 3 + 1] * dt;
        leafPos[i * 3 + 2] += leafVel[i * 3 + 2] * dt;
        if (leafPos[i * 3 + 1] < 0) {
          leafPos[i * 3] = (Math.random() - 0.5) * 40;
          leafPos[i * 3 + 1] = 12 + Math.random() * 3;
          leafPos[i * 3 + 2] = 6 - Math.random() * 40;
        }
      }
      leafGeom.attributes.position.needsUpdate = true;
      // 粉塵(スローモーションの間は粉塵もゆっくり)
      const sdt = ui && ui.simDt != null ? ui.simDt : dt;
      for (let k = 0; k < DUST; k++) {
        if (dLife[k] <= 0) continue;
        dLife[k] -= sdt;
        dVel[k * 3 + 1] -= 3 * sdt;
        dPos[k * 3] += dVel[k * 3] * sdt;
        dPos[k * 3 + 1] = Math.max(0.05, dPos[k * 3 + 1] + dVel[k * 3 + 1] * sdt);
        dPos[k * 3 + 2] += dVel[k * 3 + 2] * sdt;
        if (dLife[k] <= 0) dPos[k * 3 + 1] = -99;
      }
      dGeo.attributes.position.needsUpdate = true;

      // 結果の木札
      if (ui && ui.reveal && (g.chosen || g.broke)) updateReveal(g, ui.reveal, dt);
      for (let k = 0; k < SPARK; k++) {
        if (spLife[k] <= 0) continue;
        spLife[k] -= dt;
        spVel[k * 3 + 1] -= 1.5 * dt;
        for (let a = 0; a < 3; a++) spPos[k * 3 + a] += spVel[k * 3 + a] * dt;
        if (spLife[k] <= 0) spPos[k * 3 + 1] = -99;
      }
      spGeo.attributes.position.needsUpdate = true;

      updateCamera(g, dt, ui);
      renderer.render(scene, camera);
    }

    // 結果の木札: 落ちた所から浮き上がり、カメラの前へ来て回り、裏返るとレア度
    // (外れた時は、割れた玉の中から小さな木札が出て、その上で大きくなる)
    const REVEAL_AT = new THREE.Vector3(0, 2.3, S.TOWER.z + 6.2);
    const missPlaque = new THREE.Mesh(box(S.PART.plaque.half[0] * 2, S.PART.plaque.half[1] * 2, S.PART.plaque.half[2] * 2), [plaqueSide, plaqueSide, plaqueSide, plaqueSide, plaqueBack, plaqueBack]);
    missPlaque.castShadow = true;
    missPlaque.visible = false;
    scene.add(missPlaque);
    // 動かない物(櫓・石灯籠・鳥居の柱)の箱 { min, max }。外れた時の木札とカメラの置き場所を決める
    const OBST = [{ min: new THREE.Vector3(-S.TOWER.halfW - 0.35, 0, S.TOWER.z - S.TOWER.halfD - 0.15), max: new THREE.Vector3(S.TOWER.halfW + 0.35, S.TOWER_TOP, S.TOWER.z + S.TOWER.halfD + 0.15) }];
    for (const sx of [-1, 1]) {
      for (const z of S.LANTERN.zs) OBST.push({ min: new THREE.Vector3(sx * S.LANTERN.x - 0.6, 0, z - 0.6), max: new THREE.Vector3(sx * S.LANTERN.x + 0.6, 2.8, z + 0.6) });
      OBST.push({ min: new THREE.Vector3(sx * S.TORII.x - 0.6, 0, S.TORII.z - 0.6), max: new THREE.Vector3(sx * S.TORII.x + 0.6, S.TORII.h + 0.5, S.TORII.z + 0.6) });
    }
    const ray = new THREE.Ray();
    const box3 = new THREE.Box3();
    const hitPt = new THREE.Vector3();
    // a から b への線が、どれかの箱(pad だけ大きくする)を通るか
    function blocked(a, b, pad) {
      const len = a.distanceTo(b);
      ray.origin.copy(a);
      ray.direction.subVectors(b, a).normalize();
      return OBST.some((o) => {
        box3.min.copy(o.min).subScalar(pad);
        box3.max.copy(o.max).addScalar(pad);
        if (box3.containsPoint(a)) return true;
        return ray.intersectBox(box3, hitPt) && a.distanceTo(hitPt) < len;
      });
    }
    // 外れた時の見せ方: 割れた所の上に木札を出し、木札もカメラも物に重ならず、見通しのよい向きから見る
    // (正面 = 手前から。ふさがっていたら少しずつ横へ回る。木札はカメラの方を向く)
    function missView(broke) {
      const at = new THREE.Vector3(broke.x, 2.1, broke.z);
      // 柱や灯籠のすぐ脇なら、木札(大きくなると幅 0.9m)が重ならない所まで離す
      for (let i = 0; i < 4; i++) {
        const o = OBST.find((b) => at.x > b.min.x - 0.7 && at.x < b.max.x + 0.7 && at.z > b.min.z - 0.7 && at.z < b.max.z + 0.7 && at.y < b.max.y + 0.9);
        if (!o) break;
        const cx = (o.min.x + o.max.x) / 2;
        const cz = (o.min.z + o.max.z) / 2;
        const dx = at.x - cx || 0.01;
        const dz = at.z - cz || 0.01;
        const d = Math.hypot(dx, dz);
        const need = Math.hypot((o.max.x - o.min.x) / 2, (o.max.z - o.min.z) / 2) + 0.75;
        at.x = cx + (dx / d) * need;
        at.z = cz + (dz / d) * need;
      }
      const top = new THREE.Vector3();
      const bottom = new THREE.Vector3();
      for (const yaw of [0, 0.45, -0.45, 0.9, -0.9, 1.35, -1.35, 1.8, -1.8, 2.4, -2.4, Math.PI]) {
        const cam = new THREE.Vector3(at.x + Math.sin(yaw) * 4.3, at.y + 0.25, at.z + Math.cos(yaw) * 4.3);
        top.copy(at).y += 0.8;
        bottom.copy(at).y -= 0.8;
        if (!blocked(cam, at, 0.3) && !blocked(cam, top, 0.1) && !blocked(cam, bottom, 0.1)) return { at, cam, yaw };
      }
      return { at, cam: new THREE.Vector3(at.x, at.y + 0.25, at.z + 4.3), yaw: 0 };
    }
    function revealView(g) {
      if (g.chosen) return { at: REVEAL_AT, cam: REVEAL_AT.clone().add(tmp.set(0, 0.25, 4.3)), yaw: 0 };
      return missView(g.broke);
    }
    // 外れた玉を追うカメラが、櫓・鳥居・灯籠の中に入らない
    function avoidScenery(p) {
      const w = S.TOWER.halfW + 0.8;
      if (Math.abs(p.x) < w && p.z > S.TOWER.z - S.TOWER.halfD - 0.8 && p.z < S.TOWER.z + S.TOWER.halfD + 0.8) p.x = (p.x < 0 ? -1 : 1) * w;
      // 鳥居: 貫より下を通る。柱からは離れる
      if (Math.abs(p.z - S.TORII.z) < 1.6 && Math.abs(p.x) < S.TORII.x + 1.4) p.y = Math.min(p.y, 7.6);
      for (const sx of [-1, 1]) {
        for (const z of S.LANTERN.zs) {
          const lx = p.x - sx * S.LANTERN.x;
          const lz = p.z - z;
          const ld = Math.hypot(lx, lz);
          if (ld < 1.3 && p.y < 3.4) {
            p.x = sx * S.LANTERN.x + (ld < 1e-3 ? 1.3 : (lx / ld) * 1.3);
            p.z = z + (ld < 1e-3 ? 0 : (lz / ld) * 1.3);
          }
        }
        const dx = p.x - sx * S.TORII.x;
        const dz = p.z - S.TORII.z;
        const d = Math.hypot(dx, dz);
        const min = S.TORII.r + 0.9;
        if (d < min) {
          const f = min / Math.max(d, 1e-3);
          p.x = sx * S.TORII.x + (d < 1e-3 ? min : dx * f);
          p.z = S.TORII.z + (d < 1e-3 ? 0 : dz * f);
        }
      }
      return p;
    }
    let revealFrom = null;
    let spinAngle = 0;
    let flipFrom = null;
    let flipTo = null;
    let burstDone = false;
    function updateReveal(g, r, dt) {
      const m = g.chosen ? partMeshes[g.chosen.id] : missPlaque;
      if (!revealFrom) {
        if (!g.chosen) {
          m.visible = true;
          m.position.set(g.broke.x, g.broke.y, g.broke.z);
          m.quaternion.identity();
        }
        const view = revealView(g);
        revealFrom = { pos: m.position.clone(), quat: m.quaternion.clone(), at: view.at, cam: view.cam, upright: new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), view.yaw), scale: g.chosen ? 1 : 0.25 };
      }
      const u = Math.min(1, r.u);
      const e = u * u * (3 - 2 * u);
      // 弧を描いて上がってくる
      m.position.lerpVectors(revealFrom.pos, revealFrom.at, e);
      m.position.y += Math.sin(e * Math.PI) * 1.4 + Math.sin(time * 2) * 0.05 * e;
      m.quaternion.slerpQuaternions(revealFrom.quat, revealFrom.upright, e);
      // 待つ間はゆっくり回る。裏返す時は今の角度から 1 回転以上回って、正面(カメラの方)に表を向ける
      if (r.flip == null) spinAngle += dt * 1.4 * e;
      else {
        if (flipFrom == null) {
          flipFrom = spinAngle;
          flipTo = Math.ceil((spinAngle + Math.PI * 2.5) / (Math.PI * 2)) * Math.PI * 2;
        }
        spinAngle = flipFrom + (flipTo - flipFrom) * easeOut(Math.min(1, r.flip));
      }
      m.rotateY(spinAngle);
      m.scale.setScalar(revealFrom.scale + e * (2.3 - revealFrom.scale));
      // 表の文字は、表の面がカメラの反対を向いている間に貼り替える(替わる瞬間が見えない)
      if (r.flip != null && r.tier && tierShown !== r.tier && Math.cos(spinAngle) < -0.2) {
        tierFace = keep(new THREE.MeshStandardMaterial({ map: keep(makePlaqueTexture(THREE, r.tier)), roughness: 0.6, emissive: 0x3a2a10, emissiveIntensity: 0.25 }));
        m.material = [plaqueSide, plaqueSide, plaqueSide, plaqueSide, tierFace, plaqueBack];
        tierShown = r.tier;
      }
      revealGlow.position.copy(m.position).add(tmp.set(0, 0, -0.15));
      revealGlow.lookAt(camera.position);
      if (r.tier && revealGlow.userData.tier !== r.tier) {
        revealGlow.material.color.set(TIER_COLORS[r.tier] || "#ffe9a0");
        revealGlow.userData.tier = r.tier;
      }
      revealGlow.scale.setScalar(1 + 0.04 * Math.sin(time * 4));
      const glow = r.flip == null ? 0.2 * e : 0.2 + 0.5 * Math.min(1, r.flip * 2);
      revealGlow.material.opacity = glow;
      revealGlow.rotation.z += dt * 0.6;
      // 裏返った瞬間に光の粒
      if (r.flip != null && r.flip > 0.7 && !burstDone) {
        burstDone = true;
        burst(m.position, SPARK, 1.5);
      }
    }
    // 光の粒をはじけさせる
    function burst(p, n, speed) {
      for (let j = 0; j < n; j++) {
        const k = spNext;
        spNext = (spNext + 1) % SPARK;
        spPos.set([p.x, p.y, p.z], k * 3);
        const th = Math.random() * Math.PI * 2;
        const ph = (Math.random() - 0.5) * Math.PI;
        const sp = speed + Math.random() * 2.5;
        spVel.set([Math.cos(th) * Math.cos(ph) * sp, Math.sin(ph) * sp + 1, Math.sin(th) * Math.cos(ph) * sp * 0.4], k * 3);
        spLife[k] = 0.8 + Math.random() * 0.8;
      }
    }
    function easeOut(u) {
      return 1 - Math.pow(1 - u, 3);
    }

    function updateCamera(g, dt, ui) {
      let wantPos;
      let wantLook;
      let k = Math.min(1, dt * 4);
      if (g.phase === "aim") {
        wantPos = AIM_POS.clone();
        wantLook = AIM_LOOK.clone();
        // 引き絞ると、玉と一緒に少し下がる
        wantPos.z += g.aim.power * 0.6;
      } else if (g.phase === "flight" && !o.reducedMotion) {
        // 玉の後ろについて飛ぶ(少し上・少し外側から。櫓の左を抜ける時は左から。櫓の前に寄らない)
        // (物理の位置は cannon-es の Vec3。three の Vector3 に移してから計算する)
        const v = g.ball.velocity;
        const dir = new THREE.Vector3(v.x, v.y * 0.4, v.z).normalize();
        const bp = new THREE.Vector3(g.ball.position.x, g.ball.position.y, g.ball.position.z);
        wantPos = bp.clone().addScaledVector(dir, -3.2).add(tmp.set(bp.x < -0.8 ? -0.6 : 0.6, 0.9, 0));
        wantLook = bp.clone().addScaledVector(dir, 6);
        k = Math.min(1, dt * 10);
      } else if (g.phase === "miss" && !o.reducedMotion) {
        // 外れた玉を、少し上・手前から追って、落ちて転がるのを見る
        const bp = new THREE.Vector3(g.ball.position.x, g.ball.position.y, g.ball.position.z);
        wantPos = avoidScenery(bp.clone().add(tmp.set(bp.x < -0.8 ? -0.5 : 0.5, 2.25, 4.3)));
        // 櫓のすぐ後ろに玉がある間は、櫓の上から見下ろす(櫓の中をくぐらない)
        if (Math.abs(wantPos.x) < S.TOWER.halfW + 1.8 && Math.abs(wantPos.z - S.TOWER.z) < S.TOWER.halfD + 2.5) wantPos.y = Math.max(wantPos.y, S.TOWER_TOP + 1.6);
        // 鳥居の近くで動くので、追う位置も鳥居を避ける(カメラは追う位置へ遅れて動くので、着く先も避ける)
        avoidScenery(wantPos);
        wantLook = bp.clone().add(tmp.set(0, 0.3, 0));
        k = Math.min(1, dt * 4);
      } else if (g.phase === "impact" || ((g.phase === "flight" || g.phase === "miss") && o.reducedMotion)) {
        // 横へ回り込んで、崩れ全体を見せる
        if (cam.wideAt == null) cam.wideAt = time;
        wantPos = WIDE_POS.clone();
        wantLook = WIDE_LOOK.clone();
        k = Math.min(1, dt * (o.reducedMotion ? 6 : 2.2));
      } else {
        // 結果の木札の正面
        const view = revealFrom || (g.chosen || g.broke ? revealView(g) : { at: REVEAL_AT, cam: REVEAL_AT.clone().add(tmp.set(0, 0.25, 4.3)) });
        wantPos = view.cam.clone();
        wantLook = view.at.clone().add(tmp.set(0, 0.15, 0));
        k = Math.min(1, dt * (o.reducedMotion ? 6 : 2.5));
      }
      cam.pos.lerp(wantPos, k);
      cam.look.lerp(wantLook, k);
      camera.position.copy(cam.pos);
      if (cam.shake > 0 && !o.reducedMotion) {
        camera.position.x += (Math.random() - 0.5) * cam.shake;
        camera.position.y += (Math.random() - 0.5) * cam.shake;
        cam.shake = Math.max(0, cam.shake - dt * 1.2);
      }
      camera.lookAt(cam.look);
    }

    function degrade() {
      renderer.shadowMap.enabled = false;
      sun.castShadow = false;
      scene.traverse((m) => {
        if (m.material) m.material.needsUpdate = true;
      });
      pixelRatio = Math.max(1, pixelRatio * 0.66);
      renderer.setPixelRatio(pixelRatio);
      resize(width, height);
    }
    function warmUp() {
      try {
        renderer.compile(scene, camera);
      } catch (e) {
        // 描く時に作られる
      }
    }
    function dispose() {
      for (const d of disposables) d.dispose && d.dispose();
      envRT.dispose();
      if (sun.dispose) sun.dispose();
      renderer.dispose();
      // 失われた後(contextlost)にもう一度失わせると、警告が出る
      const gl = renderer.getContext();
      if (renderer.forceContextLoss && gl && !gl.isContextLost()) renderer.forceContextLoss();
    }
    return { render, resize, onEvent, degrade, warmUp, dispose, renderer, camera };
  }
}

// ---- 模様(canvas。共通のものは shrineTextures.js) ----
// 木札の面。tier が無ければ裏(墨のかすれた模様だけ)
function makePlaqueTexture(THREE, tier) {
  return canvasTex(THREE, 128, 232, (g, w, h) => {
    g.fillStyle = "#ead2a8";
    g.fillRect(0, 0, w, h);
    g.strokeStyle = "rgba(160,110,60,0.35)";
    for (let x = 4; x < w; x += 7) {
      g.beginPath();
      g.moveTo(x, 0);
      g.lineTo(x + 2, h);
      g.stroke();
    }
    g.strokeStyle = "#8a1e14";
    g.lineWidth = 5;
    g.strokeRect(6, 6, w - 12, h - 12);
    g.textAlign = "center";
    g.textBaseline = "middle";
    if (!tier) {
      g.fillStyle = "rgba(30,20,10,0.75)";
      g.font = "700 22px 'Hiragino Mincho ProN', 'Yu Mincho', serif";
      g.fillText("奉", w / 2, 40);
      g.fillText("納", w / 2, 68);
      g.fillStyle = "rgba(160,30,20,0.8)";
      g.beginPath();
      g.arc(w / 2, h - 46, 16, 0, Math.PI * 2);
      g.fill();
      return;
    }
    g.fillStyle = "#8a1e14";
    g.font = "700 16px 'Hiragino Mincho ProN', 'Yu Mincho', serif";
    g.fillText("御神籤", w / 2, 28);
    // 色の文字に墨の縁(明るい色のレア度でも木の地に埋もれないように)
    g.font = `900 ${tier.length > 1 ? 58 : 80}px 'Hiragino Mincho ProN', 'Yu Mincho', serif`;
    g.lineJoin = "round";
    Array.from(tier).forEach((ch, i, a) => {
      const y = a.length > 1 ? 92 + i * 66 : 130;
      g.strokeStyle = "#2a1408";
      g.lineWidth = 7;
      g.strokeText(ch, w / 2, y);
      g.fillStyle = TIER_COLORS[tier] || "#222";
      g.fillText(ch, w / 2, y);
    });
  });
}

function makeEmaTexture(THREE) {
  return canvasTex(THREE, 128, 96, (g, w, h) => {
    g.fillStyle = "#d8b480";
    g.fillRect(0, 0, w, h);
    g.fillStyle = "#c8381c";
    g.beginPath();
    g.arc(w / 2, h / 2, 26, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = "#fff6e0";
    g.font = "900 30px 'Hiragino Mincho ProN', serif";
    g.textAlign = "center";
    g.textBaseline = "middle";
    g.fillText("祈", w / 2, h / 2 + 2);
  });
}

module.exports = { createView, TIER_COLORS };
