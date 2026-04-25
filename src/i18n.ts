import uz from '../locales/uz.json';
import en from '../locales/en.json';
import ru from '../locales/ru.json';

type LocaleKey = keyof typeof en;

const locales: Record<string, Record<string, string>> = { uz, en, ru };

const SUPPORTED_LANGS = ['uz', 'en', 'ru'] as const;
export type SupportedLang = (typeof SUPPORTED_LANGS)[number];

export function isSupportedLang(lang: string): lang is SupportedLang {
  return (SUPPORTED_LANGS as readonly string[]).includes(lang);
}

export function t(
  lang: string,
  key: LocaleKey,
  vars?: Record<string, string | number>,
): string {
  const locale = locales[isSupportedLang(lang) ? lang : 'uz'];
  let text: string = locale[key] ?? locales['uz'][key] ?? key;

  if (vars) {
    for (const [varName, value] of Object.entries(vars)) {
      text = text.replaceAll(`{{${varName}}}`, String(value));
    }
  }

  return text;
}

export function getLangName(lang: string): string {
  switch (lang) {
    case 'uz': return "O'zbek 🇺🇿";
    case 'ru': return 'Русский 🇷🇺';
    case 'en': return 'English 🇬🇧';
    default:   return lang;
  }
}
