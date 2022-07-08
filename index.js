const { Telegraf } = require("telegraf");
const { TOKEN, MONGODB ,PORT} = require("./config.js");
const bot = new Telegraf(TOKEN);
const Controllers = require("./Controllers.js");
const express = require("express");
const app = express();

app.use(bot.webhookCallback("/"));
bot.telegram.setWebhook("https://c308-37-110-211-20.eu.ngrok.io/");

app.get("/", (req, res) => {
  res.send("Hello World!");
});
bot.on("text", (ctx) => {

  ctx.telegram.sendMessage(ctx.message.chat.id, `Hello ${ctx.message.from.first_name}`);

});
app.listen(PORT, () => {
  console.log(`Example app listening on port ${PORT}!`);
});
