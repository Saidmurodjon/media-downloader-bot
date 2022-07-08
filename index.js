const { Telegraf } = require("telegraf");
const { TOKEN, MONGODB } = require("./config.js");
const bot = new Telegraf(TOKEN);
const Controllers = require("./Controllers.js");
// const Telegraf = require('telegraf');
// const bot = new Telegraf('123:ABC');

// bot.telegram.setWebhook("https://saidmurod.uz");

bot.command('image', (ctx) => ctx.replyWithPhoto({ url: 'https://picsum.photos/200/300/?random' }))
bot.on('text', (ctx) => ctx.replyWithHTML('<b>Hello</b>'))

// Start webhook directly
// bot.startWebhook('/secret-path', null, 3000)
// bot.telegram.setWebhook('https://---.localtunnel.me/secret-path')

// Start webhook via launch method (preferred)
bot.launch({
  webhook: {
    domain: 'https://saidmurod.uz/',
    port: 4000
  }
})

// Enable graceful stop
process.once('SIGINT', () => bot.stop('SIGINT'))
process.once('SIGTERM', () => bot.stop('SIGTERM'))
process.once('SIGTERM', () => bot.stop('SIGTERM'))
