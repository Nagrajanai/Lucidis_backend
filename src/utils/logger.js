const { createWriteStream } = require('fs');
const { join } = require('path');

const logLevel = process.env.LOG_LEVEL || 'info';
const isDevelopment = process.env.NODE_ENV === 'development';

const logStream = createWriteStream(
  join(process.cwd(), 'logs', 'app.log'),
  { flags: 'a' }
);

const logLevels = {
  error: 0,
  warn: 1,
  info: 2,
  debug: 3,
};

const shouldLog = (level) => {
  return logLevels[level] <= logLevels[logLevel];
};

const formatMessage = (level, message, ...args) => {
  const timestamp = new Date().toISOString();
  const formattedArgs = args.length > 0 ? ' ' + JSON.stringify(args) : '';
  return `[${timestamp}] [${level.toUpperCase()}] ${message}${formattedArgs}\n`;
};

const logger = {
  error: (message, ...args) => {
    if (shouldLog('error')) {
      const logMessage = formatMessage('error', message, ...args);
      if (isDevelopment) console.error(logMessage);
      logStream.write(logMessage);
    }
  },
  warn: (message, ...args) => {
    if (shouldLog('warn')) {
      const logMessage = formatMessage('warn', message, ...args);
      if (isDevelopment) console.warn(logMessage);
      logStream.write(logMessage);
    }
  },
  info: (message, ...args) => {
    if (shouldLog('info')) {
      const logMessage = formatMessage('info', message, ...args);
      if (isDevelopment) console.log(logMessage);
      logStream.write(logMessage);
    }
  },
  debug: (message, ...args) => {
    if (shouldLog('debug')) {
      const logMessage = formatMessage('debug', message, ...args);
      if (isDevelopment) console.debug(logMessage);
      logStream.write(logMessage);
    }
  },
};

module.exports = { logger };

