import jQuery from 'jquery';
import 'jquery.fancytree';
import 'jquery.fancytree/dist/modules/jquery.fancytree.glyph';
import 'jquery.fancytree/dist/modules/jquery.fancytree.dnd5';
import 'jquery.fancytree/dist/modules/jquery.fancytree.edit';
import 'jquery.fancytree/dist/modules/jquery.fancytree.multi';
import 'jquery.fancytree/dist/modules/jquery.fancytree.filter';

import { EventEmitter } from 'events';
import JSZip from 'jszip';
import {
  Data,
  PartData,
  LayerData,
  EntryData,
  CategoryData,
} from './data-structs';
import { Tabs } from './tabs';
import { generateUniqueId, Bind, preventDefault, delay } from './utils';
import { LanguageDef } from './lang';
import { openFile } from './file-helper';

const defaultOptions: Fancytree.FancytreeOptions = {
  extensions: ['edit', 'dnd5', 'multi', 'glyph'],
  nodata: false,
  multi: {
    mode: 'sameParent',
  },
  glyph: {
    preset: 'material',
    map: {
      checkbox: 'md-check_box_outline_blank',
      checkboxSelected: 'md-check_box',
      checkboxUnknown: 'md-indeterminate_check_box',
      dragHelper: 'md-play_arrow',
      dropMarker: 'md-arrow-forward',
      error: 'md-warning',
      expanderClosed: 'md-chevron_right',
      expanderLazy: 'md-last_page',
      expanderOpen: 'md-expand_more',
      loading: 'autorenew fancytree-helper-spin',
      nodata: 'md-info',
      noExpander: '',
      radio: 'md-radio_button_unchecked',
      radioSelected: 'md-radio_button_checked',
      doc: 'md-insert_drive_file',
      docOpen: 'md-insert_drive_file',
      folder: 'md-folder',
      folderOpen: 'md-folder_open',
    },
  },
};

const glyphMaps: { [key: string]: string } = {
  _addClass: 'material-icons md-18',
  category: 'md-list',
  entry: 'md-style',
  part: 'md-layers',
  layer: 'md-layers',
};

for(const key in glyphMaps) {
  if(key === '_addClass')
    continue;
  glyphMaps[key] = `${glyphMaps._addClass} ${glyphMaps[key]}`;
}

export class Editor extends EventEmitter {
  public isEditMode = true;
  public data?: Data;
  private relatedLayerNodes = new Map<string, Set<string>>();

  private editorTabs: Tabs;
  private editorRoot: HTMLElement;
  public playerRoot: HTMLElement;
  private titleEdit: HTMLInputElement;
  private descriptionEdit: HTMLTextAreaElement;
  private widthEdit: HTMLInputElement;
  private heightEdit: HTMLInputElement;
  private layerTree: Fancytree.Fancytree;
  private optTree: Fancytree.Fancytree;
  private pack?: JSZip;

  private deleteLayerButton: HTMLButtonElement;
  private deleteOptButton: HTMLButtonElement;

  constructor(
    private root: HTMLElement,
    private loadPackPromise: Promise<JSZip> | JSZip,
    private images: Map<string, CanvasImageSource>,
    private loadDataPromise: Promise<Data>,
    private lang: LanguageDef,
  ) {
    super();

    const editorTabsRoot = this.root.appendChild(document.createElement('div'));
    editorTabsRoot.addEventListener('submit', preventDefault, true);
    this.editorTabs = new Tabs(editorTabsRoot);
    this.editorRoot = this.editorTabs.contentOf(this.editorTabs.addTab(lang.edit))!;
    this.editorRoot.className = 'editor';
    this.playerRoot = this.editorTabs.contentOf(this.editorTabs.addTab(lang.play))!;
    this.editorTabs.on('select', this.onEditTabSelect);

    const leftPanel = this.editorRoot.appendChild(document.createElement('div'));
    leftPanel.className = 'vertical-divider';
    const metaEditRoot = leftPanel.appendChild(document.createElement('form'));
    {
      const field = metaEditRoot.appendChild(document.createElement('div'));
      field.className = 'field';
      const label = field.appendChild(document.createElement('label'));
      label.appendChild(document.createTextNode(lang.title));
      label.htmlFor = generateUniqueId();
      this.titleEdit = field.appendChild(document.createElement('input'));
      this.titleEdit.id = label.htmlFor;
      this.titleEdit.addEventListener('input', this.onTitleChange);
    }
    {
      const field = metaEditRoot.appendChild(document.createElement('div'));
      field.className = 'field';
      const label = field.appendChild(document.createElement('label'));
      label.appendChild(document.createTextNode(this.lang.description));
      label.htmlFor = generateUniqueId();
      this.descriptionEdit = field.appendChild(document.createElement('textarea'));
      this.descriptionEdit.id = label.htmlFor;
      this.descriptionEdit.addEventListener('input', this.onDescriptionChange);
    }
    {
      const field = metaEditRoot.appendChild(document.createElement('div'));
      field.className = 'field';
      const label = field.appendChild(document.createElement('label'));
      label.appendChild(document.createTextNode(lang.width));
      label.htmlFor = generateUniqueId();
      this.widthEdit = field.appendChild(document.createElement('input'));
      this.widthEdit.id = label.htmlFor;
      this.widthEdit.type = 'number';
      this.widthEdit.min = '128';
      this.widthEdit.max = '1024';
      this.widthEdit.addEventListener('input', this.onWidthChange);
    }
    {
      const field = metaEditRoot.appendChild(document.createElement('div'));
      field.className = 'field';
      const label = field.appendChild(document.createElement('label'));
      label.appendChild(document.createTextNode(lang.height));
      label.htmlFor = generateUniqueId();
      this.heightEdit = field.appendChild(document.createElement('input'));
      this.heightEdit.id = label.htmlFor;
      this.heightEdit.type = 'number';
      this.heightEdit.min = '128';
      this.heightEdit.max = '1024';
      this.heightEdit.addEventListener('input', this.onHeightChange);
    }
    {
      const buttons = leftPanel.appendChild(document.createElement('div'));
      buttons.className = 'buttons';
      {
        const caption = buttons.appendChild(document.createElement('span'));
        caption.className = 'caption';
        caption.textContent = lang.layers;
      }
      {
        const addLayerButton = buttons.appendChild(document.createElement('button'));
        const icon = addLayerButton.appendChild(document.createElement('i'));
        icon.className = `${glyphMaps._addClass} md-add`;
        addLayerButton.addEventListener('click', this.onClickAddLayer);
      }
      {
        this.deleteLayerButton = buttons.appendChild(document.createElement('button'));
        const icon = this.deleteLayerButton.appendChild(document.createElement('i'));
        icon.className = `${glyphMaps._addClass} md-delete`;
        this.deleteLayerButton.addEventListener('click', this.onClickDeleteLayer);
        this.deleteLayerButton.disabled = true;
      }
    }
    {
      const container = leftPanel.appendChild(document.createElement('div'));
      container.className = 'tree';
      const $container = jQuery(container);
      $container.fancytree(Object.assign({
        source: [],
        edit: {
          triggerStart: ['clickActive', 'f2', 'dblclick', 'mac+enter'],
          beforeEdit: this.layerBeforeEdit,
          save: this.layerRenameSave,
        },
        dnd5: {
          multiSource: true,
          dragStart: alwaysTrue,
          dragEnter: layerDragEnter,
          dragDrop: this.layerDrop,
        },
        select: this.onLayerSelectChange,
        blurTree: onBlurTree,
      } as Fancytree.FancytreeOptions, defaultOptions));
      this.layerTree = $container.fancytree('getTree');
    }
    const rightPanel = this.editorRoot.appendChild(document.createElement('div'));
    rightPanel.className = 'vertical-divider';
    {
      const buttons = rightPanel.appendChild(document.createElement('div'));
      buttons.className = 'buttons';
      {
        const caption = buttons.appendChild(document.createElement('span'));
        caption.className = 'caption';
        caption.textContent = lang.options;
      }
      {
        const button = buttons.appendChild(document.createElement('button'));
        const icon = button.appendChild(document.createElement('i'));
        icon.className = `${glyphMaps._addClass} md-add`;
        button.addEventListener('click', this.onClickAddOpt);
      }
      {
        this.deleteOptButton = buttons.appendChild(document.createElement('button'));
        const icon = this.deleteOptButton.appendChild(document.createElement('i'));
        icon.className = `${glyphMaps._addClass} md-delete`;
        this.deleteOptButton.addEventListener('click', this.onClickDeleteOpt);
        this.deleteOptButton.disabled = true;
      }
    }
    {
      const container = rightPanel.appendChild(document.createElement('div'));
      container.className = 'tree';
      const $container = jQuery(container);
      $container.fancytree(Object.assign({
        source: [],
        edit: {
          triggerStart: ['clickActive', 'f2', 'dblclick', 'mac+enter'],
          beforeEdit: optBeforeEdit,
          save: optRenameSave,
        },
        dnd5: {
          multiSource: true,
          dragStart: alwaysTrue,
          dragEnter: optDragEnter,
          dragDrop: this.optDrop,
        },
        select: this.onOptSelectChange,
        blurTree: onBlurTree,
      } as Fancytree.FancytreeOptions, defaultOptions));
      this.optTree = $container.fancytree('getTree');
    }
    this.waitForDataLoad();
  }

  public reset(
    loadPackPromise: Promise<JSZip> | JSZip,
    loadDataPromise: Promise<Data>,
  ) {
    this.editorTabs.selectTab(0);
    this.loadPackPromise = loadPackPromise;
    this.loadDataPromise = loadDataPromise;
    this.waitForDataLoad();
  }

  public getSelectedLayers() {
    const selection = this.layerTree.getSelectedNodes();
    return selection?.length && selection.map(x => (x.data.refData as LayerData).fileName) || [];
  }

  public async handleFiles(files: File | FileList | ArrayLike<File>, addTo?: Fancytree.FancytreeNode, mode?: string) {
    if(files instanceof File)
      return this.handleFile(files, addTo, mode);
    const p: Promise<void>[] = [];
    for(let i = 0; i < files.length; i++)
      p.push(this.handleFile(files[i], addTo, mode));
    await Promise.all(p);
    this.syncLayerData();
  }

  private async handleFile(file: File, addTo?: Fancytree.FancytreeNode, mode?: string) {
    if(!file.type.startsWith('image/'))
      return;
    let { name } = file;
    if(this.pack!.file(name)) {
      const extOffset = name.lastIndexOf('.');
      const nameWithoutExt = name.substr(0, extOffset);
      const extName = name.substr(extOffset);
      let acc = 0;
      do name = `${nameWithoutExt}-${++acc}${extName}`;
      while(this.pack!.file(name));
    }
    this.images.set(name, await createImageBitmap(file));
    this.pack!.file(name, file);
    (addTo || this.layerTree.getRootNode()).addNode({
      title: name.substr(0, name.lastIndexOf('.')),
      icon: glyphMaps.layer,
      data: {
        nodeType: 'layer',
        refData: {
          fileName: name,
        } as LayerData,
      },
    }, mode);
  }

  public syncData(layers = true, categories = true) {
    if(!this.data)
      return;
    if(layers)
      this.data.layers = this.layerTree.getRootNode().children?.map(node2Layer) || [];
    if(categories)
      this.data.categories = this.optTree.getRootNode().children?.map(node2Entry) || [];
  }

  private async waitForDataLoad() {
    this.pack = await this.loadPackPromise;
    this.data = await this.loadDataPromise;
    this.titleEdit.value = this.data.title || '';
    this.descriptionEdit.value = this.data.description || '';
    this.widthEdit.value = this.data.width.toString();
    this.heightEdit.value = this.data.height.toString();
    this.optTree.reload(this.data.categories.map(this.cat2Node, this));
    this.layerTree.reload(this.data.layers.map(layer2Node));
  }

  @Bind
  private onEditTabSelect(index: number) {
    switch(index) {
      case 0: {
        this.isEditMode = true;
        break;
      }
      case 1: {
        this.isEditMode = false;
        this.syncData();
        this.emit('refresh');
        break;
      }
    }
    this.emit('composite', true, this.isEditMode && this.getSelectedLayers());
  }

  @Bind
  private onTitleChange(e: Event) {
    if(this.data) this.data.title = this.titleEdit.value;
  }

  @Bind
  private onDescriptionChange(e: Event) {
    if(this.data) this.data.description = this.descriptionEdit.value;
  }

  @Bind
  private onWidthChange(e: Event) {
    if(this.data) this.data.width = parseInt(this.widthEdit.value);
    this.emit('refresh');
  }

  @Bind
  private onHeightChange(e: Event) {
    if(this.data) this.data.height = parseInt(this.heightEdit.value);
    this.emit('refresh');
  }

  @Bind
  private async onClickAddLayer(e: Event) {
    this.handleFiles(await openFile({
      multiple: true,
      accept: 'image/*'
    }));
  }

  @Bind
  private onClickDeleteLayer(e: Event) {
    const selection = this.layerTree.getSelectedNodes();
    if(selection?.length)
      for(const node of selection) {
        const relatedNodes = this.relatedLayerNodes.get(node.title);
        this.relatedLayerNodes.delete(node.title);
        if(relatedNodes)
          for(const key of relatedNodes)
            this.optTree.getNodeByKey(key)?.remove();
        node.remove();
        this.pack!.remove((node.data as any).refData.fileName);
      }
    this.syncLayerData();
    this.onLayerSelectChange();
  }

  @Bind
  private onLayerSelectChange() {
    this.deleteLayerButton.disabled = !this.layerTree.getSelectedNodes(true).length;
    this.emit('composite', true, this.isEditMode);
  }

  @Bind
  private syncLayerData() {
    this.syncData(true, false);
    this.emit('composite', true, this.isEditMode);
  }

  @Bind
  private layerDrop(targetNode: Fancytree.FancytreeNode, data: any) {
    if(data.files?.length) {
      this.handleFiles(data.files, targetNode, data.hitMode)
    } else if(data.otherNodeList) {
      if(data.hitMode === 'after')
        data.otherNodeList.reverse();
      for(const node of data.otherNodeList)
        if(node?.data?.nodeType === 'layer')
          node.moveTo(targetNode, data.hitMode);
    } else if(data.otherNode?.data?.nodeType === 'layer')
      data.otherNode?.moveTo(targetNode, data.hitMode);
    this.syncLayerData();
  }

  private layerBeforeEdit(_: any, data: any) {
    return data.node.data?.nodeType === 'layer' || false;
  }

  @Bind
  private layerRenameSave(_: any, data: any) {
    console.log('Rename saveing');
    try {
      const newValue = data.input.val().trim();
      if(!newValue)
        throw new TypeError('Invalid Name');
      const layerData = data.node.data.refData as LayerData;
      const newName = newValue + layerData.fileName.substr(layerData.fileName.lastIndexOf('.'));
      if(this.pack!.file(newName))
        throw new TypeError('File already exists');
      this.renameFile(layerData.fileName, newName);
      layerData.fileName = newName;
      let relatedNodes = this.relatedLayerNodes.get(data.orgTitle);
      if(relatedNodes) {
        this.relatedLayerNodes.delete(data.orgTitle);
        this.relatedLayerNodes.set(newValue, relatedNodes);
        for(const key of relatedNodes) {
          const node = this.optTree.getNodeByKey(key);
          if(node) {
            node.setTitle(newValue);
            (node.data as any).refData.layer = newName;
          }
        }
      }
      return true;
    } catch {
      return false;
    } finally {
      this.syncLayerData();
    }
  }

  @Bind
  private onClickAddOpt(e: Event) {
    let selection: (Fancytree.FancytreeNode | undefined)[] = this.optTree.getSelectedNodes();
    if(!selection || !selection.length) selection = [undefined];
    switch((selection[0]?.data as any)?.nodeType) {
      case 'part':
        selection[0]!.editCreateNode('after', {
          title: this.lang.newcat,
          icon: glyphMaps.entry,
          data: {
            nodeType: 'entry',
            refData: {
              label: this.lang.newcat,
            } as EntryData,
          },
        } as Fancytree.NodeData);
        break;
      case 'category':
      case 'entry':
        selection[0]!.editCreateNode('child', {
          title: this.lang.newcat,
          icon: glyphMaps.entry,
          data: {
            nodeType: 'entry',
            refData: {
              label: this.lang.newcat,
            } as EntryData,
          },
        } as Fancytree.NodeData);
        break;
      default:
        this.optTree.getRootNode().editCreateNode('child', {
          title: this.lang.newcat,
          icon: glyphMaps.category,
          data: {
            nodeType: 'category',
            refData: {
              label: this.lang.newcat,
            } as CategoryData,
          },
        });
        break;
    }
  }

  @Bind
  private onClickDeleteOpt(e: Event) {
    const selection = this.optTree.getSelectedNodes();
    if(selection?.length)
      for(const node of selection)
        node.remove();
    this.onOptSelectChange();
  }

  @Bind
  private optDrop(targetNode: Fancytree.FancytreeNode, data: any) {
    if(data.otherNodeList) {
      if(data.hitMode === 'after')
        data.otherNodeList.reverse();
      for(const node of data.otherNodeList)
        if(node?.data?.nodeType === 'layer')
          node.copyTo(targetNode, data.hitMode, this.optDropCopy);
        else
          node.moveTo(targetNode, data.hitMode);
    } else if(data.otherNode?.data?.nodeType === 'layer')
      data.otherNode.copyTo(targetNode, data.hitMode, this.optDropCopy);
    else
      data.otherNode?.moveTo(targetNode, data.hitMode);
  }
  
  @Bind
  private optDropCopy(node: Fancytree.NodeData) {
    node.key = generateUniqueId();
    const oldData: any = node.data;
    node.data = {
      nodeType: 'part',
      refData: {
        layer: oldData.refData.fileName,
      } as PartData,
    };
    let relatedNodeSet = this.relatedLayerNodes.get(node.title);
    if(!relatedNodeSet) {
      relatedNodeSet = new Set();
      this.relatedLayerNodes.set(node.title, relatedNodeSet);
    }
    relatedNodeSet.add(node.key);
  }

  @Bind
  private onOptSelectChange() {
    this.deleteOptButton.disabled = !this.optTree.getSelectedNodes(true).length;
  }

  private async renameFile(oldName: string, newName: string) {
    this.images.set(newName, this.images.get(oldName)!);
    this.images.delete(oldName);
    const buf = await this.pack!.file(oldName).async('arraybuffer');
    this.pack!.file(newName, buf);
  }

  private cat2Node(cat: EntryData) {
    return {
      title: cat.label,
      children: cat.entries?.map(this.entry2Node, this),
      nodeType: 'category',
      refData: cat,
      icon: glyphMaps.category,
    };
  }

  private entry2Node(cat: EntryData) {
    let children: any[] | undefined =
      cat.parts?.map(this.part2Node, this);
    const entries: any = cat.entries?.map(this.entry2Node, this);
    if(entries) {
      if(children)
        children = children.concat(entries);
      else
        children = entries;
    }
    return {
      title: cat.label,
      icon: glyphMaps.entry,
      children,
      data: {
        nodeType: 'entry',
        refData: cat,
      },
    };
  }

  private part2Node(part: PartData) {
    const partNode = {
      key: generateUniqueId(),
      title: part.layer.substr(0, part.layer.lastIndexOf('.')),
      icon: glyphMaps.part,
      data: {
        nodeType: 'part',
        refData: part,
      },
    };
    let relatedNodeSet = this.relatedLayerNodes.get(partNode.title);
    if(!relatedNodeSet) {
      relatedNodeSet = new Set();
      this.relatedLayerNodes.set(partNode.title, relatedNodeSet);
    }
    relatedNodeSet.add(partNode.key);
    return partNode;
  }
}

function alwaysTrue() {
  return true;
}

async function onBlurTree(e: Event, data: Fancytree.EventData) {
  await delay(100);
  (data.tree as any).selectAll(false);
  data.tree.activateKey(false);
}

function optDragEnter(targetNode: Fancytree.FancytreeNode, data: any) {
  if(data.otherNodeList) {
    let containsAny: boolean | string[] = false;
    for(const node of data.otherNodeList) {
      switch(node.data?.nodeType) {
        case 'category':
          if(targetNode.isRootNode())
            containsAny = true;
          else if((targetNode.data as any).nodeType === 'entry')
            containsAny = ['before', 'after'];
          break;
        case 'part':
        case 'entry':
          if((targetNode.data as any).nodeType === 'entry')
            containsAny = true;
          break;
        case 'layer':
          if((targetNode.data as any).nodeType === 'entry') {
            data.dropEffect = 'copy';
            data.isMove = false;
            containsAny = ['over'];
          }
          break;
      }
      if(containsAny)
        break;
    }
    return containsAny;
  } else switch(data.otherNode?.data?.nodeType) {
    case 'category':
      return targetNode.isRootNode();
    case 'part':
    case 'entry':
      return (targetNode.data as any).nodeType === 'entry';
    case 'layer':
      if((targetNode.data as any).nodeType === 'entry') {
        data.dropEffect = 'copy';
        data.isMove = false;
        return ['over'];
      }
      break;
  }
  return false;
}

function optBeforeEdit(_: any, data: any) {
  return data.node.data?.nodeType !== 'part' || false;
}

function optRenameSave(_: any, data: any) {
  switch(data.node.data?.nodeType) {
    case 'parts': return false;
    case 'category':
    case 'entry':
      data.node.data.refData.label = data.input.val();
      return true;
  }
}

function layerDragEnter(targetNode: Fancytree.FancytreeNode, data: any) {
  if(data.files?.length)
    data.dropEffect = 'copy';
  else {
    if(data.otherNodeList) {
      let containsAny = false;
      for(const node of data.otherNodeList) {
        switch(node.data?.nodeType) {
          case 'layer':
            containsAny = true;
            break;
        }
        if(containsAny)
          break;
      }
      if(!containsAny)
        return false;
    } else switch(data.otherNode?.data?.nodeType) {
      case 'category':
      case 'part':
      case 'entry':
        return false;
    }
  }
  return ['before', 'after'];
}


function layer2Node(layer: LayerData) {
  return {
    title: layer.fileName.substring(0, layer.fileName.length - 4),
    icon: glyphMaps.layer,
    data: {
      nodeType: 'layer',
      refData: layer,
    },
  };
}

function node2Layer(node: Fancytree.NodeData): LayerData {
  return (node.data as any).refData;
}

function node2Entry(node: Fancytree.NodeData): EntryData {
  let { children } = node;
  let parts: PartData[] | undefined;
  let entries: EntryData[] | undefined;
  if(children?.length)
    for(const child of children) {
      const data = (child.data as any).refData as PartData & EntryData;
      if(data.layer) {
        if(!parts) parts = [];
        parts.push(data);
      } else {
        if(!entries) entries = [];
        entries.push(node2Entry(child));
      }
    }
  return Object.assign((node.data as any).refData, {
    parts, entries, label: node.title,
  } as EntryData);
}
