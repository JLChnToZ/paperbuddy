export interface OpenFileOptions {
  accept?: string;
  multiple?: boolean;
}

export interface SaveFileOptions {
  endings?: EndingType;
  type?: string;
  fileName?: string;
}

let openCallback: ((value: File[]) => void) | undefined;
const openHandler = document.createElement('input');
openHandler.type = 'file';
openHandler.addEventListener('change', handleOpenCallback);
document.addEventListener('focus', () => openCallback && setTimeout(handleOpenCallback, 100), true);
const saveHandler = document.createElement('a');

export function openFile(options?: OpenFileOptions) {
  return new Promise<File[]>(resolve => {
    openHandler.value = '';
    openHandler.accept = options?.accept || '*';
    openHandler.multiple = options?.multiple || false;
    openCallback = resolve;
    openHandler.click();
  });
}

function handleOpenCallback() {
  openCallback?.(openHandler.files ? Array.from(openHandler.files) : []);
  openCallback = undefined;
}

export function saveFile(data: BlobPart | BlobPart[], options?: SaveFileOptions) {
  const blob = data instanceof Blob ? data : new Blob(Array.isArray(data) ? data : [data], {
    endings: options?.endings,
    type: options?.type,
  });
  saveHandler.href = URL.createObjectURL(blob);
  saveHandler.download = options?.fileName || 'untitled';
  saveHandler.click();
  URL.revokeObjectURL(saveHandler.href);
}
