FROM node:8-jessie as production

WORKDIR /var/www
COPY ./src  /var/www/src
COPY ./package.json ./package-lock.json /var/www/
# RUN npm i npm@latest -g
RUN npm install
