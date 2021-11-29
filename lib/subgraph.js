const servers =  require('../servers.json');
console.log('servers', servers);
const Redis = require("ioredis");
const redis = new Redis();
const apollo = require('apollo-fetch');

const Subgraph = module.exports = class {

  constructor(name, obj) {
    this.current = null;
    this.pending = null;
    this.last = 0;
    this.name = name;
    this.manualHash = obj.current;

    // We keep a copy of all servers that run this graphql
    // We use Object.assign here to make a copy of the configs.
    this.servers = obj.servers.map( i => Object.assign({}, servers[i]));
  }

  // Load subgraph details.
  async load() {
    // Check to see if a currentHash exists in Redis...
    const redisHash = await redis.get(`${this.name}.current.hash`);

    // If hash does not exists in Redis save it...
    if (redisHash === null){
      console.log(`Redis hash for ${this.name} is empty. Setting it to "${this.manualHash}"...`);
      let r = await redis.set(`${this.name}.current.hash`, this.manualHash);
      this.current = this.manualHash;
    // if not, set the hash in Redis
    }else{
      this.current = redisHash;
      console.log(`Redis hash for ${this.name} exists: "${redisHash}" manualHash: "${this.manualHash}"`);
    }
  }

  async getRandomActiveUrl() {
    let activeServers = this.servers.filter( server => server.active === true);

    if (activeServers.length === 0){
      console.error('Error: No servers are active so using them all.', activeServers);
      activeServers = this.servers;
    }
    let randomNumber = Math.floor(Math.random() * activeServers.length);
    return activeServers[randomNumber].redirectUrl;
  }

  // Update graph hash locally and on Redis.
  async updateHash(newHash) {
    console.log(`${this.name}: updating hash...`, newHash);
    this.current = newHash;
    await redis.set(`${this.name}.current.hash`, newHash);
  }

  // Update graph hash locally and on Redis.
  async updatePendingHash(newHash) {
    console.log(`${this.name}: updating pending hash...`, newHash);
    this.pending = newHash;
    await redis.set(`${this.name}.pending.hash`, newHash);
  }

  async syncCheck() {
    // For each server that supports this graphql, see if its ok
    /*
      {
        redirectUrl: 'http://157.90.182.138:8000',
        indexUrl: 'http://157.90.182.138:8030/graphql',
        active: false
      }
    */

    for(const server of this.servers){
      try{
        const r = await this.checkGraphOnServer(server);
      }catch(err){
        // TODO: error here usually means Graph node is off.
        console.error(`${this.name}: > Error: failed.`, err.message);
        this.server.active = false;
      }
    }
  }

  async checkGraphOnServer(server) {
    const thisGraph = this;
    let subgraphsString = thisGraph.pending != null ? `["${thisGraph.pending}", "${thisGraph.current}"]` : `["${thisGraph.current}"]`
    let query = `{ indexingStatuses(subgraphs: ${subgraphsString}) {
                synced
                subgraph
                health
                chains {
                    chainHeadBlock {
                        number
                    }
                    latestBlock {
                        number
                    }
                }
                fatalError {
                    handler
                }
                entityCount
                node
            }}`;

    console.log(`${thisGraph.name}: fetching ${server.indexUrl}...`);
    const graph = apollo.createApolloFetch({
      uri: server.indexUrl
    });

    let {data} = await graph({query});
    // console.log(`${thisGraph.name}: > fetch data:`, data);

    if (data.indexingStatuses.length === 0){

      // TODO: subgraph can not be found on this node / is not deployed
      console.error(`${thisGraph.name}: > indexStatuses has no length`);
      this.server.active = false;
    }

    for(let k=0; k<data.indexingStatuses.length; k++) {
      let subgraphStatus = data.indexingStatuses[k];

      if(subgraphStatus.subgraph === thisGraph.pending) { // check pending

        if(subgraphStatus.synced && subgraphStatus.health === "healthy" && subgraphStatus.fatalError === null && Math.abs(subgraphStatus.chains[0].chainHeadBlock.number - subgraphStatus.chains[0].latestBlock.number) <= 10) {
          // replace current with pending, if pending is synced, healthy and has no fatal errors
          thisGraph.pending = null;
          thisGraph.current = thisGraph.pending;

          // server ready
          server.active = true;

          // break loop for this subgraph server
          break;
        } else if (subgraphStatus.fatalError !== null) {
          // remove pending because failed
          thisGraph.pending = null;
        }
      } else { // check current
        if(!subgraphStatus.synced || subgraphStatus.health !== "healthy" || subgraphStatus.fatalError !== null || Math.abs(subgraphStatus.chains[0].chainHeadBlock.number - subgraphStatus.chains[0].latestBlock.number) > 10) {
          // disable server
          server.active = false;
        } else {
          server.active = true;
        }
      }
    }

  }

};

