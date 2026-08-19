// shared/processing.js

function processOrder(order) {
  const items = order.items || [];

  const itemCount = items.reduce((sum, item) => sum + item.quantity, 0);

  const totalAmount = items.reduce(
    (sum, item) => sum + item.price * item.quantity,
    0
  );

  const averageItemPrice = items.length > 0
    ? totalAmount / items.length
    : 0;

  return {
    requestId: order.requestId,
    itemCount,
    totalAmount: Number(totalAmount.toFixed(2)),
    averageItemPrice: Number(averageItemPrice.toFixed(2)),
  };
}

module.exports = { processOrder };