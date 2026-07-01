const test = require("node:test")
const assert = require("node:assert")
const moment = require("moment")
const perf = require("../performance")

const {
  get_level,
  get_next_leve_exp,
  user_performance,
  user_formatted_performance,
  raw_user_data_from_status,
  latest_activity_created_at,
  compute_performance_increment
} = perf

// ---- helpers ----
function iso(unix) {
  return moment.unix(unix).utc().format("YYYY-MM-DDTHH:mm:ss") + "Z"
}
let _seq = 0
function item(type, unix, payload = null) {
  return { id: `${unix}_${_seq++}`, type, payload, created_at: iso(unix) }
}

// ============================================================
// get_level / get_next_leve_exp
// ============================================================
test("get_level: しきい値の境界", () => {
  assert.strictEqual(get_level(0), 1)   // target_points[0]=0
  assert.strictEqual(get_level(5), 2)   // target_points[1]=5
  assert.strictEqual(get_level(6), 3)   // 6<=11
  assert.strictEqual(get_level(11), 3)
  assert.strictEqual(get_level(12), 4)  // 12<=19
})

test("get_next_leve_exp: 次レベルと必要経験値", () => {
  const r = get_next_leve_exp(0) // level=1 -> target_points[1]=5
  assert.strictEqual(r.next_level, 2)
  assert.strictEqual(r.next_exp, 5)
})

// ============================================================
// user_performance: イベント種別ごとの加点
// ============================================================
test("user_performance: 単一イベントの種別加点", () => {
  assert.strictEqual(user_performance([item("PushEvent", 1000)], "u").power, 2)
  assert.strictEqual(user_performance([item("ForkEvent", 1000)], "u").power, 1)
  assert.strictEqual(user_performance([item("CreateEvent", 1000)], "u").power, 1)
  assert.strictEqual(user_performance([item("DeleteEvent", 1000)], "u").power, 1)
  assert.strictEqual(user_performance([item("PullRequestEvent", 1000)], "u").power, 3)
  assert.strictEqual(user_performance([item("IssueCommentEvent", 1000)], "u").intelligence, 2)
  assert.strictEqual(user_performance([item("PullRequestReviewEvent", 1000)], "u").defence, 3)
  assert.strictEqual(user_performance([item("PullRequestReviewCommentEvent", 1000)], "u").defence, 3)
  assert.strictEqual(user_performance([item("GollumEvent", 1000)], "u").defence, 3)
  assert.strictEqual(user_performance([item("ReleaseEvent", 1000)], "u").defence, 10)
})

test("user_performance: 未対応イベントは加点しない", () => {
  const r = user_performance([item("WatchEvent", 1000)], "u")
  assert.strictEqual(r.power + r.defence + r.intelligence + r.agility + r.hp, 0)
})

test("user_performance: IssuesEvent は payload.action で加点する", () => {
  // GitHub Events API の payload は {action:"opened"} 等のオブジェクト。
  // payload.action を見て加点する(opened -> intelligence+3, closed -> defence+5)。
  assert.strictEqual(user_performance([item("IssuesEvent", 1000, { action: "opened" })], "u").intelligence, 3)
  assert.strictEqual(user_performance([item("IssuesEvent", 1000, { action: "closed" })], "u").defence, 5)
  // opened/closed 以外(reopened等)は加点されない
  const reopened = user_performance([item("IssuesEvent", 1000, { action: "reopened" })], "u")
  assert.strictEqual(reopened.intelligence, 0)
  assert.strictEqual(reopened.defence, 0)
  // payload がオブジェクトでない(文字列/null)場合は action を取れず加点されない
  const strR = user_performance([item("IssuesEvent", 1000, "opened")], "u")
  assert.strictEqual(strR.intelligence, 0)
  assert.strictEqual(strR.defence, 0)
})

// ============================================================
// user_performance: 時間差による agility / hp
// ============================================================
function twoPush(diffSec) {
  return user_performance([item("PushEvent", 1000), item("PushEvent", 1000 + diffSec)], "u")
}

test("user_performance: agility は連続イベントの時間差で決まる", () => {
  assert.strictEqual(twoPush(60).agility, 6)   // 30<diff<=120
  assert.strictEqual(twoPush(120).agility, 6)
  assert.strictEqual(twoPush(150).agility, 3)  // <=180
  assert.strictEqual(twoPush(250).agility, 2)  // <=300
  assert.strictEqual(twoPush(1000).agility, 1) // <=1200
  assert.strictEqual(twoPush(1201).agility, 0) // >1200 はどのバケットにも該当しない
  assert.strictEqual(twoPush(30).agility, 3)   // 30<diff は false だが diff<=180 に該当し +3
})

test("user_performance: hp は diff<=7200秒の連続ペア数*2", () => {
  assert.strictEqual(twoPush(60).hp, 2)    // 連続1ペア -> hp 2
  assert.strictEqual(twoPush(7200).hp, 2)  // 境界(<=7200)
  assert.strictEqual(twoPush(7201).hp, 0)  // ギャップ -> hp 0
  // 3連続(全て7200秒以内) -> 2ペア -> hp 4
  const three = user_performance([
    item("PushEvent", 1000), item("PushEvent", 2000), item("PushEvent", 3000)
  ], "u")
  assert.strictEqual(three.hp, 4)
})

// ============================================================
// user_formatted_performance
// ============================================================
test("user_formatted_performance: total/chart/level/exp/points", () => {
  const raw = { user: "u", hp: 10, power: 4, intelligence: 2, defence: 3, agility: 6, dex: 0 }
  const fmt = user_formatted_performance(raw, { exp: 100, user: { display_name: "d" } })
  assert.strictEqual(fmt.total, 10 + 4 + 2 + 3 + 6)
  assert.strictEqual(fmt.exp, 100)
  assert.strictEqual(fmt.points, 100)
  assert.deepStrictEqual(fmt.chart, { hp: 10, power: 4, intelligence: 2, defence: 3, agility: 6 })
  assert.strictEqual(fmt.level, get_level(fmt.total))
  assert.deepStrictEqual(fmt.user, { display_name: "d" })
})

// ============================================================
// raw_user_data_from_status / latest_activity_created_at
// ============================================================
test("raw_user_data_from_status: status から生ステータスを復元", () => {
  const status = { hp: 1, power: 2, defence: 3, agility: 4, intelligence: 5 }
  assert.deepStrictEqual(raw_user_data_from_status(status, "u"), {
    user: "u", hp: 1, power: 2, defence: 3, dex: 0, agility: 4, intelligence: 5
  })
})

test("latest_activity_created_at: 最新の created_at を返す", () => {
  assert.strictEqual(latest_activity_created_at([]), null)
  const items = [item("PushEvent", 3000), item("PushEvent", 1000), item("PushEvent", 5000)]
  assert.strictEqual(latest_activity_created_at(items), iso(5000))
})

test("compute_performance_increment: 不変条件違反(新着が境界より前)で警告を出す", () => {
  const base = { user: "u", hp: 0, power: 0, defence: 0, agility: 0, intelligence: 0 }
  const orig = console.warn
  let warned = 0
  console.warn = () => { warned++ }
  try {
    // 境界より前の created_at を渡す
    compute_performance_increment(base, [item("PushEvent", 1000)], iso(5000))
    assert.strictEqual(warned, 1)
    // 境界より後なら警告は出ない
    warned = 0
    compute_performance_increment(base, [item("PushEvent", 9000)], iso(5000))
    assert.strictEqual(warned, 0)
  } finally {
    console.warn = orig
  }
})

// ============================================================
// 増分計算の等価性(プロパティテスト)
// ============================================================
const TYPES = ["ForkEvent","PushEvent","CreateEvent","DeleteEvent","PullRequestEvent","IssuesEvent","IssueCommentEvent","PullRequestReviewEvent","PullRequestReviewCommentEvent","GollumEvent","ReleaseEvent","WatchEvent"]
const PAYLOADS = [{ action: "opened" }, { action: "closed" }, "opened", "closed", null]
function rand(n) { return Math.floor(Math.random() * n) }

function genItems(count, startUnix) {
  let t = startUnix
  let items = []
  for (let i = 0; i < count; i++) {
    t += rand(10000) // 7200秒境界を跨ぐようばらつかせる
    items.push(item(TYPES[rand(TYPES.length)], t, PAYLOADS[rand(PAYLOADS.length)]))
  }
  return items
}

const KEYS = ["hp","power","intelligence","defence","agility","total","level","next_exp","points","exp"]
function pick(o) { const r = {}; for (const k of KEYS) r[k] = o[k]; return r }
const append = { exp: 42, user: { display_name: "d", screen_name: "s" } }

// 保存済み status からの増分適用を 1 ステップ行う
function applyIncrement(prevStatus, prevTs, batch) {
  if (prevStatus) {
    const inc = compute_performance_increment(raw_user_data_from_status(prevStatus, "s"), batch, prevTs)
    return { status: user_formatted_performance(inc.user_data, {}), ts: inc.last_created_at }
  }
  // 初回(status未保存)は全件計算で初期化
  return {
    status: user_formatted_performance(user_performance(batch.slice(), {}), {}),
    ts: latest_activity_created_at(batch)
  }
}

test("増分計算 == 全件計算 (2分割・多数試行)", () => {
  for (let c = 0; c < 2000; c++) {
    const all = genItems(1 + rand(40), moment("2020-01-01T00:00:00Z").unix() + rand(1000000))
    all.sort((a, b) => moment(a.created_at).unix() - moment(b.created_at).unix())
    const k = rand(all.length + 1)
    const oldItems = all.slice(0, k)
    const newItems = all.slice(k)
    if (newItems.length === 0) continue

    const full = user_formatted_performance(user_performance(all.slice(), {}), append)

    let incFmt
    if (oldItems.length > 0) {
      const baseStatus = user_formatted_performance(user_performance(oldItems.slice(), {}), {})
      const inc = compute_performance_increment(raw_user_data_from_status(baseStatus, "s"), newItems, latest_activity_created_at(oldItems))
      incFmt = user_formatted_performance(inc.user_data, append)
    } else {
      incFmt = user_formatted_performance(user_performance(newItems.slice(), {}), append)
    }
    assert.deepStrictEqual(pick(incFmt), pick(full))
  }
})

test("増分計算 == 全件計算 (3バッチ逐次適用)", () => {
  for (let c = 0; c < 1000; c++) {
    const all = genItems(3 + rand(40), moment("2020-01-01T00:00:00Z").unix() + rand(1000000))
    all.sort((a, b) => moment(a.created_at).unix() - moment(b.created_at).unix())
    const p1 = rand(all.length), p2 = p1 + rand(all.length - p1)
    const b1 = all.slice(0, p1), b2 = all.slice(p1, p2), b3 = all.slice(p2)
    if (b3.length === 0) continue

    const full = user_formatted_performance(user_performance(all.slice(), {}), append)

    let s = null, ts = null
    if (b1.length > 0) { const r = applyIncrement(s, ts, b1); s = r.status; ts = r.ts }
    if (b2.length > 0) { const r = applyIncrement(s, ts, b2); s = r.status; ts = r.ts }
    let finalFmt
    if (s) {
      const inc = compute_performance_increment(raw_user_data_from_status(s, "s"), b3, ts)
      finalFmt = user_formatted_performance(inc.user_data, append)
    } else {
      finalFmt = user_formatted_performance(user_performance(b3.slice(), {}), append)
    }
    assert.deepStrictEqual(pick(finalFmt), pick(full))
  }
})
