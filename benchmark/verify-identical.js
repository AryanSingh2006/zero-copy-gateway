// Proves both services use the SAME shared/processing.js logic
// on the SAME sample payload. Not part of the benchmark — just a demo aid.

const grpc = require('@grpc/grpc-js');
const protoLoader = require('@grpc/proto-loader');

const PROTO_PATH = '../proto/order.proto';

const sampleOrder = {
  requestId: 'verify-001',
  items: [
    { productId: 'p1', price: 10, quantity: 2 },
    { productId: 'p2', price: 25, quantity: 1 },
  ],
};

async function callJson() {
  const res = await fetch('http://localhost:4000/process', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(sampleOrder),
  });
  return res.json();
}

function callGrpc() {
  const packageDefinition = protoLoader.loadSync(PROTO_PATH);
  const orderProto = grpc.loadPackageDefinition(packageDefinition);
  const client = new orderProto.OrderService('localhost:50051', grpc.credentials.createInsecure());

  return new Promise((resolve, reject) => {
    client.ProcessOrder(sampleOrder, (err, response) => {
      client.close();
      if (err) reject(err);
      else resolve(response);
    });
  });
}

async function main() {
  console.log('Sample payload (identical for both):');
  console.log(JSON.stringify(sampleOrder, null, 2));
  console.log('\nBoth services call the SAME function: shared/processing.js -> processOrder()\n');

  const jsonResult = await callJson();
  const grpcResult = await callGrpc();

  console.log('JSON  result:', jsonResult);
  console.log('gRPC  result:', grpcResult);

  const identical =
    jsonResult.itemCount === grpcResult.itemCount &&
    jsonResult.totalAmount === grpcResult.totalAmount &&
    jsonResult.averageItemPrice === grpcResult.averageItemPrice;

  console.log(`\nResults identical: ${identical ? 'YES ✔' : 'NO ✘ (investigate!)'}`);
}

main();