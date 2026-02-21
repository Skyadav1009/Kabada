require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const path = require('path');
const http = require('http');
const { Server } = require('socket.io');

const containerRoutes = require('./routes/containers');
const adminRoutes = require('./routes/admin');

const app = express();
const server = http.createServer(app);
const PORT = process.env.PORT || 5000;
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/quickshare';
const { initCronJobs } = require('./cron');

// Environment validation
const requiredEnvVars = ['MONGODB_URI'];
const missingEnvVars = requiredEnvVars.filter(v => !process.env[v]);
if (missingEnvVars.length > 0) {
  console.error('❌ Missing required environment variables:', missingEnvVars.join(', '));
  process.exit(1);
}

// Debug: Print masked URI to verify it's being read correctly
console.log('MongoDB URI loaded:', MONGODB_URI ? MONGODB_URI.replace(/:([^@]+)@/, ':****@') : 'NOT SET');
console.log('Environment:', process.env.NODE_ENV || 'development');

// Allowed origins for CORS
const allowedOrigins = [
  'http://localhost:3000',
  'http://localhost:5173',
  'http://127.0.0.1:3000',
  'http://127.0.0.1:5173',
  'https://kabada.vercel.app',
  'https://kabada.surveyzen.live',
  'https://quickshare-dr4.pages.dev',
  process.env.FRONTEND_URL
].filter(Boolean);

// Middleware
app.use(cors({
  origin: function (origin, callback) {
    // Allow requests with no origin (like mobile apps or curl requests)
    if (!origin) return callback(null, true);

    if (allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      console.log('CORS blocked origin:', origin);
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true
}));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Socket.IO setup
const io = new Server(server, {
  cors: {
    origin: allowedOrigins,
    methods: ['GET', 'POST'],
    credentials: true
  }
});

// Socket.IO connection handling
io.on('connection', (socket) => {
  console.log('🔌 Client connected:', socket.id);

  // Join a container room for real-time updates
  socket.on('join-container', (containerId) => {
    socket.join(`container-${containerId}`);
    console.log(`Socket ${socket.id} joined container-${containerId}`);
  });

  // Leave a container room
  socket.on('leave-container', (containerId) => {
    socket.leave(`container-${containerId}`);
    console.log(`Socket ${socket.id} left container-${containerId}`);
  });

  socket.on('disconnect', () => {
    console.log('🔌 Client disconnected:', socket.id);
  });
});

// Make io accessible to routes
app.set('io', io);

// API Routes
app.use('/api/containers', containerRoutes);
app.use('/api/admin', adminRoutes);

// Health check with database status
app.get('/api/health', (req, res) => {
  const dbState = mongoose.connection.readyState;
  const dbStatus = {
    0: 'disconnected',
    1: 'connected',
    2: 'connecting',
    3: 'disconnecting'
  };
  
  res.json({
    status: dbState === 1 ? 'ok' : 'degraded',
    database: dbStatus[dbState] || 'unknown',
    timestamp: new Date().toISOString(),
    uptime: process.uptime()
  });
});

// Serve uploaded files statically (optional, for direct access)
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// MongoDB connection options
const mongooseOptions = {
  serverSelectionTimeoutMS: 30000,
  socketTimeoutMS: 45000,
  maxPoolSize: 10,
  retryWrites: true,
};

// Connect to MongoDB with retry logic
const MAX_RETRIES = 5;
const RETRY_DELAY = 5000;

async function connectWithRetry(retries = MAX_RETRIES) {
  try {
    await mongoose.connect(MONGODB_URI, mongooseOptions);
    console.log('✅ Connected to MongoDB');
    
    server.listen(PORT, () => {
      console.log(`🚀 Server running on http://localhost:${PORT}`);
      console.log('🔌 Socket.IO ready for real-time connections');
      initCronJobs();
    });
  } catch (error) {
    console.error(`❌ MongoDB connection error (${MAX_RETRIES - retries + 1}/${MAX_RETRIES}):`, error.message);
    
    if (retries > 1) {
      console.log(`⏳ Retrying in ${RETRY_DELAY / 1000} seconds...`);
      await new Promise(resolve => setTimeout(resolve, RETRY_DELAY));
      return connectWithRetry(retries - 1);
    } else {
      console.error('❌ Failed to connect to MongoDB after maximum retries');
      process.exit(1);
    }
  }
}

// Handle MongoDB connection events
mongoose.connection.on('error', (err) => {
  console.error('MongoDB connection error:', err.message);
});

mongoose.connection.on('disconnected', () => {
  console.warn('⚠️ MongoDB disconnected');
});

mongoose.connection.on('reconnected', () => {
  console.log('✅ MongoDB reconnected');
});

// Start the server
connectWithRetry();

// Graceful shutdown
process.on('SIGINT', async () => {
  console.log('\n🔄 Graceful shutdown initiated...');
  await mongoose.connection.close();
  console.log('MongoDB connection closed.');
  process.exit(0);
});

process.on('SIGTERM', async () => {
  console.log('\n🔄 SIGTERM received, shutting down gracefully...');
  await mongoose.connection.close();
  console.log('MongoDB connection closed.');
  process.exit(0);
});

// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
  console.error('Uncaught Exception:', error);
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
});
