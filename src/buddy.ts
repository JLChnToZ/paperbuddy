import './styles/main.less';
import JSZip, { OutputType } from 'jszip';
import { Bind, mapRun } from './utils';
import { Tabs } from './tabs';
import { Data, Config } from './data-structs';
import { Editor } from './editor';
import { defaultLanguage, LanguageDef } from './lang';
import { Choose } from './choose';
import marked from 'marked';
import { saveFile, openFile } from './file-helper';
import { Core } from './core';
import { canvasToBlobAsync } from './offscreen-canvas';

const classNameBase = 'material-icons md-24 ';

export class Buddy extends Core {
  public editor?: Editor;
  private controlDocumentTitle?: boolean;
  private orgDocumentTitle?: string;
  private lang: LanguageDef;

  private root: HTMLElement;
  private selectionHandler: Choose[] = [];
  private descriptionPanel: HTMLDivElement;
  private descriptionTitle: HTMLHeadingElement;
  private descriptionContent: HTMLDivElement;

  private playerRoot: HTMLElement;
  private playerTabs: Tabs;
  
  constructor(
    root: HTMLElement | string,
    config: Config = {},
  ) {
    super(config.src);
    this.lang = config.lang || defaultLanguage;
    this.root = typeof root === 'string' ? document.querySelector<HTMLElement>(root)! : root;
    this.root.classList.add('buddy');
    const canvasContainer = this.root.appendChild(document.createElement('div'));
    canvasContainer.className = 'preview-container';
    canvasContainer.appendChild(this.canvas);
    if(config.isEditor) {
      this.editor = new Editor(this.root, this.loadPackPromise, this.images, this.loadDataPromise, this.lang)
      .on('refresh', this.refresh)
      .on('composite', this.composite);
      this.playerRoot = this.editor.playerRoot;
    } else {
      this.playerRoot = this.root.appendChild(document.createElement('div'));
    }
    this.playerTabs = new Tabs(this.playerRoot);
    const overlayButtons = canvasContainer.appendChild(document.createElement('div'));
    overlayButtons.className = 'overlay-buttons';
    if(config.isEditor && config.canReset) {
      const button = overlayButtons.appendChild(document.createElement('button'));
      const icon = button.appendChild(document.createElement('i'));
      icon.className = classNameBase + 'md-insert_drive_file';
      button.addEventListener('click', this.reset);
    }
    if(config.canOpen) {
      const button = overlayButtons.appendChild(document.createElement('button'));
      const icon = button.appendChild(document.createElement('i'));
      icon.className = classNameBase + 'md-folder_open';
      button.addEventListener('click', this.onOpenClick);
    }
    if(config.isEditor && config.canSave) {
      const button = overlayButtons.appendChild(document.createElement('button'));
      const icon = button.appendChild(document.createElement('i'));
      icon.className = classNameBase + 'md-save';
      button.addEventListener('click', this.onSaveClick);
    }
    {
      const button = overlayButtons.appendChild(document.createElement('button'));
      const icon = button.appendChild(document.createElement('i'));
      icon.className = classNameBase + 'md-info';
      button.addEventListener('click', this.showDescriptionPanel);
    }
    {
      const button = overlayButtons.appendChild(document.createElement('button'));
      const icon = button.appendChild(document.createElement('i'));
      icon.className = classNameBase + 'md-photo_camera';
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
      closeButton.textContent = this.lang.close;
      closeButton.addEventListener('click', this.hideDescriptionPanel);
    }
    if(config.controlDocumentTitle) {
      this.controlDocumentTitle = true;
      this.orgDocumentTitle = document.title;
    }
  }

  @Bind
  public refresh() {
    super.refresh();
    for(let i = 0; i < this.conditionMapping.length; i++) {
      if(this.selectionHandler[i])
        this.selectionHandler[i].value = 0;
      else
        this.selectionHandler[i] = new Choose(this.playerTabs, this.getSelectionPreview)
        .on('select', this.select);
      this.selectionHandler[i].update(this.conditionMapping[i].entry, i);
    }
    const removeCount = this.selectionHandler.length - this.conditionMapping.length;
    if(removeCount > 0)
      this.selectionHandler.splice(this.selectionHandler.length - removeCount, removeCount).forEach(mapRun, 'dispose');
    this.updateDocumentTitle();
  }

  @Bind
  public composite(refreshLayers = true, selectedLayers?: string[]) {
    super.composite(refreshLayers, selectedLayers);
  }

  @Bind
  public select(index: number, value: number) {
    super.select(index, value);
  }

  protected refreshLayers() {
    super.refreshLayers();
    for(let i = 0; i < this.selectionHandler.length; i++)
      this.selectionHandler[i].show(this.conditionMapping[i]?.enabled);
  }

  private updateDocumentTitle() {
    if(!this.controlDocumentTitle) return;
    const { title, orgDocumentTitle } = this;
    document.title = title ? `${title} - ${orgDocumentTitle}` : orgDocumentTitle!;
  }

  @Bind
  private async onDownloadClick() {
    const blob = await canvasToBlobAsync(this.canvas);
    if(blob) saveFile(blob, { fileName: `${Date.now()}.png` });
  }

  @Bind
  public reset() {
    this.reload(new JSZip());
  }

  @Bind
  private async onOpenClick() {
    const [pack] = await openFile({ accept: '*.pack' });
    if(pack) this.reload(JSZip.loadAsync(pack));
  }

  protected reload(loadPackPromise: JSZip | Promise<JSZip>) {
    super.reload(loadPackPromise);
    this.editor?.reset(this.loadPackPromise, this.loadDataPromise);
  }

  @Bind
  private async onSaveClick() {
    const blob = await this.repack('blob');
    if(blob) saveFile(blob, { fileName: `${Date.now()}.pack` });
  }

  @Bind
  private showDescriptionPanel() {
    const { data } = this;
    if(!data) return;
    const { title, description } = data;
    this.descriptionTitle.textContent = title || '';
    if(description)
      this.descriptionContent.innerHTML = marked(description);
    else
      this.descriptionContent.textContent = '';
    this.descriptionPanel.classList.add('show');
  }

  @Bind
  public getSelectionPreview(index: number, value: number) {
    return super.getSelectionPreview(index, value);
  }

  @Bind
  private hideDescriptionPanel() {
    this.descriptionPanel.classList.remove('show');
  }

  protected async init() {
    await super.init();
    if(!this.editor) this.refresh();
    this.updateDocumentTitle();
    if(this.data?.description) this.showDescriptionPanel();
  }

  public repack<T extends OutputType>(type: T = 'blob' as T) {
    this.editor?.syncData();
    return super.repack(type);
  }
}
