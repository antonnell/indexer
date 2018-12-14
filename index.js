const fetch = require('node-fetch')
const redis = require("redis")
const client = redis.createClient()
const config = require('./config/config.js')
const db = require('./pg_db').db
const async = require('async')

const con = config.bitcoinURL
const authHash = config.bitcoinHash

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

function start() {
  console.log("************************************** STARTUP SCRIPT *************************************")
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

    if(!latestLocal) {
      latestLocal = 0
    }

    console.log('DEBUG ***********')
    console.log('latest chain: '+latestChain)
    console.log('latest chain: '+latestLocal)
    console.log('DEBUG ***********')

    if(latestChain > latestLocal) {
      console.log("*********************************** PROCESSING NEW BLOCK **********************************")
      console.log(parseInt(latestLocal) + 1)
      console.log('*******************************************************************************************')

      getBlockHash(parseInt(latestLocal) + 1, (err) => {
        if(err) {
          console.log(err)
        }
        processBlocks
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
  callBitcoin('getblockchaininfo', [], (json) => {

    console.log("************************************ GET BLOCKCHAIN INFO **********************************")
    console.log(json.result.blocks)
    console.log('*******************************************************************************************')

    setLatestChainBlock(json.result.blocks)

    //call every minute to see if something changed?
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
  callBitcoin('getblockhash', [blockNumber], (json) => {
    getBlock(json.result, callback)
  })
}

function getBlock(blockHash, callback) {
  callBitcoin('getblock', [blockHash], (json) => {
    //store in DB
    async.parallel([
      (callbackInner) => { saveBlock(json.result, callbackInner) },
      (callbackInner) => { setLatestLocalBlock(json.result.height, callbackInner) },
      (callbackInner) => { getTransactions(json.result.tx, callbackInner) }
    ], callback)
  })
}

function saveBlock(block, callback) {
  console.log('*************************************STORING NEW BLOCK*************************************')
  console.log(block)
  console.log('*******************************************************************************************')
  db.none("insert into blocks (hash, confirmations, strippedsize, size, weight, height, version, versionHex, merkleroot, time, mediantime, nonce, bits, difficulty, chainwork, ntx, previousblockhash, nextblockhash) values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18);",
  [block.hash, block.confirmations, block.strippedsize, block.size, block.weight, block.height, block.version, block.versionHex, block.merkleroot, block.time, block.mediantime, block.nonce, block.bits, block.difficulty, block.chainwork, block.nTx, block.previousblockhash, block.nextblockhash])
    .then(callback)
    .catch(callback)
}

function getTransactions(transactions, callback) {
  async.mapLimit(transactions, 10, getTransaction, callback)
}

function getTransaction(transaction, callback) {
  callBitcoin('getrawtransaction', [transaction, true], (json) => {
    saveTransaction(json.result, callback)

    // async.parallel([
    //   (callbackInner) => { saveTransaction(json.result, callbackInner) },
    //   (callbackInner) => { saveTransactionDetails(json.result, callbackInner) }
    // ], callback)
  })
}

function saveTransaction(transaction, callback) {
  console.log('************************************* STORING NEW TXN *************************************')
  console.log(transaction)
  console.log('*******************************************************************************************')
  db.none('insert into transactions (txid, hash, version, size, vsize, weight, locktime, vin, vout, blockhash, confirmations, time, blocktime) values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13);',
  [transaction.txid, transaction.hash, transaction.version, transaction.size, transaction.vsize, transaction.weight, transaction.locktime, transaction.vin, transaction.vout, transaction.blockhash, transaction.confirmations, transaction.time, transaction.blocktime])
    .then(callback)
    .catch(callback)
}

function saveTransactionDetails(transaction, callback) {
  async.mapLimit(transaction.details, 2, saveTransactionDetail, callback)
}

function saveTransactionDetail(details, callback) {
  console.log('********************************* STORING NEW TXN DETAILS *********************************')
  console.log(details)
  console.log('*******************************************************************************************')
  db.none('insert into transaction_details (account, address, category, amount, vout, fee) values ($1, $2, $3, $4, $5, $6);',
  [details.amount, details.address, details.category, details.amount, details.vout, details.fee])
    .then(callback)
    .catch(callback)
}

function callBitcoin(method, params, callback) {
  fetch(con, {
    method: 'POST',
    body: JSON.stringify({
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
