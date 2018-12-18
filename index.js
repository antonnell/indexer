const config = require('./config/config.js')

function start() {
  console.log("************************************** STARTUP SCRIPT *************************************")

  switch(config.chainBase) {
    case 'bitcoin' :
      const service = require('./bitcoin')
      service.startBitcoin()
      break;
    case 'ethereum' :

      break;
    case 'neo' :
      const service = require('./neo')
      service.startNeo()
      break;
    default :
      {}
      break;
  }
}

start()
