module.exports = class Controllers {
  static async MessageController(ctx, bot) {
    console.log(ctx.message);

    if (ctx.message.text == "/start") {
      ctx.telegram.sendMessage(
        ctx.message.chat.id,
        `Hello ${ctx.message.from.first_name}`
      );
    } else {
      ctx.telegram.sendMessage(
        ctx.message.chat.id,
        `Nomalum habar ${ctx.message.from.first_name}`
      );
    }
  }
  
};
