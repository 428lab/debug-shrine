// ミニゲーム「誤字祓い」のルール(描画も音も含まない純関数)。
//
// 上から誤字を含む言葉が落ちてくる。間違っている文字をタップすると、らぼみがお祓いして
// 正しい文字に直る。正しい文字をタップするとお手つき(コンボが切れる)。直せないまま
// しめ縄(LINE_Y)まで落ちると命が 1 つ減り、3 つなくなったら終わり。
// 直すたびにお祓いゲージがたまり、満タンで「一斉お祓い」(画面の誤字をまとめて直す)。
//
// 言葉は "ret{ru|ur}n" のように書く({間違い|正しい})。間違いの側は 1 文字以上。
// 座標は論理の大きさ(W × H)。文字の幅は、半角 = FS × 0.6、全角 = FS として並べる
// (描く側も同じ幅のマスに 1 文字ずつ描く)。
//
// 検証は scripts/test-typo-game.js。

const W = 420;
const H = 700;
const LINE_Y = 500; // しめ縄の高さ。言葉の下端がここを越えたら漏れ
const FS = 32; // 文字の大きさ
const STEP = 1 / 60;
const LIVES = 3;
const GAUGE_MAX = 10;
const HIT_PAD = 6; // 間違いのマスの左右に足す、当たりの余裕

// ---- 言葉(tier: 1 = 最初から、2 = 25 秒から、3 = 60 秒から) ----
const WORDS = [
  // プログラミング
  { s: "ret{ru|ur}n", tier: 1, kind: "code" },
  { s: "fu{cn|nc}tion", tier: 1, kind: "code" },
  { s: "leng{ht|th}", tier: 1, kind: "code" },
  { s: "imp{ro|or}t", tier: 1, kind: "code" },
  { s: "con{ts|st}", tier: 1, kind: "code" },
  { s: "con{os|so}le", tier: 1, kind: "code" },
  { s: "fa{sl|ls}e", tier: 1, kind: "code" },
  { s: "tr{eu|ue}", tier: 1, kind: "code" },
  { s: "pr{ni|in}t", tier: 1, kind: "code" },
  { s: "Str{ni|in}g", tier: 1, kind: "code" },
  { s: "whi{el|le}", tier: 1, kind: "code" },
  { s: "c{al|la}ss", tier: 1, kind: "code" },
  { s: "Java{s|S}cript", tier: 1, kind: "code" },
  { s: "Git{h|H}ub", tier: 1, kind: "code" },
  { s: "com{mti|mit}", tier: 1, kind: "code" },
  { s: "m{re|er}ge", tier: 1, kind: "code" },
  { s: "stat{su|us}", tier: 1, kind: "code" },
  { s: "def{ua|au}lt", tier: 1, kind: "code" },
  { s: "undefi{en|ne}d", tier: 1, kind: "code" },
  { s: "ob{ej|je}ct", tier: 1, kind: "code" },
  { s: "console.l{go|og}()", tier: 2, kind: "code" },
  { s: "imp{ro|or}t React", tier: 2, kind: "code" },
  { s: "npm i{sn|ns}tall", tier: 2, kind: "code" },
  { s: "git che{kc|ck}out", tier: 2, kind: "code" },
  { s: "docker bu{li|il}d", tier: 2, kind: "code" },
  { s: "sudo a{tp|pt}", tier: 2, kind: "code" },
  { s: "README.{dm|md}", tier: 2, kind: "code" },
  { s: "localh{so|os}t", tier: 2, kind: "code" },
  { s: "Type{s|S}cript", tier: 2, kind: "code" },
  { s: "e{sl|ls}e if", tier: 2, kind: "code" },
  { s: "nu{1|l}l", tier: 3, kind: "code" },
  { s: "c{0|o}nst", tier: 3, kind: "code" },
  { s: "fa{1|l}se", tier: 3, kind: "code" },
  { s: "{I|l}ength", tier: 3, kind: "code" },
  { s: "if (x {=|==} 1)", tier: 3, kind: "code" },
  { s: "ret{ru|ur}n fa{sl|ls}e", tier: 3, kind: "code" },
  { s: "fu{cn|nc}tion ma{ni|in}", tier: 3, kind: "code" },
  { s: "con{ts|st} ok = tr{eu|ue}", tier: 3, kind: "code" },
  // 日本語
  { s: "デバッ{ク|グ}", tier: 1, kind: "ja" },
  { s: "シ{ュミ|ミュ}レーション", tier: 1, kind: "ja" },
  { s: "コミ{ニュ|ュニ}ケーション", tier: 1, kind: "ja" },
  { s: "アボ{ガ|カ}ド", tier: 1, kind: "ja" },
  { s: "ベッ{ト|ド}", tier: 1, kind: "ja" },
  { s: "ふ{いん|んい}き", tier: 1, kind: "ja" },
  { s: "こんにち{わ|は}", tier: 1, kind: "ja" },
  { s: "シ{ュチ|チ}ュエーション", tier: 1, kind: "ja" },
  { s: "プログラミン{ク|グ}", tier: 1, kind: "ja" },
  { s: "アップデー{ド|ト}", tier: 1, kind: "ja" },
  { s: "危機一{発|髪}", tier: 2, kind: "ja" },
  { s: "絶{対|体}絶命", tier: 2, kind: "ja" },
  { s: "五里{夢|霧}中", tier: 2, kind: "ja" },
  { s: "{短|単}刀直入", tier: 2, kind: "ja" },
  { s: "意味深{重|長}", tier: 2, kind: "ja" },
  { s: "責任転{化|嫁}", tier: 2, kind: "ja" },
  { s: "異{句|口}同音", tier: 2, kind: "ja" },
  { s: "専{問|門}家", tier: 2, kind: "ja" },
  { s: "講{議|義}を受ける", tier: 2, kind: "ja" },
  { s: "{感|関}心を持つ", tier: 2, kind: "ja" },
  { s: "サー{パ|バ}ー", tier: 2, kind: "ja" },
  { s: "完{壁|璧}", tier: 3, kind: "ja" },
  { s: "一{諸|緒}に", tier: 3, kind: "ja" },
  { s: "特{微|徴}", tier: 3, kind: "ja" },
  { s: "{遇|偶}然", tier: 3, kind: "ja" },
  { s: "{ツ|シ}ステム", tier: 3, kind: "ja" },
  { s: "ログイ{ソ|ン}", tier: 3, kind: "ja" },
  { s: "メ{ツ|ッ}セージ", tier: 3, kind: "ja" },
  { s: "デバッ{ク|グ}の{シ|ツ}ール", tier: 3, kind: "ja" },
];

// "ret{ru|ur}n" → 文字の並び(間違い)と、直す所(segs)
function parse(s) {
  const glyphs = [];
  const segs = [];
  const re = /\{([^|}]*)\|([^}]*)\}|([^{]+)/g;
  let mm;
  while ((mm = re.exec(s))) {
    if (mm[3] != null) {
      glyphs.push(...Array.from(mm[3]));
    } else {
      const wrong = Array.from(mm[1]);
      if (!wrong.length) throw new Error(`間違いの側が空: ${s}`);
      segs.push({ from: glyphs.length, to: glyphs.length + wrong.length, fix: Array.from(mm[2]) });
      glyphs.push(...wrong);
    }
  }
  const right = s.replace(/\{([^|}]*)\|([^}]*)\}/g, "$2");
  const wrongText = s.replace(/\{([^|}]*)\|([^}]*)\}/g, "$1");
  return { glyphs, segs, right, wrong: wrongText };
}

// 全角(日本語)は 1 マス、半角は 0.6 マス
function isWide(ch) {
  return /[^\x20-\x7e]/.test(ch);
}
function glyphW(ch) {
  return isWide(ch) ? FS : FS * 0.6;
}
function widthOf(glyphs) {
  return glyphs.reduce((a, ch) => a + glyphW(ch), 0);
}

// 乱数(種から毎回同じ並び。検証しやすいように)
function rng(seed) {
  let s = seed >>> 0 || 1;
  return () => {
    s ^= s << 13;
    s ^= s >>> 17;
    s ^= s << 5;
    return (s >>> 0) / 4294967296;
  };
}

// 時間(秒)ごとの難しさ
function speedAt(t) {
  return Math.min(150, 55 + t * 1.2); // 落ちる速さ(px/秒)
}
function intervalAt(t) {
  return Math.max(0.9, 2.4 - t * 0.017); // 次の言葉までの秒数
}
function tierAt(t) {
  return t < 25 ? 1 : t < 60 ? 2 : 3;
}

function newGame(seed = Date.now()) {
  return {
    rand: rng(seed),
    t: 0,
    nextSpawn: 0.6,
    items: [],
    nextId: 1,
    score: 0,
    lives: LIVES,
    combo: 0,
    maxCombo: 0,
    gauge: 0,
    fixed: 0, // 直した言葉の数
    misses: 0, // お手つき
    leaks: 0, // 漏れ
    recent: [],
    over: false,
    events: [], // 描画側が演出に使う出来事(毎フレーム取り出す)
  };
}

function spawn(g) {
  const tier = tierAt(g.t);
  let pool = WORDS.filter((w) => w.tier <= tier && !g.recent.includes(w.s));
  // 難しくなってきたら、新しい言葉を多めに
  if (tier >= 2 && g.rand() < 0.5) {
    const newer = pool.filter((w) => w.tier === tier);
    if (newer.length) pool = newer;
  }
  if (!pool.length) pool = WORDS.filter((w) => w.tier <= tier);
  const w = pool[Math.floor(g.rand() * pool.length)];
  g.recent.push(w.s);
  if (g.recent.length > 8) g.recent.shift();
  const p = parse(w.s);
  const width = widthOf(p.glyphs);
  // 横の位置: 上の方にいる言葉と重ならない所を何回か探す
  let x = 10;
  for (let k = 0; k < 8; k++) {
    x = 10 + g.rand() * Math.max(0, W - 20 - width);
    const clash = g.items.some((it) => !it.done && it.y < FS * 2.2 && x < it.x + it.width + 12 && it.x < x + width + 12);
    if (!clash) break;
  }
  const item = {
    id: g.nextId++,
    src: w.s,
    kind: w.kind,
    glyphs: p.glyphs,
    segs: p.segs.map((s) => Object.assign({ fixed: false }, s)),
    right: p.right,
    x,
    y: -8, // 文字の下端(ベースライン)
    width,
    vy: speedAt(g.t) * (0.9 + g.rand() * 0.2),
    done: false,
    leaked: false,
  };
  g.items.push(item);
  g.events.push({ type: "spawn", id: item.id });
}

// 言葉の i 文字目の左端の x
function glyphX(item, i) {
  let x = item.x;
  for (let k = 0; k < i; k++) x += glyphW(item.glyphs[k]);
  return x;
}

// タップした点を札に含む言葉(下 = 急ぐものから順に)
function itemsAt(g, px, py) {
  return g.items
    .filter((it) => {
      if (it.done || it.leaked) return false;
      const top = it.y - FS * 0.95 - 10;
      const bottom = it.y + FS * 0.3 + 10;
      return px >= it.x - 10 && px <= it.x + it.width + 10 && py >= top && py <= bottom;
    })
    .sort((a, b) => b.y - a.y);
}
function itemAt(g, px, py) {
  return itemsAt(g, px, py)[0] || null;
}
// 言葉の中で、x に当たる直す所(fixed: 直したものを探すか)
function segAt(it, px, fixed) {
  for (const s of it.segs) {
    if (s.fixed !== fixed) continue;
    const x0 = glyphX(it, s.from) - (fixed ? 0 : HIT_PAD);
    const x1 = glyphX(it, s.to) + (fixed ? 0 : HIT_PAD);
    if (px >= x0 && px <= x1) return s;
  }
  return null;
}

// タップ。返り値: { result: "fix" | "miss" | "none", item, seg }
function tap(g, px, py) {
  if (g.over) return { result: "none" };
  const cands = itemsAt(g, px, py);
  if (!cands.length) return { result: "none" };
  // 言葉が重なっていたら、間違いの文字に当たっている方を選ぶ
  let it = cands[0];
  let hit = null;
  for (const c of cands) {
    const s = segAt(c, px, false);
    if (s) {
      it = c;
      hit = s;
      break;
    }
  }
  // 直したばかりの金の文字をもう一度押しただけなら、お手つきにしない
  if (!hit && cands.some((c) => segAt(c, px, true))) return { result: "none" };
  if (!hit) {
    g.misses++;
    g.combo = 0;
    g.events.push({ type: "miss", id: it.id, x: px, y: py });
    return { result: "miss", item: it };
  }
  fixSeg(g, it, hit, "tap");
  return { result: "fix", item: it, seg: hit };
}

function fixSeg(g, it, seg, how) {
  seg.fixed = true;
  g.events.push({ type: "fixSeg", id: it.id, from: seg.from, to: seg.to, fix: seg.fix, how });
  if (it.segs.every((s) => s.fixed)) finishItem(g, it, how);
}

// 言葉を直し終えた: 点(高い所で直すほど多い、コンボで増える)
function finishItem(g, it, how) {
  it.done = true;
  g.fixed++;
  g.combo++;
  g.maxCombo = Math.max(g.maxCombo, g.combo);
  if (how !== "special") g.gauge = Math.min(GAUGE_MAX, g.gauge + 1);
  const base = 100 + 50 * (it.segs.length - 1);
  const height = Math.round(60 * Math.max(0, 1 - it.y / LINE_Y));
  const mult = 1 + Math.min(g.combo, 50) * 0.02;
  const pts = Math.round((base + height) * mult * (how === "special" ? 0.5 : 1));
  g.score += pts;
  g.events.push({ type: "done", id: it.id, pts, combo: g.combo, how });
}

// 一斉お祓い(ゲージ満タンの時だけ)。画面の誤字をすべて直す
function special(g) {
  if (g.over || g.gauge < GAUGE_MAX) return false;
  g.gauge = 0;
  g.events.push({ type: "special" });
  for (const it of g.items) {
    if (it.done || it.leaked) continue;
    for (const s of it.segs) if (!s.fixed) fixSeg(g, it, s, "special");
  }
  return true;
}

function step(g, dt = STEP) {
  if (g.over) return;
  g.t += dt;
  g.nextSpawn -= dt;
  if (g.nextSpawn <= 0) {
    spawn(g);
    g.nextSpawn = intervalAt(g.t);
  }
  for (const it of g.items) {
    if (it.done || it.leaked) continue;
    it.y += it.vy * dt;
    if (it.y >= LINE_Y) {
      it.leaked = true;
      g.leaks++;
      g.lives--;
      g.combo = 0;
      g.events.push({ type: "leak", id: it.id, x: it.x + it.width / 2 });
      if (g.lives <= 0) {
        g.over = true;
        g.events.push({ type: "over" });
        break; // 同じ瞬間に落ちた言葉で、命がマイナスにならないように
      }
    }
  }
  // 片付いた言葉は、演出が終わるころに消す(描画側が t と doneAt で使う)
  g.items = g.items.filter((it) => {
    if (!(it.done || it.leaked)) return true;
    if (it.endT == null) it.endT = g.t;
    return g.t - it.endT < 1.2;
  });
}

// 称号(点で)
const TITLES = [
  { min: 0, name: "見習い巫女" },
  { min: 3000, name: "誤字ハンター" },
  { min: 8000, name: "校正の達人" },
  { min: 15000, name: "言霊の守り手" },
  { min: 25000, name: "誤字祓いの神" },
];
function titleOf(score) {
  let t = TITLES[0].name;
  for (const x of TITLES) if (score >= x.min) t = x.name;
  return t;
}

module.exports = {
  W,
  H,
  LINE_Y,
  FS,
  STEP,
  LIVES,
  GAUGE_MAX,
  WORDS,
  TITLES,
  parse,
  isWide,
  glyphW,
  widthOf,
  glyphX,
  speedAt,
  intervalAt,
  tierAt,
  newGame,
  step,
  tap,
  itemAt,
  special,
  titleOf,
};
