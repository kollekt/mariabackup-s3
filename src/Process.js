const lockfile = require('lockfile');
var signalExit = require('signal-exit')
signalExit(function (code, signal) {
  if (signal)
    process.emit('exit')
})

module.exports.lock = () => {
  return new Promise(function(resolve, reject){
    lockfile.lock('../.lock', {}, err => {
      return err ? reject() : resolve();
    })
  })
}
