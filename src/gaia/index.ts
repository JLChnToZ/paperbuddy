import load from './load';
import { Translations, StringToStringMap } from './types';
import resolveUserLocale from './user-locale';
import { normalize, first } from './util';

let locale: string | undefined;
let fallbackLocale: string | undefined;
const translations: Translations = {};
const supportedLocales = new Set<string>();
const boundTranslators = new Map<any, Map<PropertyKey, string>>();

export class Gaia {
  private constructor() {}

  static get supportedLocales() {
    return supportedLocales;
  }

  static get locale() { return locale; }
}

export namespace Gaia {
  export interface Options {
    supportedLocales: (string | [string, StringToStringMap | Promise<StringToStringMap>])[],
    locale?: string,
    fallbackLocale?: string,
  }

  export async function init(options: Options) {
    if(!options?.supportedLocales.length)
      throw new Error(
        'No supported locales given. Please provide ' +
        'supported locales.'
      );

    for(const locale of options.supportedLocales) {
      if(typeof locale === 'string') {
        supportedLocales.add(normalize(locale));
        continue;
      }
      const [langCode, translation] = locale;
      const normalizedLangCode = normalize(langCode);
      translations[normalizedLangCode] = await translation;
      supportedLocales.add(normalizedLangCode);
    }

    if(options.fallbackLocale && !Gaia.isSupported(options.fallbackLocale))
      throw new Error(
        `Fallback locale ${options.fallbackLocale} is not in ` +
        'supported locales given: ' +
        `[${Array.from(supportedLocales).join(', ')}].`
      );

    fallbackLocale = options.fallbackLocale;
    
    locale = options.locale || resolveUserLocale(supportedLocales) ||
      options.fallbackLocale || first(supportedLocales);
    
    if(!locale)
      throw new Error('No locale is matched.');
    
    await loadAndSet(locale);
    return locale;
  }

  /**
   * Check if the given locale is supported.
   *
   * @param locale The locale to check.
   */
  export function isSupported(locale: string) {
    return supportedLocales.has(locale);
  }

  /**
   * Set the current locale, reloading translations.
   *
   * @param locale The locale to set.
   */
  export function setLocale(locale: string, translation?: StringToStringMap | Promise<StringToStringMap>) {
    return loadAndSet(locale, translation);
  }

  export async function loadLocale(locale: string, translation?: StringToStringMap | Promise<StringToStringMap>) {
    await loadToMemory(locale, translation);
  }

  export function t(key: string) {
    return translations[locale!]?.[key] ||
      translations[fallbackLocale!]?.[key] ||
      key;
  }

  export function bind<T, K extends keyof T>(target: T, key: K, localeKey: string): void;
  export function bind(target: any, key: PropertyKey, localeKey: string) {
    let b = boundTranslators.get(target);
    if(!b) {
      b = new Map();
      boundTranslators.set(target, b);
    }
    b.set(key, localeKey);
    target[key] = localeKey;
  }

  export function unBind(target: any): void;
  export function unBind<T, K extends keyof T>(target: T, key: K): void;
  export function unBind(target: any, key?: PropertyKey) {
    if(key == null) {
      boundTranslators.delete(target);
      return;
    }
    const b = boundTranslators.get(target);
    if(!b) return;
    b.delete(key);
    if(!b.size)
      boundTranslators.delete(target);
  }
}

async function loadToMemory(locale: string, translation?: StringToStringMap | Promise<StringToStringMap>) {
  const normalizedLocale = normalize(locale);
  if(!Gaia.isSupported(locale)) {
    if(!translation)
      throw new Error(`Locale ${locale} is not in supported ` +
        `locales given: [${Array.from(supportedLocales).join(', ')}].`);
    supportedLocales.add(normalizedLocale);
  }
  if(translation)
    translation = await translation;
  if(!translation)
    translation = translations[locale] || await load(normalizedLocale);
  translations[locale] = translation;
  return normalizedLocale;
}

async function loadAndSet(locale: string, translation?: StringToStringMap | Promise<StringToStringMap>) {
  locale = await loadToMemory(locale, translation);
  for(const [target, b] of boundTranslators)
    for(const [key, localeKey] of b)
      target[key] = Gaia.t(localeKey);
}