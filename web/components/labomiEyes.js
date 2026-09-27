// らぼみ(web/static/labomi/labomi_01.png)の瞬き。
//
// 元の絵は変えずに、その上に SVG を重ねる。SVG には「元の目を隠す肌色の被い」と「まぶたの線」を描く。
// 閉じ具合 c(0 = 開き、1 = 閉じ)で、被いとまぶたの線を同じ値で動かす。c = 0 では何も描かない
// (元の絵のまま)。ゲームでは、閉じ具合ごとの SVG を画像のパーツにしておき、元の絵の目の所に重ねた
// 絵を瞬きの時に差し替える(labomiRig.js)。
//
// - 元の絵は右目(画面の右)だけ開いていて、左目はウインクで閉じている。瞬きは右目だけ
// - 上まぶたが下りてくる: まぶたの線を「開いた時の上まつげ」から「閉じた線」まで動かし、その線より
//   上を肌色で被って元の目(白目・黒目・上まつげ)を隠す。下まぶたは少しだけ上がって閉じた線で合わさり、
//   その下も被う(閉じた線の下に元の目が見えないように)
// - 閉じた線は元のウインクの線(平らで、目尻側の端が下がる)を左右反転した形。右目は画面の手前に
//   少し近く、顔は右側が少し上がっているので、少し大きく・少し上に・左回りに少し回して置く
// - 被いは前髪・横の髪・頬の赤みにかからない形にしてある(元の絵を 1px ずつ見て決めた)
//
// 値はすべて元の絵の座標(360 × 480)。目の形や位置を直す時は RIGHT_EYE だけ変えればよい。

const RIGHT_EYE = {
  skin: "#feddbd", // 目の周りの肌の色(元の絵から測った)
  lineColor: "#141014",
  lineWidth: [4.4, 3.1], // まぶたの線の太さ(開き → 閉じ)
  // まぶたの線(3 次ベジェ: 目頭 → 制御点 1 → 制御点 2 → 目尻)
  lid: {
    open: [[187.5, 116.5], [190, 111.5], [207, 111.5], [212.5, 116.5]], // 開いた時の上まつげ
    closed: [[193, 128.3], [197, 127.3], [204, 127.4], [207.8, 129.8]], // 閉じた線(置き方は closedPose)
  },
  // 閉じた線の置き方: 閉じた線の真ん中を中心に、大きさ・回転(度。マイナスで左回り)・上下のずれ
  closedPose: { scale: 1.08, rotate: -4, dy: -1.5 },
  // 下まぶた(目頭 → 目尻)。開いた時は元の目の下の縁。閉じた時はまぶたの線に重なる
  lowerLidOpen: [[188, 121], [191.5, 131.2], [204.5, 132], [211, 126]],
  // 被いの外側の縁。上: 目頭の上 → 上まつげの上 → 目尻の外の縦のまつげの外(前髪・横の髪の手前まで)
  coverTop: [[186, 118], [188.2, 112.6], [190.4, 110.4], [205, 109.4], [208, 110.8], [212, 112.2], [214, 114.3], [214.4, 116], [213.8, 121], [213, 126.5]],
  // 下: 目の下の縁の少し外(頬の赤みの手前まで)。最後は上の縁の始まりと同じ点(目頭で上下の被いの間にすき間を作らない)
  lowerEdge: [[211.6, 126.5], [211, 129.6], [208, 131.6], [201, 132.1], [193.4, 132.3], [189.2, 127.6], [186.6, 121], [186, 118]],
  // 閉じた時の二重のしわ(元のウインクの上の薄い線を反転した位置。閉じた線と一緒に置き直す)
  crease: { from: [194, 123.4], to: [201, 122.9], width: 1.1, color: "#b0806a", opacity: 0.8, after: 0.6 },
  // 画像のパーツにする範囲(元の絵の座標)
  box: { x: 176, y: 96, w: 48, h: 50 },
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
const f1 = (v) => Math.round(v * 100) / 100;

// 閉じた線の置き方(closedPose)を点に当てる
function posed(eye, pts) {
  const c = eye.lid.closed;
  const cx = (c[0][0] + c[3][0]) / 2;
  const cy = (c[0][1] + c[1][1] + c[2][1] + c[3][1]) / 4;
  const { scale, rotate, dy } = eye.closedPose;
  const a = (rotate * Math.PI) / 180;
  return pts.map(([x, y]) => {
    const dx0 = (x - cx) * scale;
    const dy0 = (y - cy) * scale;
    return [cx + dx0 * Math.cos(a) - dy0 * Math.sin(a), cy + dx0 * Math.sin(a) + dy0 * Math.cos(a) + dy];
  });
}
function closedLid(eye) {
  return posed(eye, eye.lid.closed);
}

// 閉じ具合 c のまぶたの線と下まぶたの 4 点
function lidAt(eye, c) {
  const closed = closedLid(eye);
  return eye.lid.open.map((p, k) => lerpPt(p, closed[k], c));
}
function lowerAt(eye, c) {
  const closed = closedLid(eye);
  return eye.lowerLidOpen.map((p, k) => lerpPt(p, closed[k], c));
}

// ---- SVG のパス ----
const bez = ([a, b, d, e]) => `M${f1(a[0])} ${f1(a[1])} C${f1(b[0])} ${f1(b[1])} ${f1(d[0])} ${f1(d[1])} ${f1(e[0])} ${f1(e[1])}`;
function lidPath(eye, c) {
  return bez(lidAt(eye, c));
}
// 上の被い: 目頭 → 外側の縁 → 目尻 → まぶたの線を目頭へ
function coverPath(eye, c) {
  const [a, b, d, e] = lidAt(eye, c);
  let s = `M${f1(a[0])} ${f1(a[1])}`;
  for (const p of eye.coverTop) s += ` L${p[0]} ${p[1]}`;
  return `${s} L${f1(e[0])} ${f1(e[1])} C${f1(d[0])} ${f1(d[1])} ${f1(b[0])} ${f1(b[1])} ${f1(a[0])} ${f1(a[1])} Z`;
}
// 下の被い: 目尻 → 下の縁 → 目頭 → 下まぶたを目尻へ
function lowerCoverPath(eye, c) {
  const [a, b, d, e] = lowerAt(eye, c);
  let s = `M${f1(e[0])} ${f1(e[1])}`;
  for (const p of eye.lowerEdge) s += ` L${p[0]} ${p[1]}`;
  return `${s} L${f1(a[0])} ${f1(a[1])} C${f1(b[0])} ${f1(b[1])} ${f1(d[0])} ${f1(d[1])} ${f1(e[0])} ${f1(e[1])} Z`;
}

// 閉じ具合 c の SVG(box の範囲。scale 倍の大きさの画像にする)
function eyeSvg(eye, c, scale = 2) {
  const { x, y, w, h } = eye.box;
  let body = "";
  if (c > 0.001) {
    const cr = eye.crease;
    const [p, q] = posed(eye, [cr.from, cr.to]);
    const creaseOp = c > cr.after ? (cr.opacity * (c - cr.after)) / (1 - cr.after) : 0;
    body =
      `<path d="${coverPath(eye, c)}" fill="${eye.skin}"/>` +
      `<path d="${lowerCoverPath(eye, c)}" fill="${eye.skin}"/>` +
      (creaseOp > 0 ? `<path d="M${f1(p[0])} ${f1(p[1])} L${f1(q[0])} ${f1(q[1])}" stroke="${cr.color}" stroke-width="${cr.width}" stroke-linecap="round" opacity="${f1(creaseOp)}" fill="none"/>` : "") +
      `<path d="${lidPath(eye, c)}" stroke="${eye.lineColor}" stroke-width="${f1(lerp(eye.lineWidth[0], eye.lineWidth[1], c) * lerp(1, eye.closedPose.scale, c))}" stroke-linecap="round" fill="none"/>`;
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${x} ${y} ${w} ${h}" width="${w * scale}" height="${h * scale}">${body}</svg>`;
}

// 閉じ具合ごとの画像パーツ(SVG を画像にしたもの)。Promise<[{ c, img }]>
function loadParts(levels, eye = RIGHT_EYE) {
  return Promise.all(
    levels.map(
      (c) =>
        new Promise((resolve, reject) => {
          const img = new Image();
          img.onload = () => resolve({ c, img });
          img.onerror = reject;
          img.src = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(eyeSvg(eye, c));
        })
    )
  );
}

// 元の絵にパーツを重ねた絵(canvas)
function composeFrame(base, part, eye = RIGHT_EYE) {
  const c = document.createElement("canvas");
  c.width = 360;
  c.height = 480;
  const g = c.getContext("2d");
  g.drawImage(base, 0, 0, 360, 480);
  if (part) {
    const { x, y, w, h } = eye.box;
    g.drawImage(part, x, y, w, h);
  }
  return c;
}

module.exports = { RIGHT_EYE, TIMING, closureAt, lidPath, coverPath, lowerCoverPath, eyeSvg, loadParts, composeFrame };
