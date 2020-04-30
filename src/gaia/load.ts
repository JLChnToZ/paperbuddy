import 'whatwg-fetch';

import { StringToStringMap } from './types';

export default async function load(locale: string): Promise<StringToStringMap> {
  const url = `/lang/${locale}.json`;

  const response = await fetch(url);
  if(!response.ok)
    throw new Error(`${response.status}: Could not retrieve file at ${url}`);
    
  return response.json();
}