const express = require('express');
const grpc = require('@grpc/grpc-js');
const protoLoader = require('@grpc/proto-loader');

const app = express();
app.use(express.json());
app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.sendStatus(200);
  next();
});

const PORT = 5000;
const JSON_SERVICE_URL = 'http://localhost:4000/process';
const GRPC_ADDRESS = 'localhost:50051';
const PROTO_PATH = '../../proto/order.proto';

const packageDefinition = protoLoader.loadSync(PROTO_PATH);
const orderProto = grpc.loadPackageDefinition(packageDefinition);
const grpcClient = new orderProto.OrderService(
  GRPC_ADDRESS,
  grpc.credentials.createInsecure()
);

function callGrpc(payload) {
  return new Promise((resolve, reject) => {
    grpcClient.ProcessOrder(payload, (err, response) => {
      if (err) reject(err);
      else resolve(response);
    });
  });
}

async function callJson(payload) {
  const res = await fetch(JSON_SERVICE_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error(`JSON service returned ${res.status}`);
  return res.json();
}

// Health check: pings both backends so the frontend can show real status
app.get('/health', async (req, res) => {
  const status = { gateway: 'up', json: 'down', grpc: 'down' };

  try {
    const r = await fetch('http://localhost:4000/cpu');
    if (r.ok) status.json = 'up';
  } catch (_) {}

  try {
    await new Promise((resolve, reject) => {
      grpcClient.ProcessOrder(
        { requestId: 'healthcheck', items: [] },
        (err) => (err ? reject(err) : resolve())
      );
    });
    status.grpc = 'up';
  } catch (_) {}

  res.json(status);
});

app.post('/gateway/process', async (req, res) => {
  const mode = req.query.mode;
  const payload = req.body;

  if (mode !== 'json' && mode !== 'grpc') {
    return res.status(400).json({ error: "mode must be 'json' or 'grpc'" });
  }

  const start = Date.now();
  try {
    const result = mode === 'json' ? await callJson(payload) : await callGrpc(payload);
    const elapsedMs = Date.now() - start;

    res.json({
      mode,
      transport: mode === 'json' ? 'HTTP / JSON' : 'gRPC / Protobuf',
      result,
      elapsedMs,
    });
  } catch (err) {
    res.status(500).json({ error: 'Processing failed', details: err.message });
  }
});

app.listen(PORT, () => {
  console.log(`Gateway listening on http://localhost:${PORT}`);
});