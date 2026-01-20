require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const { errorHandler, notFoundHandler } = require('./middleware/error.middleware');
const { logger } = require('./utils/logger');

// Routes
const authRoutes = require('./routes/auth.routes');
const accountRoutes = require('./routes/account.routes');
const workspaceRoutes = require('./routes/workspace.routes');
const departmentRoutes = require('./routes/department.routes');
const departmentUserRoutes = require('./routes/departmentUser.routes');
const teamRoutes = require('./routes/team.routes');
const inboxRoutes = require('./routes/inbox.routes');

const app = express();

// Security middleware
app.use(helmet());
app.use(cors({
  // origin: process.env.CORS_ORIGIN || 'http://localhost:3001',
  origin: '*',
  credentials: true,
}));

// Rate limiting
const limiter = rateLimit({
  windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS || '900000'), // 15 minutes
  max: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS || '100'),
  message: 'Too many requests from this IP, please try again later.',
});

app.use(limiter);

// Body parsing middleware
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Request logging
app.use((req, res, next) => {
  logger.info(`${req.method} ${req.path}`);
  next();
});

// Health check
app.get('/health', (req, res) => {
  res.status(200).json({
    success: true,
    message: 'Server is healthy',
    timestamp: new Date().toISOString(),
  });
});

app.get("/", (req, res) => {
  res.json({ status: "ok", message: "Server live" });
});

// API routes
const apiPrefix = process.env.API_PREFIX || '/api/v1';
app.use(`${apiPrefix}/auth`, authRoutes);
app.use(`${apiPrefix}/accounts`, accountRoutes);
app.use(`${apiPrefix}/workspaces`, workspaceRoutes);
// Mount departmentUser routes before department routes to ensure specific routes are matched first
app.use(`${apiPrefix}/departments`, departmentUserRoutes);
app.use(`${apiPrefix}/departments`, departmentRoutes);
app.use(`${apiPrefix}/teams`, teamRoutes);
app.use(`${apiPrefix}/inbox`, inboxRoutes);

// Error handling middleware (must be last)
app.use(notFoundHandler);
app.use(errorHandler);

module.exports = app;

