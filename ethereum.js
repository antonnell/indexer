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

function startEthereum() {
  updateLatestChainBlock()
  //processBlocks()
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

    let latestChain = blockDetails[0]
    let latestLocal = blockDetails[1]

    console.log("Block number " + latestLocal + " of " + latestChain)
    if(!latestLocal) {
      latestLocal = 0
    }

    if(parseInt(latestChain) > parseInt(latestLocal)) {
      getBlockHash(parseInt(latestLocal) + 1, (err) => {
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
  call('eth_blockNumber', [], (json) => {
    setLatestChainBlock(parseInt(json.result, 16))

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
      console.log('*******************************************************************************************')
    })

  //we aren't waiting for the DB store to happen, just call callback!
  callback()
}

function getTransactions(block, callback) {

  //neo returns the trnasaction for us. YAY!
  async.mapLimit(block.tx, 10, (transaction, callback) => { saveTransaction(transaction, block, callback) }, callback)
}

// function getTransaction(transaction, callback) {
//   call('getrawtransaction', [transaction, 1], (json) => {
//     saveTransaction(json.result, callback)
//   })
// }

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
    .then(() => {})
    .catch((err) => {
      console.log("****************************************** ERROR ******************************************")
      console.log(err)
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
      'Content-Type': 'application/json;'
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

module.exports = { startEthereum }
