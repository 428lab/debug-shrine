// おみくじ演出の装置(からくり)の一覧と選択。
//
// 演出は「儀式(ユーザー操作) → 装置の見せ場(サーバー応答待ち) → 狐が本命の
// ビンへ着地(結果)」の3幕で、装置を差し替えても幕の構造は変わらない。
// 各装置モジュールは同じインターフェースを実装し、OmikujiScene はそれだけを
// 使って動く(装置固有の座標や操作をシーンに持ち込まない)。
//
// インターフェース:
//   id            : 識別子("bell" など)。?scene= での指定にも使う
//   GEO           : 論理座標系(W/H/BIN_COUNT/FIXED_DELTA/BIN_TOP/FLOOR_Y ほか)
//   FOX           : 狐の寝床 { sleepLeft, sleepBottom, flip }(シーン内%)
//   HINT          : { title, fallback, button } 案内文
//   TIMELINE      : { nudgeMs, wakeMs, failsafeMs } 詰まり時のフォールバック時刻
//   wakeLabels    : fox-sensor に触れたら狐が起きるボディのラベル
//   grabFilter    : 指でつまめるものの collisionFilter(MouseConstraint 用)
//   build(Matter, opts?): 世界を組む。{ engine, world, ...handles }。opts.rnd で乱数を注入可(検証用)
//   pulseAt(built): 儀式完了の波紋を出す論理座標 { x, y }
//   createRitual(Matter, built): { step(dragging) → 儀式完了で true }
//   fallbackRitual(Matter, built, ritual): 「うまくできないとき」の代替操作。
//                   その場で完了なら true(以降は step に任せるなら false)
//   onRitualDone(Matter, built, later): 儀式完了時の装置側の処理(玉の投入等)
//   nudge(Matter, built): 詰まったときにそっと押す
//   createSettleDetector(Matter, built) (任意): { step() → 静止したら true }。
//                   狙いが外れて何にも当たらない装置で、物音で狐を起こすきっかけ
//
// 抽選の正しさは装置に依存しない(狐の最終着地は omikujiFox.js)。
const bell = require("./omikujiMachine");
const slingshot = require("./omikujiSlingshot");
const pinball = require("./omikujiPinball");

const ALL = { bell, slingshot, pinball };
const IDS = Object.keys(ALL);

function byId(id) {
  return ALL[id] || bell;
}

// 毎回ランダムに1つ選ぶ(rnd は検証用に注入可)。
function pick(rnd) {
  const r = (rnd || Math.random)();
  return IDS[Math.min(IDS.length - 1, Math.floor(r * IDS.length))];
}

module.exports = { ALL, IDS, byId, pick };
