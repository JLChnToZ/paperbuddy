const canvasCache = new Set<HTMLCanvasElement | OffscreenCanvas>();

export function getCanvas(width: number, height: number): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  return canvas;
}

export function getOffscreenCanvas(width: number, height: number): HTMLCanvasElement | OffscreenCanvas {
  if(canvasCache.size)
    for(const canvas of canvasCache) {
      canvas.width = width;
      canvas.height = height;
      canvasCache.delete(canvas);
      return canvas;
    }
  if(typeof OffscreenCanvas !== 'undefined')
    return new OffscreenCanvas(width, height);
  const canvas = getCanvas(width, height);
  canvas.style.display = 'none';
  document.body.appendChild(canvas);
  return canvas;
}

export function returnOffscreenCanvas(canvas: HTMLCanvasElement | OffscreenCanvas) {
  canvasCache.add(canvas);
}

export function canvasToBlobAsync(canvas: HTMLCanvasElement | OffscreenCanvas, type?: string, quality?: number) {
  return typeof OffscreenCanvas !== 'undefined' && (canvas instanceof OffscreenCanvas) ?
    canvas.convertToBlob({ type, quality }) :
    new Promise<Blob | null>(resolve => (canvas as HTMLCanvasElement).toBlob(resolve, type, quality));
}
