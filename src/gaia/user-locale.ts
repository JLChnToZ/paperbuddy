import { normalize, languageCode } from './util';

declare global {
  interface Window {
    // IE navigator lanuage settings (non-standard)
    userLanguage: string;
    browserLanguage: string;
  }
}

export default function resolveUserLocale(
  supportedLocales: Iterable<string>,
) {
  const userLocale = normalize(getUserLocale());
  for(const supported of supportedLocales)
    if(supported === userLocale)
      return supported;
  const userLanguageCode = languageCode(userLocale);
  for(const supported of supportedLocales)
    if(languageCode(supported) === userLanguageCode)
      return supported;
}

export function getUserLocale(): string {
  return window.navigator.language ||
    window.browserLanguage ||
    window.userLanguage;
}
