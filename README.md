# Project Title

Cross-Chain indexer written in nodeJS.
Very basic RPC parser for a couple of different chain bases. (bitcoin, ethereum, neo)
Stores all the data in a PostgreSQL database.

## Getting Started

clone the repo
npm install
mkdir config
vi config/config.js
update with the following DB connection details and chain details

```
var config = {
  host: '', //postgres DB host
  database: '', //postgres DB database
  user: '', //postgres DB user
  password: '', //postgres DB password
  chainBase: '', //bitcoin/ethereum/neo
  chain: '', //bitcoin, bitcoin-abc, litecoin, ethereum, etc
  bitcoinURL: '', //RPC connection for your bitcoin or bitcoin based node
  bitcoinHash: '', //RPC autentication hash for your bitcoin or bitcoin based node
  neoURL: '', //RPC connection for your neo node
  neoHash: '', //RPC connection for your neo node
  neoURL: '', //RPC connection for your ethereum node
  neoHash: '' //RPC connection for your ethereum node
}

module.exports = config
```

node run index.js

### Prerequisites

nodeJS
NPM
blockchain that needs to be parsed
  Bitcoin or any Bitcoin based chain
  Ethereum or any Ethereum based chain
  Neo or any Neo based chain

```
sudo su
curl -sL https://deb.nodesource.com/setup_11.x | bash -
apt-get install -y build-essential
apt-get install -y nodejs

Following blockchain installation instructions per chain.
```

## Built With

* [Dropwizard](http://www.dropwizard.io/1.0.2/docs/) - The web framework used
* [Maven](https://maven.apache.org/) - Dependency Management
* [ROME](https://rometools.github.io/rome/) - Used to generate RSS Feeds

## License

This project is licensed under the MIT License - see the [LICENSE.md](LICENSE.md) file for details
