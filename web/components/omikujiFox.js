// 狐セレクタのホップ列を生成する純関数。
//
// おみくじの結果(レア度 tier)はサーバーが決める。演出では、シャッフルした7つのビンの
// うち tier が載っている物理ビン(= targetBin)へ狐が最後に着地することで結果を"選ぶ"。
// 途中はおとり(フェイクアウト)で別のビンに跳ねてハラハラさせる。
//
// この関数は演出用だが、「最後のホップ先 == targetBin」「途中はターゲット以外」という
// 公平性の核を Node で決定論的に検証できるよう純粋に保つ(乱数は引数で注入可能)。

// ひと跳び直行(おとり無し)の確率。毎回2〜3回のフェイクアウトだと展開が
// 読めてしまうため、たまに迷いなく本命へ飛び込むパターンを混ぜる。
const DIRECT_HOP_RATE = 0.2;

// targetBin: 本命の物理ビン index(0..binCount-1)
// binCount : ビン数(通常7)
// rnd      : 0..1 の乱数関数(省略時 Math.random)。テストでは固定値を注入する。
// 返り値   : ビン index の配列。末尾が必ず targetBin。
//            約20%で [targetBin] のみ(ひと跳び直行)、それ以外は
//            おとり2〜3 + 本命(長さ3〜4)。
function foxHopSequence(targetBin, binCount, rnd) {
  rnd = rnd || Math.random;
  if (binCount <= 1) return [targetBin];

  // ひと跳び直行: おとり無しで寝床から本命へ飛び込む。
  if (rnd() < DIRECT_HOP_RATE) {
    return [targetBin];
  }

  // おとりの回数(2〜3)。1ホップに溜め・着地・間を含めて約2秒かけるため、
  // 多すぎると尺が延びる。ビンが少なければさらに抑える。
  const maxDecoys = Math.min(3, binCount - 1);
  const minDecoys = Math.min(2, maxDecoys);
  const decoys = minDecoys + Math.floor(rnd() * (maxDecoys - minDecoys + 1));

  const seq = [];
  let prev = -1;
  for (let i = 0; i < decoys; i++) {
    let b;
    let guard = 0;
    // ターゲット以外・直前と違うビン(跳ね回る感)を選ぶ。
    do {
      b = Math.floor(rnd() * binCount);
      if (b >= binCount) b = binCount - 1;
      guard++;
    } while ((b === targetBin || b === prev) && guard < 30);
    // ガードで抜けても不正値にならないよう最終フォールバック。
    if (b === targetBin) {
      b = (targetBin + 1) % binCount;
    }
    seq.push(b);
    prev = b;
  }
  seq.push(targetBin); // 本命で締める
  return seq;
}

module.exports = { foxHopSequence, DIRECT_HOP_RATE };
