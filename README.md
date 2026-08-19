# Zero-Copy Gateway — Round 1 Prototype

## Problem
Hackathon 2026, PS-5: CPU overhead from repeated JSON serialization/deserialization
between backend/microservice components.

## What this demonstrates
A head-to-head comparison of a text-based JSON/HTTP pipeline vs a binary
Protobuf/gRPC pipeline, executing **identical business logic** on **identical workloads**.

## Architecture
                Same Workload
         1000 requests, concurrency 50, 100 items/request
                      │
          ┌───────────┴───────────┐
          ▼                       ▼
    JSON / HTTP              Protobuf / gRPC
    port 4000                port 50051
          │                       │
          ▼                       ▼
    processOrder()          processOrder()
          │                       │
          ▼                       ▼
    JSON response            Proto response


Both services call the exact same function: `shared/processing.js -> processOrder()`.
Only the transport/serialization layer differs.

## Pipelines

**JSON:** JS object → `JSON.stringify` → HTTP → `JSON.parse` → JS object → `processOrder()` → `JSON.stringify` → HTTP response

**gRPC:** JS object → Protobuf binary encode → HTTP/2 → Protobuf decode → JS object → `processOrder()` → Protobuf encode → HTTP/2 response

## Why the business logic is identical
Both services import `shared/processing.js`. No duplicated implementation exists —
this guarantees any measured difference comes from the transport/serialization
layer, not from different computation.

## Benchmark methodology
- 1000 requests, concurrency 50, 100 items/request, 5 repeated runs
- JSON and gRPC run **sequentially**, never concurrently, to avoid CPU contention between them
- Per-run CPU measured via each service's own `process.cpuUsage()`, exposed over a `/cpu` endpoint
- Same deterministic payload used for both pipelines every run

## Verified results

| Metric              | JSON / HTTP     | Protobuf / gRPC |
|---------------------|-----------------|------------------|
| Avg throughput      | 3062.95 req/sec | 3686.12 req/sec |
| Min / Max throughput| 2087.68 / 3921.57 | 2525.25 / 4405.29 |
| Avg CPU             | 107.34%         | 51.78%           |
| Failures            | 0               | 0                |

Throughput improvement (gRPC vs JSON): **+20.3%**
CPU reduction (gRPC vs JSON): **-51.8%**

## Honest limitation
This prototype does **not** implement literal zero-copy (e.g. FlatBuffers/Cap'n Proto,
which allow reading data in place without a decode step). `@grpc/grpc-js` +
`@grpc/proto-loader` fully decode Protobuf into JS objects, same as JSON parsing does
conceptually. The technically accurate claim is:

> This prototype demonstrates the measurable performance difference between
> JSON/text serialization and Protobuf/binary serialization, using identical
> business logic and identical workloads.