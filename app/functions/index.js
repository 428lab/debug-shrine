const functions = require("firebase-functions")
const axios = require('axios')
var moment = require("moment")
const admin = require("firebase-admin")
const { getStorage } = require('firebase-admin/storage');
const { getFirestore, Timestamp, FieldValue } = require("firebase-admin/firestore")
const { createCanvas, loadImage } = require("canvas")
const fs = require("fs");

if(process.env.FIREBASE_CONFIG){
  admin.initializeApp()
}else(
  admin.initializeApp({
    credential: admin.credential.applicationDefault(),
    storageBucket: "d-shrine-dev.appspot.com"
  })
)
// admin.initializeApp()

const bucket = getStorage().bucket()
const db = getFirestore()

const client_id = functions.config().github.client_id
const client_secret = functions.config().github.client_secret

const fontStyle = {
  font: '60px "Noto Sans JP"',
  lineHight: 100,
  color: "#FFFFFF"
}

// Create and Deploy Your First Cloud Functions
// https://firebase.google.com/docs/functions/write-firebase-functions

function get_level(points) {
  target_points = [0,5,11,19,30,45,65,91,124,166,218,281,357,447,553,676,818,981,1167,1378,1616,1884,2184,2519,2892,3306,3764,4269,4825,5436,6106,6840,7643,8520,9477,10520,11656,12892,14236,15696,17281,19001,20867,22891,25086,27466,30046,32842,35872,39156]
  level = 0
  for (let i=0; i < target_points.length; i++) {
    if (points <= target_points[i]) {
      level = i + 1
      break
    }
  }
  return level
}


async function get_feed(user, per_page=100) {
  try {
    url = `https://api.github.com/users/${user}/events/public?per_page=${per_page}&client_id=${client_id}&client_secret=${client_secret}`
    const res = await axios.get(url);
    const items = res.data;
    return items
  } catch (error) {
    const {status,statusText} = error.response;
    functions.logger.error(`Error! HTTP Status: ${status} ${statusText}`, {structuredData: true})
  }
}

async function get_user(username) {
  try {
    url = `https://api.github.com/users/${username}`
    const res = await axios.get(url);
    const items = res.data;
    return items
  } catch (error) {
    const {status,statusText} = error.response;
    functions.logger.error(`Error! HTTP Status: ${status} ${statusText}`, {structuredData: true})
  }
}


exports.status = functions.https.onRequest(async (request, response) => {
  response.set("Access-Control-Allow-Origin", "*")
  functions.logger.info("status", {structuredData: true})
  functions.logger.info(request.query.user, {structuredData: true})
  const items = await get_feed(request.query.user)
  var power = 0
  var hp = 0
  var power = 0
  var defence = 0
  var dex = 0
  var agility = 0
  var intelligence = 0

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
        agility += 6
      } else if (diff <= 180) {
        agility += 3
      } else if (diff <= 300) {
        agility += 2
      } else if (diff <= 1200) {
        agility += 1
      }
      if (diff <= 7200) {
        continuous_count++
      } else {
        hp += continuous_count * 2
        continuous_count = 0
      }
    }
    switch (item.type) {
      case "ForkEvent":
        power += 1
        break
      case "PushEvent":
        power += 2
        break
      case "CreateEvent":
      case "DeleteEvent":
        power += 1
        break
      case "PullRequestEvent":
        power += 3
        break
      case "IssuesEvent":
        switch (item.payload) {
          case "opened":
            intelligence += 3
            break
          case "closed":
            defence += 5
            break
        }
        break
      case "IssueCommentEvent":
        intelligence += 2
        break
      case "PullRequestReviewEvent":
        defence += 3
        break
      case "PullRequestReviewCommentEvent":
        defence += 3
        break
      case "GollumEvent":
        defence += 3
        break
      case "ReleaseEvent":
        defence += 10
        break
    }
    previousItem = item
  }
  if (continuous_count > 0) {
    hp += continuous_count * 2
  }

  var json = {}
  json["user"] = request.query.user

  json["points"] = hp + power + intelligence + defence + agility
  json["hp"] = hp
  json["power"] = power
  json["intelligence"] = intelligence
  json["defence"] = defence
  json["agility"] = agility
  json["total"] = hp + power + intelligence + defence + agility
  points = json["points"]
  level = get_level(points)
  json["level"] = level

  response.json(json)
})

exports.userOGP = functions.https.onRequest(async (request, response) => {
  response.set('Access-Control-Allow-Headers', '*')
  response.set("Access-Control-Allow-Origin", "*")
  response.set('Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS, POST')

  functions.logger.info(request.query)
  if(!request.query.user){
    // 404で返す
    response.send("not found")
    return
  }

  const username = request.query.user
  const filepath = `ogps/${username}.png`

  fileExists = await isStrageExists(filepath)
  functions.logger.info(`file ${filepath}: ${fileExists}`)

  // fileExists = false
  if(fileExists){
    url = getOgpUrl(username)
    // response.send(url) // debug
    response.redirect(url)
  }else{

    newOgpPath = await createOgp(username)
    // response.send(url) // debug
    response.redirect(newOgpPath)
  }
})

// strageに指定ファイル名のものが存在するか
async function isStrageExists(filepath) {
  data = await bucket.file(filepath).exists()
  return data[0]
}

function getOgpUrl(username) {
  url = `https://firebasestrage.googleapis.com/v0/b/d-shrine-dev.appspot.com/o/${encodeURIComponent(username)}.png?alt=media`
  if(process.env.FUNCTIONS_EMULATOR){
    url = `http://${process.env.FIREBASE_STORAGE_EMULATOR_HOST}/download/storage/v1/b/d-shrine-dev.appspot.com/o/ogps%2F${username}.png?alt=media`
  }

  return url
}

async function createOgp(username) {
  const basePath = "base.png"
  const localBasePath = "/tmp/base.png"
  const targetPath = `ogps/${username}.png`
  const localTargetPath = "/tmp/target.png"

  baseexists = await isStrageExists(basePath)

  functions.logger.info(`${basePath} is ${baseexists}`)
  if(!baseexists){
    functions.logger.warn(`missing base.png!: ${baseexists}`)
    response.status(500).send("server missing.")
    return
  }
  await bucket.file(basePath).download({
    destination: localBasePath,
    validation: false // エミュレーター時必要
  })


  // init image
  const baseImage = await loadImage(localBasePath)
  const canvas  = createCanvas(baseImage.width, baseImage.height)
  const ctx = canvas.getContext("2d")
  ctx.drawImage(baseImage, 0, 0, baseImage.width, baseImage.height)

  const userData = await get_user(username)
  const imageURL = userData.avatar_url
  const userDisplayName = userData.name ? userData.name :userData.login

  // generate
  ctx.font = fontStyle.font
  ctx.fillStyle = fontStyle.color
  ctx.textBaseline = "top"

  // 名前
  const userPos = {
    x: 700,
    y: 323,
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

  // チャート

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
  response.set('Access-Control-Allow-Headers', '*')
  response.set("Access-Control-Allow-Origin", "*")
  response.set('Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS, POST')
  if(requeset.method != "POST"){
    response.json({
      status: "missing request"
    })
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
  
  userRef.set({
    github_id: requeset.body.github_id,
    display_name: requeset.body.display_name,
    screen_name: requeset.body.screen_name,
    image_path: requeset.body.image_path
  })

  response.json({
    status: "success"
  })
})