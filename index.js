const { Telegraf } = require("telegraf");
const { TOKEN, PORT, BaseURL, BOT_API_URL, ADMIN_ID } = require("./config.js");
const { initSchema } = require("./db");
const Queue = require("./queue");
const Controllers = require("./Controllers.js");
const AdminModel = require("./admin/AdminModel");
const AdminController = require("./admin/AdminController");
const { handleChatMemberUpdate } = require("./functions/ChannelMemberHandler");
const BotInfo = require("./functions/BotInfo");
const BotDescription = require("./functions/BotDescription");
const ConnectionManager = require("./functions/ConnectionManager");
const logger = require("./functions/logger");
const express = require("express");
const app = express();

const ALLOWED_UPDATES = ["message", "callback_query", "chat_member"];

// Catch what would otherwise be a silent crash (or an unhandled promise that
// just hangs) so there's always a trace of *why* the process stopped.
process.on("uncaughtException", (err) => {
  logger.error("Uncaught exception — process exiting", { error: err.stack || String(err) });
  process.exit(1);
});
process.on("unhandledRejection", (reason) => {
  logger.error("Unhandled promise rejection", { error: reason?.stack || String(reason) });
});

const bot = new Telegraf(
  TOKEN,
  BOT_API_URL ? { telegram: { apiRoot: BOT_API_URL } } : undefined
);

// Telegraf swallows errors thrown inside handlers by default; without this
// they vanish instead of reaching the logs.
bot.catch((err, ctx) => {
  logger.error("Unhandled bot error", {
    error: err.stack || String(err),
    updateType: ctx.updateType,
    chatId: ctx.chat?.id,
  });
});

// Express always runs, whether the active delivery mode is webhook or
// polling — GET requests fall through webhookCallback untouched (it only
// intercepts POST), so the health check route below still works either way.
app.use(bot.webhookCallback("/"));
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

  // Cosmetic setup (command list, profile description) shouldn't take the
  // whole bot down if Telegram rate-limits it — log and move on.
  await bot.telegram
    .setMyCommands([
      { command: "/start", description: "Start bot" },
      { command: "/about", description: "About Bot" },
      { command: "/language", description: "choose language" },
    ])
    .catch((err) => logger.warn("setMyCommands failed", { error: err.message }));
  await BotDescription.apply(bot.telegram).catch((err) =>
    logger.warn("BotDescription.apply failed", { error: err.message })
  );

  if (ADMIN_ID) {
    await AdminModel.bootstrapAdmin(ADMIN_ID);
  }
  await Queue.start(bot);
  logger.info("Postgres schema ready, download queue worker started");

  app.listen(PORT, () => {
    logger.info(`Express listening on port ${PORT}`);
  });

  if (BaseURL) {
    // A real, stable domain was given (production) — use it directly as a
    // permanent webhook, no ngrok/monitoring needed.
    await bot.telegram.setWebhook(BaseURL, { allowed_updates: ALLOWED_UPDATES });
    logger.info("Bot started on fixed webhook", { BaseURL });
    return;
  }

  // No fixed domain (local dev) — webhook via ngrok when reachable, with
  // automatic fallback to (and recovery from) long-polling.
  const connection = new ConnectionManager(bot, { port: PORT, allowedUpdates: ALLOWED_UPDATES });
  await connection.start();
}

bootstrap().catch((err) => {
  logger.error("Bootstrap failed", { error: err.stack || String(err) });
  process.exit(1);
});
