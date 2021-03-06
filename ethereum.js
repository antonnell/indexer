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
  processBlocks()
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
      getBlock(parseInt(blockDetails[1]) + 1, (err) => {
        if(err) {
          console.log(err)
        }
        setTimeout(processBlocks, 100)
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
    setLatestChainBlock(toDecimal(json.result))

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


function getBlock(blockNumber, callback) {
  call('eth_getBlockByNumber', [toHex(blockNumber), true], (json) => {
    if(json.result) {
      async.parallel([
        (callbackInner) => { saveBlock(json.result, callbackInner) },
        (callbackInner) => { getTransactions(json.result, callbackInner) }
      ], (err) => {
        setLatestLocalBlock(toDecimal(json.result.number), callback)
      })
    } else {
      callback()
    }
  })
}

function saveBlock(block, callback) {
  db.none("insert into blocks (difficulty, gaslimit, gasused, hash, logsbloom, miner, mixhash, nonce, number, parenthash, receiptsroot, sha3uncles, size, stateroot, timestamp, totaldifficulty, transactionsroot, uncles) values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18);",
  [toDecimal(block.difficulty), toDecimal(block.gasLimit), toDecimal(block.gasUsed), block.hash, block.logsBloom, block.miner, block.mixHash, block.nonce, toDecimal(block.number), block.parentHash, block.receiptsRoot, block.sha3Uncles, toDecimal(block.size), block.stateRoot, toDecimal(block.timestamp), toDecimal(block.totalDifficulty), block.transactionsRoot, {result: block.uncles}])
    .then(callback)
    .catch((err) => {
      console.log("****************************************** ERROR ******************************************")
      console.log(err)
      console.log('*******************************************************************************************')
    })

  //we aren't waiting for the DB store to happen, just call callback!
}

function getTransactions(block, callback) {

  //eth returns the trnasaction for us. YAY!
  async.mapLimit(block.transactions, 3, (transaction, callbackInner) => { saveTransaction(transaction, block, callbackInner) }, callback)
}

function saveTransaction(transaction, block, callback) {
  db.none('insert into transactions (blockhash, blocknumber, "from", gas, gasprice, hash, input, nonce, "to", transactionindex, value, v, r, s) values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14);',
  [transaction.blockHash, toDecimal(transaction.blockNumber), transaction.from, toDecimal(transaction.gas), toDecimal(transaction.gasPrice), transaction.hash, transaction.input, toDecimal(transaction.nonce), transaction.to, toDecimal(transaction.transactionIndex), toDecimal(transaction.value), toDecimal(transaction.v), transaction.r, transaction.s])
    .then(callback)
    .catch((err) => {
      console.log("****************************************** ERROR ******************************************")
      console.log(transaction)
      console.log(err)
      console.log('*******************************************************************************************')
    })

  //we aren't waiting for the DB store to happen, just call callback!
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

function toHex(number) {
  return '0x'+number.toString(16)
}

function toDecimal(hex) {
  return parseInt(hex, 16)
}

module.exports = { startEthereum }
