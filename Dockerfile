FROM node:18-alpine

RUN apk --no-cache add mariadb-backup

WORKDIR /usr/app

ADD . /usr/app
COPY backup.cron /etc/crontabs/root

RUN npm install
RUN ln -s /usr/app/src/index.js /usr/local/bin/backup
RUN chmod +x scripts/cron.sh
RUN chmod +x scripts/restore-check.sh

CMD "./scripts/cron.sh"
