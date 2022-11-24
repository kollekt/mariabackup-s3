const child_process = require('child_process');
const path = require('path');

const backupStarted = (storagePath) => {
  child_process.execSync(`${path.join(__dirname, '../hooks/backup-started')} ${storagePath}`, { stdio: 'inherit' });
};

const backupSuccess = (storagePath) => {
  child_process.execSync(`${path.join(__dirname, '../hooks/backup-success')} ${storagePath}`, { stdio: 'inherit' });
};

const backupFailed = (storagePath, message) => {
  child_process.execSync(`${path.join(__dirname, '../hooks/backup-failed')}  ${storagePath} "${message.replace(/[\\$'"]/g, "\\$&")}"`, { stdio: 'inherit' });
};

module.exports = {
  backupStarted,
  backupSuccess,
  backupFailed
};
