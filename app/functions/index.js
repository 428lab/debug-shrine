const functions = require("firebase-functions")
const axios = require('axios')
var moment = require("moment")

const client_id = functions.config().github.client_id
const client_secret = functions.config().github.client_secret

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


exports.status = functions.https.onRequest(async (request, response) => {
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

  response.send(JSON.stringify(json))
})
