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
const PIVOT = { x: 103, y: 183 }; // 祓串を持つ手
const GOHEI = { cx: 78, cy: 148, rx: 46, ry: 78 }; // 祓串と紙垂のあたり
const FOOT = 455;

function smooth(e0, e1, x) {
  const t = Math.max(0, Math.min(1, (x - e0) / (e1 - e0)));
  return t * t * (3 - 2 * t);
}

// ---- 目(図形で描き直す) ----
// 元の絵の目は画素なので、開き具合を変えられない。両目(開いた右目とウインクの左目)を肌の色で
// 消してから、線と塗りの図形(SVG のような描き方)で描き直す。open: 1 = 開き、0 = 閉じ。
// 座標は元の絵の座標。左目は顔の中心(x = FACE_X)を挟んで右目と対になる位置
const FACE_X = 182;
const EYE_R = { cx: 201, cy: 122 }; // 右目の中心
const EYE_L = { cx: 2 * FACE_X - EYE_R.cx, cy: EYE_R.cy };
const isHairPx = (r, g, b) => (r > 170 && g < 140 && b < 110 && r - g > 70) || (r - b > 60 && g < 150); // 前髪とその縁の線
const isBlushPx = (r, g, b) => r > 220 && g < 205 && r - b > 45; // 頬の赤み

function lerp(a, b, t) {
  return a + (b - a) * t;
}
function mix(p, q, t) {
  return [lerp(p[0], q[0], t), lerp(p[1], q[1], t)];
}

// 1 つの目を描く。s = 1 は右目(目尻が +x)、-1 は左目
function drawEye(g, cx, cy, s, open) {
  // まぶたの端(目頭・目尻)と上まぶたの山。閉じると、下向きのゆるいカーブ 1 本になる
  const inner = mix([-11.5 * s, 4], [-9.5 * s, 5], 1 - open);
  const outer = mix([12 * s, -2], [10 * s, 4], 1 - open);
  const upCtl = mix([1 * s, -23], [0, 8], 1 - open); // 上まぶたの制御点
  const lowCtl = [0.5 * s, 18]; // 下まぶたの制御点
  g.save();
  g.translate(cx, cy);
  const upper = () => {
    g.moveTo(inner[0], inner[1]);
    g.quadraticCurveTo(upCtl[0], upCtl[1], outer[0], outer[1]);
  };
  if (open > 0.08) {
    // 白目(上まぶたと下まぶたの間)
    g.beginPath();
    upper();
    g.quadraticCurveTo(lowCtl[0], lowCtl[1], inner[0], inner[1]);
    g.closePath();
    g.fillStyle = "#fbfbff";
    g.fill();
    g.save();
    g.clip();
    // 黒目(青)と瞳孔、ハイライト(光は左上から、両目とも同じ向き)
    const ix = 1 * s;
    const iy = 2.5;
    const grd = g.createLinearGradient(0, iy - 9, 0, iy + 9);
    grd.addColorStop(0, "#1d3a8f");
    grd.addColorStop(0.55, "#2f6fd0");
    grd.addColorStop(1, "#7fb8f5");
    g.fillStyle = grd;
    g.beginPath();
    g.ellipse(ix, iy, 8, 9.6, 0, 0, Math.PI * 2);
    g.fill();
    g.strokeStyle = "#12225a";
    g.lineWidth = 1.2;
    g.stroke();
    g.fillStyle = "#0b1030";
    g.beginPath();
    g.ellipse(ix + 0.3, iy - 0.5, 4, 5, 0, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = "#ffffff";
    g.beginPath();
    g.ellipse(ix - 3.2, iy - 3.8, 3, 3.4, 0, 0, Math.PI * 2);
    g.fill();
    g.beginPath();
    g.arc(ix + 3, iy + 4.2, 1.3, 0, Math.PI * 2);
    g.fill();
    // 上まぶたの影
    g.strokeStyle = "rgba(40,30,50,0.35)";
    g.lineWidth = 4;
    g.beginPath();
    upper();
    g.stroke();
    g.restore();
    // 下まつげ(目尻側だけ細く)
    g.strokeStyle = "rgba(70,40,35,0.8)";
    g.lineWidth = 1;
    g.beginPath();
    for (let k = 0; k <= 8; k++) {
      // 下まぶたの曲線の、目尻側 1/3 をなぞる
      const t = 0.06 + (k / 8) * 0.34;
      const x = (1 - t) * (1 - t) * outer[0] + 2 * (1 - t) * t * lowCtl[0] + t * t * inner[0];
      const y = (1 - t) * (1 - t) * outer[1] + 2 * (1 - t) * t * lowCtl[1] + t * t * inner[1];
      if (k === 0) g.moveTo(x, y);
      else g.lineTo(x, y);
    }
    g.stroke();
  }
  // 上まつげ(太い黒)と目尻の跳ね
  g.strokeStyle = "#141014";
  g.lineCap = "round";
  g.lineJoin = "round";
  g.lineWidth = lerp(2.6, 3.4, open);
  g.beginPath();
  upper();
  g.stroke();
  g.lineWidth = 2.2;
  g.beginPath();
  g.moveTo(outer[0], outer[1]);
  g.lineTo(outer[0] + 3 * s, outer[1] - 2.5 * open - 1);
  g.stroke();
  g.restore();
}

// 目の絵(open: 1 = 開き、0 = 閉じ)。元の目を消して、両目を描き直す
function eyeFrame(img, open) {
  const c = document.createElement("canvas");
  c.width = IW;
  c.height = IH;
  const g = c.getContext("2d");
  g.drawImage(img, 0, 0, IW, IH);
  let d;
  try {
    d = g.getImageData(0, 0, IW, IH);
  } catch (e) {
    return c; // 画素が読めない時は元の絵のまま
  }
  const px = d.data;
  const at = (x, y) => (y * IW + x) * 4;
  const s0 = at(182, 128); // 目の間の肌の色
  const skin = [px[s0], px[s0 + 1], px[s0 + 2]];
  const paint = (x, y) => {
    const i = at(x, y);
    const r = px[i];
    const gg = px[i + 1];
    const b = px[i + 2];
    if (isHairPx(r, gg, b) || isBlushPx(r, gg, b)) return;
    px[i] = skin[0];
    px[i + 1] = skin[1];
    px[i + 2] = skin[2];
  };
  // 右目を消す
  for (let y = 106; y <= 132; y++) for (let x = 184; x <= 219; x++) if (((x - 201) / 17) ** 2 + ((y - 120) / 14) ** 2 <= 1) paint(x, y);
  // 左目(ウインクの線と上のしわ)を消す
  for (let y = 122; y <= 140; y++) for (let x = 150; x <= 179; x++) paint(x, y);
  g.putImageData(d, 0, 0);
  // 描き直した目を別の絵に描いて、前髪の所を除いて重ねる(前髪は目より手前)
  const e = document.createElement("canvas");
  e.width = IW;
  e.height = IH;
  const eg = e.getContext("2d");
  drawEye(eg, EYE_R.cx, EYE_R.cy, 1, open);
  drawEye(eg, EYE_L.cx, EYE_L.cy, -1, open);
  const ed = eg.getImageData(0, 0, IW, IH).data;
  const base = g.getImageData(0, 0, IW, IH);
  const bp = base.data;
  for (let y = 100; y < 145; y++) {
    for (let x = 140; x < 225; x++) {
      const i = at(x, y);
      const a = ed[i + 3] / 255;
      if (a <= 0) continue;
      if (isHairPx(bp[i], bp[i + 1], bp[i + 2])) continue;
      for (let k = 0; k < 3; k++) bp[i + k] = Math.round(bp[i + k] * (1 - a) + ed[i + k] * a);
    }
  }
  g.putImageData(base, 0, 0);
  return c;
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
  const frames = [eyeFrame(img, 1), eyeFrame(img, 0.45), eyeFrame(img, 0), img];
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

module.exports = { createLabomi, eyeFrame, drawEye, IW, IH, PAD, CW, CH, PIVOT, EYE };
