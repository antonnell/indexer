const fetch = require('node-fetch')

let con = 'http://localhost:8332'

fetch(con, {
  method: 'POST',
  body: JSON.stringify({
    "method": "getblockhash",
    "params": [0]
  }),
  headers: { 'Content-Type': 'application/json; charset=utf-8' },
})
.then((res) => {
  return res.json()
})
.then((json) => {
  model.updateToRestarted(req, res, next, transactionID, clientID, json.access)
})
.catch(function(err) {
  console.log(err)
  res.status(500)
  res.body = { 'status': 500, 'success': false, 'message': err }
  return next(null, req, res, next)
})
