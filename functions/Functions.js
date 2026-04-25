const UserModel = require("../user/UserModel");
const InlineKeyboards = require("../keyboards/InlineKeyboards");

module.exports = class Functions {
  // User saqlash
  static async Languages(ctx) {
    // console.log(ctx.message.text);
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
    // console.log(ctx.message.text);
    try {
      const user = {
        userName: ctx.message.chat.username,
        chatId: ctx.message.chat.id,
        step: 1,
        language: "",
        date: new Date(),
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

  static async ThemeMenu(ctx, user) {
    const lan = user.language || "in";
    const texts = require("../text.json");
    const currentTheme = user.theme || "light";
    const themeLabel = currentTheme === "dark" ? "🌙 Dark" : "☀️ Light";
    try {
      await ctx.telegram.sendMessage(
        ctx.message.chat.id,
        `${texts[lan].theme_menu} (${themeLabel})`,
        {
          reply_markup: {
            inline_keyboard: InlineKeyboards.theme,
          },
        }
      );
    } catch (err) {
      console.log(err);
    }
  }

  static async SetTheme(ctx, theme) {
    const up = ctx.update.callback_query;
    const texts = require("../text.json");
    const user = await UserModel.findOne({ chatId: up.message.chat.id });
    if (!user) return;
    const lan = user.language || "in";
    await UserModel.findByIdAndUpdate(user._id, { theme });
    const confirmText =
      theme === "dark" ? texts[lan].theme_set_dark : texts[lan].theme_set_light;
    await ctx.editMessageText(confirmText, {
      chat_id: up.message.chat.id,
      message_id: up.message.message_id,
    });
  }

  // Contact saqlash
  static async ChooseLanguage(ctx) {
    const up = ctx.update.callback_query;
    const user = await UserModel.findOne({
      chatId: up.message.chat.id,
    });
    const lan = {
      language: "",
      step: 2,
    };
    var text = "";
    try {
      switch (up.data) {
        case "uz":
          lan.language = "uz";
          text = "URL yuborishingiz mumkin.";
          break;
        case "ru":
          lan.language = "ru";
          text = "Вы можете отправить URL.";
          break;
        case "in":
          lan.language = "in";
          text = "You can send a URL.";
          break;
        default:
          console.log(`Sorry, we are out of.`);
      }
      await UserModel.findByIdAndUpdate(user._id, lan);
      await ctx.editMessageText(text, {
        chat_id: up.message.chat.id,
        message_id: up.message.message_id,
      });
      console.log(up.message);
    } catch (err) {
      console.log(err);
    }
  }
};
