const PushBullet = require('pushbullet')

const notifiers = [
  console.log
];

if(process.env.PUSHBULLET_KEY){
  const pusher = new PushBullet(process.env.PUSHBULLET_KEY);
  const pushMessage = (title, message) => pusher.note({}, title, message, (error, response) => {})
  notifiers.push(pushMessage)
}

module.exports = (message, title = '') => {
  notifiers.forEach(notify => notify(title, message));
}
