export type MenuDiscount = {type:'none'|'percent'|'fixed';value:number};
export function menuPrice(menu:{price:number;overrides?:Record<string,number>;discount?:MenuDiscount},branchId?:string):{originalPrice:number;discountAmount:number;price:number};
export function menuDiscountLabel(discount?:MenuDiscount):string;
