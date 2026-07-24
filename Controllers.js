const Functions = require("./functions/Functions");
const UserModel = require("./user/UserModel");
const VideoCache = require("./db/VideoCache");
const Queue = require("./queue");
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

module.exports = class Controllers {
  static async MessageController(ctx, bot) {
    const chat_id = ctx.message.chat.id;
    const user = await UserModel.findOne(chat_id);
    const text = ctx.message.text;

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

    try {
      const cached = await VideoCache.get(text);
      if (cached) {
        await ctx.telegram.sendVideo(chat_id, cached.file_id);
        return;
      }

      await ctx.replyWithChatAction("upload_video");
      const status = await ctx.reply(t(user.language, "processing"));
      await Queue.enqueue({
        chatId: chat_id,
        url: text,
        platform,
        statusMessageId: status.message_id,
      });
    } catch (err) {
      console.error(err);
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
};
