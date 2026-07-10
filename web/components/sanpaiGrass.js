// 参拝の草(GitHub風ヒートマップ)のグリッド計算。
//
// sanpaiHistoryGo が返す日別集計([{date:"YYYY-MM-DD", count, points}])を
// 「日曜始まりの週 × 7日」の列構造に変換する。日付はサーバー側でJSTに
// 正規化済みの文字列なので、ここではタイムゾーンに依存しないよう
// UTC固定で日数計算だけを行う。
//
// 表示(SanpaiGrass.vue / GrassGrid.vue)から分離した純関数にしてあるのは、
// 週の折り返し・月ラベル・年分割をNodeで決定論的に検証するため
// (omikujiFox.js と同じ流儀)。

var DAY_MS = 24 * 60 * 60 * 1000;

function parseDate(s) {
  return new Date(s + "T00:00:00Z");
}

function formatDate(d) {
  return d.toISOString().slice(0, 10);
}

// count → 草の濃さ(0〜4)。GitHubと同じく上限を設けて頭打ちにする。
function levelFor(count) {
  if (count <= 0) return 0;
  if (count === 1) return 1;
  if (count === 2) return 2;
  if (count === 3) return 3;
  return 4;
}

// since〜until(両端含む)を日曜始まりの週の列に並べる。
// days: [{date, count, points}](参拝があった日のみで良い)
// 返り値: {
//   weeks: [ [ {date, count, points, inRange} x7 ] ... ]  // 列=週、行=日曜..土曜
//   monthLabels: [ {week, label} ]  // 「n月」を出す週番号
// }
function buildGrassGrid(since, until, days) {
  var byDate = {};
  (days || []).forEach(function (d) {
    byDate[d.date] = d;
  });

  var start = parseDate(since);
  var end = parseDate(until);
  // 先頭列の頭を直前の日曜に揃える(getUTCDay: 0=日曜)。
  var gridStart = start.getTime() - start.getUTCDay() * DAY_MS;

  var weeks = [];
  var monthLabels = [];
  var prevMonth = -1;
  for (var ws = gridStart; ws <= end.getTime(); ws += 7 * DAY_MS) {
    var col = [];
    var firstInRange = null;
    for (var i = 0; i < 7; i++) {
      var d = new Date(ws + i * DAY_MS);
      var dateStr = formatDate(d);
      var inRange = d.getTime() >= start.getTime() && d.getTime() <= end.getTime();
      var rec = inRange ? byDate[dateStr] : null;
      var cell = {
        date: dateStr,
        count: rec ? rec.count : 0,
        points: rec ? rec.points || 0 : 0,
        inRange: inRange,
      };
      if (inRange && !firstInRange) firstInRange = cell;
      col.push(cell);
    }
    // 月ラベル: その週の最初の範囲内の日の月が前の週と変わったら付ける。
    if (firstInRange) {
      var month = parseInt(firstInRange.date.slice(5, 7), 10);
      if (month !== prevMonth) {
        monthLabels.push({ week: weeks.length, label: month + "月" });
        prevMonth = month;
      }
    }
    weeks.push(col);
  }
  return { weeks: weeks, monthLabels: monthLabels };
}

// 全期間表示用: 初参拝日〜untilを暦年ごとの範囲に分割する。
// 各年はグリッドを揃えるため 1/1〜12/31(最終年のみuntilまで)。
function splitYearRanges(firstDate, until) {
  var firstYear = parseInt(firstDate.slice(0, 4), 10);
  var lastYear = parseInt(until.slice(0, 4), 10);
  var ranges = [];
  for (var y = firstYear; y <= lastYear; y++) {
    ranges.push({
      year: y,
      since: y + "-01-01",
      until: y === lastYear ? until : y + "-12-31",
    });
  }
  return ranges;
}

module.exports = { buildGrassGrid, splitYearRanges, levelFor };
