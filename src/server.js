require('dotenv').config();
const app = require('./app');
const { createServer } = require('http');
const { logger } = require('./utils/logger');
const prisma = require('./config/database');
const redis = require('./config/redis');
const { setupSocketIO } = require('./socket/socket');

const PORT = process.env.PORT || 3000;

// Create HTTP server
const httpServer = createServer(app);

// Setup Socket.IO
const io = setupSocketIO(httpServer);

// Make io available globally (for use in controllers/services)
global.io = io;

// Start server
const startServer = async () => {
  try {
    // Test database connection
    await prisma.$connect();
    logger.info('Database connected successfully');

    // Test Redis connection (optional)
    try {
      await redis.ping();
      logger.info('Redis connected successfully');
    } catch (redisError) {
      logger.warn('Redis not available, continuing without cache:', redisError.message);
    }

    // Start HTTP server
    httpServer.listen(PORT, () => {
      logger.info(`Server running on port ${PORT}`);
      logger.info(`Environment: ${process.env.NODE_ENV || 'development'}`);
      logger.info(`API prefix: ${process.env.API_PREFIX || '/api/v1'}`);
    });
  } catch (error) {
    logger.error('Failed to start server:', error);
    process.exit(1);
  }
};

// Graceful shutdown
process.on('SIGTERM', async () => {
  logger.info('SIGTERM received, shutting down gracefully');
  httpServer.close(() => {
    logger.info('HTTP server closed');
  });
  await prisma.$disconnect();
  try {
    await redis.quit();
  } catch (e) {
    // Redis might not be connected
  }
  process.exit(0);
});

process.on('SIGINT', async () => {
  logger.info('SIGINT received, shutting down gracefully');
  httpServer.close(() => {
    logger.info('HTTP server closed');
  });
  await prisma.$disconnect();
  try {
    await redis.quit();
  } catch (e) {
    // Redis might not be connected
  }
  process.exit(0);
});

// Start the server
startServer();

