// リズムゲームの譜面を、曲の音の並び(rhythmSong.js)から作る。描画も音も含まない純関数。
//
// レーンは 3 本: 0 = 鈴(メロディ・三味線)、1 = 太鼓(キック・和太鼓)、2 = 柏手(スネア・クラップ)。
// 曲で実際に鳴っている音に合わせて置くので、叩くと曲とぴったり合う。
//
// - 参拝(やさしい): 2 拍ごとの頭くらい(平均 2 個/秒ほど)。同じレーンは 4 ステップ(約 0.35 秒)以上あける
// - 修行(むずかしい): ボーカルのメロディをなぞる。長い音は長押し。同じレーンは 2 ステップ以上
// - どちらも、同時に押すのは 2 本まで。長押しの間、そのレーンに次の音は置かない
//
// 検証は scripts/test-rhythm-chart.js。

const LANES = ["suzu", "taiko", "clap"];

const LEVELS = {
  easy: { label: "参拝", minGap: 4, hold: false },
  hard: { label: "修行", minGap: 2, hold: true },
};

// 曲の音を、どのレーンに置くか(候補)。prio が大きいものを優先して残す
function candidates(song, level) {
  const out = [];
  const easy = level === "easy";
  const secAt = (bar) => {
    let s = song.sections[0];
    for (const x of song.sections) if (bar >= x.startBar) s = x;
    return s.name;
  };
  for (const e of song.events) {
    const sec = secAt(e.bar);
    const chorus = sec.startsWith("chorus");
    if (sec === "outro" && e.step > 0) continue;
    switch (e.inst) {
      case "vox":
        if (easy && e.step % 8 !== 0) break;
        out.push({ t: e.t, lane: 0, prio: 3, len: e.len });
        break;
      case "shamisen":
        // イントロとブレイクのメロディ役
        if (easy ? e.step % 8 === 0 : e.step % 2 === 0) out.push({ t: e.t, lane: 0, prio: 2, len: 0 });
        break;
      case "kick":
        if (easy && !(chorus && e.step === 8)) break;
        out.push({ t: e.t, lane: 1, prio: 2, len: 0 });
        break;
      case "taiko":
        if (easy && e.step !== 0) break;
        out.push({ t: e.t, lane: 1, prio: 3, len: 0 });
        break;
      case "snare":
        // 連打(フィル)は修行だけ、それも 8 分まで
        if (easy && !(chorus && e.step === 12)) break;
        if (!easy && e.step % 2 !== 0) break;
        out.push({ t: e.t, lane: 2, prio: 2, len: 0 });
        break;
      case "clap":
        out.push({ t: e.t, lane: 2, prio: 3, len: 0 });
        break;
      default:
        break;
    }
  }
  return out;
}

function buildChart(song, level = "easy") {
  const cfg = LEVELS[level];
  if (!cfg) throw new Error(`unknown level ${level}`);
  const gap = cfg.minGap * song.step - 1e-6;
  const holdMin = 6 * song.step; // これより長いボーカルは長押し
  const cands = candidates(song, level).sort((a, b) => a.t - b.t || b.prio - a.prio);

  // 同じ時刻・同じレーンの重複をまとめる
  const merged = [];
  for (const c of cands) {
    const prev = merged[merged.length - 1];
    if (prev && prev.lane === c.lane && Math.abs(prev.t - c.t) < 1e-6) continue;
    merged.push(c);
  }

  // レーンごとに、間隔と長押しを守って残す
  const kept = [];
  for (let lane = 0; lane < LANES.length; lane++) {
    let busyUntil = -Infinity;
    for (const c of merged.filter((x) => x.lane === lane)) {
      if (c.t < busyUntil + gap) continue;
      const hold = cfg.hold && lane === 0 && c.len >= holdMin;
      const note = { t: c.t, lane, prio: c.prio };
      if (hold) note.end = c.t + c.len * 0.9;
      kept.push(note);
      busyUntil = hold ? note.end : c.t;
    }
  }

  // 同時に押すのは 2 本まで(3 本重なったら、優先度の低いものを外す)
  kept.sort((a, b) => a.t - b.t || b.prio - a.prio);
  const notes = [];
  for (let i = 0; i < kept.length; ) {
    let j = i;
    while (j < kept.length && Math.abs(kept[j].t - kept[i].t) < 1e-6) j++;
    const group = kept.slice(i, j).sort((a, b) => b.prio - a.prio).slice(0, 2);
    for (const n of group) notes.push(n);
    i = j;
  }
  notes.sort((a, b) => a.t - b.t || a.lane - b.lane);
  notes.forEach((n, i) => {
    n.id = i;
    delete n.prio;
  });
  return { level, label: cfg.label, lanes: LANES, notes };
}

// ---- 判定 ----
// 叩いた時刻と音符の時刻の差(秒)から判定を返す。null は判定の外(叩いても何も起きない)
const WINDOWS = { kiwami: 0.045, ryo: 0.09, ka: 0.135 };
function judge(diff) {
  const d = Math.abs(diff);
  if (d <= WINDOWS.kiwami) return "kiwami";
  if (d <= WINDOWS.ryo) return "ryo";
  if (d <= WINDOWS.ka) return "ka";
  return null;
}

// 点数(満点 1,000,000)と評価
const WEIGHT = { kiwami: 1, ryo: 0.7, ka: 0.3, fuka: 0 };
function scoreOf(counts, total) {
  if (!total) return 0;
  const sum = Object.keys(WEIGHT).reduce((a, k) => a + (counts[k] || 0) * WEIGHT[k], 0);
  return Math.round((1000000 * sum) / total);
}
// 正確さ(%)から運勢の評価
const RANKS = [
  { min: 97, name: "大吉" },
  { min: 92, name: "中吉" },
  { min: 85, name: "小吉" },
  { min: 75, name: "吉" },
  { min: 60, name: "末吉" },
  { min: 0, name: "凶" },
];
function rankOf(score) {
  const pct = score / 10000;
  return RANKS.find((r) => pct >= r.min).name;
}

module.exports = { LANES, LEVELS, WINDOWS, WEIGHT, RANKS, buildChart, judge, scoreOf, rankOf };
