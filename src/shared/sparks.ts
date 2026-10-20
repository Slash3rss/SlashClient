import { getLang, locale } from './i18n';

/**
 * The SlashClient currency, earned with achievements and spent on cosmetics in the shop (the server's
 * economy.ts). Its names live here only, so a rename touches this file (and the texts using it).
 */
export const CURRENCY = {
  /** Polish forms: 1 Iskra, 2–4 Iskry (not 12–14), 5+ Iskier. */
  pl: ['Iskra', 'Iskry', 'Iskier'] as const,
  en: ['Spark', 'Sparks'] as const,
  /** Its sign, before amounts. */
  sign: '✦',
};

/** The currency's name as a title ("Iskry", "Sparks"). */
export const currencyName = () => (getLang() === 'en' ? CURRENCY.en[1] : CURRENCY.pl[1]);
/** Its name after "history of", "spent" ("Iskier", "Sparks"). */
export const currencyOf = () => (getLang() === 'en' ? CURRENCY.en[1] : CURRENCY.pl[2]);

/** Which Polish form goes with a number: 0 one, 1 few, 2 many. */
export function polishForm(n: number): 0 | 1 | 2 {
  const a = Math.abs(n);
  if (a === 1) return 0;
  return a % 10 >= 2 && a % 10 <= 4 && (a % 100 < 12 || a % 100 > 14) ? 1 : 2;
}

/** "1 Iskra", "3 Iskry", "1 250 Iskier"; English "1 Spark", "40 Sparks". */
export function sparks(n: number): string {
  const num = n.toLocaleString(locale());
  if (getLang() === 'en') return `${num} ${Math.abs(n) === 1 ? CURRENCY.en[0] : CURRENCY.en[1]}`;
  return `${num} ${CURRENCY.pl[polishForm(n)]}`;
}

/** "+40 Iskier" for a gain, "−600 Iskier" for a spend. */
export const signedSparks = (n: number) => `${n > 0 ? '+' : n < 0 ? '−' : ''}${sparks(Math.abs(n))}`;

/** An amount with the sign only, for tight spots: "✦ 1 250". */
export const sparkAmount = (n: number) => `${CURRENCY.sign} ${n.toLocaleString(locale())}`;
