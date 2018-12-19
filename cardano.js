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

function startCardano() {
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

    let latestChain = blockDetails[0]
    let latestLocal = blockDetails[1]

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
  call('/v1/chain/get_info', {}, (json) => {
    setLatestChainBlock(json.last_irreversible_block_num)

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
  call('/v1/chain/get_block', { block_num_or_id: blockNumber }, (json) => {
    async.parallel([
      (callbackInner) => { saveBlock(json, callbackInner) },
      (callbackInner) => { setLatestLocalBlock(json.block_num, callbackInner) },
      (callbackInner) => { getTransactions(json, callbackInner) }
    ], callback)
  })
}

function saveBlock(block, callback) {

  db.none("insert into blocks (timestamp, producer, confirmed, previous, transaction_mroot, action_mroot, schedule_version, new_producers, header_extensions, producer_signature, transactions, block_extensions, id, block_num, ref_block_prefix) values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15);",
  [block.timestamp, block.producer, block.confirmed, block.previous, block.transaction_mroot, block.action_mroot, block.schedule_version, block.new_producers, { result: block.header_extensions }, block.producer_signature, { result: block.transactions }, { result: block.block_extensions }, block.id, block.block_num, block.ref_block_prefix])
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
  async.mapLimit(block.transactions, 10, (transaction, callback) => { saveTransaction(transaction, block, callback) }, callback)
}

// function getTransaction(transaction, callback) {
//   call('getrawtransaction', [transaction, 1], (json) => {
//     saveTransaction(json.result, callback)
//   })
// }

function saveTransaction(transaction, block, callback) {

  // db.none('insert into transactions (txid, size, type, version, attributes, vin, vout, sys_fee, net_fee, scripts, blockhash, confirmations, blocktime) values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13);',
  // [transaction.txid, transaction.size, transaction.type, transaction.version, attributes, vin, vout, transaction.sys_fee, transaction.net_fee, scripts, block.hash, block.confirmations, block.time])
  //   .then(() => {})
  //   .catch((err) => {
  //     console.log("****************************************** ERROR ******************************************")
  //     console.log(err)
  //     console.log('*******************************************************************************************')
  //   })

  console.log("********************************** TRANSACTION RECEIVED ***********************************")
  console.log(transaction)
  console.log('*******************************************************************************************')
  //we aren't waiting for the DB store to happen, just call callback!
  callback()
}

function call(method, params, callback) {
  fetch(con+method, {
    method: 'POST',
    body: JSON.stringify(params),
    headers: {
      'Content-Type': 'application/json'
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

module.exports = { startCardano }
