// おみくじ演出「だるま落とし」(3D)の見た目(three.js)。ルールと物理は omikujiDaruma.js。
//
// createView(lib, canvas, opts) で組み、毎フレーム render(g, dt, ui) を呼ぶ。
// lib: { THREE, RoomEnvironment }(OmikujiDaruma.vue がこの演出の時だけ読み込む)。
// ui: { reveal: { u, flip, tier } | null, simDt } — おみくじの見せ方(画面の側が進める)
//
// 場面: 弾き玉と同じ秋の夕方の境内。参道の真ん中の台に、胴 5 段と頭のだるま。左に木槌。
// カメラ: 普段は斜め前から全体 → 打つ瞬間は打つ段に寄る → 結果はおみくじの正面。

const D = require("./omikujiDaruma");
const { TIER_COLORS, canvasTex, makeSkyTexture, makeGroundTexture, makePathTexture, makeWoodTexture, makeLeafTexture, makeSoftTexture } = require("./shrineTextures");

// 胴の色(下から。だるま落としの定番の 5 色)
const BLOCK_COLORS = ["#2f6fb5", "#e8b820", "#3d9a4a", "#c83a2a", "#7a4aa0"];

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
    scene.background = keep(makeSkyTexture(THREE));
    scene.fog = new THREE.Fog(0xc8a088, 18, 70);
    const camera = new THREE.PerspectiveCamera(50, 1, 0.05, 300);

    // 映り込み(漆の照り)
    const pmrem = new THREE.PMREMGenerator(renderer);
    const room = new lib.RoomEnvironment(renderer);
    const envRT = pmrem.fromScene(room, 0.04);
    const envTex = envRT.texture;
    pmrem.dispose();
    if (room.dispose) room.dispose();

    // ---- 明かり(夕日) ----
    scene.add(new THREE.HemisphereLight(0xffd9b0, 0x5a4030, 0.8));
    const sun = new THREE.DirectionalLight(0xffc890, 2.2);
    sun.position.set(-8, 10, 7);
    sun.target.position.set(0, 1, 0);
    sun.castShadow = !!o.shadows;
    sun.shadow.mapSize.set(1024, 1024);
    sun.shadow.camera.left = -6;
    sun.shadow.camera.right = 6;
    sun.shadow.camera.top = 6;
    sun.shadow.camera.bottom = -6;
    sun.shadow.camera.near = 1;
    sun.shadow.camera.far = 30;
    sun.shadow.bias = -0.0008;
    scene.add(sun);
    scene.add(sun.target);

    // ---- 地面と参道 ----
    const groundTex = keep(makeGroundTexture(THREE));
    groundTex.wrapS = groundTex.wrapT = THREE.RepeatWrapping;
    groundTex.repeat.set(10, 10);
    groundTex.anisotropy = 8;
    const ground = new THREE.Mesh(keep(new THREE.PlaneGeometry(160, 160)), keep(new THREE.MeshStandardMaterial({ map: groundTex, roughness: 0.95, color: 0xa8a49c })));
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = true;
    scene.add(ground);
    const pathTex = keep(makePathTexture(THREE));
    pathTex.wrapS = pathTex.wrapT = THREE.RepeatWrapping;
    pathTex.repeat.set(1, 8);
    const path = new THREE.Mesh(keep(new THREE.PlaneGeometry(3.4, 40)), keep(new THREE.MeshStandardMaterial({ map: pathTex, roughness: 0.85 })));
    path.rotation.x = -Math.PI / 2;
    path.position.set(0, 0.01, -10);
    path.receiveShadow = true;
    scene.add(path);

    const woodTex = keep(makeWoodTexture(THREE, "#b8854f", "#8a5a30"));
    const darkWoodTex = keep(makeWoodTexture(THREE, "#7a5232", "#4a2e18"));
    const mat = {
      vermilion: keep(new THREE.MeshStandardMaterial({ color: 0xd8401f, roughness: 0.55 })),
      black: keep(new THREE.MeshStandardMaterial({ color: 0x1c1816, roughness: 0.6 })),
      wood: keep(new THREE.MeshStandardMaterial({ map: woodTex, roughness: 0.7 })),
      darkWood: keep(new THREE.MeshStandardMaterial({ map: darkWoodTex, roughness: 0.65 })),
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

    // ---- 鳥居(奥) ----
    {
      const tz = -11;
      for (const sx of [-1, 1]) add(cyl(0.4, 0.45, 9, 20), mat.vermilion, sx * 3.8, 4.5, tz);
      add(box(10.6, 0.6, 0.9), mat.black, 0, 9.3, tz);
      add(box(9.8, 0.45, 0.7), mat.vermilion, 0, 8.7, tz);
      add(box(9.0, 0.45, 0.55), mat.vermilion, 0, 7.2, tz);
      add(box(0.8, 1.3, 0.45), mat.black, 0, 8.0, tz);
    }
    // ---- 石灯籠(台の奥の両脇。カメラと木槌の通り道には置かない) ----
    for (const [x, z] of [[-2.8, -3.2], [2.8, -3.2], [-3.2, -8], [3.2, -8]]) {
      add(box(0.9, 0.3, 0.9), mat.stone, x, 0.15, z);
      add(cyl(0.16, 0.2, 1.3, 10), mat.stone, x, 0.95, z);
      add(box(0.8, 0.6, 0.8), mat.stone, x, 1.9, z);
      const roof = add(keep(new THREE.ConeGeometry(0.8, 0.55, 4)), mat.stone, x, 2.45, z);
      roof.rotation.y = Math.PI / 4;
      const lamp = new THREE.Mesh(box(0.4, 0.3, 0.82), keep(new THREE.MeshBasicMaterial({ color: 0xffd080 })));
      lamp.position.set(x, 1.9, z);
      scene.add(lamp);
    }
    // ---- 木(紅葉と杉。両脇の奥) ----
    {
      let seed = 7;
      const rnd = () => {
        seed = (seed * 16807) % 2147483647;
        return seed / 2147483647;
      };
      const leafGeo = keep(new THREE.IcosahedronGeometry(1, 1));
      for (let i = 0; i < 22; i++) {
        const side = i % 2 ? 1 : -1;
        const x = side * (7 + rnd() * 12);
        const z = 2 - rnd() * 30;
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
    const LEAVES = 120;
    const leafPos = new Float32Array(LEAVES * 3);
    const leafVel = new Float32Array(LEAVES * 3);
    for (let i = 0; i < LEAVES; i++) {
      leafPos[i * 3] = (Math.random() - 0.5) * 24;
      leafPos[i * 3 + 1] = Math.random() * 9;
      leafPos[i * 3 + 2] = 4 - Math.random() * 22;
      leafVel[i * 3] = 0.25 + Math.random() * 0.4;
      leafVel[i * 3 + 1] = -(0.3 + Math.random() * 0.4);
      leafVel[i * 3 + 2] = (Math.random() - 0.5) * 0.3;
    }
    const leafGeom = keep(new THREE.BufferGeometry());
    leafGeom.setAttribute("position", new THREE.BufferAttribute(leafPos, 3));
    const leaves = new THREE.Points(leafGeom, keep(new THREE.PointsMaterial({ map: keep(makeLeafTexture(THREE)), size: 0.16, transparent: true, alphaTest: 0.3 })));
    leaves.frustumCulled = false;
    scene.add(leaves);

    // ---- 台(天板と脚) ----
    {
      const S = D.STAND;
      add(box(S.halfW * 2 + 0.1, S.thick, S.halfD * 2 + 0.1), mat.darkWood, 0, S.y - S.thick / 2, 0);
      for (const [x, z] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) add(box(0.09, S.y - S.thick, 0.09), mat.darkWood, x * (S.halfW - 0.05), (S.y - S.thick) / 2, z * (S.halfD - 0.05));
      // 敷物(赤い毛氈)
      const felt = add(box(S.halfW * 2 + 0.3, 0.02, S.halfD * 2 + 0.3), keep(new THREE.MeshStandardMaterial({ color: 0xa8201a, roughness: 0.95 })), 0, 0.01, 0);
      felt.receiveShadow = true;
    }

    // ---- だるま ----
    const pieceMeshes = D.stackLayout().map((p, i) => {
      let mesh;
      if (p.kind === "block") {
        const side = keep(new THREE.MeshStandardMaterial({ map: keep(makeBlockTexture(THREE, BLOCK_COLORS[i % BLOCK_COLORS.length])), roughness: 0.32, envMap: envTex, envMapIntensity: 0.7 }));
        const cap = keep(new THREE.MeshStandardMaterial({ color: BLOCK_COLORS[i % BLOCK_COLORS.length], roughness: 0.35, envMap: envTex, envMapIntensity: 0.6 }));
        mesh = new THREE.Mesh(cyl(D.BLOCK.r, D.BLOCK.r, D.BLOCK.h - 0.004, 40), [side, cap, cap]);
      } else {
        mesh = new THREE.Mesh(keep(makeDarumaGeometry(THREE)), keep(new THREE.MeshStandardMaterial({ map: keep(makeDarumaTexture(THREE)), roughness: 0.3, envMap: envTex, envMapIntensity: 0.8 })));
      }
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      mesh.position.set(0, p.y, 0);
      scene.add(mesh);
      return mesh;
    });

    // ---- 木槌(左。柄は斜め上へ) ----
    const mallet = new THREE.Group();
    {
      const head = new THREE.Mesh(cyl(0.17, 0.17, 0.5, 24), mat.wood);
      head.rotation.z = Math.PI / 2;
      head.castShadow = true;
      mallet.add(head);
      const ring = new THREE.Mesh(cyl(0.18, 0.18, 0.05, 24), mat.black);
      ring.rotation.z = Math.PI / 2;
      for (const x of [-0.18, 0.18]) {
        const r = ring.clone();
        r.position.x = x;
        mallet.add(r);
      }
      const handle = new THREE.Mesh(cyl(0.04, 0.05, 1.3, 10), mat.darkWood);
      handle.position.set(-0.05, 0.65, 0.05);
      handle.rotation.z = 0.08;
      handle.castShadow = true;
      mallet.add(handle);
    }
    scene.add(mallet);
    const HIT_Y = D.STAND.y + D.BLOCK.h / 2;
    const MALLET_REST = new THREE.Vector3(-1.55, HIT_Y, 0.15);
    const MALLET_HIT_X = -D.BLOCK.r - 0.25; // 木槌の頭の右端が段に当たる位置
    mallet.position.copy(MALLET_REST);

    // ---- 木っ端・光の粒 ----
    const softTex = keep(makeSoftTexture(THREE));
    const DUST = 160;
    const dPos = new Float32Array(DUST * 3);
    const dVel = new Float32Array(DUST * 3);
    const dLife = new Float32Array(DUST);
    const dGeo = keep(new THREE.BufferGeometry());
    dGeo.setAttribute("position", new THREE.BufferAttribute(dPos, 3));
    const dust = new THREE.Points(dGeo, keep(new THREE.PointsMaterial({ map: softTex, color: 0xe8d0b0, size: 0.18, transparent: true, opacity: 0.8, depthWrite: false })));
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
        dVel.set([Math.cos(th) * sp * 0.5 + speed * 0.4, Math.random() * sp * 0.8, Math.sin(th) * sp], k * 3);
        dLife[k] = 0.5 + Math.random() * 0.5;
      }
    }
    const SPARK = 140;
    const spPos = new Float32Array(SPARK * 3);
    const spVel = new Float32Array(SPARK * 3);
    const spLife = new Float32Array(SPARK);
    const spGeo = keep(new THREE.BufferGeometry());
    spGeo.setAttribute("position", new THREE.BufferAttribute(spPos, 3));
    const sparks = new THREE.Points(spGeo, keep(new THREE.PointsMaterial({ map: softTex, color: 0xffe080, size: 0.14, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending })));
    sparks.frustumCulled = false;
    scene.add(sparks);
    let spNext = 0;
    function burst(p, n, speed) {
      for (let j = 0; j < n; j++) {
        const k = spNext;
        spNext = (spNext + 1) % SPARK;
        spPos.set([p.x, p.y, p.z], k * 3);
        const th = Math.random() * Math.PI * 2;
        const ph = (Math.random() - 0.5) * Math.PI;
        const sp = speed + Math.random() * 1.6;
        spVel.set([Math.cos(th) * Math.cos(ph) * sp, Math.sin(ph) * sp + 0.8, Math.sin(th) * Math.cos(ph) * sp * 0.5], k * 3);
        spLife[k] = 0.7 + Math.random() * 0.7;
      }
    }

    // ---- おみくじ(紙) ----
    // 細く折った紙が段から飛び出し、浮き上がって回り、開くと表にレア度
    const SLIP = { w: 0.36, h: 0.9, d: 0.012 };
    const paperSide = keep(new THREE.MeshStandardMaterial({ color: 0xf6f0e2, roughness: 0.9 }));
    const slipBack = keep(new THREE.MeshStandardMaterial({ map: keep(makeSlipTexture(THREE, null)), roughness: 0.85 }));
    const slip = new THREE.Mesh(box(SLIP.w, SLIP.h, SLIP.d), [paperSide, paperSide, paperSide, paperSide, slipBack, slipBack]);
    slip.castShadow = true;
    slip.visible = false;
    scene.add(slip);
    const revealGlow = new THREE.Mesh(keep(new THREE.RingGeometry(0.98, 1.08, 64)), keep(new THREE.MeshBasicMaterial({ color: 0xffe9a0, transparent: true, opacity: 0, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending })));
    scene.add(revealGlow);
    const REVEAL_AT = new THREE.Vector3(0, 1.75, 1.35);
    let revealFrom = null;
    let spinAngle = 0;
    let flipFrom = null;
    let flipTo = null;
    let burstDone = false;
    let tierShown = null;

    // ---- カメラ ----
    const cam = { pos: new THREE.Vector3(), look: new THREE.Vector3(), shake: 0, zoomUntil: -1 };
    const BASE_POS = new THREE.Vector3(1.5, 2.3, 4.1);
    const BASE_LOOK = new THREE.Vector3(0, 1.45, 0);
    // 打つ瞬間: 木槌と打つ段が並んで見える、左手前から(縦長の画面でも頭まで入る)
    const HIT_POS = new THREE.Vector3(-1.3, 1.6, 3.0);
    const HIT_LOOK = new THREE.Vector3(-0.35, 1.3, 0);
    cam.pos.copy(BASE_POS);
    cam.look.copy(BASE_LOOK);
    let width = 1;
    let height = 1;
    function resize(w, h) {
      width = Math.max(1, w);
      height = Math.max(1, h);
      renderer.setSize(width, height, false);
      camera.aspect = width / height;
      // 縦長の画面では引いて、だるまが上下に収まるように
      camera.fov = camera.aspect < 0.8 ? 62 : 48;
      camera.updateProjectionMatrix();
    }

    // ---- 出来事 ----
    let time = 0;
    let swing = null; // { at(物理の時刻), startT(物理の時刻) }
    function onEvent(e, g) {
      if (e.type === "swing") {
        swing = { at: e.at, from: e.t };
        if (!o.reducedMotion) cam.zoomUntil = e.at + 0.55;
      } else if (e.type === "hit") {
        const p = g.pieces[e.id].body.position;
        puff({ x: p.x - D.BLOCK.r, y: p.y, z: p.z }, 26, 2.2);
        cam.shake = o.reducedMotion ? 0 : 0.06;
      } else if (e.type === "found") {
        const p = g.pieces[e.id].body.position;
        burst({ x: p.x, y: p.y, z: p.z }, 60, 1.2);
      } else if (e.type === "collapse") {
        cam.zoomUntil = -1;
      }
    }

    // ---- 毎フレーム ----
    const tmp = new THREE.Vector3();
    const upright = new THREE.Quaternion();
    function render(g, dt, ui) {
      time += dt;
      const simDt = ui && ui.simDt != null ? ui.simDt : dt;
      // 段を物理に合わせる
      g.pieces.forEach((p, i) => {
        pieceMeshes[i].position.copy(p.body.position);
        pieceMeshes[i].quaternion.copy(p.body.quaternion);
      });
      // 木槌: 振りかぶって(後ろへ)、当たる時刻に段の脇まで、打った後は戻る
      if (swing) {
        const pre = Math.max(0.0001, swing.at - swing.from);
        const u = (g.t - swing.from) / pre;
        let x;
        if (u < 0.55) x = MALLET_REST.x - 0.45 * Math.sin((u / 0.55) * Math.PI * 0.5);
        else if (u < 1) x = MALLET_REST.x - 0.45 + (MALLET_HIT_X - MALLET_REST.x + 0.45) * Math.pow((u - 0.55) / 0.45, 2);
        else {
          const back = Math.min(1, (g.t - swing.at) / 0.35);
          x = MALLET_HIT_X + (MALLET_REST.x - MALLET_HIT_X) * back * back * (3 - 2 * back);
          if (back >= 1) swing = null;
        }
        mallet.position.x = x;
        mallet.rotation.z = u < 1 ? -0.18 * Math.sin(Math.min(1, u) * Math.PI) : 0;
      } else {
        mallet.position.x = MALLET_REST.x;
        mallet.position.y = HIT_Y + Math.sin(time * 1.6) * 0.015;
        mallet.rotation.z = 0;
      }

      // 紅葉
      for (let i = 0; i < LEAVES; i++) {
        leafPos[i * 3] += leafVel[i * 3] * dt;
        leafPos[i * 3 + 1] += leafVel[i * 3 + 1] * dt;
        leafPos[i * 3 + 2] += leafVel[i * 3 + 2] * dt + Math.sin(time + i) * 0.003;
        if (leafPos[i * 3 + 1] < 0) {
          leafPos[i * 3] = (Math.random() - 0.5) * 24 - 4;
          leafPos[i * 3 + 1] = 8 + Math.random() * 2;
          leafPos[i * 3 + 2] = 4 - Math.random() * 22;
        }
      }
      leafGeom.attributes.position.needsUpdate = true;
      // 木っ端(スローの間はゆっくり)
      for (let k = 0; k < DUST; k++) {
        if (dLife[k] <= 0) continue;
        dLife[k] -= simDt;
        dVel[k * 3 + 1] -= 3 * simDt;
        for (let a = 0; a < 3; a++) dPos[k * 3 + a] += dVel[k * 3 + a] * simDt;
        if (dPos[k * 3 + 1] < 0.02) dVel[k * 3 + 1] = 0;
        if (dLife[k] <= 0) dPos[k * 3 + 1] = -99;
      }
      dGeo.attributes.position.needsUpdate = true;
      for (let k = 0; k < SPARK; k++) {
        if (spLife[k] <= 0) continue;
        spLife[k] -= dt;
        spVel[k * 3 + 1] -= 1.5 * dt;
        for (let a = 0; a < 3; a++) spPos[k * 3 + a] += spVel[k * 3 + a] * dt;
        if (spLife[k] <= 0) spPos[k * 3 + 1] = -99;
      }
      spGeo.attributes.position.needsUpdate = true;

      if (ui && ui.reveal && g.chosen) updateReveal(g, ui.reveal, dt);
      updateCamera(g, dt);
      renderer.render(scene, camera);
    }

    function easeOut(u) {
      return 1 - Math.pow(1 - u, 3);
    }

    function updateReveal(g, r, dt) {
      const m = slip;
      if (!revealFrom) {
        const p = g.chosen.body.position;
        m.visible = true;
        revealFrom = { pos: new THREE.Vector3(p.x, p.y, p.z) };
        burst(revealFrom.pos, 50, 1.4);
      }
      const u = Math.min(1, r.u);
      const e = u * u * (3 - 2 * u);
      // 段から飛び出して、弧を描いて正面へ
      m.position.lerpVectors(revealFrom.pos, REVEAL_AT, e);
      m.position.y += Math.sin(e * Math.PI) * 0.9 + Math.sin(time * 2) * 0.03 * e;
      m.quaternion.copy(upright);
      // 待つ間はゆっくり回る。開く時は今の角度から 1 回転以上回って、正面(+z)に表を向ける
      if (r.flip == null) spinAngle += dt * 2.2 * (0.3 + e);
      else {
        if (flipFrom == null) {
          flipFrom = spinAngle;
          flipTo = Math.ceil((spinAngle + Math.PI * 2.5) / (Math.PI * 2)) * Math.PI * 2;
        }
        spinAngle = flipFrom + (flipTo - flipFrom) * easeOut(Math.min(1, r.flip));
      }
      m.rotateY(spinAngle);
      // 折った紙が開く(幅が細い → 広い)
      const open = r.flip == null ? 0 : easeOut(Math.min(1, r.flip * 1.3));
      const s = 0.3 + e * 1.1;
      m.scale.set(s * (0.28 + 0.72 * open), s, s);
      // 表の文字は、表の面がカメラの反対を向いている間に貼り替える(替わる瞬間が見えない)
      if (r.flip != null && r.tier && tierShown !== r.tier && Math.cos(spinAngle) < -0.2) {
        const face = keep(new THREE.MeshStandardMaterial({ map: keep(makeSlipTexture(THREE, r.tier)), roughness: 0.8, emissive: 0x2a2010, emissiveIntensity: 0.2 }));
        m.material = [paperSide, paperSide, paperSide, paperSide, face, slipBack];
        tierShown = r.tier;
      }
      revealGlow.position.copy(m.position).add(tmp.set(0, 0, -0.12));
      revealGlow.lookAt(camera.position);
      if (r.tier && revealGlow.userData.tier !== r.tier) {
        revealGlow.material.color.set(TIER_COLORS[r.tier] || "#ffe9a0");
        revealGlow.userData.tier = r.tier;
      }
      revealGlow.scale.setScalar(1 + 0.04 * Math.sin(time * 4));
      revealGlow.material.opacity = r.flip == null ? 0.2 * e : 0.2 + 0.5 * Math.min(1, r.flip * 2);
      revealGlow.rotation.z += dt * 0.6;
      if (r.flip != null && r.flip > 0.7 && !burstDone) {
        burstDone = true;
        burst(m.position, SPARK, 1.2);
      }
    }

    function updateCamera(g, dt) {
      let wantPos;
      let wantLook;
      let k = Math.min(1, dt * 3);
      if (g.phase === "reveal") {
        // おみくじの正面(崩れた時も、おみくじは正面まで飛んでくる)
        wantPos = REVEAL_AT.clone().add(tmp.set(0.15, 0.25, 2.7));
        wantLook = REVEAL_AT.clone().add(tmp.set(0, 0.05, 0));
        k = Math.min(1, dt * (o.reducedMotion ? 6 : 2.4));
      } else if (g.t < cam.zoomUntil) {
        // 打つ瞬間は、打つ段に寄る
        wantPos = HIT_POS.clone();
        wantLook = HIT_LOOK.clone();
        k = Math.min(1, dt * 7);
      } else {
        wantPos = BASE_POS.clone();
        wantLook = BASE_LOOK.clone();
        // 残りが低くなったら、少し下を見る
        const top = g.pieces[g.pieces.length - 1].body.position.y;
        wantLook.y = Math.min(BASE_LOOK.y, 0.6 + top * 0.45);
        k = Math.min(1, dt * 2.5);
      }
      cam.pos.lerp(wantPos, k);
      cam.look.lerp(wantLook, k);
      camera.position.copy(cam.pos);
      if (cam.shake > 0) {
        camera.position.x += (Math.random() - 0.5) * cam.shake;
        camera.position.y += (Math.random() - 0.5) * cam.shake;
        cam.shake = Math.max(0, cam.shake - dt * 0.6);
      }
      camera.lookAt(cam.look);
    }

    function degrade() {
      renderer.shadowMap.enabled = false;
      sun.castShadow = false;
      scene.traverse((m) => {
        if (m.material) [].concat(m.material).forEach((x) => (x.needsUpdate = true));
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

// ---- 形と模様 ----

// だるまの頭(下が太く、底は平ら。高さ D.HEAD.h、中心が原点)
function makeDarumaGeometry(THREE) {
  const R = D.HEAD.r;
  const H = D.HEAD.h;
  const pts = [new THREE.Vector2(0.001, -H / 2)];
  const n = 28;
  // 下の方が太い卵形(一番太い所は高さの 42%)。底は平ら、てっぺんは丸い
  const mid = 0.42;
  for (let i = 0; i <= n; i++) {
    const t = i / n; // 0 = 底、1 = てっぺん
    const k = (t - mid) / (t < mid ? 0.52 : 0.58);
    const r = R * Math.sqrt(Math.max(0, 1 - k * k));
    pts.push(new THREE.Vector2(Math.max(0.001, r), -H / 2 + t * H));
  }
  // phiStart を -π にして、模様の真ん中(u = 0.5)が正面(+z)に来るようにする
  return new THREE.LatheGeometry(pts, 48, -Math.PI, Math.PI * 2);
}

// だるまの顔(赤い漆に白い顔、金の「福」)。u = 0.5 が正面、v = 0 が底
function makeDarumaTexture(THREE) {
  return canvasTex(THREE, 512, 256, (g, w, h) => {
    g.fillStyle = "#c8261a";
    g.fillRect(0, 0, w, h);
    const cx = w / 2;
    // 顔の中心の高さ(キャンバスの上がだるまのてっぺん。丸い頭の上の方はすぼまるので、少し下に置く)
    const FY = h * 0.4;
    // 顔(白い楕円)
    g.fillStyle = "#fbefd8";
    g.beginPath();
    g.ellipse(cx, FY, w * 0.1, h * 0.17, 0, 0, Math.PI * 2);
    g.fill();
    // 眉と髭
    g.strokeStyle = "#1a1210";
    g.lineCap = "round";
    g.lineWidth = 5;
    for (const s of [-1, 1]) {
      g.beginPath();
      g.moveTo(cx + s * 12, FY - 26);
      g.quadraticCurveTo(cx + s * 28, FY - 34, cx + s * 44, FY - 24);
      g.stroke();
      g.beginPath();
      g.moveTo(cx + s * 8, FY + 24);
      g.quadraticCurveTo(cx + s * 28, FY + 32, cx + s * 42, FY + 20);
      g.stroke();
    }
    // 目(白目に黒い瞳。両目とも入れる)
    for (const s of [-1, 1]) {
      g.fillStyle = "#ffffff";
      g.beginPath();
      g.arc(cx + s * 24, FY - 6, 12, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = "#111";
      g.beginPath();
      g.arc(cx + s * 24, FY - 5, 6.5, 0, Math.PI * 2);
      g.fill();
    }
    // 金の縁取り
    g.strokeStyle = "#e8c050";
    g.lineWidth = 4;
    g.beginPath();
    g.ellipse(cx, FY, w * 0.105, h * 0.18, 0, 0, Math.PI * 2);
    g.stroke();
    // お腹の「福」
    g.fillStyle = "#f2cf5a";
    g.font = "900 46px 'Hiragino Mincho ProN', 'Yu Mincho', serif";
    g.textAlign = "center";
    g.textBaseline = "middle";
    g.fillText("福", cx, h * 0.76);
    // 両脇の金の渦
    g.strokeStyle = "rgba(240,200,90,0.8)";
    g.lineWidth = 3;
    for (const s of [-1, 1]) {
      for (let k = 0; k < 3; k++) {
        g.beginPath();
        g.arc(cx + s * (100 + k * 26), h * (0.58 + k * 0.08), 12, 0, Math.PI * 1.5);
        g.stroke();
      }
    }
  });
}

// 胴の側面(漆の色に金の線)
function makeBlockTexture(THREE, color) {
  return canvasTex(THREE, 256, 64, (g, w, h) => {
    g.fillStyle = color;
    g.fillRect(0, 0, w, h);
    g.fillStyle = "rgba(255,255,255,0.12)";
    g.fillRect(0, h * 0.18, w, h * 0.12);
    g.fillStyle = "#e8c050";
    g.fillRect(0, 3, w, 3);
    g.fillRect(0, h - 6, w, 3);
  });
}

// おみくじの紙。tier が無ければ裏(「御神籤」の文字だけ)
function makeSlipTexture(THREE, tier) {
  return canvasTex(THREE, 128, 320, (g, w, h) => {
    g.fillStyle = "#fbf6ea";
    g.fillRect(0, 0, w, h);
    // 和紙の繊維
    g.strokeStyle = "rgba(180,160,120,0.18)";
    for (let i = 0; i < 40; i++) {
      g.beginPath();
      const x = Math.random() * w;
      const y = Math.random() * h;
      g.moveTo(x, y);
      g.lineTo(x + (Math.random() - 0.5) * 20, y + (Math.random() - 0.5) * 20);
      g.stroke();
    }
    g.strokeStyle = "#b8281c";
    g.lineWidth = 4;
    g.strokeRect(8, 8, w - 16, h - 16);
    g.lineWidth = 1.5;
    g.strokeRect(14, 14, w - 28, h - 28);
    g.textAlign = "center";
    g.textBaseline = "middle";
    if (!tier) {
      g.fillStyle = "#b8281c";
      g.font = "700 26px 'Hiragino Mincho ProN', 'Yu Mincho', serif";
      Array.from("御神籤").forEach((ch, i) => g.fillText(ch, w / 2, 110 + i * 40));
      return;
    }
    g.fillStyle = "#b8281c";
    g.font = "700 18px 'Hiragino Mincho ProN', 'Yu Mincho', serif";
    g.fillText("御神籤", w / 2, 40);
    g.font = `900 ${tier.length > 1 ? 66 : 92}px 'Hiragino Mincho ProN', 'Yu Mincho', serif`;
    g.lineJoin = "round";
    Array.from(tier).forEach((ch, i, a) => {
      const y = a.length > 1 ? 130 + i * 78 : 170;
      g.strokeStyle = "#2a1408";
      g.lineWidth = 6;
      g.strokeText(ch, w / 2, y);
      g.fillStyle = TIER_COLORS[tier] || "#222";
      g.fillText(ch, w / 2, y);
    });
  });
}

module.exports = { createView, TIER_COLORS };
