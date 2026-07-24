// おみくじ装置のパターンレジストリ(#200)。
//
// 新しいパターンを追加するときは:
//   1. patternXXName.js を作り { id, name, build } をエクスポートする
//      (build は共通フレームの上に中間のからくりを組み、{ relayBall } を返す。
//       リレー玉が無いパターンは relayBall: null)
//   2. この配列に加える
//   3. `node scripts/simulate-omikuji.js --sweep 1801 --max-ritual 30` で
//      全パターンの完走(失敗0)と --jitter の静止を確認する(必須)
//
// 選択は毎回ランダム(Issue #200 の方針)。

const PATTERNS = [
  require("./pattern01Karakuri.js"),
  require("./pattern02Zigzag.js"),
];

module.exports = { PATTERNS };
