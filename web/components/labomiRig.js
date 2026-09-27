// らぼみ(web/static/labomi/labomi_01.png の 1 枚絵)を動かす。ブラウザでしか動かない。
//
// - 絵に細かい網目(メッシュ)をかけ、頂点を動かしてゆがめる(Live2D 風)。WebGL で描く
//   - 呼吸(足元を支点に少し伸び縮み)、髪先・袴のすその揺れ、指さしの手の上下
//   - 祓串: 手元を支点に回す(swing。お祓いの一振り)
// - 瞬き: labomiEyes.js が作る「閉じ具合ごとの SVG の画像パーツ」を元の絵の目の所に重ねた絵を
//   用意しておき、閉じ具合(pose.blink: 0 = 開き 〜 1 = 閉じ)で差し替える。パーツができるまでは元の絵
// - WebGL が使えない時は、絵をそのまま少し揺らして描く
//
// 使い方: const rig = createLabomi(img); rig.render(t, pose) → rig.canvas を drawImage する。
// pose = { swing: 祓串の角度(ラジアン、+ で振り下ろし), blink: 目の閉じ具合(0 = 開き 〜 1 = 閉じ),
//          jump: 上への跳ね(px), squash: 縦の縮み(0〜0.2) }

const IW = 360; // 元の絵の大きさ
const IH = 480;
const PAD = 60; // 祓串がはみ出す分の余白
const CW = IW + PAD * 2;
const CH = IH + PAD;
const GX = 36; // 網目の数
const GY = 48;

const Eyes = require("./labomiEyes");

// 瞬きの絵を用意する閉じ具合(この間は近い方を使う)
const BLINK_LEVELS = [0, 0.2, 0.4, 0.6, 0.8, 1];

// 祓串の位置(元の絵の座標)
const PIVOT = { x: 103, y: 183 }; // 祓串を持つ手
const GOHEI = { cx: 78, cy: 148, rx: 46, ry: 78 }; // 祓串と紙垂のあたり
const FOOT = 455;

function smooth(e0, e1, x) {
  const t = Math.max(0, Math.min(1, (x - e0) / (e1 - e0)));
  return t * t * (3 - 2 * t);
}

const VS = `
attribute vec2 aPos;
attribute vec2 aUv;
varying vec2 vUv;
uniform vec2 uSize;
void main() {
  vUv = aUv;
  vec2 p = aPos / uSize * 2.0 - 1.0;
  gl_Position = vec4(p.x, -p.y, 0.0, 1.0);
}`;
const FS = `
precision mediump float;
varying vec2 vUv;
uniform sampler2D uTex;
uniform float uFlash;
void main() {
  vec4 c = texture2D(uTex, vUv);
  c.rgb += uFlash * c.a; // お祓いの瞬間、白く光る
  gl_FragColor = c;
}`;

function createLabomi(img) {
  const canvas = document.createElement("canvas");
  canvas.width = CW;
  canvas.height = CH;
  // 瞬きの絵(閉じ具合の順)。SVG の画像パーツができるまでは元の絵だけ
  let frames = [img];
  let destroyed = false;
  let gl = null;
  try {
    gl = canvas.getContext("webgl", { premultipliedAlpha: true, alpha: true, antialias: true });
  } catch (e) {
    gl = null;
  }

  // 網目の頂点(元の絵の座標)と三角形
  const base = [];
  for (let j = 0; j <= GY; j++) for (let i = 0; i <= GX; i++) base.push([(IW * i) / GX, (IH * j) / GY]);
  const idx = [];
  for (let j = 0; j < GY; j++) {
    for (let i = 0; i < GX; i++) {
      const a = j * (GX + 1) + i;
      idx.push(a, a + 1, a + GX + 1, a + 1, a + GX + 2, a + GX + 1);
    }
  }
  // 頂点ごとの重み(どこがどれだけ動くか)は先に計算しておく
  const wGohei = base.map(([x, y]) => {
    const e = Math.sqrt(((x - GOHEI.cx) / GOHEI.rx) ** 2 + ((y - GOHEI.cy) / GOHEI.ry) ** 2);
    return 1 - smooth(1, 1.2, e);
  });
  // 髪: 顔の両脇の髪先ほど大きく(祓串の所は祓串に任せる)
  const wHair = base.map(([x, y], k) => {
    const side = x < 150 ? 1 - smooth(115, 150, x) : smooth(228, 262, x);
    return side * smooth(95, 230, y) * (1 - smooth(250, 290, y)) * (1 - wGohei[k]);
  });
  const wSkirt = base.map(([, y]) => smooth(300, 440, y) ** 1.5);
  const wHand = base.map(([x, y]) => smooth(245, 262, x) * (1 - smooth(200, 225, y)) * smooth(125, 140, y));

  const pos = new Float32Array(base.length * 2);
  const bufs = []; // 片付ける時に消す WebGL のバッファ
  let prog;
  let texs = [];
  let posBuf;
  let uFlash;
  if (gl) {
    const sh = (type, src) => {
      const s = gl.createShader(type);
      if (!s) return null;
      gl.shaderSource(s, src);
      gl.compileShader(s);
      return gl.getShaderParameter(s, gl.COMPILE_STATUS) ? s : null;
    };
    const vs = sh(gl.VERTEX_SHADER, VS);
    const fs = sh(gl.FRAGMENT_SHADER, FS);
    prog = vs && fs ? gl.createProgram() : null;
    if (prog) {
      gl.attachShader(prog, vs);
      gl.attachShader(prog, fs);
      gl.linkProgram(prog);
    }
    if (!prog || !gl.getProgramParameter(prog, gl.LINK_STATUS)) {
      gl = null;
    }
  }
  if (gl) {
    gl.useProgram(prog);
    const uv = new Float32Array(base.length * 2);
    base.forEach(([x, y], k) => {
      uv[k * 2] = x / IW;
      uv[k * 2 + 1] = y / IH;
    });
    const uvBuf = gl.createBuffer();
    bufs.push(uvBuf);
    gl.bindBuffer(gl.ARRAY_BUFFER, uvBuf);
    gl.bufferData(gl.ARRAY_BUFFER, uv, gl.STATIC_DRAW);
    const aUv = gl.getAttribLocation(prog, "aUv");
    gl.enableVertexAttribArray(aUv);
    gl.vertexAttribPointer(aUv, 2, gl.FLOAT, false, 0, 0);
    posBuf = gl.createBuffer();
    bufs.push(posBuf);
    gl.bindBuffer(gl.ARRAY_BUFFER, posBuf);
    gl.bufferData(gl.ARRAY_BUFFER, pos, gl.DYNAMIC_DRAW);
    const aPos = gl.getAttribLocation(prog, "aPos");
    gl.enableVertexAttribArray(aPos);
    gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 0, 0);
    const ib = gl.createBuffer();
    bufs.push(ib);
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ib);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint16Array(idx), gl.STATIC_DRAW);
    gl.uniform2f(gl.getUniformLocation(prog, "uSize"), CW, CH);
    uFlash = gl.getUniformLocation(prog, "uFlash");
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, true);
    texs = frames.map((f) => makeTex(f));
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
  }
  function makeTex(f) {
    const t = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, t);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, f);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    return t;
  }
  // 瞬きの絵を用意する(SVG を画像にするのは非同期)
  Eyes.loadParts(BLINK_LEVELS)
    .then((parts) => {
      if (destroyed) return;
      // 絵とテクスチャが両方そろってから差し替える(途中で失敗しても、数が食い違わないように)
      const next = parts.map((pt) => Eyes.composeFrame(img, pt.c > 0 ? pt.img : null));
      if (gl && !gl.isContextLost()) {
        const nextTex = next.map((f) => makeTex(f));
        const old = texs;
        texs = nextTex;
        old.forEach((t) => gl.deleteTexture(t));
      }
      frames = next;
    })
    .catch(() => {
      // 用意できなければ瞬きしない(元の絵のまま)
    });
  const frameIndex = (c) => Math.max(0, Math.min(frames.length - 1, Math.round((c || 0) * (frames.length - 1))));
  // WebGL が使えない・失われた時の絵(WebGL の絵とは別のキャンバス。同じキャンバスでは 2D が取れない)
  const fb = document.createElement("canvas");
  fb.width = CW;
  fb.height = CH;
  const ctx2d = fb.getContext("2d");
  const glRef = gl;
  // スマホで裏に回った時などに WebGL が失われたら、それからは 2D で描く
  const onLost = (e) => {
    e.preventDefault();
    gl = null;
  };
  canvas.addEventListener("webglcontextlost", onLost);

  function render(t, pose = {}) {
    if (gl && gl.isContextLost()) gl = null;
    const swing = (pose.swing || 0) + Math.sin(t * 1.3) * 0.04;
    const breath = 1 + Math.sin(t * 2.2) * 0.012 - (pose.squash || 0);
    const jump = pose.jump || 0;
    const hair = Math.sin(t * 1.7) * 3 + swing * 3;
    const skirt = Math.sin(t * 1.5 + 0.6) * 2.2;
    const hand = Math.sin(t * 3) * 1.6;
    if (!gl) {
      ctx2d.clearRect(0, 0, CW, CH);
      ctx2d.save();
      ctx2d.translate(PAD, PAD - jump + FOOT * (1 - breath));
      ctx2d.scale(1, breath);
      ctx2d.drawImage(frames[frameIndex(pose.blink)], 0, 0, IW, IH);
      ctx2d.restore();
      return fb;
    }
    const cs = Math.cos(swing);
    const sn = Math.sin(swing);
    for (let k = 0; k < base.length; k++) {
      let [x, y] = base[k];
      // 祓串: 手元を支点に回す(重みの分だけ)
      const wg = wGohei[k];
      if (wg > 0) {
        const dx = x - PIVOT.x;
        const dy = y - PIVOT.y;
        const rx = PIVOT.x + dx * cs - dy * sn;
        const ry = PIVOT.y + dx * sn + dy * cs;
        x += (rx - x) * wg;
        y += (ry - y) * wg;
      }
      x += hair * wHair[k] * (x < 180 ? 1 : -0.8);
      x += skirt * wSkirt[k];
      y += hand * wHand[k];
      // 呼吸(足元を支点に)と跳ね
      y = FOOT + (y - FOOT) * breath - jump;
      pos[k * 2] = x + PAD;
      pos[k * 2 + 1] = y + PAD;
    }
    gl.viewport(0, 0, CW, CH);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.bindBuffer(gl.ARRAY_BUFFER, posBuf);
    gl.bufferSubData(gl.ARRAY_BUFFER, 0, pos);
    gl.bindTexture(gl.TEXTURE_2D, texs[frameIndex(pose.blink)]);
    gl.uniform1f(uFlash, pose.flash || 0);
    gl.drawElements(gl.TRIANGLES, idx.length, gl.UNSIGNED_SHORT, 0);
    return canvas;
  }

  // ページを離れる時に WebGL を手放す(残すと、来るたびに増えて古いものから落とされる)
  function destroy() {
    destroyed = true;
    canvas.removeEventListener("webglcontextlost", onLost);
    const g = glRef;
    if (!g) return;
    try {
      if (!g.isContextLost()) {
        texs.forEach((t) => g.deleteTexture(t));
        bufs.forEach((b) => g.deleteBuffer(b));
        g.deleteProgram(prog);
      }
      const ext = g.getExtension("WEBGL_lose_context");
      if (ext) ext.loseContext();
    } catch (e) {
      // すでに失われている
    }
    gl = null;
  }

  return {
    canvas,
    render,
    destroy,
    base: img, // 元の絵(ウインク)
    get frames() {
      return frames;
    },
    webgl: !!gl,
    W: CW,
    H: CH,
    PAD,
    IW,
    IH,
    PIVOT,
  };
}

module.exports = { createLabomi, IW, IH, PAD, CW, CH, PIVOT };
