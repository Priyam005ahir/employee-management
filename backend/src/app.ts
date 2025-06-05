import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import rateLimit from 'express-rate-limit';
import cookieParser from 'cookie-parser';
import { config } from 'dotenv';
import path from 'path';

// Routes
import authRouter from './routes/auth';
import cameraRouter from './routes/cameras';
import employeeRouter from './routes/employees';
import attendanceRouter from './routes/attendance';
import dashboardRoutes from './routes/dashboard';

// Middleware
import { errorHandler } from './middleware/errorHandler';
//import { authenticate } from './middleware/auth';

// Database
import pool from './config/db';  // Changed from { pool }

// Load environment variables
config({ path: path.resolve(__dirname, '../.env') });

const app = express();

// Security Middleware
app.use(helmet());
app.use(
  cors({
    origin: process.env.FRONTEND_URL || 'http://localhost:5173',
    credentials: true,
  })
);

// Rate Limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100,
});
app.use(limiter);

// Request Parsing
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

// Logging
if (process.env.NODE_ENV === 'development') {
  app.use(morgan('dev'));
}

// Health Check Endpoint
app.get('/api/health', async (req, res) => {
  try {
    await pool.query('SELECT NOW()');
    res.status(200).json({ 
      status: 'OK', 
      database: 'connected',
      timestamp: new Date() 
    });
  } catch (err: unknown) {
    const errorMessage = err instanceof Error ? err.message : 'Unknown database error';
    res.status(500).json({
      status: 'ERROR',
      database: 'disconnected',
      error: errorMessage
    });
  }
});

// API Routes
app.use('/api/auth', authRouter);
app.use('/api/cameras', cameraRouter);
app.use('/api/employees',  employeeRouter);
app.use('/api/attendance', attendanceRouter);
app.use('/api/dashboard', dashboardRoutes);

// Static Files (for production)
if (process.env.NODE_ENV === 'production') {
  app.use(express.static(path.join(__dirname, '../../frontend/build')));
  app.get('*', (req, res) => {
    res.sendFile(path.resolve(__dirname, '../../frontend/build', 'index.html'));
  });
}

// Error Handling
app.use(errorHandler);

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`Server running in ${process.env.NODE_ENV} mode on port ${PORT}`);
});

export default app;