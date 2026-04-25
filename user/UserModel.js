const mongoose = require("mongoose");

// product uchun

const userSchema = mongoose.Schema({
  userName: String,
  chatId: String,
  language: String,
  step: Number,
  theme: { type: String, default: "light" },
});

const UserModel = mongoose.model("UserModel", userSchema);

module.exports = UserModel;
