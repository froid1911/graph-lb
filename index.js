'use strict';

const Hapi = require('@hapi/hapi');
const Joi = require('joi');
const axios = require('axios').default
const apollo = require('apollo-fetch');


const subgraphs = {
    'aavegotich-core-matic': {
        current: "QmefYc7CDnV6VbJdsosSvPA8gUuaSe6KWuuNeraqpgvY7H",
        pending: null,
        servers: [false, false, false],
        last: 0
    },
    'aavegotchi-svg': {
        current: "QmX1fymAL8V6kjAAKux7hxUzAHyZ9Vfv5GS1i9tVwbu2ux",
        pending: null,
        servers: [false, false, false],
        last: 0
    }
}

const servers = [
    { redirectUrl: "http://157.90.182.138:8000", indexUrl: "http://157.90.182.138:8030/graphql", active: false },
    { redirectUrl: "https://api.thegraph.com", indexUrl: "https://api.thegraph.com/index-node/graphql", active: false },
    { redirectUrl: "https://aavegotchi2.stakesquid-frens.gq", indexUrl: "https://aavegotchi-lb.stakesquid-frens.gq/graphql", active: false },
];

const init = async () => {

    let counter = 0;
    const config = {
        get baseURL() {
            
            let baseURL = servers[counter];
            counter += 1;
            return baseURL.redirectUrl;
        },
    };

    const server = Hapi.server({
        port: 3030,
        host: 'localhost'
    });



    // Routes to set and get latest hash
    server.route({
        method: 'GET',
        path: '/hash/{name}',
        handler: (request, h) => {
            return subgraphs[request.params.name];
        }
    });

    server.route({
        method: 'POST',
        path: '/hash/{name}',
        handler: (request, h) => {
            const { payload } = request;
            if(payload.hash) {
                subgraphs[request.params.name] = payload.hash;
            }
        }
    });

    // Route to Proxy GraphQL Request
    server.route({
        method: 'POST',
        path: '/{name}',
        handler: async (request, h) => {
            const { payload } = request; 
            const subgraph = subgraphs[request.params.name];
            const server = null;

            // fetch active server with round robin
            // @todo: need help from mauvis :-)
            const response = await axios.post(`/subgraphs/id/${subgraph.current}`, payload, config);
            return response.data;
        }
    });

    await server.start();
    console.log('Server running on %s', server.info.uri);
};

const checkSubgraphs = async () => {
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
                    console.log(subgraphStatus);
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

    setTimeout(checkSubgraphs, 10000)
}

process.on('unhandledRejection', (err) => {

    console.log(err);
    process.exit(1);
});

init();
checkSubgraphs();