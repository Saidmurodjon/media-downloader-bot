const { Telegraf } = require("telegraf");
const { TOKEN, MONGODB, PORT } = require("./config.js");
const bot = new Telegraf(TOKEN);
const Controllers = require("./Controllers.js");
const { Download } = require("./req");
const express = require("express");
const app = express();

app.use(bot.webhookCallback("/"));
bot.telegram.setWebhook("https://nodejs-telegraf-testbot.herokuapp.com");

app.get("/", (req, res) => {
  res.send("Hello World!");
});
bot.on("text", async (ctx) => {
  try {
    ctx.telegram.sendMessage(
      ctx.message.chat.id,
      `Hello ${ctx.message.from.first_name}`
    );
    // console.log(ctx.message);
    const getVideoUrl = await Download(ctx.message.text);
    await ctx.telegram.sendVideo(ctx.message.chat.id, getVideoUrl.videoUrl, {
      caption: getVideoUrl.caption,
    });
  } catch (err) {
    console.log(err);
  }
});
app.listen(PORT, () => {
  console.log(`Example app listening on port ${PORT}!`);
});
