const { Telegraf } = require("telegraf");
const { TOKEN, PORT, BaseURL, BOT_API_URL, ADMIN_ID } = require("./config.js");
const { initSchema } = require("./db");
const Queue = require("./queue");
const Controllers = require("./Controllers.js");
const AdminModel = require("./admin/AdminModel");
const AdminController = require("./admin/AdminController");
const { handleChatMemberUpdate } = require("./functions/ChannelMemberHandler");
const BotInfo = require("./functions/BotInfo");
const express = require("express");
const app = express();

const ALLOWED_UPDATES = ["message", "callback_query", "chat_member"];

const bot = new Telegraf(
  TOKEN,
  BOT_API_URL ? { telegram: { apiRoot: BOT_API_URL } } : undefined
);

bot.telegram.setMyCommands([
  { command: "/start", description: "Start bot" },
  { command: "/about", description: "About Bot" },
  { command: "/language", description: "choose language" },
]);

const usePolling = !BaseURL;

if (!usePolling) {
  app.use(bot.webhookCallback("/"));
  bot.telegram.setWebhook(BaseURL, { allowed_updates: ALLOWED_UPDATES });
}

app.get("/", (req, res) => {
  res.send("Hello World!");
});

bot.command("admin", (ctx) => AdminController.Menu(ctx));

bot.on(["text", "photo", "video"], async (ctx) => {
  if (AdminController.isPending(ctx.chat.id)) {
    return AdminController.ReceivePendingInput(ctx);
  }
  if (ctx.message.text) {
    return Controllers.MessageController(ctx, bot);
  }
});

bot.on("chat_member", (ctx) => handleChatMemberUpdate(bot, ctx.update.chat_member));

bot.on("callback_query", async (ctx) => {
  const data = ctx.update.callback_query.data;
  if (data.startsWith("admin_") || data.startsWith("broadcast_")) {
    return AdminController.HandleMenuCallback(ctx);
  }
  if (data === "check_subscription") {
    return Controllers.CheckSubscriptionController(ctx);
  }
  if (data === "fmt_video" || data === "fmt_audio") {
    return Controllers.HandleFormatChoice(ctx);
  }
  return Controllers.InlineController(ctx);
});

async function bootstrap() {
  await initSchema();
  await BotInfo.init(bot.telegram);
  if (ADMIN_ID) {
    await AdminModel.bootstrapAdmin(ADMIN_ID);
  }
  await Queue.start(bot);
  console.log("Postgres schema ready, download queue worker started");

  if (usePolling) {
    await bot.telegram.deleteWebhook().catch(() => {});
    bot.launch({ allowedUpdates: ALLOWED_UPDATES });
    console.log("Bot started in long-polling mode (BaseURL not set)");
  } else {
    app.listen(PORT, () => {
      console.log(`Example app listening on port ${PORT}!`);
    });
  }
}

bootstrap().catch((err) => {
  console.error("Bootstrap failed:", err);
  process.exit(1);
});
