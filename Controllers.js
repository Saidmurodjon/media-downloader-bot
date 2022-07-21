const {  Tiktok, Youtube } = require("./Downloader");
const Functions = require("./functions/Functions");
const UserModel = require("./user/UserModel");
const texts = require("./text.json");
module.exports = class Controllers {
  static async MessageController(ctx, bot) {
    const chat_id = ctx.message.chat.id;
    const user = await UserModel.findOne({
      chatId: chat_id,
    });
    // const user = await BotUserModel.findOne({ chatID: chat_id });
    // console.log(ctx.message);
    const text = ctx.message.text;
    if (text == "/start") {
      if (!user) {
        await Functions.StartUser(ctx);
      } else if (user.language.length <= 0) {
        await Functions.Languages(ctx);
      } else {
        await ctx.telegram.sendMessage(
          chat_id,
          user.language == "uz"
            ? texts.uz.start
            : user.language == "ru"
            ? texts.ru.start
            : user.language == "in"
            ? texts.in.start
            : null
        );
      }
    } else if (text === "/language") {
      await Functions.Languages(ctx);
    } 
    else if (text.includes("instagram")) {
      try {
        //
        await ctx.replyWithChatAction("typing");
        // const ins = await Instagrams(ctx.message.text);
        // console.log(ins);

        if (false) {
          await ctx.telegram.sendVideo(chat_id, ins.videoUrl, {
            caption: ins.caption,
          });
        } else {
          ctx.telegram.sendMessage(
            chat_id,
            user.language == "uz"
              ? texts.uz.er
              : user.language == "ru"
              ? texts.ru.er
              : user.language == "in"
              ? texts.in.er
              : null
          );
        }
      } catch (err) {
        console.log(err);
      }
    } 
    else if (text.includes("tiktok")) {
      try {
        // console.log(ctx.message);
        await ctx.replyWithChatAction("typing");
        const tik = await Tiktok(ctx.message.text);
        console.log(tik);
        tik.videoUrl
          ? await ctx.telegram.sendVideo(chat_id, tik.videoUrl, {
              caption: tik.caption,
            })
          : ctx.telegram.sendMessage(
              chat_id,
              user.language == "uz"
                ? texts.uz.er
                : user.language == "ru"
                ? texts.ru.er
                : user.language == "in"
                ? texts.in.er
                : null
            );
      } catch (err) {
        console.log(err);
      }
    } else if (text === "/about") {
      await ctx.replyWithChatAction("typing");

      await ctx.telegram.sendMessage(
        chat_id,
        user.language == "uz"
          ? texts.uz.abaut
          : user.language == "ru"
          ? texts.ru.abaut
          : user.language == "in"
          ? texts.in.abaut
          : null
      );
    } else {
      ctx.telegram.sendMessage(
        chat_id,
        user.language == "uz"
          ? texts.uz.wrong
          : user.language == "ru"
          ? texts.ru.wrong
          : user.language == "in"
          ? texts.in.wrong
          : null
      );
    }
  }
  // Inline controller
  static async InlineController(ctx) {
    const up = ctx.update.callback_query;
    const user = await UserModel.findOne({
      chatId: up.from.id,
    });
    // console.log(ctx.update.callback_query.data);
    if ((up.data === "uz" || "ru" || "in") && user.step >= 1) {
      await Functions.ChooseLanguage(ctx);
    }
  }
};
