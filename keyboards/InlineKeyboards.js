const texts = require("../text.json");
module.exports = {
  languages: new Array(
    new Array(
      {
        text: texts.uz.lan,
        callback_data: "uz",
      },
      {
        text: texts.ru.lan,
        callback_data: "ru",
      },
      {
        text: texts.in.lan,
        callback_data: "in",
      }
    )
  ),
};
