#!/bin/sh

DATA_DIR="${MYSQL_DATA_DIR:-/var/lib/mysql}"
echo "Mysql datadir is set to ${DATA_DIR}";
echo "Check if backup is ready to restore.."

if [ -d "${DATA_DIR}/restore" ]; then
    echo "Restoring backup.."
    FILE_OWNER=$(stat -c "%u:%g" $DATA_DIR)
    mv "${DATA_DIR}/restore" /tmp/mysql-backup
    rm -rf "${DATA_DIR}"
    mariabackup --move-back --target-dir /tmp/mysql-backup --datadir $DATA_DIR
    # Set correct permissions
    chown -R $FILE_OWNER $DATA_DIR
fi
