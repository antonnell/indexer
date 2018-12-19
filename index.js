const config = require('./config/config.js')

function start() {
  console.log("************************************** STARTUP SCRIPT *************************************")

  let service = null

  switch(config.chainBase) {
    case 'bitcoin' :
      service = require('./bitcoin')
      service.startBitcoin()
      break;
    case 'neo' :
      service = require('./neo')
      service.startNeo()
      break;
    case 'eos' :
      service = require('./eos')
      service.startEos()
      break;
    case 'cardano' :
      service = require('./cardano')
      service.startCardano()
      break;
    case 'ethereum' :

      break;
    default :
      {}
      break;
  }
}

start()
