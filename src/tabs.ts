import { EventEmitter } from 'events';

export class Tabs extends EventEmitter {
  private root: Element;
  public selectedIndex: number = -1;
  private tabHeaders: HTMLDivElement[] = [];
  private tabs = new Map<HTMLDivElement, HTMLDivElement>();
  private tabContainer: HTMLDivElement;
  private contentContainer: HTMLDivElement;

  constructor(root: HTMLElement | string) {
    super();
    this.root = typeof root === 'string' ? document.querySelector(root)! : root;
    this.root.classList.add('tabs-container');
    const tabOverflowContainer = this.root.appendChild(document.createElement('div'));
    tabOverflowContainer.className = 'tabs';
    this.tabContainer = tabOverflowContainer.appendChild(document.createElement('div'));
    this.contentContainer = this.root.appendChild(document.createElement('div'));
    this.contentContainer.className = 'contents';
  }

  public addTab(header: string | Node, content?: Node) {
    const headerNode = this.tabContainer.appendChild(document.createElement('div'));
    headerNode.className = 'tab inactive';
    const ref = this;
    if(typeof header === 'string')
      headerNode.appendChild(document.createTextNode(header));
    else
      headerNode.appendChild(header);
    headerNode.tabIndex = 0;
    headerNode.addEventListener('click', function(e) {
      e.preventDefault();
      ref.selectTab(this);
    });
    const contentNode = this.contentContainer.appendChild(document.createElement('div'));
    contentNode.className = 'inactive';
    if(content)
      contentNode.appendChild(content);
    this.tabs.set(headerNode, contentNode);
    this.tabHeaders.push(headerNode);
    if(this.selectedIndex < 0)
      this.selectTab(0);
    return headerNode;
  }

  public indexOf(headerNode: HTMLDivElement) {
    return this.tabHeaders.indexOf(headerNode);
  }

  public headerOf(index: number) {
    return this.tabHeaders[index];
  }

  public contentOf(indexOrHeader: number | HTMLDivElement) {
    return this.tabs.get(
      typeof indexOrHeader === 'number' ?
      this.tabHeaders[indexOrHeader] :
      indexOrHeader,
    );
  }

  public show(index: number) {
    this.tabHeaders[index]?.classList.remove('hidden');
    this.emit('show', index);
  }

  public hide(index: number) {
    const header = this.tabHeaders[index];
    if(!header) return;
    header.classList.add('hidden');
    this.emit('hide', index);
    if(this.selectedIndex === index)
      this.selectTab(this.selectedIndex + (this.selectedIndex < this.tabs.size - 2 ? 1 : -1));
  }

  public destroyTab(indexOrHeader: number | HTMLDivElement) {
    let selectedHeaderNode: HTMLDivElement;
    let index: number;
    if(typeof indexOrHeader === 'number') {
      selectedHeaderNode = this.tabHeaders[indexOrHeader];
      index = indexOrHeader;
    } else {
      selectedHeaderNode = indexOrHeader;
      index = this.tabHeaders.indexOf(indexOrHeader);
    }
    const contentNode = this.tabs.get(selectedHeaderNode);
    this.tabs.delete(selectedHeaderNode);
    if(contentNode) contentNode.remove();
    selectedHeaderNode.remove();
    this.tabHeaders.splice(index, 1);
    this.emit('destroy', index);
    if(index === this.selectedIndex)
      this.selectTab(Math.max(index, this.tabHeaders.length - 1));
  }

  public selectTab(indexOrHeader: number | HTMLDivElement) {
    let selectedHeaderNode: HTMLDivElement | undefined;
    let newIndex = this.selectedIndex;
    if(typeof indexOrHeader === 'number') {
      selectedHeaderNode = this.tabHeaders[indexOrHeader];
      newIndex = indexOrHeader;
    } else {
      selectedHeaderNode = indexOrHeader;
      newIndex = this.tabHeaders.indexOf(indexOrHeader);
    }
    if(selectedHeaderNode?.classList.contains('hidden'))
      return;
    for(const [headerNode, contentNode] of this.tabs) {
      if(headerNode === selectedHeaderNode) {
        headerNode.classList.remove('inactive');
        headerNode.classList.add('active');
        contentNode.classList.remove('inactive');
        contentNode.classList.add('active');
      } else {
        headerNode.classList.remove('active');
        headerNode.classList.add('inactive');
        contentNode.classList.remove('active');
        contentNode.classList.add('inactive');
      }
    }
    this.selectedIndex = newIndex;
    this.emit('select', this.selectedIndex);
  }
}
