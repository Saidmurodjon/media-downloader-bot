const { Telegraf } = require("telegraf");
const { TOKEN, PORT, BaseURL, BOT_API_URL } = require("./config.js");
const { initSchema } = require("./db");
const Queue = require("./queue");
const Controllers = require("./Controllers.js");
const express = require("express");
const app = express();

const bot = new Telegraf(
  TOKEN,
  BOT_API_URL ? { telegram: { apiRoot: BOT_API_URL } } : undefined
);

bot.telegram.setMyCommands([
  { command: "/start", description: "Start bot" },
  { command: "/about", description: "About Bot" },
  { command: "/language", description: "choose language" },
]);
app.use(bot.webhookCallback("/"));
bot.telegram.setWebhook(BaseURL);

app.get("/", (req, res) => {
  res.send("Hello World!");
});
bot.on("text", async (ctx) => {
  Controllers.MessageController(ctx, bot);
});
bot.on("callback_query", async (ctx) => {
  Controllers.InlineController(ctx);
});

async function bootstrap() {
  await initSchema();
  await Queue.start(bot);
  console.log("Postgres schema ready, download queue worker started");
  app.listen(PORT, () => {
    console.log(`Example app listening on port ${PORT}!`);
  });
}

bootstrap().catch((err) => {
  console.error("Bootstrap failed:", err);
  process.exit(1);
});
