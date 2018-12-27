const fetch = require('node-fetch')
const redis = require("redis")
const client = redis.createClient()
const config = require('./config/config.js')
const db = require('./pg_db').db
const async = require('async')

const con = config.chainURL
const authHash = config.chainHash

// startup process
// connect to DB
// connect to Redis
// connect to chain, some status call?

//async process (1) that gets latest best block height
  //store block height in Redis
  //store block height in PostgresDB

//async process (2) that gets latest current block height
  //if current block < max block then we are busy catching up, else we are on our latest block and we can go to sleep? Not sure bitcoin has a subscribe functionality

  //run process for getBlockHash(currentBlockHeight) => hash
  //.then getBlock(hash)
  //.then async process (1) store in PostgresDB
  //      async process (2) store in Redis
  //      async process (3) map all transactions => transactionHash
  //        get transaction(transactionHash)
  //        transaction store in PostgresDB

function startNeo() {
  updateLatestChainBlock()
  processBlocks()
}

function processAccounts(transaction, callback) {
  let voutAccounts = transaction.vout.map((acc) => {
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
    .then(() => { })
    .catch((err) => {
      console.log("****************************************** ERROR ******************************************")
      console.log(err)
      console.log(accountHash)
      console.log('*******************************************************************************************')
    })

  //we aren't waiting for the DB store to happen, just call callback!
  callback()
}

function processBlocks() {
  async.parallel([
    (callback) => { getLatestChainBlock(callback) },
    (callback) => { getLatestLocalBlock(callback) }
  ], (err, blockDetails) => {
    if(err) {
      console.log("****************************************** ERROR ******************************************")
      console.log(err)
      console.log('*******************************************************************************************')
      return
    }

    console.log("Block number " + blockDetails[1] + " of " + blockDetails[0])
    if(!blockDetails[1]) {
      blockDetails[1] = 0
    }

    if(parseInt(blockDetails[0]) > parseInt(blockDetails[1])) {
      getBlockHash(parseInt(blockDetails[1]) + 1, (err) => {
        if(err) {
          console.log(err)
        }
        processBlocks()
      })
    } else {

      console.log('DEBUG ***********')
      console.log('sleeping for 1 minute')
      console.log('DEBUG ***********')
      setTimeout(processBlocks, 60000)
    }
  })
}

function setLatestChainBlock(value) {
  client.set('latest-chain-block', value)
}

function getLatestChainBlock(callback) {
  client.get("latest-chain-block", (err, value) => {
    if(err) {
      console.log("****************************************** ERROR ******************************************")
      console.log(err)
      console.log('*******************************************************************************************')
    }
    callback(err, value)
  });
}

function updateLatestChainBlock() {
  call('getblockcount', [], (json) => {
    setLatestChainBlock(json.result)

    setTimeout(updateLatestChainBlock, 60000)
  })
}

function setLatestLocalBlock(value, callback) {
  client.set('latest-local-block', value)
  if(callback) {
    callback()
  }
}

function getLatestLocalBlock(callback) {
  client.get("latest-local-block", (err, value) => {
    if(err) {
      console.log("****************************************** ERROR ******************************************")
      console.log(err)
      console.log('*******************************************************************************************')
    }

    callback(err, value)
  });
}

function getBlockHash(blockNumber, callback) {
  call('getblockhash', [blockNumber], (json) => {
    getBlock(json.result, callback)
  })
}

function getBlock(blockHash, callback) {
  call('getblock', [blockHash, 1], (json) => {
    if(json.result) {
      async.parallel([
        (callbackInner) => { saveBlock(json.result, callbackInner) },
        (callbackInner) => { setLatestLocalBlock(json.result.index, callbackInner) },
        (callbackInner) => { getTransactions(json.result, callbackInner) }
      ], callback)
    } else {
      callback()
    }
  })
}

function saveBlock(block, callback) {
  db.none("insert into blocks (hash, size, version, previousblockhash, merkleroot, time, index, nonce, nextconsensus, confirmations, nextblockhash) values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11);",
  [block.hash, block.size, block.version, block.previousblockhash, block.merkleroot, block.time, block.index, block.nonce, block.nextconsensus, block.confirmations, block.nextblockhash])
    .then(() => {})
    .catch((err) => {
      console.log("****************************************** ERROR ******************************************")
      console.log(err)
      console.log(block)
      console.log('*******************************************************************************************')
    })

  //we aren't waiting for the DB store to happen, just call callback!
  callback()
}

function getTransactions(block, callback) {

  //neo returns the trnasaction for us. YAY!
  async.mapLimit(block.tx, 2, (transaction, callbackInner) => { processTransaction(transaction, block, callbackInner) }, callback)
}

function processTransaction(transaction, block, callback) {
  async.parallel([
    (callbackInner) => { saveTransaction(transaction, block, callbackInner) },
    (callbackInner) => { processVin(transaction.vin, transaction.txid, callbackInner) },
    (callbackInner) => { processVout(transaction.vout, transaction.txid, callbackInner) }
  ], callback)
}


function processVin(vins, txid, callback) {
  async.mapLimit(vins, 5, (vin, callbackInner) => { saveVin(vin, txid, callbackInner) }, callback)
}

function saveVin(vin, txid, callback) {
  db.none('insert into vin (txid, vouttxid, voutindex) values ($1, $2, $3);',
  [txid, vin.txid, vin.vout])
    .then(callback)
    .catch((err) => {
      console.log("****************************************** ERROR ******************************************")
      console.log(err)
      console.log(vin)
      console.log('*******************************************************************************************')
      callback(err)
    })
}

function processVout(vouts, txid, callback) {
  async.mapLimit(vouts, 5, (vout, callbackInner) => { saveVout(vout, txid, callbackInner) }, callback)
}

function saveVout(vout, txid, callback) {
  db.none('insert into vout (txid, value, index, asset, address) values ($1, $2, $3, $4, $5);',
  [txid, vout.value, vout.n, vout.asset, vout.address])
    .then(callback)
    .catch((err) => {
      console.log("****************************************** ERROR ******************************************")
      console.log(err)
      console.log(vout)
      console.log('*******************************************************************************************')
      callback(err)
    })
}

function saveTransaction(transaction, block, callback) {

  let vin = {
    result: transaction.vin
  }
  let vout = {
    result: transaction.vout
  }
  let scripts = {
    result: transaction.scripts
  }
  let attributes = {
    result: transaction.attributes
  }
  db.none('insert into transactions (txid, size, type, version, attributes, vin, vout, sys_fee, net_fee, scripts, blockhash, confirmations, blocktime) values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13);',
  [transaction.txid, transaction.size, transaction.type, transaction.version, attributes, vin, vout, transaction.sys_fee, transaction.net_fee, scripts, block.hash, block.confirmations, block.time])
    .then(() => {
      processAccounts(transaction, (err) => {
        if(err) {
          console.log("****************************************** ERROR ******************************************")
          console.log(err)
          console.log('*******************************************************************************************')
        }
      })
    })
    .catch((err) => {
      console.log("****************************************** ERROR ******************************************")
      console.log(err)
      console.log(transaction)
      console.log('*******************************************************************************************')
    })

  //we aren't waiting for the DB store to happen, just call callback!
  callback()
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

module.exports = { startNeo }
