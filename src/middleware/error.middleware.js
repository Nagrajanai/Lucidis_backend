const { logger } = require('../utils/logger');

const errorHandler = (err, req, res, next) => {
  logger.error('Error:', err);

  const response = {
    success: false,
    error: process.env.NODE_ENV === 'production' 
      ? 'Internal server error' 
      : err.message,
  };

  // Handle Prisma errors
  if (err.name === 'PrismaClientKnownRequestError') {
    response.error = 'Database operation failed';
  }

  // Handle validation errors
  if (err.name === 'ValidationError' || err.name === 'ZodError') {
    response.error = err.message;
    res.status(400).json(response);
    return;
  }

  // Handle JWT errors
  if (err.name === 'JsonWebTokenError' || err.name === 'TokenExpiredError') {
    response.error = 'Invalid or expired token';
    res.status(401).json(response);
    return;
  }

  res.status(500).json(response);
};

const notFoundHandler = (req, res, next) => {
  res.status(404).json({
    success: false,
    error: `Route ${req.method} ${req.path} not found`,
  });
};

module.exports = {
  errorHandler,
  notFoundHandler,
};

