const grpc = require('@grpc/grpc-js');
const protoLoader = require('@grpc/proto-loader');
const http = require('http');
const { processOrder } = require('../../shared/processing.js');

const PROTO_PATH = '../../proto/order.proto';
const CPU_STATS_PORT = 50052;

const packageDefinition = protoLoader.loadSync(PROTO_PATH);
const orderProto = grpc.loadPackageDefinition(packageDefinition);

function ProcessOrder(call, callback) {
  try {
    const result = processOrder(call.request);
    callback(null, result);
  } catch (err) {
    callback({
      code: grpc.status.INTERNAL,
      message: err.message,
    });
  }
}

const server = new grpc.Server();

server.addService(orderProto.OrderService.service, {
  ProcessOrder: ProcessOrder,
});

server.bindAsync(
  '0.0.0.0:50051',
  grpc.ServerCredentials.createInsecure(),
  (err, port) => {
    if (err) {
      console.error('Failed to bind gRPC server:', err);
      return;
    }
    console.log(`gRPC server listening on 0.0.0.0:${port}`);
  }
);

const statsServer = http.createServer((req, res) => {
  if (req.url === '/cpu') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ pid: process.pid, cpuUsage: process.cpuUsage() }));
  } else {
    res.writeHead(404);
    res.end();
  }
});

statsServer.listen(CPU_STATS_PORT, () => {
  console.log(`gRPC service CPU stats endpoint on http://localhost:${CPU_STATS_PORT}/cpu`);
});