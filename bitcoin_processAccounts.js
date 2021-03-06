const fetch = require('node-fetch')
const redis = require("redis")
const client = redis.createClient()
const config = require('./config/config.js')
const db = require('./pg_db').db
const async = require('async')

const con = config.chainURL
const authHash = config.chainHash

let blocktime = 0

function start() {
  getMaxBlockHash((maxBlock) => {
    loop(maxBlock)
  })
}

function loop(maxBlock) {
  getData(blocktime, () => {
    if(blocktime < maxBlock) {
      console.log("DONE: " + blocktime + " OF " + maxBlock)
      loop(maxBlock)
    } else {
      console.log('DONEZO')
    }
  })
}

function getMaxBlockHash(callback) {
  db.oneOrNone('select max(time) as maxblock from transactions;')
    .then((tx) => {
      callback(tx.maxblock)
    })
    .catch((err) => {
      console.log("****************************************** ERROR ******************************************")
      console.log(err)
      console.log('*******************************************************************************************')
    })
}

function getData(blocktime, callback) {
  db.manyOrNone('select blocktime, vout from transactions where blocktime >= $1 order by blocktime limit 10000;', [blocktime])
    .then((results) => {
      async.mapLimit(results, 5, processAccount, (err) => {
        if(err) {
          console.log("****************************************** ERROR ******************************************")
          console.log(err)
          console.log('*******************************************************************************************')
        }

        callback()
      })
    })
    .catch((err) => {
      console.log("****************************************** ERROR ******************************************")
      console.log(err)
      console.log('*******************************************************************************************')
    })
}

function processAccount(transaction, callback) {
  blocktime = transaction.blocktime
  if(transaction.vout.result.length == 0) {
    return callback()
  }

  let voutAccounts = transaction.vout.result.map((acc) => {
    return acc.address
  }).filter(function(item, pos, self) {
    return self.indexOf(item) == pos
  })

  async.mapLimit(voutAccounts, 2, getAccount, callback)
}


function getAccount(acc, callback) {
  call('getaccountstate', [acc], (json) => {
    if(json.result) {
      saveAccount(json.result, acc, callback)
    } else {
      callback()
    }
  })
}

function saveAccount(account, accountHash, callback) {
  let neoBalance = account.balances.filter((bal) => {
    return bal.asset = "c56f33fc6ecfcd0c225c4ab356fee59390af8560be0e930faebe74a6daff7c9b"
  })
  if(neoBalance && neoBalance.length > 0) {
    neoBalance = neoBalance[0].value
  } else {
    neoBalance = 0
  }
  let gasBalance = account.balances.filter((bal) => {
    return bal.asset = "602c79718b16e442de58778e148d0b1084e3b2dffd5de6b7b16cee7969282de7"
  })
  if(gasBalance && gasBalance.length > 0) {
    gasBalance = gasBalance[0].value
  } else {
    gasBalance = 0
  }

  db.none("insert into accounts (hash, balances, neobalance, gasbalance) values ($1, $2, $3, $4) ON CONFLICT (hash) DO UPDATE set balances=excluded.balances, neoBalance=excluded.neoBalance, gasBalance=excluded.gasbalance;",
  [accountHash, { result: account.balances }, neoBalance, gasBalance])
    .then(callback)
    .catch((err) => {
      console.log("****************************************** ERROR ******************************************")
      console.log(err)
      console.log(accountHash)
      console.log('*******************************************************************************************')
    })
}

function call(method, params, callback) {
  fetch(con, {
    method: 'POST',
    body: JSON.stringify({
      "jsonrpc": "2.0",
      "id": 1,
      "method": method,
      "params": params
    }),
    headers: {
      'Content-Type': 'text/plain;',
      'Authorization': 'Basic '+authHash
    },
  })
  .then((res) => {
    return res.json()
  })
  .then((json) => {
    callback(json)
  })
  .catch(console.log)
}

start()
