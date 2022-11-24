#!/usr/bin/env node
require('dotenv').config();
const program = require('commander');
const moment = require('moment');
const mariaBackup = require('./backup');
const hooks = require('./hooks');
const ps = require('./Process');

const backupInProgress = () => {
  console.log('backup in progress. Please try again later');
  process.exit();
};

program
  .command('create')
  .description('Create a new backup')
  .option('-p, --path <path>', 'Storage path')
  .option('-f, --full', 'Full backup')
  .action(async (cmd) => {
    const storagePath = cmd.path || process.env.S3_PATH;
    try {
      await ps.lock().catch(backupInProgress);
      const time = moment();

      hooks.backupStarted(storagePath);
      (await mariaBackup.isFullBackupRequired(storagePath) || cmd.full)
        ? await mariaBackup.createFullBackup(storagePath, time)
        : await mariaBackup.createIncrementalBackup(storagePath, time);
      hooks.backupSuccess(storagePath);
    } catch (e) {
      hooks.backupFailed(storagePath, e.message)
    }
  });

program
  .command('restore <dateTime>')
  .description('Restore a backup')
  .option('-p, --path <path>', 'Storage path')
  .action(async (time, cmd) => {
    await ps.lock().catch(backupInProgress);
    const storagePath = cmd.path || process.env.S3_PATH;
    const restoreMoment = moment(time, 'YYYY-MM-DD HH:mm:ss', true)
    if(!restoreMoment.isValid()){
      console.error('invalid date time value provided. Format: "YYYY-MM-DD HH:mm:ss"');
      return;
    }
    await mariaBackup.createRestore(storagePath, restoreMoment);
    console.log('Restore completed. Kill pod to finalize');
  });

program
  .command('prune')
  .description('Rotate backups')
  .option('-p, --path <path>', 'Storage path')
  .option('-r, --retention <retention>', 'default "7:days,4:weeks,12:months,5:years"')
  .option('--dry-run', 'simulate deletion')
  .action(async (cmd) => {
    const storagePath = cmd.path || process.env.S3_PATH;
    try {
      await mariaBackup.prune(storagePath, cmd.retention || "7:days,4:weeks,12:months,5:years", cmd.dryRun);
      console.log('Done pruning');
    } catch (e) {
      console.error(`failed removing all old backups for ${storagePath}: ${e.message}`);
    }
  });

program
  .command('list')
  .description('List available backups')
  .option('-p, --path <path>', 'Storage path')
  .option('-a, --after <after>', 'Format: "YYYY-MM-DD HH:mm:ss"')
  .option('-b, --before <before>', 'Format: "YYYY-MM-DD HH:mm:ss"')
  .option('--fullOnly', 'Only show full backups')
  .action(async (cmd) => {
    const storagePath = cmd.path || process.env.S3_PATH;
    try {
      const after = cmd.after ? moment(cmd.after, 'YYYY-MM-DD HH:mm:ss') : null;
      const before = cmd.before ? moment(cmd.before, 'YYYY-MM-DD HH:mm:ss') : null;
      await mariaBackup.listBackups(storagePath, after, before, cmd.fullOnly);
    } catch (e) {
      console.error(`failed listing old backups for ${storagePath}: ${e.message}`);
    }
  });

program.parse(process.argv);
