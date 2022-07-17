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
  setInlineKey: new Array(
    new Array(
      {
        text: "yo'q",
        callback_data: "no",
      },
      {
        text: "Ha",
        callback_data: "ok",
      }
    )
  ),
  setInlineMeet: new Array(
    new Array(
      {
        text: "Ortga",
        callback_data: "no",
      },
      {
        text: "Meeting",
        url: "https://zoom.us/",
      }
    )
  ),
  setInlineServiceTrue: new Array(
    new Array({
      text: "Tasdiqlash",
      callback_data: "tasdiq",
    })
  ),
  setOldService: new Array(
    new Array(
      {
        text: "Ortga",
        callback_data: "no",
      },
      {
        text: "Avvalgi chaqiruvlar",
        callback_data: "oldService",
      }
    )
  ),
};
