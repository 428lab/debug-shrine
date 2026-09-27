// らぼみ(web/static/labomi/labomi_01.png の 1 枚絵)を動かす。ブラウザでしか動かない。
//
// - 絵に細かい網目(メッシュ)をかけ、頂点を動かしてゆがめる(Live2D 風)。WebGL で描く
//   - 呼吸(足元を支点に少し伸び縮み)、髪先・袴のすその揺れ、指さしの手の上下
//   - 祓串: 手元を支点に回す(swing。お祓いの一振り)
// - 瞬き: 開いている右目の白目・黒目・まつげを肌の色で塗り、まぶたの線を描いた絵を
//   「半分」「閉じ」の 2 枚作って差し替える(前髪の色の点は残す)
// - WebGL が使えない時は、絵をそのまま少し揺らして描く
//
// 使い方: const rig = createLabomi(img); rig.render(t, pose) → rig.canvas を drawImage する。
// pose = { swing: 祓串の角度(ラジアン、+ で振り下ろし), blink: 0 開き / 1 半分 / 2 閉じ,
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
  const at = (x, y) => (y * IW + x) * 4;
  const s = at(182, 128); // 目の横の肌の色
  const skin = [px[s], px[s + 1], px[s + 2]];
  const lidY = close >= 1 ? 131 : EYE.cy - EYE.ry + close * 2 * EYE.ry * 0.8;
  for (let y = 100; y < 142; y++) {
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
  g.putImageData(d, 0, 0);
  g.strokeStyle = "#2b1715";
  g.lineCap = "round";
  g.lineWidth = 2.4;
  g.beginPath();
  g.moveTo(187, lidY + (close >= 1 ? 1 : 0));
  g.quadraticCurveTo(200, lidY + (close >= 1 ? 5 : 2), 213, lidY - 1);
  g.stroke();
  g.lineWidth = 1.8;
  g.beginPath();
  g.moveTo(211, lidY - 1);
  g.lineTo(215, lidY - 4);
  g.stroke();
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
  const frames = [img, blinkFrame(img, 0.5), blinkFrame(img, 1)];
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
  let prog;
  let texs = [];
  let posBuf;
  let uFlash;
  if (gl) {
    const sh = (type, src) => {
      const s = gl.createShader(type);
      gl.shaderSource(s, src);
      gl.compileShader(s);
      return s;
    };
    prog = gl.createProgram();
    gl.attachShader(prog, sh(gl.VERTEX_SHADER, VS));
    gl.attachShader(prog, sh(gl.FRAGMENT_SHADER, FS));
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
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
    gl.bindBuffer(gl.ARRAY_BUFFER, uvBuf);
    gl.bufferData(gl.ARRAY_BUFFER, uv, gl.STATIC_DRAW);
    const aUv = gl.getAttribLocation(prog, "aUv");
    gl.enableVertexAttribArray(aUv);
    gl.vertexAttribPointer(aUv, 2, gl.FLOAT, false, 0, 0);
    posBuf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, posBuf);
    gl.bufferData(gl.ARRAY_BUFFER, pos, gl.DYNAMIC_DRAW);
    const aPos = gl.getAttribLocation(prog, "aPos");
    gl.enableVertexAttribArray(aPos);
    gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 0, 0);
    const ib = gl.createBuffer();
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
  const ctx2d = gl ? null : canvas.getContext("2d");

  function render(t, pose = {}) {
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
      return canvas;
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

  return { canvas, render, frames, webgl: !!gl, W: CW, H: CH, PAD, IW, IH, PIVOT, EYE };
}

module.exports = { createLabomi, blinkFrame, IW, IH, PAD, CW, CH, PIVOT, EYE };
