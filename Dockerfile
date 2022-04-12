FROM node:14
WORKDIR /usr/src/app
COPY . .

EXPOSE 3030

RUN npm install
CMD [ "node", "index.js" ]

