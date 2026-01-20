const { Server: SocketIOServer } = require('socket.io');
const { verifyToken } = require('../utils/jwt');
const prisma = require('../config/database');
const { logger } = require('../utils/logger');

const setupSocketIO = (httpServer) => {
  const io = new SocketIOServer(httpServer, {
    cors: {
      // origin: process.env.SOCKET_IO_CORS_ORIGIN || process.env.CORS_ORIGIN || 'http://localhost:3001',
      origin: '*',
      methods: ['GET', 'POST'],
      credentials: true,
    },
    transports: ['websocket', 'polling'],
  });

  // Authentication middleware for Socket.IO
  io.use(async (socket, next) => {
    try {
      const token = socket.handshake.auth.token || socket.handshake.headers.authorization?.replace('Bearer ', '');

      if (!token) {
        return next(new Error('Authentication token required'));
      }

      const decoded = verifyToken(token);

      if (decoded.type !== 'access') {
        return next(new Error('Invalid token type'));
      }

      const user = await prisma.user.findUnique({
        where: { id: decoded.userId },
      });

      if (!user || !user.isActive) {
        return next(new Error('User not found or inactive'));
      }

      socket.userId = user.id;
      next();
    } catch (error) {
      logger.error('Socket authentication error:', error);
      next(new Error('Authentication failed'));
    }
  });

  io.on('connection', async (socket) => {
    logger.info(`Socket connected: ${socket.id}, User: ${socket.userId}`);

    // Join workspace room
    socket.on('join-workspace', async (workspaceId) => {
      try {
        if (!socket.userId) {
          socket.emit('error', { message: 'User not authenticated' });
          return;
        }

        // Verify user has access to workspace
        const workspaceUser = await prisma.workspaceUser.findUnique({
          where: {
            userId_workspaceId: {
              userId: socket.userId,
              workspaceId,
            },
          },
        });

        if (!workspaceUser) {
          socket.emit('error', { message: 'Access denied to workspace' });
          return;
        }

        socket.join(`workspace:${workspaceId}`);
        socket.workspaceId = workspaceId;
        logger.info(`User ${socket.userId} joined workspace ${workspaceId}`);
        
        socket.emit('joined-workspace', { workspaceId });
      } catch (error) {
        logger.error('Error joining workspace:', error);
        socket.emit('error', { message: 'Failed to join workspace' });
      }
    });

    // Leave workspace room
    socket.on('leave-workspace', (workspaceId) => {
      socket.leave(`workspace:${workspaceId}`);
      logger.info(`User ${socket.userId} left workspace ${workspaceId}`);
    });

    // Handle disconnect
    socket.on('disconnect', () => {
      logger.info(`Socket disconnected: ${socket.id}, User: ${socket.userId}`);
    });
  });

  return io;
};

// Helper function to emit events to workspace
const emitToWorkspace = (io, workspaceId, event, data) => {
  io.to(`workspace:${workspaceId}`).emit(event, data);
};

module.exports = {
  setupSocketIO,
  emitToWorkspace,
};

