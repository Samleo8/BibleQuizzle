/*
CREATING BIBLE QUIZZLE TELEGRAM BOT USING telegraf LIBRARY.

REFERENCES:
- https://thedevs.network/blog/build-a-simple-telegram-bot-with-node-js
- https://www.sohamkamani.com/blog/2016/09/21/making-a-telegram-bot/
*/

const Telegraf = require('telegraf');
const TELE_TOKEN = "633536414:AAENJwkQwYN3TGOe3LmFw2VyJFr8p7dU9II";
const app = new Telegraf(TELE_TOKEN);

app.hears('hi', ctx => {
  return ctx.reply('Hey!');
});

app.startPolling();
