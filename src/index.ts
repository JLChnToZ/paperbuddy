import { Buddy } from './buddy';
new Buddy(document.body, {
  isEditor: true,
  canReset: true,
  canOpen: true,
  canSave: true,
  controlDocumentTitle: true,
});