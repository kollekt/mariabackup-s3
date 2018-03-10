#!/bin/sh
echo "starting cron-jobs service"
ln -s $(which node) /usr/bin/node
printenv | grep -v "no_proxy" > /etc/environment
crond -l 2 -f
