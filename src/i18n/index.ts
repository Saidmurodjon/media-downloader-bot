import type { Language } from '../types.ts';

const translations = {
  uz: {
    start: "Salom! Menga YouTube yoki Instagram havolasini yuboring:",
    chooseLanguage: "Tilni tanlang / Choose language / Выберите язык:",
    languageSet: "Til o'rnatildi. Menga havola yuboring:",
    downloading: "Yuklanmoqda... ⏳",
    error: "Qayerdadir hatolik bor 😔\nIltimos qayta urinib ko'ring!",
    unsupported: "Bu havola qo'llab-quvvatlanmaydi. YouTube yoki Instagram havolasini yuboring.",
    tooLarge: "Fayl juda katta (50MB dan oshadi). Boshqa video urinib ko'ring.",
    wrong: "Nimadir noto'g'ri. Iltimos YouTube yoki Instagram havolasini yuboring.",
    about: "Men sizga YouTube va Instagram'dan videolarni yuklab olishda yordam beraman. Havola yuboring!",
    langBtn: "🇺🇿 O'zbek",
    adminPanel: "⚙️ Admin panel",
    stats: "📊 Statistika",
    broadcast: "📢 Broadcast",
    totalUsers: "Jami foydalanuvchilar",
    broadcastPrompt: "Yuboriladigan xabarni kiriting:",
    broadcastDone: "Broadcast yakunlandi. Yuborildi:",
    broadcastFailed: "Muvaffaqiyatsiz:",
    notAdmin: "Siz admin emassiz.",
    cancel: "Bekor qilindi.",
  },
  ru: {
    start: "Привет! Отправьте мне ссылку на YouTube или Instagram:",
    chooseLanguage: "Tilni tanlang / Choose language / Выберите язык:",
    languageSet: "Язык установлен. Отправьте мне ссылку:",
    downloading: "Скачиваю... ⏳",
    error: "Что-то пошло не так 😔\nПожалуйста, попробуйте ещё раз!",
    unsupported: "Эта ссылка не поддерживается. Отправьте ссылку на YouTube или Instagram.",
    tooLarge: "Файл слишком большой (более 50 МБ). Попробуйте другое видео.",
    wrong: "Что-то пошло не так. Отправьте ссылку на YouTube или Instagram.",
    about: "Я помогу вам скачать видео из YouTube и Instagram. Просто отправьте ссылку!",
    langBtn: "🇷🇺 Русский",
    adminPanel: "⚙️ Панель администратора",
    stats: "📊 Статистика",
    broadcast: "📢 Рассылка",
    totalUsers: "Всего пользователей",
    broadcastPrompt: "Введите сообщение для рассылки:",
    broadcastDone: "Рассылка завершена. Отправлено:",
    broadcastFailed: "Не удалось:",
    notAdmin: "Вы не администратор.",
    cancel: "Отменено.",
  },
  en: {
    start: "Hey! Send me a YouTube or Instagram link:",
    chooseLanguage: "Tilni tanlang / Choose language / Выберите язык:",
    languageSet: "Language set. Send me a link:",
    downloading: "Downloading... ⏳",
    error: "Something went wrong 😔\nPlease try again!",
    unsupported: "This link is not supported. Send a YouTube or Instagram link.",
    tooLarge: "File is too large (over 50MB). Try another video.",
    wrong: "Something went wrong. Please send a YouTube or Instagram link.",
    about: "I can help you download videos from YouTube and Instagram. Just send a link!",
    langBtn: "🇺🇸 English",
    adminPanel: "⚙️ Admin panel",
    stats: "📊 Statistics",
    broadcast: "📢 Broadcast",
    totalUsers: "Total users",
    broadcastPrompt: "Enter the message to broadcast:",
    broadcastDone: "Broadcast done. Sent:",
    broadcastFailed: "Failed:",
    notAdmin: "You are not an admin.",
    cancel: "Cancelled.",
  },
} as const;

export type TranslationKey = keyof typeof translations.en;

export function t(lang: Language | undefined, key: TranslationKey): string {
  const l = lang ?? 'en';
  return (translations[l] as Record<string, string>)[key] ?? translations.en[key];
}

export const languageButtons = [
  { text: translations.uz.langBtn, callback_data: 'lang:uz' },
  { text: translations.ru.langBtn, callback_data: 'lang:ru' },
  { text: translations.en.langBtn, callback_data: 'lang:en' },
];
