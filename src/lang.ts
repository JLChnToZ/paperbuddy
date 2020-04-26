export type LanguageKeys = 'edit' | 'play' |
  'title' | 'description' | 'width' | 'height' | 'addfile' | 'addlayer' |
  'newcat' | 'parts' | 'layers' | 'options' | 'close';

export type LanguageDef = {
  [k in LanguageKeys]: string;
};

export const defaultLanguage: LanguageDef = {
  edit: 'Edit',
  play: 'Play',
  title: 'Title',
  description: 'Description',
  width: 'Width',
  height: 'Height',
  addfile: 'Add File..',
  addlayer: 'Add Layer to Option List',
  newcat: 'New Category',
  parts: 'Parts',
  layers: 'Layers',
  options: 'Options',
  close: 'OK & Close',
};