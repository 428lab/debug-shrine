// らぼみ(web/static/labomi/labomi_01.png の 1 枚絵)を動かす。ブラウザでしか動かない。
//
// - 絵に細かい網目(メッシュ)をかけ、頂点を動かしてゆがめる(Live2D 風)。WebGL で描く
//   - 呼吸(足元を支点に少し伸び縮み)、髪先・袴のすその揺れ、指さしの手の上下
//   - 祓串: 手元を支点に回す(swing。お祓いの一振り)
// - 目: 元の絵はウインクなので、ふだんは左目も開ける(左目の閉じた線を消し、右目を左右反転して
//   写す)。瞬きは両目で「半分」「閉じ」の絵に差し替える。半分は目全体を下まつげの所を支点に縦に
//   つぶし、閉じはウインクしている左目の線(右目はそれを左右反転)。前髪は目より手前に残す。
//   blink: 0 = 両目を開ける、1 = 半分、2 = 閉じ、3 = もとの絵(ウインク。決めの場面で使う)
// - WebGL が使えない時は、絵をそのまま少し揺らして描く
//
// 使い方: const rig = createLabomi(img); rig.render(t, pose) → rig.canvas を drawImage する。
// pose = { swing: 祓串の角度(ラジアン、+ で振り下ろし), blink: 0 開き / 1 半分 / 2 閉じ / 3 ウインク,
//          jump: 上への跳ね(px), squash: 縦の縮み(0〜0.2) }

const IW = 360; // 元の絵の大きさ
const IH = 480;
const PAD = 60; // 祓串がはみ出す分の余白
const CW = IW + PAD * 2;
const CH = IH + PAD;
const GX = 36; // 網目の数
const GY = 48;

// 目と祓串の位置(元の絵の座標)
const EYE = { cx: 201, cy: 122, rx: 17, ry: 15 };
// ウインクしている左目の線のある所と、右目へ写す時の反転の軸(x → mirror - x)と上下のずれ
const WINK = { x0: 153, x1: 176, y0: 124, y1: 139, mirror: 364, dy: 0 };
// 左目を開ける時: 右目の写す範囲(s)と、左目の消す範囲(c)
const LEFT = { sx0: 181, sx1: 222, sy0: 100, sy1: 134, cx0: 152, cx1: 178, cy0: 119, cy1: 140 };
// 開いている右目の下まつげの高さ(半分閉じる時は、ここを支点に縦につぶす)
const LOWER = 135;
const PIVOT = { x: 103, y: 183 }; // 祓串を持つ手
const GOHEI = { cx: 78, cy: 148, rx: 46, ry: 78 }; // 祓串と紙垂のあたり
const FOOT = 455;

function smooth(e0, e1, x) {
  const t = Math.max(0, Math.min(1, (x - e0) / (e1 - e0)));
  return t * t * (3 - 2 * t);
}

// 瞬きの絵(close: 0.5 = 半分、1 = 閉じ)
function blinkFrame(img, close) {
  const c = document.createElement("canvas");
  c.width = IW;
  c.height = IH;
  const g = c.getContext("2d");
  g.drawImage(img, 0, 0, IW, IH);
  let d;
  try {
    d = g.getImageData(0, 0, IW, IH);
  } catch (e) {
    return c; // 画素が読めない(別のドメインの絵など)時は瞬きしない
  }
  const px = d.data;
  const src = new Uint8ClampedArray(px); // 塗る前の絵(まつげを写すのに使う)
  const at = (x, y) => (y * IW + x) * 4;
  const s = at(182, 128); // 目の横の肌の色
  const skin = [px[s], px[s + 1], px[s + 2]];
  if (close <= 0) {
    // 開き: 右目はそのまま、左目を開けるだけ
    openLeft(px, src, skin, at);
    g.putImageData(d, 0, 0);
    return c;
  }
  // 閉じ: 目の上側(白目・黒目・上まつげ)を肌の色で塗る
  const lidY = 131;
  for (let y = 100; y < 142 && close >= 1; y++) {
    for (let x = 178; x < 224; x++) {
      const e = ((x - EYE.cx) / EYE.rx) ** 2 + ((y - EYE.cy) / EYE.ry) ** 2;
      if (e > 1 || y > lidY) continue;
      const i = at(x, y);
      const r = px[i];
      const gg = px[i + 1];
      const b = px[i + 2];
      const hair = r > 170 && gg < 140 && b < 110 && r - gg > 70; // 前髪(橙)は残す
      if (hair) continue;
      px[i] = skin[0];
      px[i + 1] = skin[1];
      px[i + 2] = skin[2];
    }
  }
  if (close >= 1) {
    // 閉じた目は、もともとウインクしている左目の線(と上のしわ)を左右反転して貼る。
    // 肌より暗い所だけを、暗さに応じて重ねる(周りの肌や髪はそのまま)
    const skinL = skin[0] + skin[1] + skin[2];
    for (let y = WINK.y0; y <= WINK.y1; y++) {
      for (let x = WINK.x0; x <= WINK.x1; x++) {
        const si = at(x, y);
        const a = Math.max(0, Math.min(1, (skinL - (src[si] + src[si + 1] + src[si + 2])) / 150));
        if (a <= 0) continue;
        const dx = WINK.mirror - x;
        const dy = y + WINK.dy;
        const di = at(dx, dy);
        for (let k = 0; k < 3; k++) px[di + k] = Math.round(px[di + k] * (1 - a) + src[si + k] * a);
      }
    }
    openLeft(px, src, skin, at);
    g.putImageData(d, 0, 0);
    return c;
  }
  // 半分: 目全体(まつげ・白目・黒目)を、下まつげの所を支点に縦につぶす。
  // (上の塗りつぶしは使わず、元の目の範囲を肌で消してから、つぶした目を描き直す)
  const k = 1 - close * 0.9; // 高さの割合
  const inBox = (x, y) => ((x - EYE.cx) / (EYE.rx + 4)) ** 2 + ((y - EYE.cy) / (EYE.ry + 3)) ** 2 <= 1;
  const isHair = (r, gg, b) => r > 170 && gg < 140 && b < 110 && r - gg > 70;
  const eyeish = (i) => {
    const r = src[i];
    const gg = src[i + 1];
    const b = src[i + 2];
    if (isHair(r, gg, b) || r - b > 40) return false; // 前髪・肌・頬の赤み
    return Math.abs(r - skin[0]) + Math.abs(gg - skin[1]) + Math.abs(b - skin[2]) >= 40;
  };
  for (let y = EYE.cy - EYE.ry - 4; y <= EYE.cy + EYE.ry + 3; y++) {
    for (let x = EYE.cx - EYE.rx - 5; x <= EYE.cx + EYE.rx + 5; x++) {
      if (!inBox(x, y)) continue;
      const i = at(x, y);
      if (isHair(src[i], src[i + 1], src[i + 2])) continue;
      // つぶした後にここへ来る元の画素
      const sy = Math.round(LOWER - (LOWER - y) / k);
      const si = sy >= 0 ? at(x, sy) : -1;
      if (y <= LOWER && si >= 0 && inBox(x, sy) && eyeish(si)) {
        px[i] = src[si];
        px[i + 1] = src[si + 1];
        px[i + 2] = src[si + 2];
      } else if (eyeish(i)) {
        px[i] = skin[0];
        px[i + 1] = skin[1];
        px[i + 2] = skin[2];
      }
    }
  }
  openLeft(px, src, skin, at);
  g.putImageData(d, 0, 0);
  return c;
}

// ウインクしている左目を開ける: 左目の閉じた線を肌の色で消し、右目(今の状態: 開き・半分・閉じ)を
// 左右反転して写す。前髪(橙)は目より手前にあるので、写した目で上書きしない
function openLeft(px, src, skin, at) {
  const isHair = (r, g, b) => r > 170 && g < 140 && b < 110 && r - g > 70;
  const near = (i) => Math.abs(px[i] - skin[0]) + Math.abs(px[i + 1] - skin[1]) + Math.abs(px[i + 2] - skin[2]);
  // 右目の今の画素を先に取っておく(左へ写す元)
  const eye = [];
  for (let y = LEFT.sy0; y <= LEFT.sy1; y++) {
    for (let x = LEFT.sx0; x <= LEFT.sx1; x++) {
      // 目の輪郭の中だけ(髪飾り・前髪の縁・頬の赤みは写さない)
      if (((x - EYE.cx) / (EYE.rx + 3)) ** 2 + ((y - EYE.cy + 1) / (EYE.ry + 2)) ** 2 > 1) continue;
      const i = at(x, y);
      const r = px[i];
      const gg = px[i + 1];
      const b = px[i + 2];
      if (isHair(r, gg, b)) continue;
      if (r - b > 40) continue; // 肌・頬の赤み・前髪の縁(赤み・橙み)。目は黒・白・青だけ
      if (near(i) < 40) continue; // 肌はそのまま(左の肌を使う)
      eye.push([WINK.mirror - x, y - WINK.dy, px[i], px[i + 1], px[i + 2]]);
    }
  }
  // 左目の閉じた線(としわ)を消す
  for (let y = LEFT.cy0; y <= LEFT.cy1; y++) {
    for (let x = LEFT.cx0; x <= LEFT.cx1; x++) {
      const i = at(x, y);
      if (isHair(src[i], src[i + 1], src[i + 2])) continue;
      if (Math.abs(src[i] - skin[0]) + Math.abs(src[i + 1] - skin[1]) + Math.abs(src[i + 2] - skin[2]) < 25) continue;
      px[i] = skin[0];
      px[i + 1] = skin[1];
      px[i + 2] = skin[2];
    }
  }
  for (const [x, y, r, g, b] of eye) {
    const i = at(x, y);
    // 前髪(橙)とその縁の線(赤茶)は目より手前
    if (isHair(src[i], src[i + 1], src[i + 2]) || (src[i] - src[i + 2] > 60 && src[i + 1] < 150)) continue;
    px[i] = r;
    px[i + 1] = g;
    px[i + 2] = b;
  }
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
  // 0 = 両目を開ける、1 = 半分、2 = 閉じ、3 = もとの絵(ウインク)
  const frames = [blinkFrame(img, 0), blinkFrame(img, 0.5), blinkFrame(img, 1), img];
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
    texs = frames.map((f) => {
      const t = gl.createTexture();
      gl.bindTexture(gl.TEXTURE_2D, t);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, f);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      return t;
    });
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
  }
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
      ctx2d.drawImage(frames[pose.blink || 0], 0, 0, IW, IH);
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
    gl.bindTexture(gl.TEXTURE_2D, texs[pose.blink || 0]);
    gl.uniform1f(uFlash, pose.flash || 0);
    gl.drawElements(gl.TRIANGLES, idx.length, gl.UNSIGNED_SHORT, 0);
    return canvas;
  }

  // ページを離れる時に WebGL を手放す(残すと、来るたびに増えて古いものから落とされる)
  function destroy() {
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

  return { canvas, render, destroy, frames, webgl: !!gl, W: CW, H: CH, PAD, IW, IH, PIVOT, EYE };
}

module.exports = { createLabomi, blinkFrame, IW, IH, PAD, CW, CH, PIVOT, EYE };
