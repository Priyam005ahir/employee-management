import express, { Request, Response, NextFunction } from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import cookieParser from 'cookie-parser';
import dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';
import { errorHandler } from './middleware/errorHandler';
import { ensureDirectoryExists } from './utils/helpers';

// Import routes
import authRoutes from './routes/auth';
import cameraRoutes from './routes/cameras';
import employeeRoutes from './routes/employees';
import attendanceRoutes from './routes/attendance';
import statsRoutes from './routes/stats';
import notificationRoutes from './routes/notifications';
import modelRoutes from './routes/models';
import dashboardRoutes from './routes/dashboard';

// Load environment variables
dotenv.config();

// Initialize express app
const app = express();

// Create HTTP server
const httpServer = createServer(app);

// Initialize Socket.IO
const io = new Server(httpServer, {
  cors: {
    origin: process.env.CORS_ORIGIN || "http://localhost:5173",
    methods: ["GET", "POST"],
    credentials: true
  }
});

const PORT = process.env.PORT || 3001;

// Create logs directory
const logsDir = path.join(__dirname, '../logs');
ensureDirectoryExists(logsDir);

// Create uploads directory
const uploadsDir = path.join(__dirname, '../uploads');
ensureDirectoryExists(uploadsDir);
ensureDirectoryExists(path.join(uploadsDir, 'employees'));

// Setup request logging
const accessLogStream = fs.createWriteStream(
  path.join(logsDir, 'access.log'),
  { flags: 'a' }
);

// Middleware
app.use(helmet()); // Security headers
app.use(cors({
  origin: process.env.CORS_ORIGIN || "http://localhost:5173",
  credentials: true
}));
app.use(express.json({ limit: '10mb' })); // Parse JSON request body
app.use(express.urlencoded({ extended: true, limit: '10mb' })); // Parse URL-encoded request body
app.use(cookieParser()); // Parse cookies
app.use(morgan('combined', { stream: accessLogStream })); // Request logging

// Serve static files
app.use('/uploads', express.static(path.join(__dirname, '../uploads')));

// Socket.IO connection handling
io.on('connection', (socket) => {
  console.log('✅ User connected:', socket.id);

  // Handle camera room joining
  socket.on('join-camera-room', (cameraId) => {
    socket.join(`camera-${cameraId}`);
    console.log(`User ${socket.id} joined camera room ${cameraId}`);
  });

  // Handle model events
  socket.on('model-started', (data) => {
    socket.broadcast.emit('model-status-update', {
      ...data,
      status: 'started'
    });
  });

  socket.on('model-stopped', (data) => {
    socket.broadcast.emit('model-status-update', {
      ...data,
      status: 'stopped'
    });
  });

  socket.on('disconnect', () => {
    console.log('❌ User disconnected:', socket.id);
  });
});

// Health check endpoint
app.get('/health', (req: Request, res: Response) => {
  res.status(200).json({
    status: 'success',
    message: 'Safety Surveillance API is running',
    timestamp: new Date().toISOString(),
    socketIO: 'enabled'
  });
});

// API routes
app.use('/api/auth', authRoutes);
app.use('/api/cameras', cameraRoutes);
app.use('/api/employees', employeeRoutes);
app.use('/api/attendance', attendanceRoutes);
app.use('/api/stats', statsRoutes);
app.use('/api/notifications', notificationRoutes);
app.use('/api/models', modelRoutes);
app.use('/api/dashboard', dashboardRoutes);

// 404 handler
app.use((req: Request, res: Response) => {
  res.status(404).json({
    status: 'error',
    message: `Route ${req.originalUrl} not found`
  });
});

// Error handling middleware
app.use(errorHandler);

// Start server
httpServer.listen(PORT, () => {
  console.log(`🚀 Safety Surveillance API running on port ${PORT}`);
  console.log(`🔌 Socket.IO server ready at http://localhost:${PORT}/socket.io/`);
  console.log(`🌍 Environment: ${process.env.NODE_ENV || 'development'}`);
});

// Handle unhandled promise rejections
process.on('unhandledRejection', (err: Error) => {
  console.error('Unhandled Promise Rejection:', err);
  fs.appendFileSync(
    path.join(logsDir, 'errors.log'),
    `${new Date().toISOString()} - Unhandled Promise Rejection: ${err.stack}\n`
  );
});

// Handle uncaught exceptions
process.on('uncaughtException', (err: Error) => {
  console.error('Uncaught Exception:', err);
  fs.appendFileSync(
    path.join(logsDir, 'errors.log'),
    `${new Date().toISOString()} - Uncaught Exception: ${err.stack}\n`
  );
  process.exit(1);
});

export { io };
export default app;
