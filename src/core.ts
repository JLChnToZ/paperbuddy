import JSZip, { OutputType } from 'jszip';
import { Data, LayerData, EntryData, PartData } from './data-structs';
import { getCanvas, getOffscreenCanvas, canvasToBlobAsync } from './offscreen-canvas';
import { mapClone, delay, EMPTY_GIF } from './utils';

export interface Condition {
  index: number;
  value?: number;
}

export interface ConditionMapping {
  conditions: Condition[];
  entry: EntryData;
  value: number;
  enabled: boolean;
}

interface PreviewQueueEntry {
  resolve: (value: string) => void;
  reject: (err?: any) => void;
  index: number;
  value: number;
}

export class Core {
  public loadPackPromise: Promise<JSZip> | JSZip;
  public loadDataPromise: Promise<Data>;
  public pack?: JSZip;
  public data?: Data;

  public images = new Map<string, CanvasImageSource>();
  protected conditionMapping: ConditionMapping[] = [];
  private conditionAcc: Condition[] = [];
  private previewQueue?: PreviewQueueEntry[];

  private layerData = new Map<string, LayerData>();
  private baseLayers = new Set<string>();
  private enabledLayers = new Set<string>();
  protected canvas: HTMLCanvasElement;
  private context?: CanvasRenderingContext2D | null;
  private offscreenCanvas: HTMLCanvasElement | OffscreenCanvas;
  private offscreenContext: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;

  public constructor(src?: Blob | number[] | ArrayBufferLike | string) {
    this.loadPackPromise = src ? JSZip.loadAsync(src) : Promise.resolve(new JSZip());
    this.loadDataPromise = loadData(this.loadPackPromise);
    this.canvas = getCanvas(512, 512);
    this.offscreenCanvas = getOffscreenCanvas(512, 512);
    const offscreenContext = this.offscreenCanvas.getContext('2d');
    if(!offscreenContext)
      throw new Error('Failed to initialize 2D canvas context.');
    this.offscreenContext = offscreenContext;
    this.init();
  }
  
  public composite(refreshLayers = true, selectedLayers?: string[]) {
    const data = this.data!;
    if(!this.context)
      this.context = this.canvas.getContext('2d');
    if(!this.context)
      throw new Error('Failed to initialize 2D canvas context.');
    this.context.clearRect(0, 0, this.canvas.width, this.canvas.height);
    if(selectedLayers) {
      for(const layer of data.layers) {
        const image = this.images.get(layer.fileName);
        if(!image) continue;
        this.context.globalAlpha = selectedLayers?.indexOf(layer.fileName) < 0 ? 0.5 : 1;
        this.context.drawImage(image, 0, 0);
      }
      this.context.globalAlpha = 1;
    } else {
      if(refreshLayers) this.refreshLayers();
      for(const layer of data.layers) {
        if(!this.enabledLayers.has(layer.fileName))
          continue;
        const image = this.images.get(layer.fileName);
        if(image) this.context.drawImage(image, 0, 0);
      }
    }
  }

  public select(index: number, value: number) {
    this.conditionMapping[index].value = value;
    this.composite();
  }

  protected reload(loadPackPromise: JSZip | Promise<JSZip>) {
    this.loadPackPromise = loadPackPromise;
    this.loadDataPromise = loadData(this.loadPackPromise);
    this.init();
    this.context?.clearRect(0, 0, this.canvas.width, this.canvas.height);
  }

  protected async init() {
    this.pack = await this.loadPackPromise;
    this.data = await this.loadDataPromise;
    for(const layer of this.data.layers) {
      this.layerData.set(layer.fileName, layer);
      this.loadImage(layer.fileName);
    }
  }

  public refresh() {
    const data = this.data!;
    this.canvas.width = data.width;
    this.canvas.height = data.height;
    this.offscreenCanvas.width = data.width;
    this.offscreenCanvas.height = data.height;
    data.layers.forEach(this.refreshLayer, this);
    this.conditionMapping = [];
    this.conditionAcc = [{ index: -1 }];
    data.categories.forEach(this.refreshEntry, this);
  }

  private refreshLayer(layer: LayerData) {
    this.baseLayers.add(layer.fileName);
  }

  private refreshEntry(entry: EntryData, index: number) {
    this.conditionAcc[this.conditionAcc.length - 1].value = index;
    entry.parts?.forEach(this.refreshPart, this);
    if(entry.entries) {
      const { length } = this.conditionMapping;
      this.conditionMapping.push({
        conditions: this.conditionAcc.map(mapClone),
        entry,
        value: 0,
        enabled: this.conditionAcc.length <= 1,
      });
      this.conditionAcc.push({ index: length });
      entry.entries.forEach(this.refreshEntry, this);
      this.conditionAcc.pop();
    }
  }

  private refreshPart(part: PartData) {
    this.baseLayers.delete(part.layer);
  }

  public getCategoryEnabled(index: number) {
    const { conditions, value: selectedValue } = this.conditionMapping[index];
    for(const { index, value } of conditions) {
      if(index < 0)
        continue;
      if(selectedValue !== value)
        return false;
    }
    return true;
  }

  protected refreshLayers() {
    this.enabledLayers.clear();
    this.baseLayers.forEach(Set.prototype.add, this.enabledLayers);
    for(let index = 0; index < this.conditionMapping.length; index++) {
      const selection = this.conditionMapping[index];
      if(!(selection.enabled = this.getCategoryEnabled(index)))
        continue;
      const { value } = selection;
      const parts = this.conditionMapping[index].entry.entries?.[value]?.parts;
      if(!parts) continue;
      for(const part of parts)
        this.enabledLayers.add(part.layer);
    }
  }

  private async loadImage(fileName: string) {
    const pack = this.pack || await this.loadPackPromise;
    this.images.set(
      fileName,
      await createImageBitmap(
        await pack.file(fileName).async('blob'),
      ),
    );
  }

  public async repack<T extends OutputType>(type: T) {
    const pack = this.pack || await this.loadPackPromise;
    pack.file('data.json', JSON.stringify(this.data));
    return await pack.generateAsync({ type });
  }
  
  public requestPreview(index: number, value: number) {
    return new Promise<string>((resolve, reject) => {
      const entry: PreviewQueueEntry = {
        resolve, reject, index, value,
      };
      if(this.previewQueue)
        this.previewQueue.push(entry);
      else {
        this.previewQueue = [entry];
        this.processPreviewQueue();
      }
    });
  }
  
  private async processPreviewQueue() {
    if(!this.previewQueue) return;
    const enabledLayers = new Set<string>();
    for(const queueEntry of this.previewQueue)
      try {
        await delay(100);
        const { entry } = this.conditionMapping[queueEntry.index];
        if(!entry)
          throw new Error(`No matching base entry #${queueEntry.index}.`);
        const parts = entry.entries?.[queueEntry.value]?.parts;
        if(!parts)
          throw new Error(`Parts not found for #${queueEntry.value} in entry #${queueEntry.index}.`);
        this.offscreenContext.clearRect(0, 0, this.offscreenCanvas.width, this.offscreenCanvas.height);
        enabledLayers.clear();
        for(const part of parts)
          enabledLayers.add(part.layer);
        if(!this.data)
          throw new Error('Data is not ready.');
        for(const layer of this.data.layers) {
          if(!enabledLayers.has(layer.fileName))
            continue;
          const image = this.images.get(layer.fileName);
          if(image)
            this.offscreenContext.drawImage(image, 0, 0);
        }
        queueEntry.resolve(URL.createObjectURL(await canvasToBlobAsync(this.offscreenCanvas)));
      } catch(e) {
        console.error(e);
        console.log('Silently resolved as dummy image');
        queueEntry.resolve(EMPTY_GIF);
      }
    delete this.previewQueue;
  }
}

async function loadData(packPromise: PromiseLike<JSZip> | JSZip) {
  let data: Data | undefined;
  try {
    const pack = await packPromise;
    const dataFile = pack.file('data.json');
    if(dataFile) data = JSON.parse(await dataFile.async('text'));
  } catch(e) { console.error(e); }
  if(!data)
    data = {
      layers: [],
      categories: [],
      width: 512,
      height: 512,
    };
  else {
    if(!data.layers) data.layers = [];
    if(!data.categories) data.categories = [];
  }
  return data;
}
