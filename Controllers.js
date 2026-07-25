const Functions = require("./functions/Functions");
const UserModel = require("./user/UserModel");
const VideoCache = require("./db/VideoCache");
const DownloadLog = require("./db/DownloadLog");
const Queue = require("./queue");
const Subscription = require("./functions/Subscription");
const AdminModel = require("./admin/AdminModel");
const MediaMessage = require("./functions/MediaMessage");
const logger = require("./functions/logger");
const texts = require("./text.json");

function t(lang, key) {
  return (texts[lang] && texts[lang][key]) || texts.in[key];
}

function detectPlatform(text) {
  if (/(youtube\.com|youtu\.be)/i.test(text)) return "youtube";
  if (/instagram\.com/i.test(text)) return "instagram";
  if (/tiktok\.com/i.test(text)) return "tiktok";
  return null;
}

// Holds the URL+platform between "choose a format" and the button tap that
// answers it. Short-lived and single-request-at-a-time per chat, so an
// in-memory map is enough — no DB session needed.
const pendingRequests = new Map();

module.exports = class Controllers {
  static async MessageController(ctx, bot) {
    const chat_id = ctx.message.chat.id;
    const user = await UserModel.findOne(chat_id);
    const text = ctx.message.text;

    if (!(await AdminModel.isAdmin(chat_id))) {
      const missing = await Subscription.getMissingChannels(ctx.telegram, ctx.from.id);
      if (missing.length) {
        await ctx.telegram.sendMessage(chat_id, t(user?.language, "subscribe_required"), {
          reply_markup: {
            inline_keyboard: [
              ...missing.map((channel) => [
                { text: `📢 ${channel}`, url: Subscription.channelUrl(channel) },
              ]),
              [{ text: t(user?.language, "subscribe_check"), callback_data: "check_subscription" }],
            ],
          },
        });
        return;
      }
    }

    if (text == "/start") {
      if (!user) {
        await Functions.StartUser(ctx);
      } else if (user.language.length <= 0) {
        await Functions.Languages(ctx);
      } else {
        await ctx.telegram.sendMessage(chat_id, t(user.language, "start"));
      }
      return;
    }

    if (text === "/language") {
      await Functions.Languages(ctx);
      return;
    }

    if (text === "/about") {
      await ctx.replyWithChatAction("typing");
      await ctx.telegram.sendMessage(chat_id, t(user.language, "abaut"));
      return;
    }

    const platform = detectPlatform(text);
    if (!platform) {
      await ctx.telegram.sendMessage(chat_id, t(user.language, "wrong"));
      return;
    }

    pendingRequests.set(chat_id, { url: text, platform });
    await ctx.telegram.sendMessage(chat_id, t(user.language, "choose_format"), {
      reply_markup: {
        inline_keyboard: [
          [
            { text: "🎥 Video", callback_data: "fmt_video" },
            { text: "🎵 Audio", callback_data: "fmt_audio" },
          ],
        ],
      },
    });
  }

  static async HandleFormatChoice(ctx) {
    const up = ctx.update.callback_query;
    const chat_id = up.message.chat.id;
    const user = await UserModel.findOne(chat_id);
    const pending = pendingRequests.get(chat_id);
    if (!pending) return ctx.answerCbQuery();
    pendingRequests.delete(chat_id);

    const format = up.data === "fmt_audio" ? "audio" : "video";
    const { url, platform } = pending;
    await ctx.answerCbQuery();
    await ctx.deleteMessage().catch(() => {});

    try {
      const cached = await VideoCache.get(url, format);
      if (cached) {
        const extra = {
          caption: MediaMessage.buildCaption(cached.title),
          reply_markup: await MediaMessage.buildReplyMarkup(),
        };
        if (format === "audio") {
          await ctx.telegram.sendAudio(chat_id, cached.file_id, extra);
        } else {
          await ctx.telegram.sendVideo(chat_id, cached.file_id, extra);
        }
        await DownloadLog.log(chat_id, platform, true);
        return;
      }

      await ctx.replyWithChatAction(format === "audio" ? "upload_voice" : "upload_video");
      const status = await ctx.telegram.sendMessage(chat_id, t(user.language, "processing"));
      await Queue.enqueue({
        chatId: chat_id,
        url,
        platform,
        format,
        statusMessageId: status.message_id,
        language: user.language,
      });
    } catch (err) {
      logger.error("MessageController failed", { chatId: chat_id, error: err.stack || String(err) });
      await ctx.telegram.sendMessage(chat_id, t(user.language, "er"));
    }
  }

  static async InlineController(ctx) {
    const up = ctx.update.callback_query;
    const user = await UserModel.findOne(up.from.id);
    if ((up.data === "uz" || up.data === "ru" || up.data === "in") && user.step >= 1) {
      await Functions.ChooseLanguage(ctx);
    }
  }

  static async CheckSubscriptionController(ctx) {
    const up = ctx.update.callback_query;
    const chatId = up.message.chat.id;
    const user = await UserModel.findOne(chatId);
    const missing = await Subscription.getMissingChannels(ctx.telegram, up.from.id);

    if (!missing.length) {
      await ctx.answerCbQuery();
      return ctx.editMessageText(t(user?.language, "subscribe_success"));
    }
    await ctx.answerCbQuery(t(user?.language, "subscribe_still_no"), { show_alert: true });
  }
};
