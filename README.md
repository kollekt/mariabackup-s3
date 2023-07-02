# MariaDB Backup S3
This package is developed to run as a sidecar for Bitnami's mariaDB.

## Features
* Customize backup schedule
* Full backups + Incremental backups
* Backups are stored on S3
* Automatic backup rotation / pruning
* Restore command
* List backups
* Duplicate backup process prevention
* Custom hooks

## Backup strategy
### Defaults
 - Full backup every day at 03:00
 - Incremental backups every 10 minutes
 - Backup retention:
   - All backups (full + incremental) for the last 7 days
   - one full backup per week for the last 4 weeks
   - one full backup per month for the last 6 months
   - one full backup per year for the last 5 years
 - If no previous backup exists, the first backup made will always be a full backup

### Customize strategy
To customize the backup and prune strategy `backup.cron` can be modified and applied as configmap. 

The `--retention` argument accepts a combination of comma seperated `days`, `weeks`, `monthys` and `years`.

```shell
#example
backup prune --retention '14:days,12:months' --dry-run
```

If no argument is provided the defaults are used. 

## Restoring a backup
Shell into the `backup` sidecar. List backups in a date range which you are interested in:
```shell
node src/index.js list --after "2022-11-23" --before "2022-11-26" --fullOnly
┌─────────┬───────────────────────┬──────────────┐
│ (index) │       dateTime        │     type     │
├─────────┼───────────────────────┼──────────────┤
│    0    │ '2022-11-23 01:00:01' │    'Full'    │
│    1    │ '2022-11-24 01:00:00' │    'Full'    │
│    2    │ '2022-11-25 01:00:01' │    'Full'    │
└─────────┴───────────────────────┴──────────────┘
```

Pick backup to restore:

```shell
backup restore '2022-11-24 01:00:00'
```
This will download the last full backup and all incremental backups made up until the provided `dateTime` argument.

When the restore is completed, kill the pod. When the pod reschedules, the init container will apply the restore before the database initializes.

## Deployment
Current version is configured to work with [Bitnami's MariaDB helm chart](https://github.com/bitnami/charts/tree/main/bitnami/mariadb).  
It attaches an init and sidecar container which takes care of the backup and restore process.

Use a configmap to allow for a custom backup strategy
```shell
# For a custom backup schedule use 
kubectl apply -f k8s/mariadb-backup-config.yaml
```


Extend the Helm chart with the following configuration (`value.yaml`).  
```yaml
primary:
  extraVolumes:
    - name: backup-config
      configMap:
        name: mariadb-backup-config
        defaultMode: 0744
  initContainers:
    - name: init
      image: kollekt/mariabackup:10.6
      command: ["ash", "/usr/app/scripts/restore-check.sh"]
      env:
         - name: MYSQL_DATA_DIR
           value: /bitnami/mariadb/data
      volumeMounts:
        - mountPath: /bitnami/mariadb
          name: data
  sidecars:
    - name: backup
      image: kollekt/mariabackup:10.6
      volumeMounts:
        - mountPath: /bitnami/mariadb
          name: data
        - mountPath: /etc/crontabs/root
          name: backup-config
          subPath: backup.cron
        - mountPath: /usr/app/hooks/backup-success
          name: backup-config
          subPath: backup-success
      env:
        - name: MYSQL_ROOT_PASSWORD
          valueFrom:
            secretKeyRef:
              name: mariadb
              key: mariadb-root-password
        - name: MYSQL_DATA_DIR
          value: /bitnami/mariadb/data
        - name: S3_KEY
          value: <AWS S3 key>
        - name: S3_REGION
          value: eu-west-1
        - name: S3_SECRET
          value: <AWS S3 SECRET>
        - name: S3_BUCKET
          value: prod
        - name: S3_PATH
          value: production/foo-service
```

All that remains is to deploy the database

```shell
helm repo add bitname https://charts.bitnami.com/bitnami
helm repo update
helm install mariadb bitnami/mariadb -f k8s/values.yaml
```

## Custom hooks
There are 4 scripts that are called during the backup process:
- init (on container start)
- backup-started
- backup-success
- backup-failed

Customize through the`backup-config` configmap:
```shell
#!/bin/sh
# pings healthchecks.io after every successful backup. Can be used
# to get notifications if backup's stop happening. 
curl https://hc-ping.com/###############################
```


## Sidecar available CLI commands
Run `backup -h` in the `backup` sidecar for more details

- backup create
- backup restore
- backup prune
- backup list

### Disclaimer
Use at own risk. Always test, before using in production.
