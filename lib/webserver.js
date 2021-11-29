const axios = require('axios').default
const apollo = require('apollo-fetch');
const Hapi = require('@hapi/hapi');
const Joi = require('joi');

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
      return subgraphs[`${request.params.name}`].current;
    }
  });

  server.route({
    method: 'POST',
    path: '/hash/{name}',
    handler: (request, h) => {
      const { payload } = request;
      if(payload.hash) {
        subgraphs[`${request.params.name}`].pending = payload.hash;
      }
      return true;
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

module.exports = init;
