const child_process = require('child_process');
const s3 = require('./S3');
const fs = require('fs');
const moment = require('moment');
const gfs = require('grandfatherson');

const mariaBackupConnectCmd = `mariabackup --host 127.0.0.1 --user root --password ${process.env.MYSQL_ROOT_PASSWORD}`;

const mysqlDataDir = process.env.MYSQL_DATA_DIR || '/var/lib/mysql';
const tempBackupDir = '/tmp/backup';
const tempRestoreDir = '/tmp/restore';
const restoreDir = `${mysqlDataDir}/restore`;
const backupDir = `${mysqlDataDir}/backup`;

const backupFileNameFormat = 'YYYY-MM-DD HH:mm:ss';

const isFullBackupRequired = async () => {
  return !fs.existsSync(backupDir);
};

const createFullBackup = (storagePath, time) => {
  console.log('full backup');
  const backupTimeFormat = time.format(backupFileNameFormat);

  child_process.execSync(`rm -rf ${tempBackupDir}`);
  child_process.execSync(`${mariaBackupConnectCmd} --backup --target-dir ${tempBackupDir}`);

  return s3.uploadDir(tempBackupDir, `${storagePath}/${backupTimeFormat}-full`).then(backupCompleted);
};

const createIncrementalBackup = (storagePath, time) => {
  console.log('incremental backup');
  const backupTimeFormat = time.format(backupFileNameFormat);

  child_process.execSync(`rm -rf ${tempBackupDir}`);
  child_process.execSync(`${mariaBackupConnectCmd} --backup --incremental-basedir ${backupDir} --target-dir ${tempBackupDir}`);

  return s3.uploadDir(tempBackupDir, `${storagePath}/${backupTimeFormat}`).then(backupCompleted);
};

const createRestore = async (storagePath, time) => {
  const backupFiles = await determineCorrectBackupFiles(storagePath, time);
  console.log('Will rebuild restore based on:');
  console.log(backupFiles);
  for (const filepath of backupFiles) {
    await s3.pullDir(filepath, '/tmp/backup-part');
    const isFullBackup = filepath.indexOf('-full') !== -1;

    if (isFullBackup) child_process.execSync(`rm -rf ${tempRestoreDir}; mv /tmp/backup-part ${tempRestoreDir}`);

    const restoreCmd = isFullBackup
      ? `--prepare --target-dir ${tempRestoreDir}`
      : `--prepare --target-dir ${tempRestoreDir} --incremental-dir /tmp/backup-part`;

    console.log('Restoring', isFullBackup ? 'full' : 'incremental', 'backup');
    child_process.execSync(`${mariaBackupConnectCmd} ${restoreCmd}`);
  }

  // We are using temp restore directory to prevent impartial restores
  child_process.execSync(`mv ${tempRestoreDir} ${restoreDir}`);
};

const determineCorrectBackupFiles = async (storagePath, time) => {
  const s3DirPath = `${storagePath}/`;

  const backupsBeforeTime = filepath => {
    const dateTimeInFilename = filepath.split('/')[1].replace('-full', '');
    return moment(dateTimeInFilename, backupFileNameFormat).isSameOrBefore(time);
  };

  const toLatestFullBackup = (results, filepath) => {
    if (filepath.includes('full')) results = [];
    results.push(filepath);
    return results;
  };

  const filePaths = (await s3.list(s3DirPath)).sort(); // Oldest first

  return filePaths
    .filter(backupsBeforeTime)
    .reduce(toLatestFullBackup, []);
};

const parseRetentionArgument = string => {
  const validOptions = ['days', 'weeks', 'months', 'years'];
  const parts = string.split(',').map(s => s.toLowerCase());

  return parts.reduce((result, key) => {
    const parts = key.split(':').map(s => s.trim());
    if (parts.length !== 2) return result;
    const [interval, unit] = parts;
    if (validOptions.includes(unit) && parseInt(interval)) {
      result[unit] = parseInt(interval);
    }
    return result;
  }, {});
};

const prune = async (storagePath, retentionOptions, dryRun) => {
  const defaultRetention = '7:days,4:weeks,12:months,5:years';
  const retention = parseRetentionArgument(retentionOptions || defaultRetention);

  console.log('Retention options', retention);
  const now = moment();

  const s3DirPath = `${storagePath}/`;
  const filePaths = (await s3.list(s3DirPath)).sort();
  const xDaysBack = moment().subtract(retention.days || 0, 'days');

  // keep all backups made during the first days
  retention.seconds = 60 * 60 * 24 * (retention.days || 0);
  delete retention.days;

  // Picks all incremental backups made before the most recent days old full backup
  const incrementsToDelete = [];
  filePaths.some(filepath => {
    const isFullBackup = filepath.includes('-full');
    const backupMoment = moment(filepath.split('/')[1].replace('-full', ''), backupFileNameFormat);

    if (isFullBackup && backupMoment.isAfter(xDaysBack)) return true;
    if (!isFullBackup) incrementsToDelete.push(filepath);
  });

  const filePathMap = filePaths.reduce((r, filepath) => {
    if (!filepath.includes('-full')) return r;
    r[filepath] = moment(filepath.split('/')[1].replace('-full', ''), backupFileNameFormat);
    return r;
  }, {});

  // Get all backup moments that can be deleted
  const timesToDelete = gfs.toDelete(Object.values(filePathMap), { ...retention, now });

  // Match the backup moments back to the associated filenames
  const fullBackupsToDelete = Object.entries(filePathMap).reduce((r, [path, time]) => {
    if (timesToDelete.find(t => t.isSame(time))) r.push(path);
    return r;
  }, []);

  const toDelete = [
    ...fullBackupsToDelete,
    ...incrementsToDelete
  ];

  if (dryRun) console.log('This is a dry-run');
  else await s3.removeDirs(toDelete);

  console.log();
  console.log('Removed:');
  toDelete.forEach(f => console.log(f));
  console.log();
};

const backupCompleted = () => {
  child_process.execSync(`rm -rf ${backupDir}; mv ${tempBackupDir} ${backupDir}`);
  console.log('backup completed');
};

const listBackups = async (storagePath, after, before, fullOnly) => {
  const s3DirPath = `${storagePath}/`;
  const filePaths = (await s3.list(s3DirPath)).sort(); // Oldest first
  const mapped = filePaths.reduce((result, filepath) => {
    const isFullBackup = filepath.includes('-full');
    if (fullOnly && !isFullBackup) return result;
    const backupMoment = moment(filepath.split('/')[1].replace('-full', ''), backupFileNameFormat);
    if (after && !backupMoment.isAfter(after)) return result;
    if (before && !backupMoment.isBefore(before)) return result;

    result.push({
      dateTime: backupMoment.format(backupFileNameFormat),
      type: isFullBackup ? 'Full' : 'Incremental'
    });

    return result;
  }, []);

  console.table(mapped);
};

module.exports = {
  createFullBackup,
  createIncrementalBackup,
  createRestore,
  isFullBackupRequired,
  prune,
  listBackups
};
