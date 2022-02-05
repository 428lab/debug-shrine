const functions = require("firebase-functions")
const axios = require('axios')
var moment = require("moment")
const admin = require("firebase-admin")
const { getStorage } = require('firebase-admin/storage');
const { getFirestore, Timestamp, FieldValue } = require("firebase-admin/firestore")
const { createCanvas, loadImage } = require("canvas")
const fs = require("fs");
const { ChartJSNodeCanvas } = require("chartjs-node-canvas")
const cors = require("cors")({
  origin: true
})

const projectID = process.env.GCLOUD_PROJECT
const buggetName = `${projectID}.appspot.com`

if(process.env.FIREBASE_CONFIG){
  admin.initializeApp()
}else(
  admin.initializeApp({
    credential: admin.credential.applicationDefault(),
    storageBucket: buggetName
  })
)
// admin.initializeApp()

const bucket = getStorage().bucket()
const db = getFirestore()

const client_id = functions.config().github.client_id
const client_secret = functions.config().github.client_secret

const fontStyle = {
  font: '60px "Noto Sans JP"',
  fontname: "Noto Sans JP",
  fontsize: "60",
  lineHight: 100,
  color: "#FFFFFF"
}
const target_points = [0,5,11,19,30,45,65,91,124,166,218,281,357,447,553,676,818,981,1167,1378,1616,1884,2184,2519,2892,3306,3764,4269,4825,5436,6106,6840,7643,8520,9477,10520,11656,12892,14236,15696,17281,19001,20867,22891,25086,27466,30046,32842,35872,39156]
const date_now = (moment()).unix()
const date_low = moment("2022-01-01T00:00:00Z").subtract(9, 'hours').unix()
const date_max = moment("2022-01-04T00:00:00Z").subtract(9, 'hours').unix()

function get_bonus_mag(now) {
  return (date_low <= now && now < date_max) ? 3:1
}


const production_id = 'd-shrine'
const dev_id = 'd-shrine-dev'

const base_url = process.env.FUNCTIONS_EMULATOR ? `http://0.0.0.0:5000/` : functions.config().func.base_url

const sanpai = {
  add_point: 1,
  next_time: projectID == 'd-shrine' ? (5 * 60) : 60  // s
}

// Create and Deploy Your First Cloud Functions
// https://firebase.google.com/docs/functions/write-firebase-functions

function get_level(points) {
  level = 0
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


async function get_feed(user, per_page=100) {
  functions.logger.info("get_feed")
  try {
    url = `https://api.github.com/users/${user}/events/public?per_page=${per_page}&client_id=${client_id}&client_secret=${client_secret}`
    const res = await axios.get(url);
    functions.logger.info([
      `GitHub X-RateLimit-Limit : ${res.headers["x-ratelimit-limit"]}`,
      `GitHub X-RateLimit-Rest  : ${res.headers["x-ratelimit-reset"]}`,
      `GitHub X-RateLimit-Used  : ${res.headers["x-ratelimit-used"]}`
    ].join("¥n"))
    const items = res.data;
    return items
  } catch (error) {
    if(error.response){
      const {status,statusText} = error.response;
      functions.logger.error(`Error! HTTP Status: ${status} ${statusText}`, {structuredData: true})
      functions.logger.info([
        `GitHub X-RateLimit-Limit : ${res.headers["x-ratelimit-limit"]}`,
        `GitHub X-RateLimit-Rest  : ${res.headers["x-ratelimit-reset"]}`,
        `GitHub X-RateLimit-Used  : ${res.headers["x-ratelimit-used"]}`
      ].join("¥n"))
    }else {
      functions.logger.error(error)
    }
  }
}

async function get_user(username) {
  functions.logger.info("get_user")
  try {
    url = `https://api.github.com/users/${username}?client_id=${client_id}&client_secret=${client_secret}`
    const res = await axios.get(url);
    // functions.logger.info(res.headers)
    functions.logger.info([
      `GitHub X-RateLimit-Limit : ${res.headers["x-ratelimit-limit"]}`,
      `GitHub X-RateLimit-Rest  : ${res.headers["x-ratelimit-reset"]}`,
      `GitHub X-RateLimit-Used  : ${res.headers["x-ratelimit-used"]}`
    ].join("¥n"))
    
    const items = res.data;
    return items
  } catch (error) {
    if(error.response){
      const {status,statusText} = error.response;
      functions.logger.error(`Error! HTTP Status: ${status} ${statusText}`, {structuredData: true})
      functions.logger.info([
        `GitHub X-RateLimit-Limit : ${res.headers["x-ratelimit-limit"]}`,
        `GitHub X-RateLimit-Rest  : ${res.headers["x-ratelimit-reset"]}`,
        `GitHub X-RateLimit-Used  : ${res.headers["x-ratelimit-used"]}`
      ].join("¥n"))
    }else {
      functions.logger.error(error)
    }
    return null
  }
}

async function get_user_doc(db, github_id, screen_name=null) {
  if(process.env.FUNCTIONS_EMULATOR) {
  //エミュレータの時はgithub_idがダミーなのでscreen_nameの方を見る
    const snapshot = await db.collection("users").where('screen_name','==',`${screen_name}`).get()
    let userDoc
    if (!snapshot.empty) {
      snapshot.forEach((postDoc) => {
        userDoc = postDoc
      })
      return userDoc
    } else {
      return null
    }
  } else {
    const userRef = db.collection("users").doc(`${github_id}`)
    return await userRef.get()
  }
}


async function get_user_doc_from_username(db, screen_name) {
  const snapshot = await db.collection("users").where('screen_name','==',`${screen_name}`).get()
  let userDoc
  if (!snapshot.empty) {
    snapshot.forEach((postDoc) => {
      userDoc = postDoc
    })
    return userDoc
  } else {
    return null
  }
}


async function get_user_ref(db, github_id, screen_name=null) {
  if(process.env.FUNCTIONS_EMULATOR) {
  //エミュレータの時はgithub_idがダミーだが、ここに入ってくるのは本物のgithubidなのでfirestoreからscreen_nameを使ってgithub_idを取得
    const snapshot = await db.collection("users").where('screen_name','==',`${screen_name}`).get()
    let userDoc
    if (!snapshot.empty) {
      snapshot.forEach((postDoc) => {
        userDoc = postDoc
      })
      const userRef = db.collection("users").doc(`${userDoc.data().github_id}`)
      return userRef
    } else {
      return null
    }
  } else {
    const userRef = db.collection("users").doc(`${github_id}`)
    return userRef
  }
}


async function get_activity_list(userRef) {
  const github_acitivityRef = userRef.collection("github_activities")
  const raw_activities = await github_acitivityRef.get()
  let raw_activities_list = []
  raw_activities.forEach((postDoc) => {
    raw_activities_list.push(JSON.parse(postDoc.data().raw))
  })
  return raw_activities_list
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

  
  previousItem = null
  continuous_count = 0
  let sorted_item = items.sort(function(a, b) {
    return (moment(a.created_at).unix() < moment(b.created_at).unix()) ? -1 : 1
  })
  for (const item of sorted_item) {
    if (previousItem) {
      previous_time = moment(previousItem.created_at)
      current_time = moment(item.created_at)
      diff = current_time.diff(previous_time)/1000
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
        switch (item.payload) {
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

function user_formated_performance(user_data, append_data={}) {
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


async function get_ranking_top100(db) {
  const snapshot = await db.collection("point_ranking").orderBy("battle_point","desc").limit(100).get()
  let response = []
  snapshot.forEach((rank_item) => {
    const item = rank_item.data();
    response.push({
      rank: item.rank,
      screen_name: item.screen_name,
      display_name: item.display_name,
      battle_point: item.battle_point,
    });
  })
  return response
}

async function get_my_rank(db, screen_name) {
  const snapshot = await db.collection("point_ranking").where('screen_name','==',`${screen_name}`).get()
  let response = {}
  snapshot.forEach((rank_item) => {
    const item = rank_item.data();
    response.rank = item.rank;
    response.screen_name = item.screen_name;
    response.display_name = item.display_name;
    response.battle_point = item.battle_point;
  })
  return response
}

exports.rankingUpdate = functions.pubsub.schedule('every 60 minutes').onRun( async (context) => {
  functions.logger.info("ranking update", {structuredData: true})
  const snapshot = await db.collection("point_ranking").get()
  let rankingTable = [];
  snapshot.forEach((item) => {
    let temp = {}
    temp.id = item.id
    temp.battlePoint = item.data().battle_point;
    rankingTable.push(temp);
  })
  let sorted = [];
  let tempRank = 1;
  let tempPoint = -1;
  rankingTable.sort((a, b) => b.battlePoint - a.battlePoint).forEach((item, index) => {
    let temp = {}
    temp.id = item.id
    if(tempPoint !== item.battlePoint){
      tempRank = index + 1
      tempPoint = item.battlePoint
    }
    temp.rank = tempRank
    sorted.push(temp);
  })
  sorted.forEach(item => {
    const rankingRef = db.collection("point_ranking").doc(`${item.id}`)
    rankingRef.set({
      rank: item.rank,
    }, {merge: true})
  })
});

exports.rankingCache = functions.pubsub.schedule('every 120 minutes').onRun( async (context) => {
  functions.logger.info("ranking cache", {structuredData: true})
  const snapshot = await db.collection("users").get()
  snapshot.forEach( async (item) => {
    const rankingRef = db.collection("point_ranking").doc(`${item.id}`)
    const rankingItem = await rankingRef.get()
    if(!!rankingItem.data()){
      return;
    }
    await rankingRef.set({
      display_name: item.data().display_name,
      screen_name: item.data().screen_name,
      battle_point: item.data().status.total,
      rank: 0,
    }, {merge: true})
  })
});

exports.status = functions.https.onRequest(async (request, response) => {
  cors(request, response, async()=> {
    functions.logger.info("status", {structuredData: true})
    functions.logger.info(request.query.user, {structuredData: true})

    let appendData = {}

    const userDoc = await get_user_doc_from_username(db, request.query.user)
    let userData
    if(userDoc && userDoc.exists) {
      // ユーザーは登録さている
      functions.logger.info("user registerd")
      userData = userDoc.data()
      functions.logger.info(`data: ${userData.exp}`)
      if(userData.exp) {
        appendData.exp = userData.exp
      }
      // ユーザー情報も付与
      appendData.user = {
        display_name: userData.display_name,
        screen_name: userData.screen_name,
        github_image_path: userData.image_path
      }
    }else {
      // 登録されていない
      functions.logger.info("user not registerd")
      response.status(404).json({
        staus: "faild",
        message: "user not registerd."
      })
      return
    }

    const userRef = await get_user_ref(db, userData.github_id, request.query.user)
    let return_Data
    if (userData.status) {
      return_Data = userData.status
    } else {
      const raw_activities_list = await get_activity_list(userRef)
      const user_data = user_performance(raw_activities_list, request.query.user)
      return_Data = user_formated_performance(user_data, appendData)
      await userRef.update({
        status: return_Data
      })
    }
    return_Data.last_sanpai = moment(userData.last_sanpai.toDate()).format('YYYY年MM月DD日 HH:mm');

    response.json(return_Data)
  })
})

exports.ranking = functions.https.onRequest(async (request, response) => {
  cors(request, response, async()=> {
    functions.logger.info("ranking", {structuredData: true})

    const ranking = await get_ranking_top100(db)
    let response_data = ranking

    response.json(response_data)
  })
})

exports.my_ranking = functions.https.onRequest(async (request, response) => {
  cors(request, response, async()=> {
    functions.logger.info("ranking", {structuredData: true})
    functions.logger.info(request.query.user, {structuredData: true})

    const my_ranking = await get_my_rank(db, request.query.screen_name)
    let response_data = my_ranking

    response.json(response_data)
  })
})

exports.userOGP = functions.https.onRequest(async (request, response) => {
  cors(request, response, async()=>{
    functions.logger.info(request.query)
    if(!request.query.user){
      // 404で返す
      response.status(404).send("user not found.")
      return
    }

    const username = request.query.user
    const filepath = `ogps/${encodeURIComponent(username)}.png`

    fileExists = await isStorageExists(filepath)
    functions.logger.info(`file ${filepath}: ${fileExists}`)

    let url
    if(fileExists){
      // 既存
      url = getOgpUrl(username)
    }else{
      // 作成
      url = await createOgp(username, request, response)
    }

    if(process.env.FUNCTIONS_EMULATOR) {
      // エミュレーター上は検証がめんどいからリダイレクトしない
      // できればその場で画像出てくれたら良いのになぁ...
      response.send(url)
    }else {
      if(url) {
        response.redirect(url)
      }
    }
  })
})

// strageに指定ファイル名のものが存在するか
async function isStorageExists(filepath) {
  data = await bucket.file(filepath).exists()
  return data[0]
}

function getOgpUrl(username) {
  // ファイルチェックしてURL返したい
  url = `https://firebasestorage.googleapis.com/v0/b/${buggetName}/o/ogps%2F${encodeURIComponent(username)}.png?alt=media`
  if(process.env.FUNCTIONS_EMULATOR){
    url = `http://${process.env.FIREBASE_STORAGE_EMULATOR_HOST}/download/storage/v1/b/${buggetName}/o/ogps%2F${encodeURIComponent(username)}.png?alt=media`
  }

  return url
}

async function createOgp(username, request, response) {
  const basePath = "base.png"
  const localBasePath = "/tmp/base.png"
  const targetPath = `ogps/${encodeURIComponent(username)}.png`
  const localTargetPath = "/tmp/target.png"

  baseexists = await isStorageExists(basePath)

  functions.logger.info(`${basePath} is ${baseexists}`)
  if(!baseexists){
    functions.logger.warn(`missing base.png!: ${baseexists}`)
    response.status(500).send("server missing.")
    return
  }
  await bucket.file(basePath).download({
    destination: localBasePath,
    validation: !process.env.FUNCTIONS_EMULATOR // エミュレーター時必要
  })

  // init image
  const baseImage = await loadImage(localBasePath)
  const canvas  = createCanvas(baseImage.width, baseImage.height)
  const ctx = canvas.getContext("2d")
  ctx.drawImage(baseImage, 0, 0, baseImage.width, baseImage.height)

  const userData = await get_user(username)
  if(userData == null) {
    response.status(404).send("user not found.")
    return
  }
  const imageURL = userData.avatar_url
  const userDisplayName = userData.name ? userData.name : userData.login
  let appendData = {}
  const userDoc = await get_user_doc(db, userData.id, username)
  if(userDoc && userDoc.exists) {
    functions.logger.info("user registerd")
    const userData = userDoc.data()
    functions.logger.info(`data: ${userData.exp}`)
    if(userData.exp) {
      appendData.exp = userData.exp
    }
    // ユーザー情報も付与
    appendData.user = {
      display_name: userData.display_name,
      screen_name: userData.screen_name,
      github_image_path: userData.image_path
    }
  }else {
    response.status(404).send("user not found.")
    return
  }

  const userRef = await get_user_ref(db, userData.id, username)
  let userFeedData
  if (userData.status) {
    return_Data = userData.status
  } else {
    const raw_activities_list = await get_activity_list(userRef)
    userFeedData = user_formated_performance(user_performance(raw_activities_list, username), appendData)
    await userRef.update({
      status: userFeedData
    })
  }

  // generate
  ctx.font = fontStyle.font
  ctx.fillStyle = fontStyle.color
  ctx.textBaseline = "top"

  // 名前
  const userPos = {
    x: 700,
    y: 310,
    max: 1280
  }
  ctx.fillText(userDisplayName, userPos.x, userPos.y, (userPos.max-userPos.x))

  // アイコン
  const userIcon = await loadImage(imageURL)
  functions.logger.info(`icon w: ${userIcon.width}, h:${userIcon.height}`)
  const iconPos = {
    x: 680,
    y: 431,
    range: 893-784,
    iconSize: 215 // アイコンの大きさ
  }
  const userIconCanvas = createCanvas(userIcon.width, userIcon.height)
  const userCtx = userIconCanvas.getContext("2d")
  // 切り取られてないアイコンがあるので切り取り
  userCtx.beginPath()
  wi = userIcon.width/2
  yi = userIcon.height/2
  ri = userIcon.width/2*0.9
  rr = Math.PI*360/180
  userCtx.arc(wi, yi, ri, 0, rr, false)
  userCtx.clip()
  userCtx.drawImage(userIcon, 0, 0, userIcon.width, userIcon.height)

  ctx.drawImage(userIconCanvas, iconPos.x, iconPos.y, iconPos.iconSize, iconPos.iconSize)
  
  // レベル
  const userDataStr = [
    "れべる：" + userFeedData.level,
    "ポイント：" + userFeedData.points,
    "せんとうりょく：" + userFeedData.total
  ]

  for (let idx=0; idx < userDataStr.length; idx++) {
    ctx.fillText(
      userDataStr[idx],
      680,
      740 + fontStyle.lineHight * idx
    )
  }
  // チャート
  const chartPost = {
    x: 1325,
    y: 300
  }
  const chartWidht = 550
  const chartHight = 550
  const chartbackColor = "rgba(255,255,255,0)"//"rgba(0,0,0,0)"
  const userChatData = [
    userFeedData.hp,
    userFeedData.power,
    userFeedData.intelligence,
    userFeedData.defence,
    userFeedData.agility,
  ]
  const chartLabels = [
    "たいりょく", // hp
    "ちから", // power
    "かしこさ", // intelligence
    "しゅびりょく", // defence
    "すばやさ", // agility
  ]

  const chartGrafLineColor = "rgb(242,242,242)" // グラフの線,文字
  const chartconfig = {
    type: "radar",
    data: {
      labels: chartLabels,
      datasets: [
        {
          // データ
          data: userChatData,
          fill: true,
          backgroundColor: "rgba(0, 168, 228,0.6)",
          borderColor: "rgb(0, 117, 159)",
          borderWidth: 2
        }
      ]
    },
    options: {
      plugins: {
        title: {
          // タイトル
          display: false
        },
        legend: {
          // 凡例
          display: false,
          fontSize: 30
        },
      },

      scale: {
        ticks: {
          // 線の間隔
          stepSize: 10,
        }
      },
      elements: {
        point: {
          radius: 0 // 点は非表示
        }
      },
      scales: {
        r: {
          min: 0,
          max: 150,
          grid: {
            // メモリ
            display: true,
            color: chartGrafLineColor,
            lineWidth: 3,  // (データ幅)線の幅
          },
          angleLines: {
            // 伸びてる方のめもり
            color: chartGrafLineColor,
            lineWidth: 3
          },
          pointLabels: {
            // れべるとか
            color: chartGrafLineColor,
            font: {
              size: 25
            }
          },
          ticks: {
            // メモリの数字
            display: false,
          }
        }
      }
    }
  }

  const chartJSNodeCanvas = new ChartJSNodeCanvas({
    width: chartWidht, 
    height: chartHight,
    chartCallback: (ChartJS) => {
      // ChartJS.defaults.global.font.size = "rgb(255,255,255)"
    }
  })
  const chart = await chartJSNodeCanvas.renderToBuffer(chartconfig, "image/png")
  const chartfile = "/tmp/chart.png"
  fs.writeFileSync(chartfile, chart)
  const chartimage = await loadImage(chartfile)
  // ctx.drawImage(chartimage, 0, 0, chartimage.width, chartimage.height)
  ctx.drawImage(chartimage, chartPost.x,chartPost.y, chartimage.width, chartimage.height)

  // // upload
  const buf = canvas.toBuffer()
  fs.writeFileSync(localTargetPath, buf)

  await bucket.upload(localTargetPath, {
    destination: targetPath
  })

  fs.unlinkSync(localBasePath)
  fs.unlinkSync(localTargetPath)

  return getOgpUrl(username)
}

exports.register = functions.https.onRequest(async (requeset, response)=>{
  cors(requeset, response, async()=>{
    functions.logger.info(requeset.method)
    functions.logger.info(requeset.body)
    if(requeset.method != "POST"){
      response.status(400).json({
        status: "missing request"
      })
      return
    }
  
    if(!requeset.headers.authorization) {
      // 認証情報付与してない
      response.status(401).json({
        status: "authorization missing."
      })
      return
    }
    const token_match = requeset.headers.authorization.match(/^Bearer (.*)$/)
    if(!token_match) {
      // やっぱり認証情報付与してない
      response.status(401).json({
        status: "authorization missing."
      })
      return
    }
    const token = token_match[1]  // firebase auth token
  
    // トークンを検証
    const decodetToken = await admin.auth().verifyIdToken(token)
      .catch(e => {
        // 認証できない
        functions.logger.error(e)
        response.status(403).json({
          status: "authorization missing."
        })
        return
      })
    if(!decodetToken){
      functions.logger.info("decodetToken non")
      return
    }
  
    // firestore に投げられたデータを保存
    // {
    //   github_id, display_name, screen_name, image_path 
    // }
    // firestoreに書き込み
    // key: github_id
    if(
      !requeset.body.github_id ||
      !requeset.body.display_name ||
      !requeset.body.screen_name ||
      !requeset.body.image_path
      ){
        // functions.logger.info(requeset.body)
        response.json({
          status: "faild parameter"
        })
      return
    }
  
    const userRef = db.collection("users").doc(`${requeset.body.github_id}`)
    const userDoc = await get_user_doc(db, requeset.body.github_id, requeset.body.screen_name)
    if(!userDoc || !userDoc.exists) {
      await userRef.set({
        github_id: requeset.body.github_id,
        display_name: requeset.body.display_name,
        screen_name: requeset.body.screen_name,
        image_path: requeset.body.image_path,
        create_at: FieldValue.serverTimestamp(),
        exp: 10,
        auth_user_uid: decodetToken.uid
      })
      response.json({
        status: "success"
      })
      return
    }else {
      const userData = userDoc.data()
      if(!userData.auth_user_uid) {
        await userRef.update({
          auth_user_uid: decodetToken.uid
        })
        response.json({
          status: "updated",
          message: "auth_user_uid"
        })
        return
      }else {
        response.json({
          status: "registerd"
        })
        return
      }
    }
  })
})

exports.sanpai = functions.https.onRequest(async(request, response) => {
  cors(request, response, async()=>{
    if(request.method != "POST") {
      functions.logger.info("faild conection")
      response.json({
        status: "faild"
      })
      return
    }
  
    if(!request.headers.authorization) {
      // 認証情報付与してない
      response.status(401).json({
        status: "authorization missing."
      })
      return
    }
    const token_match = request.headers.authorization.match(/^Bearer (.*)$/)
    if(!token_match) {
      // やっぱり認証情報付与してない
      response.status(401).json({
        status: "authorization missing."
      })
      return
    }
    const token = token_match[1]  // firebase auth token
  
    // トークンを検証
    const decodetToken = await admin.auth().verifyIdToken(token)
      .catch(e => {
        // 認証できない
        functions.logger.error(e)
        response.status(403).json({
          status: "authorization missing."
        })
        return
      })
    if(!decodetToken){
      functions.logger.info("decodetToken non")
      return
    }
    if(!request.body.github_id || !request.body.screen_name) {
      response.json({
        status: "faild parameter"
      })
      return
    }
    const github_id = request.body.github_id
    const userRef = db.collection("users").doc(`${github_id}`)
    
    functions.logger.info("load")
    try {
  
      functions.logger.info("get 1")
      const userDoc = await get_user_doc(db, github_id, request.body.screen_name)
      functions.logger.info("get 2" )
  
      if(!userDoc || !userDoc.exists) {
        // 登録されてない
        response.json({
          "status": "faild",
          "message": "not registered"
        })
        return
      }
      functions.logger.info("registerd")
      let userStatusFeed = null
      let userStatusData = null
      let userAppendData = {}
      let add_exp = sanpai.add_point  // 最終的に得られるポイント
  
      const userData = userDoc.data()
      functions.logger.info(userData)
      if(userData.exp) {
        userAppendData.exp = userData.exp
      }
      const last_sanpai = userData.last_sanpai
  
      if(last_sanpai) {
        //参拝してる
        
        functions.logger.info(last_sanpai)
        functions.logger.info(last_sanpai.seconds)
        // 前回の時間指定時間足して、期限がすぎる時間 今の時間
        if(last_sanpai.seconds + sanpai.next_time > Timestamp.now().seconds) {
          // 参拝可能時間を過ぎてない
          // functions.logger.info("expire")
          response.json({
            status: "expire",
            add_exp: 0
          })
          return
        }
      }
  
      // アクティビティ取得
      userStatusFeed = await get_feed(userData.screen_name)
      const feed_items = userStatusFeed
      date = last_sanpai ? last_sanpai.seconds: moment("2008-04-01T00:00:00Z").unix() // github
      let splited_items = feed_items.filter(item => (moment(item.created_at).unix()) > date)  //前回の参拝からのアクティビティ(初回は取れるだけ)
      functions.logger.info(`activities: ${splited_items.length}`)
  
      add_exp += Math.floor(splited_items.length/5)  // 取得できたアクティビティ5件につき1件
  
      if(splited_items.length == 0) {
        // なんかアクションしてこい
        functions.logger.info("user not actions")
        response.json({
          status: "noaction",
          add_exp: 0
        })
        return
      }
  
      // アクティビティ反映
      const dbBatch = db.batch()
      const github_acitivityRef = userRef.collection("github_activities")
      for(i=0;i<splited_items.length;i++) {
        let item = {
          id: splited_items[i].id,
          type: splited_items[i].type,
          created_at: splited_items[i].created_at,
          raw: JSON.stringify(splited_items[i])
        }
        let ref = github_acitivityRef.doc(item.id)
        dbBatch.set(ref, item)
      }
      await dbBatch.commit()  //反映
  
      var msg = ""
      var bonus_mag = get_bonus_mag(date_now)
      if (bonus_mag>1) {
        //2022年の三が日はポイント３倍
        add_exp *= bonus_mag
        msg = "2022/1/1〜2022/1/3はポイント3倍！"
      }
  
      // 更新
      await userRef.update({
        last_sanpai: FieldValue.serverTimestamp(),
        exp: FieldValue.increment(add_exp)
      })
      const sanpai_logsRef = userRef.collection("sanpai_logs")
      const sanpaiRes = await sanpai_logsRef.add({
        add_point: add_exp,
        timestamp: FieldValue.serverTimestamp()
      })
      // 最新状態を取得
      if(userData.exp) {
        userAppendData.exp = userData.exp + add_exp
      }else {
        userAppendData.exp = add_exp
      }
      // ユーザー情報も付与
      userAppendData.user = {
        display_name: userData.display_name,
        screen_name: userData.screen_name,
        github_image_path: userData.image_path
      }

      const raw_activities_list = await get_activity_list(userRef)

      userStatusData = user_formated_performance(user_performance(raw_activities_list, userData.screen_name), userAppendData)
      // 更新
      // ランキングに反映
      const rankingRef = db.collection("point_ranking").doc(`${github_id}`)
      await rankingRef.set({
        display_name: userData.display_name,
        screen_name: userData.screen_name,
        battle_point: userStatusData.total,
        rank: 0,
      }, {merge: true})

      await userRef.update({
        last_sanpai: FieldValue.serverTimestamp(),
        exp: FieldValue.increment(add_exp),
        status: userStatusData
      })
      let return_data = {
        status: "success",
        add_exp: add_exp,
        level: userStatusData.level,
        exp: userStatusData.points,
        next_exp: userStatusData.next_exp,
        msg: msg
      }
      if(splited_items.length == 0) {
        // アクティビティがないっぽい
        return_data.staus = "noaction"
      }
      response.json(return_data)
    }catch(e) {
      functions.logger.error("transaction failure", e)
      response.json({
        status: "missing server error."
      })
      return
    }
  })
})

exports.scheduledOgpDelete = functions.pubsub
  .schedule("0 */1 * * *")
  .timeZone("Asia/Tokyo")
  .onRun((context) => {
    bucket.deleteFiles({
      prefix: `ogps/`
    })
  })

exports.ogpRewrite = functions.https.onRequest(async (requeset, response) => {
  // ogp用HTMLに書き換える
  const req_path = requeset.url
  functions.logger.info(`request url: ${req_path}`)
  const user_match = req_path.match("/u/(.+)")
  if(!user_match && user_match.length < 1) {
    functions.logger.info(`mismatch query: ${req_path}`)
    response.status(404).send("not found")
    return
  }
  const username = user_match[1]

  // let url
  // if(process.env.FUNCTIONS_EMULATOR) {
  //   url = `http://0.0.0.0:5000/` // firebase emulators
  // }else {
  //   url = `https://${projectID}.web.app/`
  // }
  const time = moment().unix()
  
  const ogpURL = `https://us-central1-${projectID}.cloudfunctions.net/userOGP?user=${username}&t=${time}`
  const description = `これが${username}の でばっぐのうりょくだ！`
  const title = `${username}の でばっぐのうりょく - でばっぐ神社`
  
  try {
    functions.logger.info(`username: ${username} base_url:${base_url}`)
    const res = await axios.get(base_url)
    let data = res.data

    // <meta data-n-head="1" data-hid="og:image" property="og:image" content="${base_url}ogimage.png">
    data = data.replace(
      `<meta data-n-head="1" data-hid="og:image" property="og:image" content="${base_url}ogimage.png">`,
      `<meta data-n-head="1" data-hid="og:image" property="og:image" content="${ogpURL}">`
    )
    // <meta data-n-head="1" data-hid="og:description" name="og:description" content="バグった時の神頼み。">
    data = data.replace(
      `<meta data-n-head="1" data-hid="og:description" name="og:description" property="og:description" content="バグった時の神頼み。">`,
      `<meta data-n-head="1" data-hid="og:description" name="og:description" property="og:description" content="${description}">`
    )
    // <meta data-n-head="1" data-hid="description" name="description" content="バグった時の神頼み。">
    data = data.replace(
      `<meta data-n-head="1" data-hid="description" name="description" content="バグった時の神頼み。">`,
      `<meta data-n-head="1" data-hid="description" name="description" content="${description}">`
    )
    // <meta data-n-head="1" data-hid="og:description" name="og:description" content="バグった時の神頼み。">
    data = data.replace(
      `<meta data-n-head="1" data-hid="og:description" name="og:description" content="バグった時の神頼み。">`,
      `<meta data-n-head="1" data-hid="og:description" name="og:description" content="${description}">`
    )
    // <meta data-n-head="1" data-hid="og:title" name="og:title" content="でばっぐ神社">
    data = data.replace(
      `<meta data-n-head="1" data-hid="og:title" name="og:title" content="でばっぐ神社">`,
      `<meta data-n-head="1" data-hid="og:title" name="og:title" content="${title}">`
    )
    // <meta data-n-head="1" data-hid="twitter:title" property="twitter:title" content="でばっぐ神社">
    data = data.replace(
      `<meta data-n-head="1" data-hid="twitter:title" property="twitter:title" content="でばっぐ神社">`,
      `<meta data-n-head="1" data-hid="twitter:title" property="twitter:title" content="${title}">`
    )
    // <meta data-n-head="1" name="twitter:url" content="http://localhost:3000">
    // ?

    // <meta data-n-head="1" data-hid="twitter:description" property="twitter:description" content="バグった時の神頼み。">
    data = data.replace(
      `<meta data-n-head="1" data-hid="twitter:description" property="twitter:description" content="バグった時の神頼み。">`,
      `<meta data-n-head="1" data-hid="twitter:description" property="twitter:description" content="${description}">`
    )
    // <meta data-n-head="1" data-hid="twitter:image" property="twitter:image" content="${base_url}ogimage.png">
    data = data.replace(
      `<meta data-n-head="1" data-hid="twitter:image" property="twitter:image" content="${base_url}ogimage.png">`,
      `<meta data-n-head="1" data-hid="twitter:image" property="twitter:image" content="${ogpURL}">`
    )
    
    functions.logger.info("rewrite data")
    response.set('Cache-Control', 'public, max-age=300, s-maxage=300')
    response.send(data)
  }catch (error) {
    if(error.response) {
      const {status,statusText} = error.response;
      functions.logger.error(`Error! HTTP Status: ${status} ${statusText}`, {structuredData: true})
    }
    response.status(404).send("faild")
  }
})