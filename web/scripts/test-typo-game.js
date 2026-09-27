// ミニゲーム「誤字祓い」のルール(components/typoGame.js)の検証。
//
// 使い方(web/ ディレクトリで実行):
//   node scripts/test-typo-game.js
//
// 確かめること:
// - どの言葉も書き方が正しい(間違いの側が 1 文字以上、正しい言葉と違う、画面の幅に収まる)
// - よく使う言葉の正しい形(書き間違いで別の言葉になっていない)
// - 間違いの文字をタップすると直る、正しい文字をタップするとお手つき
// - しめ縄まで落ちると命が減り、3 回で終わる。一斉お祓いで画面の誤字がすべて直る
// - 時間とともに速く、多く、難しい言葉が出る

/* eslint-disable no-console */
const assert = require("assert");
const G = require("../components/typoGame.js");

// ---- 言葉 ----
const seen = new Set();
for (const w of G.WORDS) {
  assert.ok(!seen.has(w.s), `同じ言葉が 2 回: ${w.s}`);
  seen.add(w.s);
  const p = G.parse(w.s);
  assert.ok(p.segs.length >= 1, `直す所が無い: ${w.s}`);
  assert.notStrictEqual(p.wrong, p.right, `間違いと正しいが同じ: ${w.s}`);
  for (const s of p.segs) assert.notStrictEqual(p.glyphs.slice(s.from, s.to).join(""), s.fix.join(""), `直しても同じ: ${w.s}`);
  assert.ok(G.widthOf(p.glyphs) <= G.W - 20, `幅が広すぎる: ${w.s}(${G.widthOf(p.glyphs)})`);
  assert.ok([1, 2, 3].includes(w.tier) && ["code", "ja"].includes(w.kind), w.s);
}
const right = (s) => G.parse(s).right;
const expect = {
  "ret{ru|ur}n": "return",
  "fu{cn|nc}tion": "function",
  "leng{ht|th}": "length",
  "imp{ro|or}t": "import",
  "con{os|so}le": "console",
  "コミ{ニュ|ュニ}ケーション": "コミュニケーション",
  "シ{ュミ|ミュ}レーション": "シミュレーション",
  "シ{ュチ|チ}ュエーション": "シチュエーション",
  "if (x {=|==} 1)": "if (x == 1)",
  "デバッ{ク|グ}の{シ|ツ}ール": "デバッグのツール",
  "git che{kc|ck}out": "git checkout",
};
for (const [s, r] of Object.entries(expect)) {
  assert.ok(seen.has(s), `一覧に無い: ${s}`);
  assert.strictEqual(right(s), r);
}
assert.strictEqual(G.parse("ret{ru|ur}n").wrong, "retrun");
assert.throws(() => G.parse("a{|b}c"));

// ---- タップ ----
function placed(src, x = 50, y = 200) {
  const g = G.newGame(1);
  const p = G.parse(src);
  g.items.push({ id: 99, src, glyphs: p.glyphs, segs: p.segs.map((s) => Object.assign({ fixed: false }, s)), x, y, width: G.widthOf(p.glyphs), vy: 0, done: false, leaked: false });
  return g;
}
{
  // "retrun": 間違いは 3〜4 文字目(r u)
  const g = placed("ret{ru|ur}n");
  const it = g.items[0];
  const cx = (i) => G.glyphX(it, i) + G.glyphW(it.glyphs[i]) / 2;
  assert.strictEqual(G.tap(g, cx(0), 190).result, "miss", "正しい文字でお手つきにならない");
  assert.strictEqual(g.combo, 0);
  assert.strictEqual(G.tap(g, cx(3), 190).result, "fix");
  assert.ok(it.done);
  assert.strictEqual(g.fixed, 1);
  assert.ok(g.score > 100);
  assert.strictEqual(G.tap(g, cx(3), 190).result, "none", "直した言葉にまだ当たる");
  // 言葉の外をタップしても何も起きない
  assert.strictEqual(G.tap(g, 400, 650).result, "none");
}
{
  // 2 か所ある言葉は、両方直して終わり
  const g = placed("ret{ru|ur}n fa{sl|ls}e");
  const it = g.items[0];
  const cx = (i) => G.glyphX(it, i) + G.glyphW(it.glyphs[i]) / 2;
  assert.strictEqual(G.tap(g, cx(9), 190).result, "fix");
  assert.ok(!it.done);
  assert.strictEqual(G.tap(g, cx(3), 190).result, "fix");
  assert.ok(it.done);
}
{
  // 日本語(全角)も
  const g = placed("デバッ{ク|グ}");
  const it = g.items[0];
  assert.strictEqual(G.tap(g, G.glyphX(it, 3) + 16, 190).result, "fix");
}

{
  // 2 か所ある言葉で、直したばかりの金の文字をもう一度押してもお手つきにならない
  const g = placed("ret{ru|ur}n fa{sl|ls}e");
  const it = g.items[0];
  const cx = (i) => G.glyphX(it, i) + G.glyphW(it.glyphs[i]) / 2;
  assert.strictEqual(G.tap(g, cx(3), 190).result, "fix");
  assert.strictEqual(G.tap(g, cx(3), 190).result, "none");
  assert.strictEqual(g.misses, 0);
  assert.strictEqual(g.combo, 0);
}
{
  // 言葉が重なっていたら、間違いの文字に当たっている方を直す(下の言葉でお手つきにしない)
  const g = placed("ret{ru|ur}n", 50, 200);
  const p2 = G.parse("c{al|la}ss");
  g.items.push({ id: 100, src: "c{al|la}ss", glyphs: p2.glyphs, segs: p2.segs.map((s) => Object.assign({ fixed: false }, s)), x: 50, y: 212, width: G.widthOf(p2.glyphs), vy: 0, done: false, leaked: false });
  const upper = g.items[0];
  // 上の言葉の「ru」の「u」(4 文字目)。下の言葉ではそこは正しい「s」
  const x = G.glyphX(upper, 4) + 8;
  const r = G.tap(g, x, 195);
  assert.strictEqual(r.result, "fix");
  assert.strictEqual(r.item.id, 99);
  assert.strictEqual(g.misses, 0);
}
{
  // 同じ瞬間に何個しめ縄を越えても、命はマイナスにならない
  const g = G.newGame(5);
  g.lives = 1;
  for (let k = 0; k < 3; k++) {
    const p = G.parse("tr{eu|ue}");
    g.items.push({ id: 200 + k, src: "tr{eu|ue}", glyphs: p.glyphs, segs: p.segs.map((s) => Object.assign({ fixed: false }, s)), x: 20 + k * 120, y: G.LINE_Y - 0.1, width: G.widthOf(p.glyphs), vy: 100, done: false, leaked: false });
  }
  G.step(g);
  assert.ok(g.over);
  assert.strictEqual(g.lives, 0);
  assert.strictEqual(g.events.filter((e) => e.type === "over").length, 1);
}

// ---- 漏れと終わり ----
{
  const g = G.newGame(7);
  let t = 0;
  while (!g.over && t < 120) {
    G.step(g);
    t += G.STEP;
  }
  assert.ok(g.over, "放っておいても終わらない");
  assert.strictEqual(g.lives, 0);
  assert.strictEqual(g.leaks, G.LIVES);
  assert.ok(t > 8, `終わるのが早すぎる(${t.toFixed(1)} 秒)`);
}

// ---- 一斉お祓い ----
{
  const g = G.newGame(3);
  for (let i = 0; i < 60 * 8; i++) G.step(g);
  const live = g.items.filter((it) => !it.done && !it.leaked).length;
  assert.ok(live >= 2, "画面に言葉が少ない");
  assert.strictEqual(G.special(g), false, "ゲージが無いのに撃てる");
  g.gauge = G.GAUGE_MAX;
  assert.strictEqual(G.special(g), true);
  assert.strictEqual(g.gauge, 0);
  assert.ok(g.items.every((it) => it.done || it.leaked), "残っている誤字がある");
  assert.strictEqual(g.fixed, live);
}

// ---- 難しさ ----
assert.ok(G.speedAt(60) > G.speedAt(0) * 1.8);
assert.ok(G.intervalAt(90) < G.intervalAt(0) / 2);
assert.strictEqual(G.tierAt(0), 1);
assert.strictEqual(G.tierAt(70), 3);
{
  // 上手な bot(落ちてきたら少し待って直す)は長く遊べて、後半に難しい言葉が出る
  const g = G.newGame(11);
  const tiers = new Set();
  for (let i = 0; i < 60 * 120 && !g.over; i++) {
    G.step(g);
    for (const it of g.items) {
      if (it.done || it.leaked || it.y < 120) continue;
      const w = G.WORDS.find((x) => x.s === it.src);
      tiers.add(w.tier);
      for (const s of it.segs) if (!s.fixed) G.tap(g, G.glyphX(it, s.from) + 3, it.y - 10);
    }
    g.events.length = 0;
  }
  assert.ok(!g.over, "上手に直しているのに終わった");
  assert.ok(tiers.has(3), "難しい言葉が出ていない");
  console.log(`bot: 2 分で ${g.fixed} 個直す・${g.score} 点・最大コンボ ${g.maxCombo}・称号「${G.titleOf(g.score)}」`);
}
assert.strictEqual(G.titleOf(0), "見習い巫女");
assert.strictEqual(G.titleOf(30000), "誤字祓いの神");

console.log(`OK 言葉 ${G.WORDS.length} 個(プログラミング ${G.WORDS.filter((w) => w.kind === "code").length}・日本語 ${G.WORDS.filter((w) => w.kind === "ja").length})`);
