import JSZip, { OutputType } from 'jszip';
import { Bind, mapClone, mapRun, delay, EMPTY_GIF, canvasToBlobAsync } from './utils';
import { Tabs } from './tabs';
import { Data, LayerData, EntryData, PartData } from './data-structs';
import { Editor } from './editor';
import { defaultLanguage } from './lang';
import { Choose } from './choose';
import marked from 'marked';

interface Condition {
  index: number;
  value?: number;
}

interface ConditionMapping {
  conditions: Condition[];
  entry: EntryData;
}

interface PreviewQueueEntry {
  resolve: (value: string) => void;
  reject: (err?: any) => void;
  index: number;
  value: number;
}

export class Buddy {
  public editor?: Editor;
  public loadPackPromise: Promise<JSZip> | JSZip;
  public pack?: JSZip;
  private loadDataPromise: Promise<Data>;
  private data?: Data;

  private root: HTMLElement;
  private layerData = new Map<string, LayerData>();
  private baseLayers = new Set<string>();
  private enabledLayers = new Set<string>();
  private selection: Choose[] = [];
  private conditionMapping: ConditionMapping[] = [];
  private conditionAcc: Condition[] = [];
  private images = new Map<string, CanvasImageSource>();
  private previewQueue?: PreviewQueueEntry[];
  private canvas: HTMLCanvasElement;
  private context: CanvasRenderingContext2D;
  private offscreenCanvas: OffscreenCanvas;
  private offscreenContext: OffscreenCanvasRenderingContext2D;
  private descriptionPanel: HTMLDivElement;
  private descriptionTitle: HTMLHeadingElement;
  private descriptionContent: HTMLDivElement;

  private playerRoot: HTMLElement;
  private playerTabs: Tabs;
  
  constructor(
    root: HTMLElement | string,
    src?: Blob | Uint8Array | ArrayBuffer | number[] | string,
    public isEditor?: boolean,
    private lang = defaultLanguage,
  ) {
    this.loadPackPromise = src ? JSZip.loadAsync(src) : new JSZip();
    this.loadDataPromise = loadData(this.loadPackPromise);
    this.root = typeof root === 'string' ? document.querySelector<HTMLElement>(root)! : root;
    this.root.classList.add('buddy');
    const canvasContainer = this.root.appendChild(document.createElement('div'));
    canvasContainer.className = 'preview-container';
    this.canvas = canvasContainer.appendChild(document.createElement('canvas'));
    this.canvas.width = 512;
    this.canvas.height = 512;
    this.context = this.canvas.getContext('2d')!;
    this.offscreenCanvas = new OffscreenCanvas(512, 512);
    this.offscreenContext = this.offscreenCanvas.getContext('2d')!;
    if(isEditor) {
      this.editor = new Editor(this.root, this.loadPackPromise, this.images, this.loadDataPromise, lang)
      .on('refresh', this.refresh)
      .on('composite', this.composite);
      this.playerRoot = this.editor.playerRoot;
    } else {
      this.playerRoot = this.root.appendChild(document.createElement('div'));
    }
    this.playerTabs = new Tabs(this.playerRoot);
    const overlayButtons = canvasContainer.appendChild(document.createElement('div'));
    overlayButtons.className = 'overlay-buttons';
    {
      const button = overlayButtons.appendChild(document.createElement('button'));
      const icon = button.appendChild(document.createElement('i'));
      icon.className = 'material-icons md-18 md-info';
      button.addEventListener('click', this.showDescriptionPanel);
    }
    {
      const button = overlayButtons.appendChild(document.createElement('button'));
      const icon = button.appendChild(document.createElement('i'));
      icon.className = 'material-icons md-18 md-photo_camera';
      button.addEventListener('click', this.onDownloadClick);
    }
    {
      this.descriptionPanel = canvasContainer.appendChild(document.createElement('div'));
      this.descriptionPanel.className = 'description-panel';
      const descriptionPanelFloat = this.descriptionPanel.appendChild(document.createElement('div'));
      descriptionPanelFloat.className = 'float-panel';
      this.descriptionTitle = descriptionPanelFloat.appendChild(document.createElement('h3'));
      this.descriptionContent = descriptionPanelFloat.appendChild(document.createElement('div'));
      this.descriptionContent.className = 'content';
      descriptionPanelFloat.appendChild(document.createElement('hr'));
      const closeButton = descriptionPanelFloat.appendChild(document.createElement('button'));
      closeButton.textContent = lang.close;
      closeButton.addEventListener('click', this.hideDescriptionPanel);
    }
    this.init();
  }

  @Bind
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
    for(let i = 0; i < this.conditionMapping.length; i++) {
      if(this.selection[i])
        this.selection[i].value = 0;
      else
        this.selection[i] = new Choose(this.playerTabs, this.requestPreview)
        .on('select', this.onSelect);
      this.selection[i].update(this.conditionMapping[i].entry, i);
    }
    const removeCount = this.selection.length - this.conditionMapping.length;
    if(removeCount > 0)
      this.selection.splice(this.selection.length - removeCount, removeCount).forEach(mapRun, 'dispose');
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
      });
      console.log('Pushed', this.conditionAcc.map(y => `#${y.index} = ${y.value != null ? y.value : '<Undefined>'}`).join(';'));
      this.conditionAcc.push({ index: length });
      entry.entries.forEach(this.refreshEntry, this);
      this.conditionAcc.pop();
    }
  }

  private refreshPart(part: PartData) {
    this.baseLayers.delete(part.layer);
  }

  @Bind
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

  @Bind
  public composite(refreshLayers = true, editMode = false) {
    const data = this.data!;
    this.context.clearRect(0, 0, this.canvas.width, this.canvas.height);
    if(editMode) {
      const selected = this.editor?.getSelectedLayers();
      for(const layer of data.layers) {
        const image = this.images.get(layer.fileName);
        if(!image) continue;
        this.context.globalAlpha = selected && selected.indexOf(layer.fileName) < 0 ? 0.5 : 1;
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

  @Bind
  private onSelect(index: number, value: number) {
    this.composite();
  }

  @Bind
  private async onDownloadClick() {
    const blob = await canvasToBlobAsync(this.canvas);
    if(!blob) return;
    const temp = document.createElement('a');
    temp.href = URL.createObjectURL(blob);
    temp.download = `${Date.now()}.png`;
    temp.click();
    URL.revokeObjectURL(temp.href);
  }

  @Bind
  private showDescriptionPanel() {
    this.descriptionTitle.textContent = this.data!.title || '';
    if(this.data!.description)
      this.descriptionContent.innerHTML = marked(this.data!.description);
    else
      this.descriptionContent.textContent = '';
    this.descriptionPanel.classList.add('show');
  }

  @Bind
  private hideDescriptionPanel() {
    this.descriptionPanel.classList.remove('show');
  }

  private refreshLayers() {
    this.enabledLayers.clear();
    this.baseLayers.forEach(Set.prototype.add, this.enabledLayers);
    for(let i = 0; i < this.selection.length; i++) {
      const parts = this.getSelectedEntry(i)?.parts;
      console.log('Parts...', i, parts?.length);
      if(!parts) continue;
      for(const part of parts)
        this.enabledLayers.add(part.layer);
    }
  }

  private getSelectedEntry(index: number) {
    const { conditions, entry } = this.conditionMapping[index];
    for(const condition of conditions) {
      if(condition.index < 0)
        continue;
      if(this.selection[condition.index].value !== condition.value)
        return;
    }
    return entry.entries?.[this.selection[index].value!];
  }

  private async init() {
    this.pack = await this.loadPackPromise;
    this.data = await this.loadDataPromise;
    for(const layer of this.data.layers) {
      this.layerData.set(layer.fileName, layer);
      this.loadImage(layer.fileName);
    }
    if(!this.editor)
      this.refresh();
    this.showDescriptionPanel();
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
        queueEntry.resolve(URL.createObjectURL(await this.offscreenCanvas.convertToBlob()));
      } catch(e) {
        console.error(e);
        console.log('Silently resolved as dummy image');
        queueEntry.resolve(EMPTY_GIF);
      }
    delete this.previewQueue;
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

  public async repack<T extends OutputType>(type: T = 'blob' as T) {
    this.editor?.syncData();
    const pack = this.pack || await this.loadPackPromise;
    pack.file('data.json', JSON.stringify(this.data));
    return await pack.generateAsync({ type });
  }
}

async function loadData(packPromise: PromiseLike<JSZip> | JSZip) {
  let data: Data | undefined;
  try {
    const pack = await packPromise;
    console.log('Pack ready');
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
  console.log('Data ready');
  return data;
}
