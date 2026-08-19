const grpc = require('@grpc/grpc-js');
const protoLoader = require('@grpc/proto-loader');

const path = require('path');

const PROTO_PATH = path.join(__dirname, '../../proto/order.proto');

const packageDefinition = protoLoader.loadSync(PROTO_PATH);
const orderProto = grpc.loadPackageDefinition(packageDefinition);

const client = new orderProto.OrderService(
  'localhost:50051',
  grpc.credentials.createInsecure()
);

const testOrder = {
  requestId: 'req-001',
  items: [
    { productId: 'p1', price: 10, quantity: 2 },
    { productId: 'p2', price: 25, quantity: 1 },
  ],
};

client.ProcessOrder(testOrder, (err, response) => {
  if (err) {
    console.error('gRPC call failed:', err.message);
    return;
  }
  console.log('Response from gRPC server:');
  console.log(response);
});