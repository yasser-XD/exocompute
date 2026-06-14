# ExoCompute — Product Requirement Document

**Version:** 1.0.0
**Type:** Hackathon MVP (24-hour build)
**Stack:** Node.js (Express) · Socket.io · Transformers.js / WebGPU · Twilio WhatsApp Sandbox

---

## 1. Executive Summary

ExoCompute is a decentralized, peer-to-peer compute marketplace that maps idle consumer hardware to execute low-latency AI inference workloads entirely inside the browser sandbox.

The MVP objective is a high-impact hackathon demonstration proving zero-friction compute-lending via a web browser, with an interactive consumer ingestion layer via WhatsApp. Judges experience the full loop live: send a WhatsApp prompt → watch it distribute across browser-based worker nodes → see earnings accumulate in real time.

---

## 2. System Architecture

```
┌─────────────────────────────────────────────────────────┐
│                 WhatsApp User / Judge                   │
└──────────────────────────┬──────────────────────────────┘
                           │  1. Text Prompt
                           ▼
┌─────────────────────────────────────────────────────────┐
│         Orchestrator Gateway  (Node.js / Express)       │
├─────────────────────────────────────────────────────────┤
│  • Exposes public /whatsapp-webhook via ngrok           │
│  • Manages global WebSocket mesh via Socket.io          │
│  • Hosts Orchestrator Dashboard (Workspace A)           │
└──────────────────────────┬──────────────────────────────┘
                           │  2. Broadcast Task to Workers
                           ▼
┌─────────────────────────────────────────────────────────┐
│          Lender Worker Node  (Browser Tab)              │
├─────────────────────────────────────────────────────────┤
│  • Executes pipeline via WebGPU / Transformers.js       │
│  • Runs compute inside localized browser sandbox        │
│  • Hosts Lender Dashboard (Workspace B)                 │
└─────────────────────────────────────────────────────────┘
```

---

## 3. Feature Specifications

### 3.1 Ingestion Layer — Twilio Webhook Gateway

**Goal:** Parse text prompts from end-users into computational tasks and broadcast them to the worker mesh.

| Spec | Detail |
|---|---|
| Endpoint | `POST /whatsapp-webhook` |
| Body parsing | URL-encoded form data (`Body` = prompt, `From` = sender ID) |
| Sandbox keyword | Gracefully ignore `join <keyword>` subscription messages |
| Response | Immediate TwiML XML acknowledgment back to Twilio |
| Tunnel | ngrok `http 3000` — update Twilio webhook URL on each session |

**TwiML response format:**
```xml
<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Message>Your compute request has been dispatched to the mesh.</Message>
</Response>
```

---

### 3.2 Workspace A — Orchestrator Dashboard

**Target viewport:** Fullscreen presentation display (projector / judge tracking screen)

**Socket.io events consumed:**
- `node:connected` — new lender joins the mesh
- `task:dispatched` — prompt broadcast to workers
- `task:complete` — worker result returned with timing

**UI Components:**

#### Global Mesh Statistics
Three live counters displayed as a top-bar grid:

| Metric | Description |
|---|---|
| Connected nodes | Total lender browser tabs currently live on the mesh |
| Active task queue | Prompts currently in-flight across workers |
| System throughput | Cumulative tokens processed since session start |

#### Financial Ticker
- Displays **Orchestrator Platform Fee** accumulating in real time
- Calculated as **15%** of all distributed processing revenue
- Format: `$0.0000` — updates on every `task:complete` event
- Color: distinct accent (e.g. green) to differentiate from worker payouts

#### Live Log Stream
Scrolling event feed, newest entry on top:

```
[12:04:31]  Inbound prompt from whatsapp:+91XXXXXXXXXX
[12:04:31]  Dispatched to Node 3 (192.168.x.x)
[12:04:34]  Execution complete in 2841ms — 94 tokens
[12:04:34]  Node 3 earned $0.0001 · Platform cut: $0.0000
```

---

### 3.3 Workspace B — Lender Dashboard

**Target viewport:** Lightweight consumer web console — open URL, autoconnect, done.

**Onboarding path:** Open URL → WebSocket autoconnect → Status shifts to `IDLE`

**UI Components:**

#### System Status Badge

| State | Display | Condition |
|---|---|---|
| Idle | `🟢 IDLE` | Connected, no active job |
| Computing | `⚡ COMPUTING` | Inference pipeline running |
| Offline | `🔴 OFFLINE` | WebSocket disconnected |

#### Wallet Counter
- Tracks local earnings to **4 decimal places** (e.g. `$0.0034`)
- Updates immediately when a task block completes
- Displays session total and per-task delta

#### Performance Monitoring Module

| Metric | Description |
|---|---|
| Tokens processed | Cumulative token count this session |
| Avg task duration | Rolling average of inference time in ms |
| Last task tokens | Token count for most recent job |

#### Estimated Revenue Per Hour
- Dynamically computed trailing indicator
- Formula: `(TPS × 3600 / 1,000,000) × $0.68`
- Updates after each completed task

---

## 4. Technical Specifications

### 4.1 Client-Side Execution

| Spec | Value |
|---|---|
| Library | Transformers.js (ESM CDN) with WebGPU backend |
| Primary model | `Xenova/distilbert-base-uncased-finetuned-sst-2-english` (~20MB) |
| Secondary model | `Xenova/vit-base-patch16-224` (~88MB) |
| Sandbox isolation | Standard browser JS context — no server-side compute |
| Caching | Browser cache API — model persists across tab refreshes |
| GPU flag | `navigator.gpu` detection — fall back to WASM if unavailable |

### 4.2 Metric Formulas

All metrics computed client-side using `performance.now()` precision timers.

**Tokens Per Second (TPS)**
```
TPS = Simulated Token Matrix Volume / Task Duration (seconds)
```

**Estimated Tokens Per Hour**
```
Tokens/hr = TPS × 3600
```

**Estimated Revenue Per Hour**
```
Revenue/hr = (Tokens/hr / 1,000,000) × Price Per Million Tokens × Lender Share %
```

### 4.3 Hardcoded Financial Constants

| Constant | Value |
|---|---|
| Price per million tokens (market base) | `$0.80` |
| Platform fee cut | `15%` → `$0.12 / M tokens` |
| Lender share | `85%` → `$0.68 / M tokens` |

---

## 5. Socket.io Event Schema

| Event | Direction | Payload |
|---|---|---|
| `node:connected` | Server → Orchestrator | `{ nodeId, ip, timestamp }` |
| `node:disconnected` | Server → Orchestrator | `{ nodeId, timestamp }` |
| `task:dispatch` | Server → Workers | `{ taskId, prompt, from, timestamp }` |
| `task:complete` | Worker → Server | `{ taskId, nodeId, result, durationMs, tokenCount }` |
| `earnings:update` | Server → Worker | `{ nodeId, delta, total, platformCut }` |
| `stats:update` | Server → Orchestrator | `{ connectedNodes, activeQueue, totalTokens, platformTotal }` |

---

## 6. Development Phases

### Phase 1 — Core WebSocket Backbone
**Goal:** Verified message propagation end-to-end
**Deliverable:** POST to `/test` triggers a Socket.io event visible on the open client tab

- [ ] Initialize Node.js project with Express and Socket.io
- [ ] Build mock client page that connects and displays received events
- [ ] Verify dummy payload → server → client without state drops
- [ ] Confirm multi-tab behavior (each tab = independent socket connection)

**Checkpoint:** Two browser tabs both receive the same broadcast from a single `curl` POST.

---

### Phase 2 — Twilio Integration
**Goal:** WhatsApp message triggers real-time UI update

- [ ] Add `express.urlencoded({ extended: false })` body parser
- [ ] Implement `POST /whatsapp-webhook` handler
- [ ] Parse `Body` and `From` from incoming Twilio payload
- [ ] Emit parsed task to all connected Socket.io clients
- [ ] Return valid TwiML XML response
- [ ] Test via Postman / curl before live WhatsApp test
- [ ] Run `ngrok http 3000` and update Twilio sandbox webhook URL

**Checkpoint:** WhatsApp message from test phone → log entry appears on client in under 2 seconds.

---

### Phase 3 — WebGPU / Transformers.js Inference
**Goal:** Lender node executes real inference on received tasks

- [ ] Load Transformers.js via ESM CDN import
- [ ] Initialize `pipeline('sentiment-analysis', 'Xenova/distilbert-...')` on page load
- [ ] Trigger model download with visible progress indicator
- [ ] Bind `task:dispatch` socket event to inference execution
- [ ] Capture `performance.now()` before and after inference
- [ ] Emit `task:complete` with result, duration, and token count
- [ ] Implement WebGPU detection: use `{ device: 'webgpu' }` if `navigator.gpu` exists, else WASM

**Checkpoint:** WhatsApp prompt → lender tab runs inference → result emitted back to server within 5 seconds.

---

### Phase 4 — Financial Metrics Dashboards
**Goal:** Both dashboards fully built, live, and visually compelling

**Orchestrator Dashboard:**
- [ ] Node count, task queue, throughput stats grid
- [ ] Platform fee ticker (15% cut, real-time accumulation)
- [ ] Scrolling log feed with timestamps

**Lender Dashboard:**
- [ ] IDLE / COMPUTING / OFFLINE status badge with state transitions
- [ ] Wallet counter to 4 decimal places, per-task delta flash
- [ ] TPS, tokens processed, avg duration metrics
- [ ] Estimated revenue/hr trailing indicator

**Checkpoint:** Both screens updating live with correct values during a full end-to-end WhatsApp → inference → payout loop.

---

## 7. File Structure

```
exocompute/
├── server.js                 # Express + Socket.io orchestrator
├── package.json
├── .env                      # TWILIO_AUTH_TOKEN (optional validation)
├── public/
│   ├── orchestrator.html     # Workspace A — master screen
│   ├── worker.html           # Workspace B — lender node
│   └── style.css             # Shared styles
└── routes/
    └── webhook.js            # /whatsapp-webhook handler
```

---

## 8. Environment Setup

```bash
# Install dependencies
npm install express socket.io body-parser dotenv

# Start server
node server.js

# Expose via ngrok (new terminal)
ngrok http 3000
# → copy the generated HTTPS URL

# Update Twilio sandbox webhook
# Twilio Console → Messaging → Try it out → Send a WhatsApp message
# Set webhook URL to: https://<ngrok-id>.ngrok.io/whatsapp-webhook
```

---

## 9. Demo-Day Pre-Flight Checklist

### Device Setup
- [ ] Force GPU to "High Performance" in system display settings on all demo machines
- [ ] Open `orchestrator.html` on the presentation laptop (fullscreen, projector)
- [ ] Open 3–4 tabs of `worker.html` to populate the mesh before judges arrive
- [ ] Pre-warm browser cache: load worker tab once, let model download complete, refresh to confirm instant load

### Twilio / ngrok
- [ ] Run `ngrok http 3000` and copy the HTTPS forwarding URL
- [ ] Update Twilio WhatsApp sandbox webhook URL to `https://<id>.ngrok.io/whatsapp-webhook`
- [ ] Send a test message from your own WhatsApp to confirm end-to-end flow
- [ ] Keep ngrok terminal open — do not restart it during the demo

### QR Code
- [ ] Generate QR code pointing to `https://wa.me/<YOUR_NUMBER>?text=join%20<sandbox-keyword>`
- [ ] Embed QR on orchestrator screen for judge onboarding
- [ ] Test QR scan → WhatsApp join → message flow on at least one judge's device before presentation

### Backup Plan
- [ ] Record a 60-second screen capture of a working full loop as fallback
- [ ] Have a hardcoded demo mode (`?demo=1`) that fires a fake WhatsApp event locally without Twilio

---

## 10. Success Criteria

| Criteria | Target |
|---|---|
| Worker nodes visible on mesh | ≥ 3 tabs connected simultaneously |
| End-to-end latency (WhatsApp → result) | < 10 seconds |
| Earnings update visible to judge | Within 1 second of task completion |
| Orchestrator log legibility | All events readable at projector resolution |
| Model load time (cached) | < 2 seconds per worker tab |
| Zero crashes during judging window | Full 5-minute demo loop stable |
