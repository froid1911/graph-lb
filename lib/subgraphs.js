const Subgraph = require('./subgraph');
const Subgraphs = class {

  constructor() {
    this.subgraphs = [];
  }

  // Load subgraph details.
  async load() {
    // Load configuration.
    const json = require('../subgraphs.json');
    const subgraphs = Object.keys(json);

    for (const subgraphName of subgraphs){

      let thisSubGraphJson = json[subgraphName];

      const thisGraphObj = new Subgraph(subgraphName, thisSubGraphJson);
      await thisGraphObj.load();

      // Add to internal subgraph obj collection.
      this.subgraphs.push(thisGraphObj);
    }

  }

  getAllGraphStats() {
    const r = {};
    for(const subgraph of this.subgraphs){
      //str += `${subgraph.name} : ${aJSON.stringify(subgraph.servers)}\n\n`;
      r[subgraph.name] = subgraph.servers;
    }
    return r;
  }

  // Get a subgraph by name
  getByName(name) {
    const match = this.subgraphs.filter(o => o.name === name);
    if (match.length){
      return match[0];
    }
  }

  getLatestHashes() {
    for(const subgraph of this.subgraphs){
      console.log(subgraph.name, subgraph.hash);
    }
  }

  // Run syncCheck on all sungraphs
  async syncCheck() {
    console.log(new Date(), 'syncCheck all graphs...');
    for(const subgraph of this.subgraphs){
      await subgraph.syncCheck();
    }
  }

};

module.exports = new Subgraphs();
