import { Buddy } from './buddy';
import './lang';
new Buddy(document.body, {
  isEditor: true,
  canReset: true,
  canOpen: true,
  canSave: true,
  controlDocumentTitle: true,
});