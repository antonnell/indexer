  # Cross-Chain Indexer

  Cross-Chain indexer written in nodeJS.<br />
  Very basic RPC parser for a couple of different chain bases. (bitcoin, ethereum, neo)<br />
  Stores all the data in a PostgreSQL database.<br />

  ## Getting Started

  clone the repo

  ```
  npm install
  mkdir config
  vi config/config.js
  ```

  update with the following DB connection details and chain details

  ```
  var config = {
    host: '', //postgres DB host
    database: '', //postgres DB database
    user: '', //postgres DB user
    password: '', //postgres DB password
    chainBase: '', //bitcoin/ethereum/neo
    chain: '', //bitcoin, bitcoin-abc, litecoin, ethereum, etc
    chainURL: '', //RPC connection for your bitcoin or bitcoin based node
    chainHash: '', //RPC autentication hash for your bitcoin or bitcoin based node
  }

  module.exports = config
  ```

  ```
  node run index.js
  ```

  ### Prerequisites

  <ul>
    <li>nodeJS</li>
    <li>NPM</li>
    <li>blockchain that needs to be parsed
      <ul>
        <li>Bitcoin or any Bitcoin based chain</li>
        <li>Ethereum or any Ethereum based chain</li>
        <li>Neo or any Neo based chain</li>
      </ul>
    </li>
    <li>redis</li>
  </ul>



  ```
  sudo su
  curl -sL https://deb.nodesource.com/setup_11.x | bash -
  apt-get install -y build-essential
  apt-get install -y nodejs

  Follow blockchain installation instructions per required chain.
  ```

  ## License

  This project is licensed under the MIT License - see the [LICENSE.md](LICENSE.md) file for details
