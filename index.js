/*
CREATING BIBLE QUIZZLE TELEGRAM BOT USING telegraf LIBRARY.

REFERENCES:
- https://thedevs.network/blog/build-a-simple-telegram-bot-with-node-js
- https://www.sohamkamani.com/blog/2016/09/21/making-a-telegram-bot/
*/

const Telegraf = require('telegraf');
const TELE_TOKEN = "633536414:AAENJwkQwYN3TGOe3LmFw2VyJFr8p7dU9II";
const app = new Telegraf(TELE_TOKEN);

const regex_hi = new RegExp("(hi|hello|hey|shalom)","gi");
app.hears(regex_hi, ctx => {
  return ctx.reply('Shalom!');
});

app.catch((err) => {
  console.log('Ooops', err);
  return ctx.reply('Ooops:'+err);
})

app.startPolling();
