// `status` remains the bill status for receipt/report compatibility.
// A settled bill keeps its outstanding preparation in `kitchenStatus`.
export function kitchenStatus(order) {
  return order.status === 'paid' ? (order.kitchenStatus ?? 'served') : order.status;
}
export function needsService(order) {
  return ['pending', 'cooking', 'ready'].includes(kitchenStatus(order));
}
export function serviceOpen(order) {
  return !['paid', 'refunded', 'cancelled', 'merged', 'split'].includes(order.status)
    || (order.status === 'paid' && needsService(order));
}
