'use client';

import { useState, useEffect } from 'react';

const DEFAULT_ORDER = {
  requestId: 'demo-001',
  items: [
    { productId: 'p1', price: 10, quantity: 2 },
    { productId: 'p2', price: 25, quantity: 1 },
  ],
};

const BENCHMARK = {
  json: { throughput: 3062.95, cpu: 107.34 },
  grpc: { throughput: 3686.12, cpu: 51.78 },
};

const throughputImprovement = (
  ((BENCHMARK.grpc.throughput - BENCHMARK.json.throughput) / BENCHMARK.json.throughput) * 100
).toFixed(1);
const cpuReduction = (
  ((BENCHMARK.json.cpu - BENCHMARK.grpc.cpu) / BENCHMARK.json.cpu) * 100
).toFixed(1);

const maxThroughput = Math.max(BENCHMARK.json.throughput, BENCHMARK.grpc.throughput);
const maxCpu = Math.max(BENCHMARK.json.cpu, BENCHMARK.grpc.cpu);

const GATEWAY_URL = 'http://localhost:5000';

export default function Home() {
  const [requestText, setRequestText] = useState(JSON.stringify(DEFAULT_ORDER, null, 2));
  const [jsonError, setJsonError] = useState(null);

  const [activeMode, setActiveMode] = useState(null); // 'json' | 'grpc' | null
  const [loading, setLoading] = useState(false);
  const [response, setResponse] = useState(null);
  const [requestError, setRequestError] = useState(null);

  const [health, setHealth] = useState(null); // { gateway, json, grpc } | 'unreachable' | null

  useEffect(() => {
    let cancelled = false;
    async function checkHealth() {
      try {
        const res = await fetch(`${GATEWAY_URL}/health`);
        const data = await res.json();
        if (!cancelled) setHealth(data);
      } catch (_) {
        if (!cancelled) setHealth('unreachable');
      }
    }
    checkHealth();
    const interval = setInterval(checkHealth, 8000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, []);

  function parsePayload() {
    try {
      const parsed = JSON.parse(requestText);
      setJsonError(null);
      return parsed;
    } catch (err) {
      setJsonError('Invalid JSON — ' + err.message);
      return null;
    }
  }

  async function runRequest(mode) {
    const payload = parsePayload();
    if (!payload) return;

    setLoading(true);
    setRequestError(null);
    setActiveMode(mode);
    setResponse(null);

    try {
      const res = await fetch(`${GATEWAY_URL}/gateway/process?mode=${mode}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const errBody = await res.json().catch(() => ({}));
        throw new Error(errBody.details || errBody.error || `Gateway returned ${res.status}`);
      }
      const data = await res.json();
      setResponse(data);
    } catch (err) {
      setRequestError(err.message);
    } finally {
      setLoading(false);
    }
  }

  const allUp = health && health !== 'unreachable' && health.gateway === 'up' && health.json === 'up' && health.grpc === 'up';

  return (
    <main className="min-h-screen bg-[#0a0e14] text-slate-100 px-5 py-14">
      <div className="max-w-[1080px] mx-auto space-y-10">

        {/* HEADER */}
        <header className="text-center space-y-4">
          <StatusBadge health={health} allUp={allUp} />
          <h1 className="text-4xl sm:text-5xl font-semibold tracking-tight text-slate-50">
            Zero-Copy Gateway
          </h1>
          <p className="text-slate-400 max-w-lg mx-auto text-[15px] leading-relaxed">
            Comparing text-based JSON and binary Protobuf serialization using identical business logic and workloads.
          </p>
        </header>

        {/* REQUEST FLOW */}
        <Card>
          <CardHeader title="Request Flow" subtitle="The active transport is highlighted; the other path stays muted." />
          <div className="flex flex-col items-center gap-2.5 text-[13px] py-2">
            <FlowNode label="CLIENT" />
            <Arrow pulse={loading} />
            <FlowNode label="GATEWAY" active={!!activeMode} />
            <Arrow pulse={loading} />
            <div className="flex gap-4 sm:gap-6">
              <FlowNode
                label="JSON / HTTP"
                sub=":4000"
                active={activeMode === 'json'}
                dimmed={activeMode === 'grpc'}
                color="amber"
              />
              <FlowNode
                label="Protobuf / gRPC"
                sub=":50051"
                active={activeMode === 'grpc'}
                dimmed={activeMode === 'json'}
                color="emerald"
              />
            </div>
            <Arrow pulse={loading} />
            <FlowNode label="processOrder()" sub="same logic for both" active={!!activeMode} />
          </div>
        </Card>

        {/* REQUEST PLAYGROUND */}
        <Card>
          <CardHeader title="Request Playground" subtitle="Edit the payload and send the same workload through either transport." />

          <textarea
            value={requestText}
            onChange={(e) => setRequestText(e.target.value)}
            rows={10}
            spellCheck={false}
            className="w-full font-mono text-[13px] leading-relaxed bg-[#060a10] border border-slate-800 rounded-lg p-4 text-slate-200 focus:outline-none focus:ring-1 focus:ring-emerald-500/60 focus:border-emerald-700/60 resize-y transition-colors"
          />
          {jsonError && (
            <p className="text-red-400 text-[13px] mt-2 flex items-center gap-1.5">
              <Dot color="red" /> {jsonError}
            </p>
          )}

          {/* PRIMARY ACTIONS — must stay directly above Live Result */}
          <div className="flex flex-col sm:flex-row gap-3 mt-5">
            <ActionButton
              label="Process via JSON / HTTP"
              loadingLabel="Sending via HTTP…"
              color="amber"
              loading={loading && activeMode === 'json'}
              disabled={loading}
              onClick={() => runRequest('json')}
            />
            <ActionButton
              label="Process via Protobuf / gRPC"
              loadingLabel="Sending via gRPC…"
              color="emerald"
              loading={loading && activeMode === 'grpc'}
              disabled={loading}
              onClick={() => runRequest('grpc')}
            />
          </div>
        </Card>

        {/* LIVE RESULT */}
        <Card accent={activeMode}>
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-[15px] font-semibold text-slate-100">Live Result</h2>
              <p className="text-xs text-slate-500 mt-0.5">Real response from the selected backend, via the gateway.</p>
            </div>
            {response && !requestError && (
              <span className="flex items-center gap-1.5 text-[12px] text-emerald-400 font-medium shrink-0">
                <Dot color="emerald" /> SUCCESS
              </span>
            )}
            {requestError && (
              <span className="flex items-center gap-1.5 text-[12px] text-red-400 font-medium shrink-0">
                <Dot color="red" /> FAILED
              </span>
            )}
          </div>

          {loading && (
            <div className="flex items-center gap-2.5 text-slate-400 text-sm py-4">
              <Spinner />
              Processing through {activeMode === 'json' ? 'JSON / HTTP' : 'Protobuf / gRPC'}…
            </div>
          )}

          {!loading && requestError && (
            <div className="bg-red-950/30 border border-red-900/60 rounded-lg p-4 text-red-300 text-sm">
              Request failed on the {activeMode === 'json' ? 'JSON / HTTP' : 'Protobuf / gRPC'} pipeline: {requestError}
              <div className="text-red-400/70 text-xs mt-1">Confirm the gateway and backend services are running.</div>
            </div>
          )}

          {!loading && !requestError && response && (
            <div className="grid grid-cols-2 gap-x-6 gap-y-4 text-sm">
              <ResultField label="Transport" value={response.transport} />
              <ResultField label="Request ID" value={response.result.requestId} />
              <ResultField label="Item Count" value={response.result.itemCount} />
              <ResultField label="Total Amount" value={`$${response.result.totalAmount}`} />
              <ResultField label="Avg Item Price" value={response.result.averageItemPrice} />
              <ResultField label="Response Time" value={`${response.elapsedMs} ms`} highlight />
            </div>
          )}

          {!loading && !requestError && !response && (
            <p className="text-slate-500 text-sm py-4">Run a request above to see the live backend response.</p>
          )}
        </Card>

        {/* VERIFIED BENCHMARK RESULTS */}
        <Card>
          <div className="mb-1">
            <h2 className="text-[15px] font-semibold text-slate-100">Measured Benchmark Results</h2>
          </div>
          <p className="text-xs text-slate-500 mb-1">
            Recorded from 5 repeated runs · 1000 requests/run · concurrency 50 · 100 items/request
          </p>
          <p className="text-[11px] text-slate-600 mb-6">
            These are measured results from the benchmark runner, not generated live by this page.
          </p>

          <div className="grid sm:grid-cols-2 gap-5 mb-6">
            <BenchCard label="JSON / HTTP" throughput={BENCHMARK.json.throughput} cpu={BENCHMARK.json.cpu} color="amber" />
            <BenchCard label="Protobuf / gRPC" throughput={BENCHMARK.grpc.throughput} cpu={BENCHMARK.grpc.cpu} color="emerald" />
          </div>

          <div className="space-y-4 mb-6">
            <BarRow label="Throughput" json={BENCHMARK.json.throughput} grpc={BENCHMARK.grpc.throughput} max={maxThroughput} unit=" req/s" />
            <BarRow label="CPU usage" json={BENCHMARK.json.cpu} grpc={BENCHMARK.grpc.cpu} max={maxCpu} unit="%" />
          </div>

          <div className="flex flex-wrap gap-3">
            <Metric label="Throughput" value={`+${throughputImprovement}%`} />
            <Metric label="CPU usage" value={`-${cpuReduction}%`} />
          </div>
        </Card>

        {/* TECHNICAL HONESTY */}
        <Card>
          <p className="text-slate-400 text-sm leading-relaxed">
            Both pipelines execute the exact same <code className="text-slate-300 bg-slate-800/60 px-1.5 py-0.5 rounded">processOrder()</code> business logic — the benchmark isolates the transport and serialization difference between JSON/HTTP and Protobuf/gRPC.
          </p>
          <p className="text-slate-600 text-xs leading-relaxed mt-3 border-t border-slate-800 pt-3">
            This prototype demonstrates the performance difference between text-based JSON and binary Protobuf pipelines. It does not implement literal zero-copy memory access.
          </p>
        </Card>

      </div>
    </main>
  );
}

/* ---------- Reusable pieces ---------- */

function Card({ children, accent }) {
  const ring = accent === 'json' ? 'ring-1 ring-amber-900/40' : accent === 'grpc' ? 'ring-1 ring-emerald-900/40' : '';
  return (
    <section className={`bg-gradient-to-b from-[#0d1219] to-[#0b0f16] rounded-xl p-6 border border-slate-800/80 shadow-lg shadow-black/20 ${ring} transition-shadow duration-300`}>
      {children}
    </section>
  );
}

function CardHeader({ title, subtitle }) {
  return (
    <div className="mb-4">
      <h2 className="text-[15px] font-semibold text-slate-100">{title}</h2>
      {subtitle && <p className="text-xs text-slate-500 mt-1">{subtitle}</p>}
    </div>
  );
}

function StatusBadge({ health, allUp }) {
  let color = 'bg-slate-500';
  let text = 'Checking services…';
  let pulse = 'animate-pulse';

  if (health === 'unreachable') {
    color = 'bg-red-500'; text = 'Gateway unreachable'; pulse = '';
  } else if (health && allUp) {
    color = 'bg-emerald-400'; text = 'All services live'; pulse = '';
  } else if (health) {
    color = 'bg-amber-400';
    text = `Gateway ${health.gateway} · JSON ${health.json} · gRPC ${health.grpc}`;
    pulse = '';
  }

  return (
    <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-slate-900/80 border border-slate-800 text-xs transition-colors">
      <span className={`w-1.5 h-1.5 rounded-full ${color} ${pulse}`} />
      <span className="text-slate-400">{text}</span>
    </div>
  );
}

function ActionButton({ label, loadingLabel, color, loading, disabled, onClick }) {
  const styles = color === 'amber'
    ? 'bg-amber-500 hover:bg-amber-400 active:bg-amber-500 text-slate-950'
    : 'bg-emerald-500 hover:bg-emerald-400 active:bg-emerald-500 text-slate-950';

  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`flex-1 py-3 rounded-lg font-semibold text-sm transition-all duration-150 disabled:opacity-40 disabled:cursor-not-allowed hover:shadow-md hover:-translate-y-[1px] active:translate-y-0 ${styles} flex items-center justify-center gap-2`}
    >
      {loading && <Spinner dark />}
      {loading ? loadingLabel : label}
    </button>
  );
}

function FlowNode({ label, sub, active, dimmed, color }) {
  const colorMap = {
    amber: active ? 'border-amber-500/70 bg-amber-950/30 text-amber-200' : 'border-slate-700 bg-slate-800/60 text-slate-300',
    emerald: active ? 'border-emerald-500/70 bg-emerald-950/30 text-emerald-200' : 'border-slate-700 bg-slate-800/60 text-slate-300',
  };
  const style = color
    ? colorMap[color]
    : active
      ? 'border-slate-500/70 bg-slate-800 text-slate-100'
      : 'border-slate-800 bg-slate-800/40 text-slate-400';

  return (
    <div className={`px-4 py-2 rounded-lg border text-center transition-all duration-300 ${style} ${dimmed ? 'opacity-35' : ''}`}>
      <div className="font-medium">{label}</div>
      {sub && <div className="text-[11px] text-slate-500 mt-0.5">{sub}</div>}
    </div>
  );
}

function Arrow({ pulse }) {
  return <div className={`text-slate-700 transition-colors ${pulse ? 'animate-pulse text-slate-500' : ''}`}>↓</div>;
}

function ResultField({ label, value, highlight }) {
  return (
    <div>
      <div className="text-slate-500 text-xs mb-0.5">{label}</div>
      <div className={`font-medium ${highlight ? 'text-emerald-400' : 'text-slate-200'}`}>{value}</div>
    </div>
  );
}

function BenchCard({ label, throughput, cpu, color }) {
  const border = color === 'amber' ? 'border-amber-900/50' : 'border-emerald-900/50';
  const text = color === 'amber' ? 'text-amber-400' : 'text-emerald-400';
  return (
    <div className={`rounded-lg bg-[#060a10] p-5 border ${border}`}>
      <div className={`${text} font-medium text-sm mb-3`}>{label}</div>
      <div className="text-2xl font-semibold text-slate-100">
        {throughput.toFixed(2)} <span className="text-sm font-normal text-slate-500">req/sec</span>
      </div>
      <div className="text-slate-400 text-sm mt-1">CPU: {cpu}%</div>
    </div>
  );
}

function BarRow({ label, json, grpc, max, unit }) {
  return (
    <div>
      <div className="text-xs text-slate-500 mb-2">{label}</div>
      <Bar label="JSON / HTTP" value={json} max={max} unit={unit} color="bg-amber-500" />
      <Bar label="Protobuf / gRPC" value={grpc} max={max} unit={unit} color="bg-emerald-500" />
    </div>
  );
}

function Bar({ label, value, max, unit, color }) {
  const pct = Math.max(6, (value / max) * 100);
  return (
    <div className="flex items-center gap-3 mb-2 text-xs">
      <div className="w-32 text-slate-400 shrink-0">{label}</div>
      <div className="flex-1 h-2 bg-slate-800 rounded-full overflow-hidden">
        <div className={`h-full ${color} rounded-full transition-all duration-500`} style={{ width: `${pct}%` }} />
      </div>
      <div className="w-20 text-right text-slate-400 shrink-0">{value.toFixed(2)}{unit}</div>
    </div>
  );
}

function Metric({ label, value }) {
  return (
    <div className="px-3.5 py-1.5 rounded-full bg-emerald-950/40 text-emerald-300 border border-emerald-800/60 text-sm">
      <span className="font-semibold">{value}</span> <span className="text-emerald-400/70">{label}</span>
    </div>
  );
}

function Dot({ color }) {
  const map = { red: 'bg-red-500', emerald: 'bg-emerald-400' };
  return <span className={`w-1.5 h-1.5 rounded-full ${map[color]}`} />;
}

function Spinner({ dark }) {
  return (
    <span
      className={`inline-block w-3.5 h-3.5 border-2 rounded-full animate-spin ${dark ? 'border-slate-950/30 border-t-slate-950' : 'border-slate-600 border-t-emerald-400'
        }`}
    />
  );
}