export interface Config {
  isEditor?: boolean;
  src?: Blob | ArrayBufferLike | number[] | string | Promise<Blob | number[] | ArrayBufferLike | string>;
  canReset?: boolean;
  canOpen?: boolean | (() => Promise<Blob | ArrayBufferLike | number[] | string>);
  canSave?: boolean | (() => Promise<void>);
  controlDocumentTitle?: boolean;
}

export interface Data {
  title?: string;
  description?: string;
  width: number;
  height: number;
  layers: LayerData[];
  categories: CategoryData[];
}

export interface LayerData {
  fileName: string;
}

export interface CategoryData {
  label: string;
  entries?: EntryData[];
}

export interface EntryData extends CategoryData {
  parts?: PartData[];
}

export interface PartData {
  layer: string;
}

export enum TreeNodeType {
  Layer,
  Category,
  Entry,
  Part,
}

export interface TreeNodeDef {
  type: TreeNodeType;
  ref: any;
}

export interface Selection {
  value: number;
}
