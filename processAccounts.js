const config = require('./config/config.js')

function start() {
  console.log("************************************** STARTUP SCRIPT *************************************")

  let service = null

  switch(config.chainBase) {
    case 'ethereum' :
      service = require('./ethereum_processAccounts')
      service.start()
      break;
    case 'bitcoin' :
      service = require('./bitcoin_processAccounts')
      service.start()
      break;
    case 'neo' :
      service = require('./neo_processAccounts')
      service.start()
      break;
    case 'eos' :
      service = require('./eos_processAccounts')
      service.start()
      break;
    case 'cardano' :
      service = require('./cardano_processAccounts')
      service.start()
      break;
    default :
      {}
      break;
  }
}

start()
