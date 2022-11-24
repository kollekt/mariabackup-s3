const child_process = require('child_process');

const backupStarted = (storagePath) => {
  child_process.execSync(`hooks/backup-started ${storagePath}`, {stdio: 'inherit'});
}

const backupSuccess = (storagePath) => {
  child_process.execSync(`hooks/backup-success ${storagePath}`, {stdio: 'inherit'});
}

const backupFailed = (storagePath, message) => {
  child_process.execSync(`hooks/backup-failed ${storagePath} ${message}`, {stdio: 'inherit'});
}

module.exports = {
  backupStarted,
  backupSuccess,
  backupFailed
};
