const { verifyToken } = require('../utils/jwt');
const prisma = require('../config/database');
const { logger } = require('../utils/logger');

const authMiddleware = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      res.status(401).json({
        success: false,
        error: 'Authentication required',
      });
      return;
    }

    const token = authHeader.substring(7);
    const decoded = verifyToken(token);

    if (decoded.type !== 'access') {
      res.status(401).json({
        success: false,
        error: 'Invalid token type',
      });
      return;
    }

    // Try AppOwner first
    const appOwner = await prisma.appOwner.findUnique({
      where: { id: decoded.userId },
    });

    if (appOwner) {
      req.user = {
        id: appOwner.id,
        email: appOwner.email,
        name: appOwner.name,
        isAppOwner: true,
      };
      next();
      return;
    }

    // Try User
    const user = await prisma.user.findUnique({
      where: { id: decoded.userId },
    });

    if (!user || !user.isActive) {
      res.status(401).json({
        success: false,
        error: 'User not found or inactive',
      });
      return;
    }

    req.user = {
      ...user,
      isAppOwner: false,
    };
    next();
  } catch (error) {
    logger.error('Auth middleware error:', error);
    res.status(401).json({
      success: false,
      error: 'Invalid or expired token',
    });
  }
};

module.exports = { authMiddleware };

