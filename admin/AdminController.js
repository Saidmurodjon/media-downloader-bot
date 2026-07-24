const AdminModel = require("./AdminModel");
const ChannelModel = require("./ChannelModel");
const DownloadLog = require("../db/DownloadLog");
const MediaMessage = require("../functions/MediaMessage");
const Queue = require("../queue");

// Any flow that needs a follow-up text/photo/video message from the admin
// (broadcast content, addadmin/deladmin chat_id) lives here. Short-lived and
// single-admin-at-a-time, so an in-memory map is enough — no DB session needed.
const pendingAction = new Map();

const MENU_TEXT = "🛠 Admin panel";
const MENU_KEYBOARD = {
  inline_keyboard: [
    [{ text: "📊 Statistika", callback_data: "admin_stats" }],
    [{ text: "📢 Reklama yuborish", callback_data: "admin_broadcast" }],
    [{ text: "👥 Adminlar ro'yxati", callback_data: "admin_list" }],
    [
      { text: "➕ Admin qo'shish", callback_data: "admin_addadmin" },
      { text: "➖ Admin olib tashlash", callback_data: "admin_deladmin" },
    ],
    [{ text: "📢 Majburiy obuna", callback_data: "admin_channel" }],
    [{ text: "➕ Guruhga qo'shish tugmasi", callback_data: "admin_groupbtn" }],
  ],
};
const BACK_KEYBOARD = {
  inline_keyboard: [[{ text: "🔙 Menyu", callback_data: "admin_menu" }]],
};

function formatStats({ totalUsers, totalDownloads, cachedDownloads, byPlatform }) {
  const cacheRate = totalDownloads
    ? Math.round((cachedDownloads / totalDownloads) * 100)
    : 0;
  const platformLines = byPlatform.length
    ? byPlatform.map((p) => `  • ${p.platform}: ${p.count}`).join("\n")
    : "  (hali yo'q)";

  return (
    `📊 Statistika\n\n` +
    `👤 Foydalanuvchilar: ${totalUsers}\n` +
    `⬇️ Yuklab olishlar: ${totalDownloads}\n` +
    `${platformLines}\n` +
    `⚡ Keshdan berilgan: ${cachedDownloads}/${totalDownloads} (${cacheRate}%)`
  );
}

function formatAdmins(admins) {
  if (!admins.length) return "👥 Adminlar\n\nHozircha hech kim yo'q.";
  const lines = admins.map((a) => `  • ${a.chat_id}${a.username ? " (@" + a.username + ")" : ""}`);
  return `👥 Adminlar\n\n${lines.join("\n")}`;
}

function channelListKeyboard(channels) {
  return {
    inline_keyboard: [
      ...channels.map((c) => [
        { text: `📢 ${c.username}`, callback_data: `admin_channel_view:${c.username}` },
      ]),
      [{ text: "➕ Kanal qo'shish", callback_data: "admin_channel_add" }],
      [{ text: "🔙 Menyu", callback_data: "admin_menu" }],
    ],
  };
}

module.exports = class AdminController {
  static isPending(chatId) {
    return pendingAction.has(chatId);
  }

  static async Menu(ctx) {
    if (!(await AdminModel.isAdmin(ctx.chat.id))) return;
    pendingAction.delete(ctx.chat.id);
    await ctx.reply(MENU_TEXT, { reply_markup: MENU_KEYBOARD });
  }

  // Routes every "admin_*" callback_data from the menu.
  static async HandleMenuCallback(ctx) {
    const chatId = ctx.update.callback_query.message.chat.id;
    if (!(await AdminModel.isAdmin(chatId))) return ctx.answerCbQuery();

    const data = ctx.update.callback_query.data;

    if (data.startsWith("admin_channel_view:")) {
      return AdminController.showChannelDetail(ctx, data.slice("admin_channel_view:".length));
    }
    if (data.startsWith("admin_channel_target:")) {
      return AdminController.promptTarget(ctx, data.slice("admin_channel_target:".length));
    }
    if (data.startsWith("admin_channel_cleartarget:")) {
      return AdminController.clearTarget(ctx, data.slice("admin_channel_cleartarget:".length));
    }
    if (data.startsWith("admin_channel_delete:")) {
      return AdminController.deleteChannel(ctx, data.slice("admin_channel_delete:".length));
    }

    switch (data) {
      case "admin_menu":
        pendingAction.delete(chatId);
        await ctx.answerCbQuery();
        return ctx.editMessageText(MENU_TEXT, { reply_markup: MENU_KEYBOARD });

      case "admin_stats": {
        await ctx.answerCbQuery();
        const stats = await DownloadLog.stats();
        return ctx.editMessageText(formatStats(stats), { reply_markup: BACK_KEYBOARD });
      }

      case "admin_list": {
        await ctx.answerCbQuery();
        const admins = await AdminModel.listAdmins();
        return ctx.editMessageText(formatAdmins(admins), { reply_markup: BACK_KEYBOARD });
      }

      case "admin_broadcast": {
        await ctx.answerCbQuery();
        pendingAction.set(chatId, { type: "broadcast", state: "awaiting_content" });
        return ctx.editMessageText(
          "Reklama xabarini yuboring (matn, rasm yoki video).",
          { reply_markup: BACK_KEYBOARD }
        );
      }

      case "admin_addadmin": {
        await ctx.answerCbQuery();
        pendingAction.set(chatId, { type: "addadmin" });
        return ctx.editMessageText(
          "Admin qilmoqchi bo'lgan foydalanuvchining chat_id'sini yuboring.\n(Foydalanuvchi botni avval /start qilgan bo'lishi kerak.)",
          { reply_markup: BACK_KEYBOARD }
        );
      }

      case "admin_deladmin": {
        await ctx.answerCbQuery();
        pendingAction.set(chatId, { type: "deladmin" });
        return ctx.editMessageText("Admin huquqini olib tashlamoqchi bo'lgan chat_id'ni yuboring.", {
          reply_markup: BACK_KEYBOARD,
        });
      }

      case "admin_channel": {
        await ctx.answerCbQuery();
        const channels = await ChannelModel.list();
        const text = channels.length
          ? "📢 Majburiy obunalar\n\nKanalni tanlang:"
          : "📢 Majburiy obunalar\n\nHozircha hech qanday kanal qo'shilmagan.";
        return ctx.editMessageText(text, { reply_markup: channelListKeyboard(channels) });
      }

      case "admin_channel_add": {
        await ctx.answerCbQuery();
        pendingAction.set(chatId, { type: "addchannel" });
        return ctx.editMessageText(
          "Kanalning @username'ini yuboring (masalan: @mening_kanalim).\n\nDiqqat: bot o'sha kanalga oldindan admin sifatida qo'shilgan bo'lishi kerak, aks holda a'zolikni tekshira olmaydi. Faqat ochiq (public) kanallar qo'llab-quvvatlanadi.",
          { reply_markup: BACK_KEYBOARD }
        );
      }

      case "admin_groupbtn": {
        await ctx.answerCbQuery();
        return AdminController.renderGroupButtonView(ctx);
      }

      case "admin_groupbtn_toggle": {
        const enabled = await MediaMessage.isGroupButtonEnabled();
        await MediaMessage.setGroupButtonEnabled(!enabled);
        await ctx.answerCbQuery(!enabled ? "Yoqildi" : "O'chirildi");
        return AdminController.renderGroupButtonView(ctx);
      }

      case "broadcast_confirm":
      case "broadcast_cancel":
        return AdminController.HandleBroadcastConfirm(ctx);

      default:
        return ctx.answerCbQuery();
    }
  }

  // Dispatches a follow-up text/photo/video message for whatever flow is
  // pending for this admin (broadcast content, addadmin/deladmin chat_id,
  // add channel, set target).
  static async ReceivePendingInput(ctx) {
    const chatId = ctx.chat.id;
    const pending = pendingAction.get(chatId);
    if (!pending) return;

    if (pending.type === "broadcast" && pending.state === "awaiting_content") {
      return AdminController.receiveBroadcastContent(ctx, chatId);
    }
    if (pending.type === "addadmin") {
      pendingAction.delete(chatId);
      return AdminController.applyAdminChange(ctx, ctx.message.text, true);
    }
    if (pending.type === "deladmin") {
      pendingAction.delete(chatId);
      return AdminController.applyAdminChange(ctx, ctx.message.text, false);
    }
    if (pending.type === "addchannel") {
      pendingAction.delete(chatId);
      return AdminController.applyAddChannel(ctx);
    }
    if (pending.type === "settarget") {
      pendingAction.delete(chatId);
      return AdminController.applySetTarget(ctx, pending.username);
    }
  }

  static async applyAddChannel(ctx) {
    const value = (ctx.message.text || "").trim();
    if (!value.startsWith("@")) {
      return ctx.reply("Kanal @username bilan boshlanishi kerak, masalan: @mening_kanalim", {
        reply_markup: BACK_KEYBOARD,
      });
    }

    try {
      await ctx.telegram.getChatMember(value, ctx.from.id);
    } catch (err) {
      return ctx.reply(
        `❌ Bu kanalni tekshirib bo'lmadi. Bot o'sha kanalga admin sifatida qo'shilganiga ishonch hosil qiling.\n(${err.message})`,
        { reply_markup: BACK_KEYBOARD }
      );
    }

    const added = await ChannelModel.add(value);
    await ctx.reply(
      added ? `✅ Kanal qo'shildi: ${value}` : `ℹ️ ${value} allaqachon ro'yxatda.`,
      { reply_markup: BACK_KEYBOARD }
    );
  }

  static async showChannelDetail(ctx, username) {
    await ctx.answerCbQuery();
    const channel = await ChannelModel.get(username);
    if (!channel) {
      const channels = await ChannelModel.list();
      return ctx.editMessageText("Kanal topilmadi (o'chirilgan bo'lishi mumkin).", {
        reply_markup: channelListKeyboard(channels),
      });
    }

    const stats = await ChannelModel.eventStats(username);
    let currentTotal = "noma'lum";
    try {
      currentTotal = await ctx.telegram.getChatMemberCount(username);
    } catch (err) {
      // leave as "noma'lum"
    }

    const targetLine = channel.target_count
      ? `🎯 Reja: ${channel.target_count}${channel.target_notified ? " (bajarildi ✅)" : ""}`
      : "🎯 Reja o'rnatilmagan";

    const text =
      `📢 ${username}\n\n` +
      `👥 Hozirgi umumiy obunachilar: ${currentTotal}\n` +
      `➕ Qo'shilganlar (kuzatuv boshlangandan beri): ${stats.joined}\n` +
      `➖ Chiqib ketganlar: ${stats.left}\n` +
      `${targetLine}\n\n` +
      `ℹ️ "Qo'shilganlar/chiqib ketganlar" faqat bot shu kanalga admin bo'lgandan beri kuzatilgan.`;

    const buttons = [[{ text: "🎯 Reja belgilash", callback_data: `admin_channel_target:${username}` }]];
    if (channel.target_count) {
      buttons.push([
        { text: "🎯 Rejani o'chirish", callback_data: `admin_channel_cleartarget:${username}` },
      ]);
    }
    buttons.push([{ text: "🗑 Kanalni o'chirish", callback_data: `admin_channel_delete:${username}` }]);
    buttons.push([{ text: "🔙 Kanallar", callback_data: "admin_channel" }]);

    return ctx.editMessageText(text, { reply_markup: { inline_keyboard: buttons } });
  }

  static async promptTarget(ctx, username) {
    await ctx.answerCbQuery();
    pendingAction.set(ctx.update.callback_query.message.chat.id, { type: "settarget", username });
    return ctx.editMessageText(
      `${username} uchun rejalashtirilgan obunachilar sonini kiriting (masalan: 1000).`,
      {
        reply_markup: {
          inline_keyboard: [[{ text: "🔙 Orqaga", callback_data: `admin_channel_view:${username}` }]],
        },
      }
    );
  }

  static async applySetTarget(ctx, username) {
    const num = Number((ctx.message.text || "").trim());
    if (!Number.isInteger(num) || num <= 0) {
      return ctx.reply("Iltimos musbat butun son kiriting.", { reply_markup: BACK_KEYBOARD });
    }
    await ChannelModel.setTarget(username, num);
    await ctx.reply(`✅ ${username} uchun reja o'rnatildi: ${num}`, { reply_markup: BACK_KEYBOARD });
  }

  static async clearTarget(ctx, username) {
    await ChannelModel.clearTarget(username);
    await ctx.answerCbQuery("O'chirildi");
    return AdminController.showChannelDetail(ctx, username);
  }

  static async deleteChannel(ctx, username) {
    await ChannelModel.remove(username);
    await ctx.answerCbQuery("O'chirildi");
    const channels = await ChannelModel.list();
    return ctx.editMessageText("✅ Kanal o'chirildi.\n\n📢 Majburiy obunalar", {
      reply_markup: channelListKeyboard(channels),
    });
  }

  static async renderGroupButtonView(ctx) {
    const enabled = await MediaMessage.isGroupButtonEnabled();
    return ctx.editMessageText(
      `➕ "Guruhga qo'shish" tugmasi\n\nHar bir yuborilgan video/audio ostida botni guruhga qo'shish tugmasi ko'rsatilsinmi?\n\nHozirgi holat: ${
        enabled ? "✅ Yoqilgan" : "❌ O'chirilgan"
      }`,
      {
        reply_markup: {
          inline_keyboard: [
            [{ text: enabled ? "❌ O'chirish" : "✅ Yoqish", callback_data: "admin_groupbtn_toggle" }],
            [{ text: "🔙 Menyu", callback_data: "admin_menu" }],
          ],
        },
      }
    );
  }

  static async applyAdminChange(ctx, text, makeAdmin) {
    const targetId = (text || "").trim();
    if (!targetId || Number.isNaN(Number(targetId))) {
      return ctx.reply("Noto'g'ri chat_id.", { reply_markup: BACK_KEYBOARD });
    }
    const ok = await AdminModel.setAdmin(targetId, makeAdmin);
    const message = ok
      ? makeAdmin
        ? `✅ ${targetId} endi admin.`
        : `✅ ${targetId} admin huquqi olib tashlandi.`
      : `❌ ${targetId} topilmadi — bu foydalanuvchi botni hali /start qilmagan.`;
    await ctx.reply(message, { reply_markup: BACK_KEYBOARD });
  }

  static async receiveBroadcastContent(ctx, chatId) {
    const targetCount = (await AdminModel.allChatIds()).length;
    pendingAction.set(chatId, {
      type: "broadcast",
      state: "awaiting_confirm",
      messageId: ctx.message.message_id,
    });

    await ctx.reply(`Ushbu xabar ${targetCount} ta foydalanuvchiga yuborilsinmi?`, {
      reply_markup: {
        inline_keyboard: [
          [
            { text: "✅ Yuborish", callback_data: "broadcast_confirm" },
            { text: "❌ Bekor qilish", callback_data: "broadcast_cancel" },
          ],
        ],
      },
    });
  }

  static async HandleBroadcastConfirm(ctx) {
    const chatId = ctx.update.callback_query.message.chat.id;
    const pending = pendingAction.get(chatId);
    const data = ctx.update.callback_query.data;

    if (!pending || pending.type !== "broadcast" || pending.state !== "awaiting_confirm") {
      return ctx.answerCbQuery();
    }
    pendingAction.delete(chatId);

    if (data === "broadcast_cancel") {
      await ctx.answerCbQuery();
      return ctx.editMessageText(MENU_TEXT, { reply_markup: MENU_KEYBOARD });
    }

    await ctx.answerCbQuery("Yuborilmoqda...");
    await ctx.editMessageText("⏳ Reklama yuborilmoqda...");
    await Queue.enqueueBroadcast({
      adminChatId: chatId,
      fromChatId: chatId,
      messageId: pending.messageId,
    });
  }
};
