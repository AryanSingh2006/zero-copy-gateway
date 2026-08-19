const grpc = require('@grpc/grpc-js');
const protoLoader = require('@grpc/proto-loader');

// ---- Configuration ----
const TOTAL_REQUESTS = 1000;
const CONCURRENCY = 50;
const ITEMS_PER_REQUEST = 100;
const REPEAT_RUNS = 5;

const JSON_URL = 'http://localhost:4000/process';
const JSON_CPU_URL = 'http://localhost:4000/cpu';
const GRPC_ADDRESS = 'localhost:50051';
const GRPC_CPU_URL = 'http://localhost:50052/cpu';
const PROTO_PATH = '../proto/order.proto';

function buildPayload() {
  const items = [];
  for (let i = 0; i < ITEMS_PER_REQUEST; i++) {
    items.push({
      productId: `p${i}`,
      price: 10 + (i % 5),
      quantity: 1 + (i % 3),
    });
  }
  return { requestId: 'bench-req', items };
}

async function runLoad(total, concurrency, sendOneFn) {
  let sent = 0;
  let success = 0;
  let failed = 0;

  async function worker() {
    while (sent < total) {
      sent++;
      try {
        await sendOneFn();
        success++;
      } catch (err) {
        failed++;
      }
    }
  }

  const start = Date.now();

  const workers = [];
  for (let i = 0; i < concurrency; i++) {
    workers.push(worker());
  }

  await Promise.all(workers);
  const elapsedSeconds = (Date.now() - start) / 1000;

  return { success, failed, elapsedSeconds };
}

function sendJsonRequest(payload) {
  return fetch(JSON_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  }).then((res) => {
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return res.json();
  });
}

const packageDefinition = protoLoader.loadSync(PROTO_PATH);
const orderProto = grpc.loadPackageDefinition(packageDefinition);
const grpcClient = new orderProto.OrderService(
  GRPC_ADDRESS,
  grpc.credentials.createInsecure()
);

function sendGrpcRequest(payload) {
  return new Promise((resolve, reject) => {
    grpcClient.ProcessOrder(payload, (err, response) => {
      if (err) reject(err);
      else resolve(response);
    });
  });
}

async function getCpuSnapshot(url) {
  const res = await fetch(url);
  const data = await res.json();
  return data.cpuUsage;
}

function cpuPercent(before, after, elapsedSeconds) {
  const userDeltaSec = (after.user - before.user) / 1e6;
  const systemDeltaSec = (after.system - before.system) / 1e6;
  const totalCpuSeconds = userDeltaSec + systemDeltaSec;
  return (totalCpuSeconds / elapsedSeconds) * 100;
}

async function benchmarkWithCpu(cpuUrl, sendOneFn) {
  const payload = buildPayload();

  const cpuBefore = await getCpuSnapshot(cpuUrl);
  const result = await runLoad(TOTAL_REQUESTS, CONCURRENCY, () => sendOneFn(payload));
  const cpuAfter = await getCpuSnapshot(cpuUrl);

  const cpuPct = cpuPercent(cpuBefore, cpuAfter, result.elapsedSeconds);

  return { ...result, cpuPercent: cpuPct };
}

function reportRun(name, runNumber, r) {
  const throughput = r.success / r.elapsedSeconds;
  console.log(`\n[Run ${runNumber}] ${name}`);
  console.log(`  Success: ${r.success}`);
  console.log(`  Failed:  ${r.failed}`);
  console.log(`  Time:    ${r.elapsedSeconds.toFixed(3)}s`);
  console.log(`  Throughput: ${throughput.toFixed(2)} req/sec`);
  console.log(`  Service CPU: ${r.cpuPercent.toFixed(2)}%`);
  if (r.failed > 0) {
    console.log(`  WARNING: ${r.failed} failed requests in this run`);
  }
}

// ---- Phase 10: aggregate stats over repeated runs ----
function aggregate(runs) {
  const throughputs = runs.map((r) => r.success / r.elapsedSeconds);
  const cpuValues = runs.map((r) => r.cpuPercent);
  const totalFailed = runs.reduce((sum, r) => sum + r.failed, 0);

  return {
    avgThroughput: throughputs.reduce((a, b) => a + b, 0) / throughputs.length,
    minThroughput: Math.min(...throughputs),
    maxThroughput: Math.max(...throughputs),
    avgCpu: cpuValues.reduce((a, b) => a + b, 0) / cpuValues.length,
    minCpu: Math.min(...cpuValues),
    maxCpu: Math.max(...cpuValues),
    totalFailed,
  };
}

function reportAggregate(name, agg) {
  console.log(`\n${name} (over ${REPEAT_RUNS} runs)`);
  console.log(`  Throughput: avg ${agg.avgThroughput.toFixed(2)}  min ${agg.minThroughput.toFixed(2)}  max ${agg.maxThroughput.toFixed(2)} req/sec`);
  console.log(`  CPU:        avg ${agg.avgCpu.toFixed(2)}%  min ${agg.minCpu.toFixed(2)}%  max ${agg.maxCpu.toFixed(2)}%`);
  console.log(`  Failures:   ${agg.totalFailed}`);
}

function printFinalSummary(jsonAgg, grpcAgg) {
  const throughputImprovement = ((grpcAgg.avgThroughput - jsonAgg.avgThroughput) / jsonAgg.avgThroughput) * 100;
  const cpuReduction = ((jsonAgg.avgCpu - grpcAgg.avgCpu) / jsonAgg.avgCpu) * 100;

  console.log('\n==================================================');
  console.log('           FINAL COMPARISON SUMMARY');
  console.log('==================================================');
  console.log(`Workload: ${TOTAL_REQUESTS} requests, concurrency ${CONCURRENCY}, ${ITEMS_PER_REQUEST} items/request, ${REPEAT_RUNS} runs\n`);

  console.log(`JSON / HTTP        avg ${jsonAgg.avgThroughput.toFixed(2)} req/sec   avg CPU ${jsonAgg.avgCpu.toFixed(2)}%`);
  console.log(`Protobuf / gRPC    avg ${grpcAgg.avgThroughput.toFixed(2)} req/sec   avg CPU ${grpcAgg.avgCpu.toFixed(2)}%\n`);

  console.log(`Throughput improvement (gRPC vs JSON): ${throughputImprovement >= 0 ? '+' : ''}${throughputImprovement.toFixed(1)}%`);
  console.log(`CPU reduction (gRPC vs JSON):           ${cpuReduction >= 0 ? '-' : '+'}${Math.abs(cpuReduction).toFixed(1)}%`);
  console.log(`Total failures: JSON ${jsonAgg.totalFailed}, gRPC ${grpcAgg.totalFailed}`);
  console.log('==================================================\n');
}

async function main() {
  console.log(
    `Config: ${TOTAL_REQUESTS} requests, concurrency ${CONCURRENCY}, ${ITEMS_PER_REQUEST} items/request, ${REPEAT_RUNS} repeated runs\n`
  );

  const jsonRuns = [];
  const grpcRuns = [];

  for (let i = 1; i <= REPEAT_RUNS; i++) {
    console.log(`\n--- Repetition ${i}/${REPEAT_RUNS} ---`);

    console.log('Running JSON benchmark...');
    const jsonResult = await benchmarkWithCpu(
      JSON_CPU_URL,
      sendJsonRequest
    );

    reportRun('JSON / HTTP', i, jsonResult);
    jsonRuns.push(jsonResult);

    console.log('Running gRPC benchmark...');
    const grpcResult = await benchmarkWithCpu(
      GRPC_CPU_URL,
      sendGrpcRequest
    );

    reportRun('Protobuf / gRPC', i, grpcResult);
    grpcRuns.push(grpcResult);
  }

  // Calculate aggregate results after all 5 runs
  const jsonAgg = aggregate(jsonRuns);
  const grpcAgg = aggregate(grpcRuns);

  console.log('\n===== AGGREGATED RESULTS =====');

  reportAggregate('JSON / HTTP', jsonAgg);
  reportAggregate('Protobuf / gRPC', grpcAgg);

  // Phase A: clean final comparison
  printFinalSummary(jsonAgg, grpcAgg);

  grpcClient.close();
}

main();
