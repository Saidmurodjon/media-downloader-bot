const { Telegraf } = require("telegraf");
const { TOKEN, MONGODB } = require("./config.js");
const bot = new Telegraf(TOKEN);
const Controllers = require("./Controllers.js");
// bot.command("quit", (ctx) => {
//   // Explicit usage
//   ctx.telegram.leaveChat(ctx.message.chat.id);

//   // Using context shortcut
//   ctx.leaveChat();
// });

bot.on("text", (ctx) => {
  // Explicit usage
  Controllers.MessageController(ctx, bot);
});

// bot.on("callback_query", (ctx) => {
//   // Explicit usage
//   ctx.telegram.answerCbQuery(ctx.callbackQuery.id);

//   // Using context shortcut
//   ctx.answerCbQuery();
// });

// bot.on("inline_query", (ctx) => {
//   const result = [];
//   // Explicit usage
//   ctx.telegram.answerInlineQuery(ctx.inlineQuery.id, result);

//   // Using context shortcut
//   ctx.answerInlineQuery(result);
// });

bot.launch();

// Enable graceful stop
process.once("SIGINT", () => bot.stop("SIGINT"));
process.once("SIGTERM", () => bot.stop("SIGTERM"));
