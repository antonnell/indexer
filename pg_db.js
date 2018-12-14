var pgp = require('pg-promise')(/*options*/)
var config = require('./config/config.js')

var cn = {
  host: config.host,
  port: 5432,
  database: config.database,
  user: config.user,
  password: config.password
}
var db = pgp(cn)

module.exports = {
  pgp, db
}
