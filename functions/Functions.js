const UserModel = require("../user/UserModel");
const InlineKeyboards = require("../keyboards/InlineKeyboards");

module.exports = class Functions {
  static async Languages(ctx) {
    try {
      await ctx.telegram.sendMessage(
        ctx.message.chat.id,
        `Hi  ${ctx.message.from.first_name} choose language `,
        {
          reply_markup: {
            resize_keyboard: true,
            one_time_keyboard: true,
            inline_keyboard: InlineKeyboards.languages,
          },
        }
      );
    } catch (err) {
      console.log(err);
    }
  }
  static async StartUser(ctx) {
    try {
      const user = {
        userName: ctx.message.chat.username,
        chatId: ctx.message.chat.id,
        step: 1,
        language: "",
      };
      await UserModel.create(user);

      await ctx.telegram.sendMessage(
        ctx.message.chat.id,
        `Hi  ${ctx.message.from.first_name} choose language `,
        {
          reply_markup: {
            resize_keyboard: true,
            one_time_keyboard: true,
            inline_keyboard: InlineKeyboards.languages,
          },
        }
      );
    } catch (err) {
      console.log(err);
    }
  }

  static async ChooseLanguage(ctx) {
    const up = ctx.update.callback_query;
    let language = "";
    let text = "";
    switch (up.data) {
      case "uz":
        language = "uz";
        text = "URL yuborishingiz mumkin.";
        break;
      case "ru":
        language = "ru";
        text = "Вы можете отправить URL.";
        break;
      case "in":
        language = "in";
        text = "You can send a URL.";
        break;
      default:
        return;
    }
    try {
      await UserModel.updateLanguage(up.message.chat.id, language, 2);
      await ctx.editMessageText(text, {
        chat_id: up.message.chat.id,
        message_id: up.message.message_id,
      });
    } catch (err) {
      console.log(err);
    }
  }
};
