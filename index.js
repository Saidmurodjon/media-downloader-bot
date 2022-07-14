const { Telegraf } = require("telegraf");
const { TOKEN, PORT, BaseURL } = require("./config.js");
const bot = new Telegraf(TOKEN);
const Controllers = require("./Controllers.js");
const express = require("express");
const app = express();
bot.telegram.setMyCommands([
  { command: "/start", description: "Start bot" },
  { command: "/about", description: "About Bot" },
]);
app.use(bot.webhookCallback("/"));
bot.telegram.setWebhook(BaseURL);

app.get("/", (req, res) => {
  res.send("Hello World!");
});
bot.on("text", async (ctx) => {
  Controllers.MessageController(ctx, bot);
});
bot.on(!"text", async (ctx) => {
  ctx.telegram.sendMessage(
    ctx.message.chat.id,
    `Error ${ctx.message.from.first_name}`
  );
});
app.listen(PORT, () => {
  console.log(`Example app listening on port ${PORT}!`);
});
