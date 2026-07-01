#!/usr/bin/env node
// 参拝の能力解析(パフォーマンス計算)に関する純粋ロジック。
// 副作用(Firestore/HTTP/認証)を持たず、ユニットテスト可能な単位として index.js から分離している。
const moment = require("moment")

// STATUS_LOGIC_VERSION は能力解析(performance)の計算ロジックのバージョン。
// 計算式(加点テーブルや判定条件など、同一アクティビティに対する算出結果)を変えたら
// 必ずインクリメントすること。users/{id}.status_version に保存され、キャッシュ済み
// status がこのバージョン未満なら再計算対象になる(status/sanpai/statusCacheBackfill)。
//
// 履歴:
//   1: IssuesEvent を payload.action で加点するよう修正(それ以前は常に未加点だった)。
//      未設定(フィールドが存在しない旧キャッシュ)は undefined として扱われ再計算される。
//
// Go版 (app/functions-go/internal/performance/performance.go) の StatusLogicVersion と
// 必ず一致させること。
const STATUS_LOGIC_VERSION = 1

const target_points = [0,5,11,19,30,45,65,91,124,166,218,281,357,447,553,676,818,981,1167,1378,1616,1884,2184,2519,2892,3306,3764,4269,4825,5436,6106,6840,7643,8520,9477,10520,11656,12892,14236,15696,17281,19001,20867,22891,25086,27466,30046,32842,35872,39156]

function get_level(points) {
  let level = 0
  for (let i=0; i < target_points.length; i++) {
    if (points <= target_points[i]) {
      level = i + 1
      break
    }
  }
  return level
}

function get_next_leve_exp(points) {
  let level = get_level(points)
  let return_data = {
    next_level: level + 1,
    next_exp: target_points[level]
  }
  return return_data
}

function user_performance(items, username) {
  let user_data = {
    user: username,
    hp: 0,
    power: 0,
    defence: 0,
    dex: 0,
    agility: 0,
    intelligence: 0
  }


  let previousItem = null
  let continuous_count = 0
  let sorted_item = items.sort(function(a, b) {
    return (moment(a.created_at).unix() < moment(b.created_at).unix()) ? -1 : 1
  })
  for (const item of sorted_item) {
    if (previousItem) {
      let previous_time = moment(previousItem.created_at)
      let current_time = moment(item.created_at)
      let diff = current_time.diff(previous_time)/1000
      if (30 < diff && diff <= 120) {
        user_data.agility += 6
      } else if (diff <= 180) {
        user_data.agility += 3
      } else if (diff <= 300) {
        user_data.agility += 2
      } else if (diff <= 1200) {
        user_data.agility += 1
      }
      if (diff <= 7200) {
        continuous_count++
      } else {
        user_data.hp += continuous_count * 2
        continuous_count = 0
      }
    }
    switch (item.type) {
      case "ForkEvent":
        user_data.power += 1
        break
      case "PushEvent":
        user_data.power += 2
        break
      case "CreateEvent":
      case "DeleteEvent":
        user_data.power += 1
        break
      case "PullRequestEvent":
        user_data.power += 3
        break
      case "IssuesEvent":
        // GitHub Events API の payload はオブジェクトで、開閉種別は payload.action
        // ("opened"/"closed"/...) に入る。opened で intelligence+3, closed で defence+5。
        switch (item.payload && item.payload.action) {
          case "opened":
            user_data.intelligence += 3
            break
          case "closed":
            user_data.defence += 5
            break
        }
        break
      case "IssueCommentEvent":
        user_data.intelligence += 2
        break
      case "PullRequestReviewEvent":
        user_data.defence += 3
        break
      case "PullRequestReviewCommentEvent":
        user_data.defence += 3
        break
      case "GollumEvent":
        user_data.defence += 3
        break
      case "ReleaseEvent":
        user_data.defence += 10
        break
    }
    previousItem = item
  }
  if (continuous_count > 0) {
    user_data.hp += continuous_count * 2
  }

  return user_data
}

function user_formatted_performance(user_data, append_data={}) {
  let return_Data = {
    user: user_data.user,
    points: 0,
    hp: user_data.hp,
    power: user_data.power,
    intelligence: user_data.intelligence,
    defence: user_data.defence,
    agility: user_data.agility,
    total: user_data.hp + user_data.power + user_data.intelligence + user_data.defence + user_data.agility,
    level: 0,
    exp: 0,
    next_exp: 0,
    chart: {
      hp: 0,
      power: 0,
      intelligence: 0,
      defence: 0,
      agility: 0
    }
  }
  // 経験値を反映
  if(append_data.exp) {
    return_Data.exp += append_data.exp
    return_Data.points = append_data.exp
  }
  if(append_data.user) {
    return_Data.user = append_data.user
  }

  return_Data.chart.hp = return_Data.hp
  return_Data.chart.power = return_Data.power,
  return_Data.chart.intelligence = return_Data.intelligence
  return_Data.chart.defence = return_Data.defence
  return_Data.chart.agility = return_Data.agility

  return_Data.level = get_level(return_Data.total)
  return_Data.next_exp = get_next_leve_exp(return_Data.total).next_exp
  return return_Data
}


// 保存済み status から user_performance 相当の生ステータスを復元する
function raw_user_data_from_status(status, username) {
  return {
    user: username,
    hp: status.hp,
    power: status.power,
    defence: status.defence,
    dex: 0,
    agility: status.agility,
    intelligence: status.intelligence
  }
}

// アクティビティ群の中で最も新しい created_at を返す(無ければ null)
function latest_activity_created_at(items) {
  return items.reduce((latest, item) => {
    if (!latest) return item.created_at
    return (moment(item.created_at).unix() > moment(latest).unix()) ? item.created_at : latest
  }, null)
}

// 累積ステータス(base_user_data)に新着アクティビティ分だけを加算する増分計算。
// user_performance の per-event / per-pair の寄与は加算的で、バッチ境界
// (previous_created_at と新着先頭の時間差)だけがクロスバッチ依存となるため、
// 全件を再集計せずとも全件計算と同一の結果が得られる。
// hp は「diff<=7200秒のペア数*2」であり、user_performance の continuous_count*2 と等価。
//
// 【前提となる不変条件】全件計算と一致するのは以下が成り立つ場合のみ:
//   1. new_items は base_user_data に未集計のイベントだけで構成される(二重計上しない)。
//   2. new_items の全イベントが previous_created_at(=累積済みイベントの最大時刻)より後である。
//   3. previous_created_at は累積済みイベントの最大 created_at である。
// 呼び出し側(sanpai)は「created_at > last_sanpai」で new_items を抽出し、
// previous_created_at に保存済み最大時刻(last_activity_created_at)を渡すことでこれを満たす。
// この前提が崩れると全件計算と不一致になり得るため、崩れた場合は警告ログを出す。
function compute_performance_increment(base_user_data, new_items, previous_created_at) {
  let user_data = {
    user: base_user_data.user,
    hp: base_user_data.hp,
    power: base_user_data.power,
    defence: base_user_data.defence,
    dex: base_user_data.dex || 0,
    agility: base_user_data.agility,
    intelligence: base_user_data.intelligence
  }
  let sorted_items = [...new_items].sort(function(a, b) {
    return (moment(a.created_at).unix() < moment(b.created_at).unix()) ? -1 : 1
  })
  // 不変条件2の検知: 新着の最古イベントが境界より前なら前提が崩れている
  if (previous_created_at && sorted_items.length > 0 &&
      moment(sorted_items[0].created_at).unix() < moment(previous_created_at).unix()) {
    console.warn(`[performance] 増分計算の前提違反: 新着の最古イベント(${sorted_items[0].created_at})が境界(${previous_created_at})より前です。全件計算と不一致になり得ます。`)
  }
  let prev_created_at = previous_created_at
  for (const item of sorted_items) {
    if (prev_created_at) {
      let diff = moment(item.created_at).diff(moment(prev_created_at)) / 1000
      if (30 < diff && diff <= 120) {
        user_data.agility += 6
      } else if (diff <= 180) {
        user_data.agility += 3
      } else if (diff <= 300) {
        user_data.agility += 2
      } else if (diff <= 1200) {
        user_data.agility += 1
      }
      if (diff <= 7200) {
        user_data.hp += 2
      }
    }
    switch (item.type) {
      case "ForkEvent":
        user_data.power += 1
        break
      case "PushEvent":
        user_data.power += 2
        break
      case "CreateEvent":
      case "DeleteEvent":
        user_data.power += 1
        break
      case "PullRequestEvent":
        user_data.power += 3
        break
      case "IssuesEvent":
        // GitHub Events API の payload はオブジェクトで、開閉種別は payload.action
        // ("opened"/"closed"/...) に入る。opened で intelligence+3, closed で defence+5。
        switch (item.payload && item.payload.action) {
          case "opened":
            user_data.intelligence += 3
            break
          case "closed":
            user_data.defence += 5
            break
        }
        break
      case "IssueCommentEvent":
        user_data.intelligence += 2
        break
      case "PullRequestReviewEvent":
        user_data.defence += 3
        break
      case "PullRequestReviewCommentEvent":
        user_data.defence += 3
        break
      case "GollumEvent":
        user_data.defence += 3
        break
      case "ReleaseEvent":
        user_data.defence += 10
        break
    }
    prev_created_at = item.created_at
  }
  return { user_data: user_data, last_created_at: prev_created_at }
}

module.exports = {
  STATUS_LOGIC_VERSION,
  target_points,
  get_level,
  get_next_leve_exp,
  user_performance,
  user_formatted_performance,
  raw_user_data_from_status,
  latest_activity_created_at,
  compute_performance_increment
}
