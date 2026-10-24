import {menuPrice} from '../shared/pricing.mjs';
import type {MenuItem} from './types';
const baht=(value:number)=>new Intl.NumberFormat('th-TH',{style:'currency',currency:'THB',minimumFractionDigits:0,maximumFractionDigits:2}).format(value);
export default function MenuPrice({menu,branch}:{menu:MenuItem;branch:string}) {
  const price=menuPrice(menu,branch);
  return <span className="menu-price">{price.discountAmount>0&&<del>{baht(price.originalPrice)}</del>}<strong>{baht(price.price)}</strong></span>;
}
