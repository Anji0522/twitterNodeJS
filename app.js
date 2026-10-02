const express = require('express')
const path = require('path')
const {open} = require('sqlite')
const bcrypt = require('bcrypt')
const jwtToken = require('jsonwebtoken')
const sqlite3 = require('sqlite3')
const app = express()
app.use(express.json())
const dbpath = path.join(__dirname, 'twitterClone.db')
let db = null

const connection = async () => {
  try {
    db = await open({
      filename: dbpath,
      driver: sqlite3.Database,
    })
    app.listen(3000, () => {
      console.log('Server Running http://localhost:3000')
    })
  } catch (e) {
    console.log(`DB Error ${e.message}`)
    process.exit(1)
  }
}

connection()

const check = (request, response, next) => {
  let jwt
  const authHeaders = request.headers['authorization']
  if (authHeaders !== undefined) {
    jwt = authHeaders.split(' ')[1]
  }
  if (jwt === undefined) {
    response.status(401)
    response.send('Invalid JWT Token')
  } else {
    jwtToken.verify(jwt, 'my_key', async (error, payload) => {
      if (error) {
        response.status(401)
        response.send('Invalid JWT Token')
      } else {
        request.userId = payload.userId
        next()
      }
    })
  }
}

//API 1 Register
app.post('/register/', async (request, response) => {
  const {username, password, name, gender} = request.body
  const query = `SELECT * FROM user WHERE username = '${username}'`
  const dbUser = await db.get(query)
  if (password.length < 6) {
    response.status(400)
    response.send('Password is too short')
  } else if (dbUser !== undefined) {
    response.status(400)
    response.send('User already exists')
  } else {
    const hashedPassword = await bcrypt.hash(password, 10)
    const createNewUser = `INSERT INTO user (username, name, password, gender)
    VALUES('${username}', '${name}', '${hashedPassword}', '${gender}')`
    await db.run(createNewUser)
    response.send('User created successfully')
  }
})

//API 2 Method POST
app.post('/login/', async (request, response) => {
  const {username, password} = request.body
  const query = `SELECT * FROM user WHERE username = '${username}'`
  const dbUser = await db.get(query)
  if (dbUser === undefined) {
    response.status(400)
    response.send('Invalid user')
  } else {
    const isPasswordMatched = await bcrypt.compare(password, dbUser.password)
    if (isPasswordMatched === true) {
      const payload = {userId: dbUser.user_id}
      const token = jwtToken.sign(payload, 'my_key')
      response.send({jwtToken: token})
    } else {
      response.status(400)
      response.send('Invalid password')
    }
  }
})

//Authontication Menthod
app.get('/tweets/', check, async (requset, response) => {
  const query = `SELECT * FROM tweet`
  const result = await db.all(query)
  response.send(result)
})

//API 3 Method get
app.get('/user/tweets/feed/', check, async (request, response) => {
  const {userId} = request

  const query = `
    SELECT user.username,
           tweet.tweet,
           tweet.date_time AS dateTime
    FROM follower
    INNER JOIN tweet
      ON follower.following_user_id = tweet.user_id
    INNER JOIN user
      ON tweet.user_id = user.user_id
    WHERE follower.follower_user_id = ${userId}
    ORDER BY tweet.date_time DESC
    LIMIT 4;
  `

  const dbResponse = await db.all(query)
  response.send(dbResponse)
})
//API 4 Method get
app.get('/user/following/', check, async (request, response) => {
  const {userId} = request
  const query = `SELECT user.name
    FROM follower
    INNER JOIN user
    ON follower.following_user_id = user.user_id
    WHERE follower.follower_user_id = ${userId};`
  const result = await db.all(query)
  response.send(result)
})

//API 5 Method get
app.get('/user/followers/', check, async (request, response) => {
  const {userId} = request
  const query = `
       SELECT user.name
       FROM follower
       INNER JOIN user
       ON follower.follower_user_id = user.user_id
       WHERE follower.following_user_id = ${userId};
     `
  const result = await db.all(query)
  response.send(result)
})

//API 6 Method GET
app.get('/tweets/:tweetId/', check, async (request, response) => {
  const {tweetId} = request.params
  const {userId} = request
  const query = `SELECT *
FROM tweet
INNER JOIN follower
ON tweet.user_id = follower.following_user_id
WHERE follower.follower_user_id = ${userId}
AND tweet.tweet_id = ${tweetId};`
  const tweet = await db.get(query)

  if (tweet !== undefined) {
    const query = `
      SELECT 
        tweet.tweet,
        COUNT(DISTINCT like.like_id) AS likes,
        COUNT(DISTINCT reply.reply_id) AS replies,
        tweet.date_time AS dateTime
      FROM tweet
      LEFT JOIN like 
      ON tweet.tweet_id = like.tweet_id
      LEFT JOIN reply 
      ON tweet.tweet_id = reply.tweet_id
      WHERE tweet.tweet_id = ${tweetId};
    `
    const result = await db.get(query)
    response.send(result)
  } else {
    response.status(401)
    response.send(`Invalid Request`)
  }
})

//GET Method API 7
app.get('/tweets/:tweetId/likes/', check, async (request, response) => {
  const {tweetId} = request.params
  const {userId} = request
  const query =
    // `SELECT * FROM tweet INNER JOIN like
    // ON tweet.tweet_id = like.tweet_id
    // WHERE tweet.tweet_id = ${tweetId}
    // `
    `SELECT tweet.tweet_id
    FROM tweet
    INNER JOIN follower
    ON tweet.user_id = follower.following_user_id
    WHERE follower.follower_user_id = '${userId}'
    AND tweet.tweet_id = '${tweetId}';`
  const result = await db.get(query)
  if (result !== undefined) {
    const query = `SELECT user.username
    FROM like INNER JOIN user ON like.user_id = user.user_id
    WHERE like.tweet_id = ${tweetId}`
    const likesData = await db.all(query)
    const liksList = likesData.map(each => each.username)
    response.send({likes: liksList})
  } else {
    response.status(401)
    response.send(`Invalid Request`)
  }
})

//API 8 Method GET
app.get('/tweets/:tweetId/replies/', check, async (request, response) => {
  const {tweetId} = request.params
  const {userId} = request
  const query = `SELECT *
    FROM tweet
    INNER JOIN follower
    ON tweet.user_id = follower.following_user_id
    WHERE tweet.tweet_id = ${tweetId}
    AND follower.follower_user_id = ${userId};`

  const result = await db.all(query)
  if (result.length === 0) {
    response.status(401)
    response.send('Invalid Request')
  } else {
    const repliesQuery = `
      SELECT user.name, reply.reply
      FROM reply
      INNER JOIN user
      ON reply.user_id = user.user_id
      WHERE reply.tweet_id = ${tweetId};
    `
    const dbResponse = await db.all(repliesQuery)
    response.send({replies: dbResponse})
  }
})

//API 9 Method GET
app.get('/user/tweets/', check, async (request, response) => {
  const {userId} = request
  const query = `SELECT 
      tweet.tweet,
      COUNT(DISTINCT like.like_id) AS likes,
      COUNT(DISTINCT reply.reply_id) AS replies,
      tweet.date_time AS dateTime
    FROM tweet
    LEFT JOIN like
      ON tweet.tweet_id = like.tweet_id
    LEFT JOIN reply
      ON tweet.tweet_id = reply.tweet_id
    WHERE tweet.user_id = ${userId}
    GROUP BY tweet.tweet_id;
  `
  const result = await db.all(query)
  response.send(result)
})

//API 10 POST Method
app.post('/user/tweets/', check, async (request, response) => {
  const {tweet} = request.body
  const {userId} = request
  const query = `INSERT INTO tweet (tweet, user_id) VALUES ('${tweet}', ${userId})`
  await db.run(query)
  response.send('Created a Tweet')
})

//API 11 DELETE
app.delete('/tweets/:tweetId/', check, async (request, response) => {
  const {tweetId} = request.params
  const {userId} = request

  const query = `
    SELECT * FROM tweet
    WHERE tweet_id = ${tweetId}
    AND user_id = ${userId};
  `
  const queryList = await db.get(query)
  if (queryList === undefined) {
    response.status(401)
    response.send('Invalid Request')
    return
  } else {
    const resultQuery = `DELETE FROM tweet WHERE tweet_id = ${tweetId}`
    await db.run(resultQuery)
    response.send('Tweet Removed')
  }
})

module.exports = app
