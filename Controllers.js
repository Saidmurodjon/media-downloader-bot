const { Tiktok, Instagram, Youtube } = require("./Downloader");

module.exports = class Controllers {
  static async MessageController(ctx, bot) {
    console.log(ctx.message);
    const text = ctx.message.text;
    if (ctx.message.text == "/start") {
      ctx.telegram.sendMessage(
        ctx.message.chat.id,
        `Hi  ${ctx.message.from.first_name} Send me URL for use me `
      );
    } else if (text.includes("instagram")) {
      try {
        // console.log(ctx.message);
        await ctx.replyWithChatAction("typing");
        const ins = await Instagram(ctx.message.text);
        ins.videoUrl
          ? await ctx.telegram.sendVideo(ctx.message.chat.id, ins.videoUrl, {
              caption: ins.caption,
            })
          : ctx.telegram.sendMessage(
              ctx.message.chat.id,
              `Qayerdadir hatolik bor ${ctx.message.from.first_name} 😔\n Iltimos qayta urinib ko'ring!`
            );
      } catch (err) {
        console.log(err);
      }
    } else if (text.includes("tiktok")) {
      try {
        // console.log(ctx.message);
        await ctx.replyWithChatAction("typing");
        const tik = await Tiktok(ctx.message.text);
        tik.videoUrl
          ? await ctx.telegram.sendVideo(ctx.message.chat.id, tik.videoUrl, {
              caption: tik.caption,
            })
          : ctx.telegram.sendMessage(
              ctx.message.chat.id,
              `Qayerdadir hatolik bor ${ctx.message.from.first_name} 😔\n Iltimos qayta urinib ko'ring!`
            );
      } catch (err) {
        console.log(err);
      }
    } else if (text === "/about") {
      await ctx.replyWithChatAction("typing");

      await ctx.telegram.sendMessage(
        ctx.message.chat.id,
        `Hi ${ctx.message.from.first_name}\n I can help you if You \n want download from Instagram and Tiktok.\n `
      );
    } else {
      ctx.telegram.sendMessage(
        ctx.message.chat.id,
        `Nomalum habar ${ctx.message.from.first_name}`
      );
    }
  }
};
