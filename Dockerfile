FROM node:18-alpine

RUN apk --no-cache add mariadb-backup curl

WORKDIR /usr/app

ADD . /usr/app
COPY backup.cron /etc/crontabs/root

RUN npm install
RUN ln -s /usr/app/src/index.js /usr/local/bin/backup
RUN chmod +x scripts/* hooks/*

CMD "./scripts/cron.sh"
