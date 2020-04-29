import { EventEmitter } from 'events';
import { Tabs } from './tabs';
import { Bind, EMPTY_GIF } from './utils';
import { EntryData } from './data-structs';

interface Option {
  root: HTMLDivElement;
  display: HTMLImageElement;
  caption: HTMLDivElement;
}

export class Choose extends EventEmitter {
  public value = 0;
  public index = -1;
  private header: HTMLDivElement;
  public root: HTMLDivElement;
  private visible: boolean;
  private children: Option[] = [];
  private indexMap = new Map<HTMLElement, number>();

  constructor(
    private tab: Tabs,
    private getEntryPreview: (index: number, value: number) => Promise<Blob | null>,
  ) {
    super();
    tab
    .addListener('select', this.onDisplay)
    .addListener('hide', this.onHidden);
    this.header = tab.addTab(' ');
    this.root = tab.contentOf(this.header)!;
    this.root.className = 'options';
    this.visible = tab.selectedIndex === tab.indexOf(this.header);
  }

  public show(display = true) {
    const index = this.tab.indexOf(this.header);
    if(display)
      this.tab.show(index);
    else
      this.tab.hide(index);
  }

  public update(entry: EntryData, index: number) {
    if(!entry.entries) return;
    this.header.textContent = entry.label;
    this.index = index;
    const { entries } = entry;
    for(let i = 0; i < entries.length; i++) {
      if(this.children[i]) {
        const opt = this.children[i];
        opt.caption.textContent = entries[i].label;
        opt.display.src = EMPTY_GIF;
        this.indexMap.set(opt.root, i);
        if(this.value === i)
          opt.root.classList.add('selected');
        else
          opt.root.classList.remove('selected');
      } else {
        const root = this.root.appendChild(document.createElement('div'));
        root.className = this.value === i ? 'option selected' : 'option';
        root.tabIndex = 0;
        root.addEventListener('click', this.onSelected);
        this.indexMap.set(root, i);
        const display = root.appendChild(document.createElement('img'));
        display.src = EMPTY_GIF;
        const caption = root.appendChild(document.createElement('div'));
        caption.className = 'caption';
        caption.textContent = entries[i].label;
        this.children[i] = { root, display, caption };
      }
    }
    const removeCount = this.children.length - entries.length;
    if(removeCount > 0)
      this.children.splice(this.children.length - removeCount, removeCount).forEach(this.disposeOption, this);
    if(this.visible)
      this.onDisplayHandler(true);
  }

  @Bind
  private onDisplay(index: number) {
    if(this.tab.contentOf(index) === this.root)
      return this.onDisplayHandler();
    if(this.root)
      return this.onHiddenHandler();
  }

  @Bind
  private onHidden(index: number) {
    if(this.tab.contentOf(index) === this.root)
      return this.onHiddenHandler();
  }

  private onDisplayHandler(force?: boolean) {
    if(this.visible && !force) return;
    this.visible = true;
    this.children.forEach(this.requestPreviewHandler, this);
  }

  private async requestPreviewHandler({ display }: Option, index: number) {
    try {
      const originalSrc = display.src;
      const blob = await this.getEntryPreview(this.index, index);
      display.src = blob ? URL.createObjectURL(blob) : EMPTY_GIF;
      if(originalSrc.startsWith('blob:'))
        URL.revokeObjectURL(originalSrc);
    } catch {}
  }

  private onHiddenHandler() {
    this.visible = false;
  }

  @Bind
  private onSelected(e: Event) {
    this.value = this.indexMap.get(e.currentTarget as HTMLElement) || 0;
    for(const [option, index] of this.indexMap) {
      if(this.value === index)
        option.classList.add('selected');
      else
        option.classList.remove('selected');
    }
    this.emit('select', this.index, this.value);
  }

  public dispose() {
    this.removeAllListeners();
    this.tab
    .removeListener('select', this.onDisplay)
    .removeListener('show', this.onDisplay)
    .removeListener('hide', this.onHidden)
    .destroyTab(this.header);
  }

  private disposeOption(option: Option) {
    this.indexMap.delete(option.root);
    option.root.remove();
  }
}