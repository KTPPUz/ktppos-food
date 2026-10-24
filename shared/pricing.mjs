const round = value => Math.round((value + Number.EPSILON) * 100) / 100;

// A menu promotion applies to the branch's base price. Extras retain their full price.
export function menuPrice(menu, branchId) {
  const originalPrice = round(menu.overrides?.[branchId] ?? menu.price);
  const discount = menu.discount || {type:'none',value:0};
  const reduction = discount.type === 'percent' ? round(originalPrice * discount.value / 100)
    : discount.type === 'fixed' ? discount.value : 0;
  const discountAmount = round(Math.min(originalPrice, Math.max(0, reduction)));
  return {originalPrice,discountAmount,price:round(originalPrice-discountAmount)};
}

export function menuDiscountLabel(discount) {
  if(!discount || discount.type === 'none' || !discount.value)return '';
  return discount.type === 'percent' ? `ลด ${discount.value}%` : `ลด ${discount.value} บาท`;
}
