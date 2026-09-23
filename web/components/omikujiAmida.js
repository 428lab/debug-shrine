// おみくじ演出「隠しあみだくじ」の組み立て(描画を含まない純関数)。
//
// 演出の流れ(OmikujiAmida.vue):
//   上に縦線が並び、下の端には各レア度が見えている。途中の横線は霞に隠れている
//   → 好きな縦線を1本えらぶ(ここでサーバーに抽選を頼む)
//   → 結果が届いたら、隠れている横線をここで組み立てる
//   → 霞が上から晴れていき、光が選んだ線をたどって結果のレア度に着く
//
// 設計の要:
// - 抽選の正しさは演出に依存しない。レア度はサーバーが決め、横線は「選んだ線が
//   そのレア度の端に着く」ように、結果が届いてから組み立てる。途中は霞で隠れて
//   いて、組み立てる前に見えるのは縦線と下の端だけなので、後出しでも嘘にならない。
// - 横線はふつうのあみだと同じ規則で置く(同じ段で隣り合う横線は置かない)。
//   ランダムに組んで、選んだ線が狙いの端に着くものが出るまで引き直す。
//   1回あたり約 1/7 で当たるので、数回で決まる。万一決まらなければ、
//   最後の数段で選んだ線を狙いの端まで横へ運ぶ横線を足して必ず着かせる。
// - 乱数は注入できる(rnd)。検証は scripts/test-omikuji-amida.js。

const LANES = 7;
const ROWS = 14; // 横線を置ける段の数
const DENSITY = 0.3; // 各段・各すきまに横線を置く確率(隣接は除く)
const MAX_TRIES = 200;

// 1段ぶんの横線をランダムに置く。rungs[c] = true は c と c+1 を結ぶ。
function randomRow(lanes, rnd) {
  const row = new Array(lanes - 1).fill(false);
  for (let c = 0; c < lanes - 1; c++) {
    if (c > 0 && row[c - 1]) continue; // 隣り合う横線は置かない
    row[c] = rnd() < DENSITY;
  }
  return row;
}

// start の縦線から下りた時の、各段を通った後の列(道筋)。
function tracePath(rows, start) {
  const cols = [start];
  let c = start;
  for (const row of rows) {
    if (c > 0 && row[c - 1]) c -= 1;
    else if (c < row.length && row[c]) c += 1;
    cols.push(c);
  }
  return cols;
}

function endOf(rows, start) {
  const p = tracePath(rows, start);
  return p[p.length - 1];
}

// 選んだ線 start が端 target に着くあみだを組む。
// 返り値: { rows: boolean[][], path: number[] }(path[i] は i 段を通る前の列)
function buildLadder(start, target, opts) {
  const lanes = (opts && opts.lanes) || LANES;
  const nRows = (opts && opts.rows) || ROWS;
  const rnd = (opts && opts.rnd) || Math.random;
  if (!(start >= 0 && start < lanes && target >= 0 && target < lanes)) {
    throw new Error(`buildLadder: out of range start=${start} target=${target}`);
  }
  for (let t = 0; t < MAX_TRIES; t++) {
    const rows = [];
    for (let r = 0; r < nRows; r++) rows.push(randomRow(lanes, rnd));
    if (endOf(rows, start) === target) return { rows, path: tracePath(rows, start) };
  }
  // 決まらなかった場合: ランダムな段の後ろに、狙いの端まで横へ運ぶ段を足す。
  const rows = [];
  const head = nRows - Math.abs(target - start);
  for (let r = 0; r < Math.max(0, head); r++) rows.push(randomRow(lanes, rnd));
  let c = endOf(rows, start);
  while (c !== target) {
    const row = new Array(lanes - 1).fill(false);
    if (c < target) {
      row[c] = true;
      c += 1;
    } else {
      row[c - 1] = true;
      c -= 1;
    }
    rows.push(row);
  }
  return { rows, path: tracePath(rows, start) };
}

module.exports = { LANES, ROWS, buildLadder, tracePath, endOf };
