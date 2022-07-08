const { Telegraf } = require("telegraf");
const { TOKEN, MONGODB } = require("./config.js");
const bot = new Telegraf(TOKEN);
const Controllers = require("./Controllers.js");
// const Telegraf = require('telegraf');
// const bot = new Telegraf('123:ABC');

bot.telegram.setWebhook("https://saidmurod.uz");
bot.startWebhook(`/${TOKEN}`, null, 4000);
bot.on("text", (ctx) => {
  // Explicit usage
  ctx.telegram.sendMessage(
    ctx.message.chat.id,
    `Hello ${ctx.message.from.username}`
  );

  // Using context shortcut
  // ctx.reply(`Hello ${ctx.state.role}`);
});
bot.use(function (ctx, next) {
  try {
  } catch (e) {
    console.log("Error");
  }
});

// bot.launch({
//   webhook: {
//     domain: "https://saidmurod.uz",
//   },
// });
