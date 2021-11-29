const servers =  require('../servers.json');
console.log('servers', servers);
const Redis = require("ioredis");
const redis = new Redis();

const Subgraph = module.exports = class {

  constructor(name, obj) {
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
      this.hash = this.manualHash;
    // if not, set the hash in Redis
    }else{
      this.hash = redisHash;
      console.log(`Redis hash for ${this.name} exists: "${redisHash}" manualHash: "${this.manualHash}"`);
    }
  }

  syncCheck() {
    // For each server that supports this graphql, see if its ok
    console.log(`${this.name} check!`);
    console.log('this.servers', this.servers);
  }

  // Every 10 seconds check the subgraphs;
  async checkGraphs() {
    let subgraphNames = Object.keys(subgraphs);
    for(let i=0; i<subgraphNames.length; i++) {
      let entry = subgraphs[subgraphNames[i]];
      for(let j=0; j<servers.length; j++) {
        let subgraphsString = entry.pending != null ? `["${entry.pending}", "${entry.current}"]` : `["${entry.current}"]`
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
        const graph = apollo.createApolloFetch({
          uri: servers[j].indexUrl
        });

        let {data} = await graph({query});
        for(let k=0; k<data.indexingStatuses.length; k++) {
          let subgraphStatus = data.indexingStatuses[k];
          if(subgraphStatus.subgraph === entry.pending) { // check pending
            if(subgraphStatus.synced && subgraphStatus.health === "healthy" && subgraphStatus.fatalError === null && Math.abs(subgraphStatus.chains[0].chainHeadBlock.number - subgraphStatus.chains[0].latestBlock.number) <= 10) {
              // replace current with pending, if pending is synced, healthy and has no fatal errors
              subgraphs[subgraphNames[i]].pending = null;
              subgraphs[subgraphNames[i]].current = entry.pending;

              // server ready
              subgraphs[subgraphNames[i]].servers[j] = true;

              // break loop for this subgraph server
              break;
            } else if (subgraphStatus.fatalError !== null) {
              // remove pending because failed
              subgraphs[subgraphNames[i]].pending = null;
            }
          } else { // check current
            if(!subgraphStatus.synced || subgraphStatus.health !== "healthy" || subgraphStatus.fatalError !== null || Math.abs(subgraphStatus.chains[0].chainHeadBlock.number - subgraphStatus.chains[0].latestBlock.number) > 10) {
              // disable server
              subgraphs[subgraphNames[i]].servers[j] = false;
            } else {
              subgraphs[subgraphNames[i]].servers[j] = true;
            }
          }
        }
        console.log(subgraphs);

      }
    }
  }

};

