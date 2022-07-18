const { Telegraf } = require("telegraf");
const { TOKEN, PORT, BaseURL, MONGODB } = require("./config.js");
const mongoose = require("mongoose");
const bot = new Telegraf(TOKEN);
const Controllers = require("./Controllers.js");
const express = require("express");
const app = express();
bot.telegram.setMyCommands([
  { command: "/start", description: "Start bot" },
  { command: "/about", description: "About Bot" },
  { command: "/language", description: "choose language" },
]);
app.use(bot.webhookCallback("/"));
bot.telegram.setWebhook(BaseURL);

const connectionParams = {
  useNewUrlParser: true,

  useUnifiedTopology: true,
};
mongoose
  .connect(MONGODB, connectionParams)
  .then(() => {
    console.log("Connected to database ");
  })
  .catch((err) => {
    console.error(`Error connecting to the database. \n${err}`);
  });

app.get("/", (req, res) => {
  res.send("Hello World!");
});
  bot.on("text", async (ctx) => {
    Controllers.MessageController(ctx, bot);
  });
  bot.on("callback_query", async (ctx) => {
    Controllers.InlineController(ctx);
  });
app.listen(PORT, () => {
  console.log(`Example app listening on port ${PORT}!`);
});
