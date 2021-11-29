'use strict';

const subgraphs = require('./lib/subgraphs');
const webserver = require('./lib/webserver.js');


process.on('unhandledRejection', (err) => {
  console.log('unhandledRejection', err);
  process.exit(1);
});


//checkSubgraphs();

async function init(){
  // Load subgraph data from Redis.
  await subgraphs.load();

  // This just logs latest stats on startup.
  // await subgraphs.getLatestHashes();

  // Performs a sync check on all graph instances on all servers.
  //await subgraphs.syncCheck();

  // const r = subgraphs.getByName('aavegotchi-core-matic').updateHash('QmefYc7CDnV6VbJdsosSvPA8gUuaSe6KWuuNeraqpgvY7H')

  // Start the webserver.
  await webserver();
}

init();
