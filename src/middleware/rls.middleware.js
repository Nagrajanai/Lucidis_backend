// RLS Middleware - Adds RLS context helper to request
// Note: RLS is used as defense-in-depth. Application-level isolation is primary.

const rlsMiddleware = (req, res, next) => {
  // RLS context is already set in tenant.middleware
  // This middleware just ensures it's available
  next();
};

module.exports = { rlsMiddleware };

