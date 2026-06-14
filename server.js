require('dotenv').config();
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const bodyParser = require('body-parser');
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const twilio = require('twilio');
const fs = require('fs');

let currentHost = ''; // To track ngrok URL for Twilio media

// Initialize Twilio Client
const twilioClient = process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_ACCOUNT_SID.startsWith('AC') && process.env.TWILIO_AUTH_TOKEN 
    ? twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN)
    : null;
const TWILIO_NUMBER = process.env.TWILIO_PHONE_NUMBER || 'whatsapp:+14155238886';

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST']
  }
});

const PORT = process.env.PORT || 3000;

// Apply global COOP/COEP headers (required for SharedArrayBuffer in multi-threaded WASM)
app.use((req, res, next) => {
  res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
  res.setHeader('Cross-Origin-Embedder-Policy', 'require-corp');
  next();
});

// Middleware
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: false }));

// Serve static files from the ui/stich directory
app.use(express.static(path.join(__dirname, 'ui/stich')));

// In-memory registry for connected worker nodes
const nodeRegistry = new Map();

// Task Queue and Deduplication Set
const taskQueue = [];
const completedTasks = new Set();

// Global stats tracking
let globalCalculatedPayouts = 0;
let totalTokensProcessed = 0;
let platformTotal = 0;

// Helper to broadcast updated stats to orchestrator
function broadcastStats() {
  const workers = Array.from(nodeRegistry.values());
  const connectedNodes = workers.length;

  io.to('orchestrator').emit('stats:update', {
    connectedNodes,
    activeQueue: taskQueue.length,
    totalTokens: totalTokensProcessed,
    platformTotal: platformTotal,
    nodes: workers.map(w => ({
      nodeId: w.nodeId,
      ip: w.ip,
      tasksCompleted: w.tasksCompleted,
      earnings: w.totalEarnings
    }))
  });
}

// WebSocket connection handling
io.on('connection', (socket) => {
  const ip = socket.handshake.address || socket.conn.remoteAddress || 'unknown';
  console.log(`Socket connected: ${socket.id} (IP: ${ip})`);

  socket.on('register', (data) => {
    const role = data?.role;
    if (role === 'worker') {
      socket.join('workers');
      socket.join(`worker:${socket.id}`);

      // Add to registry
      nodeRegistry.set(socket.id, {
        nodeId: socket.id,
        socketId: socket.id,
        ip,
        connectedAt: Date.now(),
        tasksCompleted: 0,
        totalEarnings: 0
      });

      console.log(`Worker registered: ${socket.id}`);

      // Broadcast connect event to orchestrator
      io.to('orchestrator').emit('node:connected', {
        nodeId: socket.id,
        ip,
        connectedAt: Date.now(),
        totalNodes: nodeRegistry.size
      });

      broadcastStats();
    } else if (role === 'orchestrator') {
      socket.join('orchestrator');
      console.log(`Orchestrator registered: ${socket.id}`);
      broadcastStats();
    }
  });

  socket.on('task:complete', (data) => {
    const { taskId, nodeId, tokenCount, durationMs } = data;

    if (completedTasks.has(taskId)) {
      return; // Deduplicate
    }
    completedTasks.add(taskId);
    
    // Remove from queue and save original payload for Twilio reply
    let originalTask = null;
    const qIndex = taskQueue.findIndex(t => t.taskId === taskId);
    if (qIndex > -1) {
      originalTask = taskQueue[qIndex];
      taskQueue.splice(qIndex, 1);
    }

    // Rate: $0.68 / million tokens
    const grossPayout = (tokenCount / 1000000) * 0.68;
    const platformCut = grossPayout * 0.15;
    const workerPayout = grossPayout - platformCut;

    globalCalculatedPayouts += workerPayout;
    platformTotal += platformCut;
    totalTokensProcessed += tokenCount;

    // Update worker state
    const worker = nodeRegistry.get(socket.id);
    if (worker) {
      worker.tasksCompleted += 1;
      worker.totalEarnings += workerPayout;
    }

    // Emit earnings to worker
    socket.emit('earnings:update', {
      taskId,
      earned: workerPayout,
      totalEarnings: worker ? worker.totalEarnings : 0
    });

    // Notify orchestrator of completion
    io.to('orchestrator').emit('task:log', {
      type: 'complete',
      ...data,
      workerPayout,
      platformCut,
      timestamp: Date.now()
    });

    broadcastStats();

    // Image Processing
    let mediaUrlList = [];
    if (data.image) {
      const base64Data = data.image.replace(/^data:image\/png;base64,/, "");
      const imagePath = path.join(__dirname, `ui/stich/images/${taskId}.png`);
      fs.writeFileSync(imagePath, base64Data, 'base64');
      
      if (currentHost) {
        mediaUrlList.push(`https://${currentHost}/images/${taskId}.png`);
      }
    }

    // Async Twilio Webhook Reply
    if (originalTask && twilioClient && originalTask.from !== 'test-client') {
      const formattedResult = data.result.replace(' (No GPU compute applied)', '');
      
      const messageOptions = {
        body: `*ExoCompute Mesh Response*\n_Task ${taskId.substring(0,8)}_\n\n${formattedResult}`,
        from: TWILIO_NUMBER,
        to: originalTask.from
      };
      
      if (mediaUrlList.length > 0) {
        messageOptions.mediaUrl = mediaUrlList;
      }

      twilioClient.messages.create(messageOptions)
        .then(message => console.log(`Twilio message sent asynchronously: ${message.sid}`))
        .catch(err => console.error('Twilio REST API Error:', err.message));
    }
  });

  socket.on('disconnect', () => {
    if (nodeRegistry.has(socket.id)) {
      nodeRegistry.delete(socket.id);
      console.log(`Worker disconnected: ${socket.id}`);

      // Broadcast disconnect to orchestrator
      io.to('orchestrator').emit('node:disconnected', {
        nodeId: socket.id,
        timestamp: Date.now(),
        totalNodes: nodeRegistry.size
      });

      broadcastStats();
    } else {
      console.log(`Socket disconnected: ${socket.id}`);
    }
  });
});

// Test route to dispatch dummy task
app.post('/test', (req, res) => {
  const { prompt, from } = req.body;
  
  if (!prompt) {
    return res.status(400).json({ error: 'Missing prompt in request body' });
  }

  const taskId = uuidv4();
  const taskPayload = {
    taskId,
    prompt,
    from: from || 'test-client',
    timestamp: Date.now()
  };

  console.log(`Dispatching test task ${taskId}: "${prompt}"`);

  // Broadcast to workers
  io.to('workers').emit('task:dispatch', taskPayload);

  // Notify orchestrator of dispatch
  io.to('orchestrator').emit('task:dispatched', {
    ...taskPayload,
    nodeCount: nodeRegistry.size
  });

  return res.status(200).json({
    message: 'Test task dispatched to workers room successfully',
    task: taskPayload
  });
});

// Twilio Webhook Route
app.post('/whatsapp-webhook', (req, res) => {
  const { Body, From } = req.body;
  currentHost = req.headers.host; // Track the current active host for media URLs

  if (!Body) {
    return res.status(200).type('text/xml').send(`<?xml version="1.0" encoding="UTF-8"?>\n<Response>\n  <Message>Internal error. Please try again.</Message>\n</Response>`);
  }

  const SANDBOX_PATTERN = /^join\s+\S+$/i;
  if (SANDBOX_PATTERN.test(Body.trim())) {
    return res.status(200).type('text/xml').send(`<?xml version="1.0" encoding="UTF-8"?>\n<Response></Response>`);
  }

  const taskId = uuidv4();
  const taskPayload = {
    taskId,
    prompt: Body.substring(0, 500),
    from: From || 'whatsapp:unknown',
    timestamp: Date.now(),
    status: 'pending'
  };

  taskQueue.push(taskPayload);

  console.log(`Twilio webhook received task ${taskId}: "${taskPayload.prompt}"`);

  // Broadcast to workers
  io.to('workers').emit('task:dispatch', taskPayload);

  // Notify orchestrator
  io.to('orchestrator').emit('task:dispatched', {
    ...taskPayload,
    nodeCount: nodeRegistry.size
  });

  return res.status(200).type('text/xml').send(`<?xml version="1.0" encoding="UTF-8"?>\n<Response>\n  <Message>Your compute request has been dispatched to the mesh.</Message>\n</Response>`);
});

// Start Server
server.listen(PORT, '0.0.0.0', () => {
  console.log(`ExoCompute Orchestrator listening on http://localhost:${PORT}`);
});
