# Demo Flow (~3–5 minutes)

## 1. Start services (3 terminals)
```powershell
cd services/json-service; node server.js
cd services/grpc-service; node server.js
cd services/gateway; node server.js
```

## 2. Start frontend
```powershell
npm run dev
```
Open http://localhost:3000

## 3. Narrate
- "Both backends run the exact same processOrder() function — only transport differs."
- Click "Process via JSON / HTTP" → show result + response time.
- Click "Process via Protobuf / gRPC" → show result + response time.
- Point out identical result values, different transport path highlighted.

## 4. Benchmark section
- Scroll to "Verified Benchmark Results."
- Explain: 1000 requests, 5 repeated runs, same workload, sequential to avoid CPU contention.
- Point out throughput +20.3% and CPU -51.8% for gRPC.

## 5. Close with the honest claim
"This isn't literal zero-copy — it's a fair, measured comparison of binary vs text
serialization overhead, using shared business logic."

## Why the comparison is fair
- Same payload, same request count, same concurrency
- Same machine, sequential execution (no CPU contention between the two runs)
- Identical business logic via shared/processing.js