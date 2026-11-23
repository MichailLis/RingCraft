import { messagesEn } from './messagesEn';

export type Locale = 'ru' | 'en';

export function selectLocale(preferences: readonly string[]): Locale {
  for (const preference of preferences) {
    const language = preference.toLowerCase().split('-')[0];
    if (language === 'ru' || language === 'en') return language;
  }
  return 'en';
}

export const locale =
  typeof window === 'undefined'
    ? 'ru'
    : selectLocale(navigator.languages.length ? navigator.languages : [navigator.language]);

export function t(message: keyof typeof messagesEn, ...values: (string | number)[]): string {
  const translated = locale === 'ru' ? message : messagesEn[message];
  return values.length
    ? translated.replace(/\{(\d+)\}/g, (_, index: string) => String(values[Number(index)]))
    : translated;
}
