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

  getMissingBlocks(maxBlock, (blocks)=> {
    processBlocks(blocks)
  })

  // getMaxBlock((max) => {
  //   let maxBlock = max.block_height
  //   console.log(maxBlock)
  //
  // })
}

function getMaxBlock() {
  db.oneOrNone("select max(number) as block_height from blocks;", [])
    .then(callback)
    .catch((err) => {
      console.log("****************************************** ERROR ******************************************")
      console.log(err)
      console.log('*******************************************************************************************')
    })
}

function getMissingBlocks() {
  db.manyOrNone("select series.num from (select generate_series(3000000, 4000000) as num) series left join blocks bl on series.num = bl.number where bl.number is null limit 10", [])
    .then(callback)
    .catch((err) => {
      console.log("****************************************** ERROR ******************************************")
      console.log(err)
      console.log('*******************************************************************************************')
    })
}

function processBlocks(blocks) {
  async.mapLimit(blocks, 1, processBlock, (err) => {
    if(err) {
      console.log("****************************************** ERROR ******************************************")
      console.log(err)
      console.log('*******************************************************************************************')
      return
    }
  })
}

function processBlock(block, callback) {
  console.log('Processing '+block.num)
  getBlock(block.num, callback)
}

function getBlock(blockNumber, callback) {
  call('eth_getBlockByNumber', [toHex(blockNumber), true], (json) => {
    if(json.result) {
      async.parallel([
        (callbackInner) => { saveBlock(json.result, callbackInner) },
        (callbackInner) => { getTransactions(json.result, callbackInner) }
      ], callback)
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
