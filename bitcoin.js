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

function startBitcoin() {
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
      callback(err)
    }
    callback(err, value)
  });
}

function updateLatestChainBlock() {
  callBitcoin('getblockchaininfo', [], (json) => {
    setLatestChainBlock(json.result.blocks)

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
      callback(err)
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
    async.parallel([
      (callbackInner) => { saveBlock(json.result, callbackInner) },
      (callbackInner) => { getTransactions(json.result.tx, callbackInner) }
    ], (err) => {
      if(err) {
        console.log("****************************************** ERROR ******************************************")
        console.log(err)
        console.log('*******************************************************************************************')
      }
      setLatestLocalBlock(json.result.height, callback)
    })
  })
}

function saveBlock(block, callback) {
  db.none("insert into blocks (hash, confirmations, strippedsize, size, weight, height, version, versionHex, merkleroot, time, mediantime, nonce, bits, difficulty, chainwork, ntx, previousblockhash, nextblockhash) values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18);",
  [block.hash, block.confirmations, block.strippedsize, block.size, block.weight, block.height, block.version, block.versionHex, block.merkleroot, block.time, block.mediantime, block.nonce, block.bits, block.difficulty, block.chainwork, block.nTx, block.previousblockhash, block.nextblockhash])
    .then(callback)
    .catch((err) => {
      console.log("****************************************** ERROR ******************************************")
      console.log(err)
      console.log('*******************************************************************************************')
      callback(err)
    })
}

function getTransactions(transactions, callback) {
  async.mapLimit(transactions, 5, getTransaction, callback)
}

function getTransaction(transaction, callback) {
  callBitcoin('getrawtransaction', [transaction, true], (json) => {
    async.parallel([
      (callbackInner) => { saveTransaction(json.result, callbackInner) },
      (callbackInner) => { saveVin(json.result.vin, callbackInner) },
      (callbackInner) => { processVout(json.result.vin, json.result.txid, callbackInner) }
    ], callback)
  })
}

function saveTransaction(transaction, callback) {
  db.none('insert into transactions (txid, hash, version, size, vsize, weight, locktime, vin, vout, blockhash, confirmations, time, blocktime) values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13);',
  [transaction.txid, transaction.hash, transaction.version, transaction.size, transaction.vsize, transaction.weight, transaction.locktime, { result: transaction.vin }, { result: transaction.vout }, transaction.blockhash, transaction.confirmations, transaction.time, transaction.blocktime])
    .then(callback)
    .catch((err) => {
      console.log("****************************************** ERROR ******************************************")
      console.log(err)
      console.log('*******************************************************************************************')
      callback(err)
    })
}

function saveVin(vin, callback) {
  db.none('insert into vin (txid, voutindex, asm, hex, sequence) values ($1, $2, $3, $4, $5);',
  [[vin.txid, vin.vout, vin.scriptSig.asm, vin.scriptSig.hex, vin.sequence]])
    .then(callback)
    .catch((err) => {
      console.log("****************************************** ERROR ******************************************")
      console.log(err)
      console.log('*******************************************************************************************')
      callback(err)
    })
}

function processVout(vout, txid, callback) {
  let insertUUID = uuid.v4()
  async.parallel([
    (callbackInner) => { saveVout(vout, txid, insertUUID, callbackInner) },
    (callbackInner) => { processAddresses(vout.addresses, insertUUID, callbackInner) }
  ], callback)
}

function processAddresses(addresses, insertUUID, callback) {
  async.mapLimit(adresses, 1, (address, callbackInner) => { saveVoutAddress(address, insertUUID, callbackInner) }, callback)
}

function saveVout(vout, txid, insertUUID, callback) {
  db.none('insert into vout (voutid, txid, value, index, asm, hex, regsigs, type, addresses) values ($1, $2, $3, $4, $5, $6, $7, $8, $9);',
  [insertUUID, txid, vout.value, vout.n, vout.scriptPubKey.asm, vout.scriptPubKey.hex, vout.scriptPubKey.regSigs, vout.scriptPubKey.type, { result: vout.scriptPubKey.addresses }])
    .then(callback)
    .catch((err) => {
      console.log("****************************************** ERROR ******************************************")
      console.log(err)
      console.log('*******************************************************************************************')
      callback(err)
    })
}

function saveVoutAddress(address, insertUUID, callback) {
  db.none('insert into voutaddresses (voutid, address) values ($1, $2);',
  [insertUUID, address])
    .then(callback)
    .catch((err) => {
      console.log("****************************************** ERROR ******************************************")
      console.log(err)
      console.log('*******************************************************************************************')
      callback(err)
    })
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

module.exports = { startBitcoin }
