// らぼみ(web/static/labomi/labomi_01.png)の瞬き。ブラウザでしか動かない。
//
// 元の絵は変えずに、その上に「元の目を隠す肌色の被い」と「まぶたの線」を重ねて描く
// (SVG のパスと同じ書き方の Path2D を使う)。閉じ具合 c(0 = 開き、1 = 閉じ)で、被いとまぶたの
// 線を同じ値で動かす。c = 0 では何も描かない(元の絵のまま)。
//
// - 元の絵は右目(画面の右)だけ開いていて、左目はウインクで閉じている。瞬きは右目だけ
// - 上まぶたが下りてくる: まぶたの線(太い黒)を「開いた時の上まつげ」から「閉じた線」まで動かし、
//   その線より上を肌色で被って元の目(白目・黒目・上まつげ)を隠す。下まぶたは動かさない
// - 閉じた線は、元のウインクの線(下まぶたの高さで平ら、目尻の端だけ下がる)を左右反転した形
// - 前髪(明るい橙)と頬の赤みは目より手前にあるので、被いで消さない(画素を見て除く)
//
// 値はすべて元の絵の座標(360 × 480)。目の位置や曲線を直す時は RIGHT_EYE だけ変えればよい。

const RIGHT_EYE = {
  // まぶたの線(3 次ベジェ: 目頭 → 制御点 1 → 制御点 2 → 目尻)。open は開いた時の上まつげの
  // 真ん中あたり、closed は閉じた線
  lid: {
    open: [[187.5, 116.5], [190, 111.5], [207, 111.5], [212.5, 116.5]],
    closed: [[193, 132], [197, 131.2], [204, 132], [207.6, 134.6]],
  },
  // 被いの上側の縁(目頭の上 → 上まつげの上 → 目尻の外側の縦のまつげの外)。前髪の下に収める
  coverTop: [[185.5, 118], [187, 112], [190, 109.2], [206, 108.8], [211, 110.5], [215, 114], [214, 121], [213, 127]],
  // まぶたの線の太さ(開き → 閉じ)と色
  lineWidth: [4.4, 3],
  lineColor: "#141014",
  // 閉じた時の二重のしわ(元のウインクの上の薄い線を反転した位置)。c がこれより大きい時だけ
  crease: { from: [194, 127.4], to: [201, 127.1], width: 1.1, color: "rgba(176,128,104,0.8)", after: 0.6 },
  // 肌の色を取る点(目の周りの、髪・頬の赤みでない所)
  skinAt: [[185, 123], [186, 128], [196, 136]],
};

// 瞬きの時間(ms)と間隔
const TIMING = { close: 80, hold: 40, open: 120, gapMin: 3000, gapMax: 6000 };

// 瞬きを始めてからの時間 → 閉じ具合(0〜1)
function closureAt(ms, t = TIMING) {
  if (ms < 0) return 0;
  if (ms < t.close) return ease(ms / t.close);
  if (ms < t.close + t.hold) return 1;
  const u = (ms - t.close - t.hold) / t.open;
  return u < 1 ? 1 - ease(u) : 0;
}
function ease(u) {
  return u * u * (3 - 2 * u);
}

const lerp = (a, b, t) => a + (b - a) * t;
const lerpPt = (p, q, t) => [lerp(p[0], q[0], t), lerp(p[1], q[1], t)];

// 閉じ具合 c のまぶたの線の 4 点
function lidAt(eye, c) {
  return eye.lid.open.map((p, k) => lerpPt(p, eye.lid.closed[k], c));
}
// SVG のパスの文字列(確認用・Path2D 用)
function lidPath(eye, c) {
  const [a, b, d, e] = lidAt(eye, c);
  return `M${a[0]} ${a[1]} C${b[0]} ${b[1]} ${d[0]} ${d[1]} ${e[0]} ${e[1]}`;
}
// 被い: 上の縁をたどり、目尻側からまぶたの線を目頭へ戻って閉じる
function coverPath(eye, c) {
  const top = eye.coverTop;
  const [a, b, d, e] = lidAt(eye, c);
  let s = `M${a[0]} ${a[1]}`;
  for (const p of top) s += ` L${p[0]} ${p[1]}`;
  s += ` L${e[0]} ${e[1]} C${d[0]} ${d[1]} ${b[0]} ${b[1]} ${a[0]} ${a[1]} Z`;
  return s;
}

// 前髪(明るい橙)。目の輪郭の赤茶の線は前髪ではない(被いで隠す)
function isHair(r, g, b) {
  return r > 170 && g < 140 && b < 110 && r - g > 70;
}
function isBlush(r, g, b) {
  return r > 220 && g < 205 && r - b > 45;
}

// 元の絵(canvas か img)に、閉じ具合 c の瞬きを重ねた canvas を返す
function blinkCanvas(img, c, eye = RIGHT_EYE) {
  const W = 360;
  const H = 480;
  const out = document.createElement("canvas");
  out.width = W;
  out.height = H;
  const g = out.getContext("2d");
  g.drawImage(img, 0, 0, W, H);
  if (c <= 0.001) return out; // 開き: 元の絵そのまま
  let base;
  try {
    base = g.getImageData(0, 0, W, H);
  } catch (e) {
    return out;
  }
  const px = base.data;
  const at = (x, y) => (y * W + x) * 4;
  // 肌の色(目の周りの数点の平均)
  const skin = [0, 0, 0];
  for (const [x, y] of eye.skinAt) for (let k = 0; k < 3; k++) skin[k] += px[at(x, y) + k] / eye.skinAt.length;
  // 被いとまぶたの線を別々に描いて、画素ごとに重ねる(前髪・頬の赤みは手前に残す)
  const layer = (draw) => {
    const cv = document.createElement("canvas");
    cv.width = W;
    cv.height = H;
    const lg = cv.getContext("2d");
    draw(lg);
    return lg.getImageData(0, 0, W, H).data;
  };
  const cover = layer((lg) => {
    lg.fillStyle = `rgb(${skin.map(Math.round).join(",")})`;
    lg.fill(new Path2D(coverPath(eye, c)));
  });
  const line = layer((lg) => {
    lg.strokeStyle = eye.lineColor;
    lg.lineWidth = lerp(eye.lineWidth[0], eye.lineWidth[1], c);
    lg.lineCap = "round";
    lg.stroke(new Path2D(lidPath(eye, c)));
    const cr = eye.crease;
    if (c > cr.after) {
      lg.globalAlpha = (c - cr.after) / (1 - cr.after);
      lg.strokeStyle = cr.color;
      lg.lineWidth = cr.width;
      lg.beginPath();
      lg.moveTo(cr.from[0], cr.from[1]);
      lg.lineTo(cr.to[0], cr.to[1]);
      lg.stroke();
    }
  });
  const src = new Uint8ClampedArray(px);
  for (let y = 100; y < 145; y++) {
    for (let x = 180; x < 222; x++) {
      const i = at(x, y);
      const r = src[i];
      const gg = src[i + 1];
      const b = src[i + 2];
      if (isHair(r, gg, b)) continue;
      // 頬の赤みは残す(目の中の目尻側の赤み = y が下まぶたより上 は被う)
      const ca = isBlush(r, gg, b) && y > 131 ? 0 : cover[i + 3] / 255;
      for (let k = 0; k < 3; k++) px[i + k] = Math.round(px[i + k] * (1 - ca) + cover[i + k] * ca);
      const la = line[i + 3] / 255;
      for (let k = 0; k < 3; k++) px[i + k] = Math.round(px[i + k] * (1 - la) + line[i + k] * la);
    }
  }
  g.putImageData(base, 0, 0);
  return out;
}

module.exports = { RIGHT_EYE, TIMING, closureAt, lidPath, coverPath, blinkCanvas };
