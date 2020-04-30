export function normalize(locale: string) {
  return locale.replace('_', '-').toLowerCase();
}

export function languageCode(locale: string) {
  return locale.split('-')[0];
}

export function first<T>(set: Set<T>) {
  for(const entry of set)
    return entry;
}
