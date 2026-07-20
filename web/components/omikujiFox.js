// 狐セレクタのホップ列を生成する純関数。
//
// おみくじの結果(レア度 tier)はサーバーが決める。演出では、シャッフルした7つのビンの
// うち tier が載っている物理ビン(= targetBin)へ狐が最後に着地することで結果を"選ぶ"。
// 途中はおとり(フェイクアウト)で別のビンに跳ねてハラハラさせる。
//
// この関数は演出用だが、「最後のホップ先 == targetBin」という公平性の核を
// Node で決定論的に検証できるよう純粋に保つ(乱数は引数で注入可能)。

// ひと跳び直行(おとり無し)の確率。毎回2〜3回のフェイクアウトだと展開が
// 読めてしまうため、たまに迷いなく本命へ飛び込むパターンを混ぜる。
const DIRECT_HOP_RATE = 0.2;

// 本命ティーズの確率(非直行時)。一度本命ビンに入ってから別のビンへ離れ、
// 最後にやっぱり本命へ戻ってくるルート(この時点ではビンは光らないので
// 見ている側は「そこ!?…違うんかい…やっぱりそこか!」となる)。
const TARGET_TEASE_RATE = 0.3;

// おとり各スロット(2番目以降)が「その場ジャンプ」(直前と同じビンに
// 跳ね直す)になる確率。
const STAY_HOP_RATE = 0.2;

// targetBin: 本命の物理ビン index(0..binCount-1)
// binCount : ビン数(通常7)
// rnd      : 0..1 の乱数関数(省略時 Math.random)。テストでは固定値を注入する。
// 返り値   : ビン index の配列。末尾が必ず targetBin。
//            - 約20%: [targetBin] のみ(ひと跳び直行)
//            - 残りの約30%: 本命ティーズ [targetBin, d1, (d2), targetBin]
//            - それ以外: おとり2〜3 + 本命(長さ3〜4)
//            おとりにはその場ジャンプ(直前と同じビン)が混ざり得るが、
//            末尾直前は必ず本命以外(フィナーレは移動して本命着地)。
function foxHopSequence(targetBin, binCount, rnd) {
  rnd = rnd || Math.random;
  if (binCount <= 1) return [targetBin];

  // ひと跳び直行: おとり無しで寝床から本命へ飛び込む。
  if (rnd() < DIRECT_HOP_RATE) {
    return [targetBin];
  }

  // 本命ティーズ: 先頭で本命に入り、1〜2ビン離れてから本命へ戻る。
  if (rnd() < TARGET_TEASE_RATE) {
    const mids = 1 + Math.floor(rnd() * 2); // 1 or 2
    const seq = [targetBin];
    let prev = targetBin;
    for (let i = 0; i < mids; i++) {
      // 2番目以降はその場ジャンプ可(先頭は本命から離れる必要があるので不可)。
      if (i > 0 && prev !== targetBin && rnd() < STAY_HOP_RATE) {
        seq.push(prev);
        continue;
      }
      const b = pickOtherBin(targetBin, prev, binCount, rnd);
      seq.push(b);
      prev = b;
    }
    seq.push(targetBin); // やっぱり本命へ戻って締める
    return seq;
  }

  // 通常ルート: おとりの回数(2〜3)。1ホップに溜め・着地・間を含めて約2秒
  // かけるため、多すぎると尺が延びる。ビンが少なければさらに抑える。
  const maxDecoys = Math.min(3, binCount - 1);
  const minDecoys = Math.min(2, maxDecoys);
  const decoys = minDecoys + Math.floor(rnd() * (maxDecoys - minDecoys + 1));

  const seq = [];
  let prev = -1;
  for (let i = 0; i < decoys; i++) {
    // 2番目以降のおとりはその場ジャンプ可(先頭は寝床からの移動なので不可)。
    if (i > 0 && rnd() < STAY_HOP_RATE) {
      seq.push(prev);
      continue;
    }
    const b = pickOtherBin(targetBin, prev, binCount, rnd);
    seq.push(b);
    prev = b;
  }
  seq.push(targetBin); // 本命で締める
  return seq;
}

// ターゲット以外・直前と違うビン(跳ね回る感)を1つ選ぶ。
// ガードで抜けても不正値にならないよう最終フォールバック付き。
function pickOtherBin(targetBin, prev, binCount, rnd) {
  let b;
  let guard = 0;
  do {
    b = Math.floor(rnd() * binCount);
    if (b >= binCount) b = binCount - 1;
    guard++;
  } while ((b === targetBin || b === prev) && guard < 30);
  if (b === targetBin) {
    b = (targetBin + 1) % binCount;
  }
  return b;
}

module.exports = {
  foxHopSequence,
  DIRECT_HOP_RATE,
  TARGET_TEASE_RATE,
  STAY_HOP_RATE,
};
