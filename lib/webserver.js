const axios = require('axios').default
const apollo = require('apollo-fetch');
const Hapi = require('@hapi/hapi');
const Boom = require('boom');
const Joi = require('joi');
const subgraphs = require('./subgraphs');

const init = async () => {

  const server = Hapi.server({
    port: 3030,
    host: 'localhost'
  });

  // Routes to set and get latest hash
  // Working
  server.route({
    method: 'GET',
    path: '/stats',
    handler: (request, h) => {
      return subgraphs.getAllGraphStats();
    }
  });

  // Routes to set and get latest hash
  // Working
  server.route({
    method: 'GET',
    path: '/hash/{name}',
    handler: (request, h) => {
      const subgraph = subgraphs.getByName(request.params.name);
      if (subgraph){
        return subgraph.current;
      }else{
        // throw error;
        throw Boom.notFound('Graph not found.')
      }
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

  // Route to random Proxy GraphQL Request
  server.route({
    method: 'POST',
    path: '/{name}',
    handler: async (request, h) => {
      const { payload } = request;
      const subgraph = subgraphs.getByName(request.params.name);
      if (!subgraph){
        // throw error;
        throw Boom.notFound('Graph not found.');
      }

      const url = `${await subgraph.getRandomActiveUrl()}/subgraphs/id/${subgraph.current}`;
      console.log('url', url);
      const response = await axios.post(url, payload);
      return response.data;
    }
  });

  await server.start();
  console.log('Server running on %s', server.info.uri);
};

module.exports = init;
