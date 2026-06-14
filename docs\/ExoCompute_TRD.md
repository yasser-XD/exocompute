# ExoCompute — Technical Requirements Document

**Version:** 1.0.0
**Type:** Hackathon MVP (24-hour build)
**Paired with:** ExoCompute PRD v1.0.0
**Stack:** Node.js 20+ · Express 4 · Socket.io 4 · Transformers.js 3 · WebGPU API · Twilio WhatsApp Sandbox · ngrok

---

## 1. Overview

This document defines the technical implementation requirements for ExoCompute. It covers runtime environments, dependency versions, server implementation, client-side inference pipeline, WebSocket protocol, data models, API contracts, security constraints, and browser compatibility targets.

Developers should read this alongside the PRD. The PRD defines *what* to build; this document defines *how* to build it.

---

## 2. Runtime & Environment Requirements

### 2.1 Server

| Requirement | Specification |
|---|---|
| Runtime | Node.js `>=20.0.0` (LTS) |
| Package manager | npm `>=10.0.0` |
| Process manager | Direct `node server.js` — no PM2 needed for MVP |
| Port | `3000` (configurable via `process.env.PORT`) |
| Host binding | `0.0.0.0` to allow LAN access from worker devices |
| Environment file | `.env` loaded via `dotenv` at startup |

### 2.2 Client (Worker / Orchestrator Browser)

| Requirement | Specification |
|---|---|
| Browser | Chrome 113+ or Edge 113+ (WebGPU support) |
| Fallback browser | Any modern browser with WASM support (Firefox 117+, Safari 16.4+) |
| JavaScript mode | ES Modules (`type="module"`) |
| WebGPU API | `navigator.gpu` — detected at runtime, not assumed |
| WASM threads | `SharedArrayBuffer` requires COOP/COEP headers (see §6.3) |
| Minimum RAM | 2GB available (model loading + inference) |

---

## 3. Dependency Manifest

### 3.1 Server Dependencies

```json
{
  "dependencies": {
    "express": "^4.18.2",
    "socket.io": "^4.7.2",
    "body-parser": "^1.20.2",
    "dotenv": "^16.3.1",
    "uuid": "^9.0.0"
  }
}
```

### 3.2 Client Dependencies (CDN — no bundler)

```html
<!-- Socket.io client — must match server version -->
<script src="/socket.io/socket.io.js"></script>

<!-- Transformers.js — ESM import in worker.html -->
<script type="module">
  import { pipeline, env } from 'https://cdn.jsdelivr.net/npm/@xenova/transformers@3';
</script>
```

> **Version lock:** Pin Transformers.js to `@3` (not `@latest`) to prevent breaking changes mid-demo.

### 3.3 External Tools

| Tool | Version | Purpose |
|---|---|---|
| ngrok | Latest stable | HTTPS tunnel for Twilio webhook |
| Twilio CLI (optional) | Latest | Local webhook testing without ngrok |

---

## 4. Server Implementation

### 4.1 Entry Point — `server.js`

```
Responsibilities:
  - Initialize Express app
  - Attach Socket.io to HTTP server
  - Mount webhook route
  - Serve static files from /public
  - Manage in-memory node registry
  - Handle all Socket.io event emission logic
  - Apply COOP/COEP headers for SharedArrayBuffer
```

**Required COOP/COEP headers (applied globally):**
```javascript
app.use((req, res, next) => {
  res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
  res.setHeader('Cross-Origin-Embedder-Policy', 'require-corp');
  next();
});
```

> These headers are mandatory for `SharedArrayBuffer`, which Transformers.js requires for multi-threaded WASM inference.

### 4.2 In-Memory Node Registry

The server maintains a live registry of connected worker nodes. No database is required for the MVP.

```javascript
// Node registry shape
const nodeRegistry = new Map();
// Key: socket.id
// Value: { nodeId, socketId, ip, connectedAt, tasksCompleted, totalEarnings }
```

**Lifecycle:**
- Entry created on `connection` event
- Entry updated on `task:complete` receipt
- Entry removed on `disconnect` event
- Registry snapshot emitted in every `stats:update` broadcast

### 4.3 Task Queue

```javascript
// Task queue shape
const taskQueue = [];
// Each entry: { taskId, prompt, from, dispatchedAt, status: 'pending'|'in-flight'|'complete' }
```

**Dispatch strategy for MVP:** Broadcast — all connected worker nodes receive every task simultaneously. First `task:complete` response wins; subsequent responses for the same `taskId` are discarded.

```javascript
// Server-side deduplication
const completedTasks = new Set(); // stores taskId strings

io.on('task:complete', ({ taskId, ...payload }) => {
  if (completedTasks.has(taskId)) return; // drop duplicate
  completedTasks.add(taskId);
  // process result...
});
```

### 4.4 Webhook Route — `routes/webhook.js`

```
POST /whatsapp-webhook

Request format: application/x-www-form-urlencoded
Required fields:
  - Body    (string) — the user's text prompt
  - From    (string) — E.164 WhatsApp number e.g. "whatsapp:+91XXXXXXXXXX"

Ignored fields:
  - Any message where Body matches /^join\s+\S+$/i (sandbox subscription)

Response:
  - Content-Type: text/xml
  - Status: 200
  - Body: valid TwiML <Response><Message>...</Message></Response>

Side effects:
  - Generates a UUID task ID
  - Pushes task to taskQueue
  - Emits task:dispatch to all connected Socket.io workers
  - Emits stats:update to orchestrator room
```

**Sandbox keyword filter:**
```javascript
const SANDBOX_PATTERN = /^join\s+\S+$/i;
if (SANDBOX_PATTERN.test(body.trim())) {
  return res.type('text/xml').send('<Response></Response>');
}
```

### 4.5 Socket.io Room Structure

| Room | Members | Purpose |
|---|---|---|
| `orchestrator` | `orchestrator.html` tabs only | Receives all system-wide stats and logs |
| `workers` | All `worker.html` tabs | Receives task dispatches |
| `worker:<nodeId>` | Single worker tab | Receives per-node earnings updates |

Workers join rooms on connection by emitting a `register` event with a `role` field.

---

## 5. WebSocket Protocol

### 5.1 Full Event Reference

#### Client → Server

| Event | Emitter | Payload | Description |
|---|---|---|---|
| `register` | Worker / Orchestrator | `{ role: 'worker'|'orchestrator' }` | Declare role on connect, join appropriate rooms |
| `task:complete` | Worker | `{ taskId, nodeId, result, label, score, durationMs, tokenCount }` | Inference result |

#### Server → Client

| Event | Room | Payload | Description |
|---|---|---|---|
| `task:dispatch` | `workers` | `{ taskId, prompt, from, timestamp }` | New job broadcast |
| `node:connected` | `orchestrator` | `{ nodeId, ip, connectedAt, totalNodes }` | Worker joined mesh |
| `node:disconnected` | `orchestrator` | `{ nodeId, totalNodes }` | Worker left mesh |
| `task:dispatched` | `orchestrator` | `{ taskId, prompt, from, nodeCount, timestamp }` | Log entry — task sent |
| `task:complete` | `orchestrator` | `{ taskId, nodeId, result, durationMs, tokenCount, winnerEarnings, platformCut }` | Log entry — result in |
| `earnings:update` | `worker:<nodeId>` | `{ nodeId, delta, sessionTotal, platformCut }` | Per-node payout |
| `stats:update` | `orchestrator` | `{ connectedNodes, activeQueue, totalTokens, platformTotal, nodes[] }` | Dashboard refresh |

### 5.2 Payload Type Definitions

```typescript
// task:dispatch
interface TaskDispatch {
  taskId: string;        // UUID v4
  prompt: string;        // Raw user text from WhatsApp Body
  from: string;          // WhatsApp E.164 sender e.g. "whatsapp:+91..."
  timestamp: number;     // Unix ms (Date.now())
}

// task:complete (Worker → Server)
interface TaskComplete {
  taskId: string;
  nodeId: string;        // socket.id of completing worker
  result: string;        // Raw model output text
  label: string;         // e.g. "POSITIVE" | "NEGATIVE"
  score: number;         // Confidence 0.0–1.0
  durationMs: number;    // performance.now() delta
  tokenCount: number;    // Simulated: Math.ceil(prompt.split(' ').length * 1.3)
}

// earnings:update (Server → Worker)
interface EarningsUpdate {
  nodeId: string;
  delta: number;         // Earnings for this single task (4 decimal places)
  sessionTotal: number;  // Cumulative session earnings
  platformCut: number;   // Platform's 15% cut for this task
}

// stats:update (Server → Orchestrator)
interface StatsUpdate {
  connectedNodes: number;
  activeQueue: number;
  totalTokens: number;
  platformTotal: number;
  nodes: Array<{ nodeId: string; ip: string; tasksCompleted: number; earnings: number }>;
}
```

---

## 6. Client-Side Inference Pipeline

### 6.1 Transformers.js Initialization

```javascript
import { pipeline, env } from 'https://cdn.jsdelivr.net/npm/@xenova/transformers@3';

// Performance tuning
env.backends.onnx.wasm.numThreads = 4;  // Match device CPU thread count
env.useBrowserCache = true;              // Persist model across refreshes
env.allowLocalModels = false;            // Force CDN fetch

// Model load (runs once on page load)
const pipe = await pipeline(
  'sentiment-analysis',
  'Xenova/distilbert-base-uncased-finetuned-sst-2-english',
  {
    device: (await navigator.gpu?.requestAdapter()) ? 'webgpu' : 'wasm',
    progress_callback: (progress) => updateProgressBar(progress)
  }
);
```

### 6.2 WebGPU Detection

```javascript
async function detectBackend() {
  if (!navigator.gpu) return 'wasm';
  try {
    const adapter = await navigator.gpu.requestAdapter();
    if (!adapter) return 'wasm';
    const device = await adapter.requestDevice();
    device.destroy();
    return 'webgpu';
  } catch {
    return 'wasm';
  }
}
```

The detected backend should be displayed on the Lender Dashboard status area (e.g. `⚡ COMPUTING · WebGPU` vs `⚡ COMPUTING · WASM`).

### 6.3 Inference Execution Handler

```javascript
socket.on('task:dispatch', async ({ taskId, prompt }) => {
  setBadge('COMPUTING');
  const t0 = performance.now();

  const output = await pipe(prompt);

  const durationMs = Math.round(performance.now() - t0);
  const tokenCount = Math.ceil(prompt.split(/\s+/).length * 1.3); // approximation

  socket.emit('task:complete', {
    taskId,
    nodeId: socket.id,
    result: output[0].label + ' (' + output[0].score.toFixed(4) + ')',
    label: output[0].label,
    score: output[0].score,
    durationMs,
    tokenCount
  });

  setBadge('IDLE');
});
```

### 6.4 Token Count Approximation

Transformers.js does not expose a public token count from the inference output. Use this deterministic approximation for the MVP:

```
tokenCount = Math.ceil(wordCount × 1.3)
```

Where `wordCount = prompt.trim().split(/\s+/).length`. This reflects the average English word-to-subword-token expansion ratio for distilbert's WordPiece tokenizer and is sufficient for demo-accuracy financial calculations.

---

## 7. Financial Calculation Engine

All financial logic runs client-side on the worker node and is verified server-side before broadcasting.

### 7.1 Constants

```javascript
const PRICE_PER_MILLION_TOKENS = 0.80;  // USD
const LENDER_SHARE = 0.85;              // 85%
const PLATFORM_SHARE = 0.15;            // 15%
const LENDER_RATE = PRICE_PER_MILLION_TOKENS * LENDER_SHARE;   // $0.68
const PLATFORM_RATE = PRICE_PER_MILLION_TOKENS * PLATFORM_SHARE; // $0.12
```

### 7.2 Per-Task Earnings

```javascript
function calcTaskEarnings(tokenCount) {
  const lenderEarnings = (tokenCount / 1_000_000) * LENDER_RATE;
  const platformEarnings = (tokenCount / 1_000_000) * PLATFORM_RATE;
  return {
    lender: parseFloat(lenderEarnings.toFixed(8)),
    platform: parseFloat(platformEarnings.toFixed(8))
  };
}
```

Display to 4 decimal places in the UI: `lenderEarnings.toFixed(4)`.

### 7.3 Live TPS and Revenue/hr

```javascript
// Maintain a rolling window of the last N tasks
const taskWindow = []; // each entry: { durationMs, tokenCount }
const WINDOW_SIZE = 10;

function updateMetrics(durationMs, tokenCount) {
  taskWindow.push({ durationMs, tokenCount });
  if (taskWindow.length > WINDOW_SIZE) taskWindow.shift();

  const avgDurationSec = taskWindow.reduce((a, t) => a + t.durationMs, 0)
    / taskWindow.length / 1000;
  const avgTokens = taskWindow.reduce((a, t) => a + t.tokenCount, 0)
    / taskWindow.length;

  const tps = avgTokens / avgDurationSec;
  const tokensPerHour = tps * 3600;
  const revenuePerHour = (tokensPerHour / 1_000_000) * LENDER_RATE;

  return { tps, tokensPerHour, revenuePerHour };
}
```

---

## 8. API Contracts

### 8.1 `POST /whatsapp-webhook`

**Request:**
```
Content-Type: application/x-www-form-urlencoded

Body=Hello+this+is+a+test+prompt&From=whatsapp%3A%2B91XXXXXXXXXX&...
```

**Response (200 OK):**
```xml
Content-Type: text/xml

<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Message>Your compute request has been dispatched to the mesh.</Message>
</Response>
```

**Response (200 OK, sandbox join — no TwiML body):**
```xml
<?xml version="1.0" encoding="UTF-8"?>
<Response></Response>
```

**Error response (500):**
```xml
<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Message>Internal error. Please try again.</Message>
</Response>
```

> Always return HTTP 200 to Twilio — non-200 responses cause Twilio to retry the webhook.

### 8.2 `GET /` → `orchestrator.html`

Serves the orchestrator dashboard. Requires no auth for MVP.

### 8.3 `GET /worker` → `worker.html`

Serves the lender worker node page. Requires no auth for MVP.

---

## 9. Security Constraints

These are minimum viable constraints appropriate for a 24-hour hackathon demo, not production hardening.

| Constraint | Implementation |
|---|---|
| Twilio request validation | Optional for MVP — implement `validateRequest` from `twilio` SDK if time permits |
| XSS — log stream | Sanitize `prompt` text before injecting into DOM: `element.textContent = prompt` not `innerHTML` |
| Prompt length | Truncate incoming `Body` to 500 characters before processing |
| Socket flood protection | Ignore `task:complete` events from unregistered socket IDs |
| ngrok auth | Use ngrok's free HTTPS tunnel; do not expose on public internet beyond demo session |
| `.env` | Never commit `.env` to version control; add to `.gitignore` |

**`.gitignore` minimum:**
```
node_modules/
.env
ngrok
*.log
```

---

## 10. Browser Compatibility & CORS

### 10.1 Target Browsers

| Browser | Version | WebGPU | WASM Threads | Status |
|---|---|---|---|---|
| Chrome | 113+ | Yes | Yes | Primary target |
| Edge | 113+ | Yes | Yes | Supported |
| Firefox | 117+ | No | Yes (with flag) | WASM fallback |
| Safari | 16.4+ | No | No | WASM single-thread |
| Chrome Android | 113+ | Partial | Yes | QR onboarding target |

### 10.2 Required HTTP Headers for WASM Threads

`SharedArrayBuffer` (required for Transformers.js multi-thread WASM) is blocked unless the page is cross-origin isolated. Set these on every response:

```
Cross-Origin-Opener-Policy: same-origin
Cross-Origin-Embedder-Policy: require-corp
```

> ngrok passes these headers through without modification. Verify in DevTools → Network → Response Headers after tunneling.

### 10.3 CORS

No CORS configuration needed — all clients connect to the same origin (`localhost:3000` or the ngrok URL). Socket.io CORS config:

```javascript
const io = new Server(server, {
  cors: {
    origin: '*',  // acceptable for hackathon — lock down for production
    methods: ['GET', 'POST']
  }
});
```

---

## 11. Data Flow Sequence

```
WhatsApp User
    │
    │  POST /whatsapp-webhook (Twilio → ngrok → Express)
    ▼
server.js — webhook handler
    │  1. Parse Body, From
    │  2. Filter sandbox keyword
    │  3. Generate taskId (UUID v4)
    │  4. Push to taskQueue
    │  5. Return TwiML 200
    │
    ├──► emit task:dispatch → room: 'workers'
    │       │
    │       ▼
    │   worker.html (all connected tabs simultaneously)
    │       │  1. Receive task:dispatch
    │       │  2. setBadge('COMPUTING')
    │       │  3. Run Transformers.js inference
    │       │  4. Measure durationMs via performance.now()
    │       │  5. Approximate tokenCount
    │       │  6. emit task:complete → server
    │       │
    │    ◄──┘
    │
    ├──► On first task:complete received for this taskId:
    │       │  1. Mark task complete, add to completedTasks Set
    │       │  2. Calculate lenderEarnings + platformCut
    │       │  3. Update nodeRegistry entry
    │       │
    │       ├──► emit earnings:update → room: 'worker:<nodeId>'
    │       ├──► emit task:complete  → room: 'orchestrator' (log entry)
    │       └──► emit stats:update   → room: 'orchestrator' (dashboard refresh)
    │
    └── Subsequent task:complete for same taskId → discarded silently
```

---

## 12. Performance Targets

| Metric | Target | Notes |
|---|---|---|
| Webhook → Socket.io dispatch latency | < 100ms | Pure Node.js in-process, no I/O |
| distilbert inference (WASM, 4 threads) | < 3000ms | On a modern laptop CPU |
| distilbert inference (WebGPU) | < 800ms | Chrome 113+, dedicated GPU |
| Model load time (cold, 20MB) | < 8s on fast WiFi | Show progress bar |
| Model load time (warm, from cache) | < 1s | Pre-cache before demo |
| Socket.io message round-trip (LAN) | < 20ms | Negligible on localhost |
| Orchestrator dashboard render fps | 60fps | No heavy DOM thrashing — use `textContent` updates |

---

## 13. Error Handling Requirements

| Scenario | Required Behavior |
|---|---|
| Twilio sends malformed body | Return TwiML 200 with generic message, log error server-side |
| Worker tab loses WebSocket connection | Badge → `OFFLINE`; Socket.io auto-reconnect with exponential backoff |
| Transformers.js model load fails | Display error in worker UI; do not crash — allow retry on next task |
| WebGPU unavailable | Silent fallback to WASM; update backend label in UI |
| No workers connected when task arrives | Queue task; dispatch when first worker connects (within 30s timeout) |
| Task times out (no complete within 30s) | Remove from activeQueue; log timeout in orchestrator feed |
| ngrok tunnel drops | Server continues running; webhook calls fail at Twilio — restart ngrok and update URL |

---

## 14. Configuration Reference

All configurable values should be defined as constants at the top of their respective files, not scattered inline.

### `server.js` constants
```javascript
const PORT = process.env.PORT || 3000;
const TASK_TIMEOUT_MS = 30_000;
const MAX_PROMPT_LENGTH = 500;
```

### `worker.html` constants
```javascript
const MODEL_ID = 'Xenova/distilbert-base-uncased-finetuned-sst-2-english';
const TRANSFORMERS_VERSION = '3';
const METRICS_WINDOW_SIZE = 10;
```

### `financial.js` (shared module or inline)
```javascript
const PRICE_PER_MILLION_TOKENS = 0.80;
const LENDER_SHARE_PCT = 0.85;
const PLATFORM_SHARE_PCT = 0.15;
const DISPLAY_DECIMAL_PLACES = 4;
```

---

## 15. Testing Checklist

### Unit-level
- [ ] Sandbox keyword regex correctly ignores `join sandbox-name` and variants
- [ ] `calcTaskEarnings(tokenCount)` returns correct split for known inputs
- [ ] `updateMetrics()` rolling window evicts oldest entry after `WINDOW_SIZE`
- [ ] Duplicate `task:complete` for same `taskId` is silently dropped

### Integration-level
- [ ] `curl -X POST localhost:3000/whatsapp-webhook -d "Body=test&From=whatsapp:+910000000000"` → TwiML 200 + socket event visible in browser
- [ ] Two worker tabs both receive `task:dispatch` for the same task
- [ ] Only one `earnings:update` fires per task (deduplication confirmed)
- [ ] Worker disconnect removes node from orchestrator stats grid
- [ ] Orchestrator refreshes `connectedNodes` count correctly on join and leave

### End-to-end (with ngrok + Twilio)
- [ ] WhatsApp message → TwiML response received in WhatsApp within 3s
- [ ] Orchestrator log shows inbound + dispatch + complete entries
- [ ] Lender wallet counter increments after task completes
- [ ] Revenue/hr estimate updates after 2+ completed tasks
