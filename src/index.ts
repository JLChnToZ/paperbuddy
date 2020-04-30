import { Buddy } from './buddy';
import './lang';
export default Buddy;
if((window as any).demo) {
  const container = document.body.appendChild(document.createElement('div'));
  new Buddy(container, (window as any).demo);
}