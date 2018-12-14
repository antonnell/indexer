const fetch = require('node-fetch')

let con = 'http://localhost:8332'
let authHash = 'dXNlcjpwYXNzd29yZA=='


getBlockHash(0)

function getBlock(blockHash) {
  fetch(con, {
    method: 'POST',
    body: JSON.stringify({
      "method": "getblock",
      "params": [blockHash]
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
    getBlock(json.result)
  })
  .catch(console.log)
}

function getBlockHash(blockNumber) {
  fetch(con, {
    method: 'POST',
    body: JSON.stringify({
      "method": "getblockhash",
      "params": [blockNumber]
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
    console.log(json)

  })
  .catch(console.log)
}
