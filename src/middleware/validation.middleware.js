const { logger } = require('../utils/logger');

// Helper function to validate required fields
const validateRequired = (data, requiredFields, source = 'body') => {
  const errors = [];
 
  for (const field of requiredFields) {
   
    if (data[field] === undefined || data[field] === null || data[field] === '') {
      errors.push({
        path: `${source}.${field}`,
        message: `${field} is required`,
      });
    }
  }
  
  return errors;
};

// Helper function to validate email format
const isValidEmail = (email) => {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
};

// Helper function to validate UUID format
const isValidUUID = (uuid) => {
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  return uuidRegex.test(uuid);
};

// Validation middleware factory
const validate = (rules) => {
  return (req, res, next) => {
    const errors = [];

    // Validate params
    if (rules.params) {
      const paramErrors = validateRequired(req.params, rules.params, 'params');
      errors.push(...paramErrors);
      
      // Validate UUID format for ID params (id, teamId, conversationId, etc.)
      for (const param of rules.params) {
        if (param.toLowerCase().includes('id') && req.params[param]) {
          if (!isValidUUID(req.params[param])) {
            errors.push({
              path: `params.${param}`,
              message: `${param} must be a valid UUID`,
            });
          }
        }
      }
    }

    // Validate query
    if (rules.query) {
      const queryErrors = validateRequired(req.query, rules.query, 'query');
      errors.push(...queryErrors);
    }
    

    // Validate body
    if (rules.body) {
      const bodyErrors = validateRequired(req.body, rules.body, 'body');
      errors.push(...bodyErrors);
    }

    

    // Validate email format if email field is present
    if (rules.body && rules.body.includes('email') && req.body.email) {
      // Trim whitespace from email and update req.body
      if (typeof req.body.email === 'string') {
        req.body.email = req.body.email.trim();
      }
      if (!req.body.email || !isValidEmail(req.body.email)) {
        errors.push({
          path: 'body.email',
          message: 'email must be a valid email address',
        });
      }
    }

    // Custom validation for user registration (firstName OR fullName)
    if (rules.custom) {
      const customErrors = rules.custom(req);
      errors.push(...customErrors);
    }

    if (errors.length > 0) {
      logger.warn('Validation error:', {
        errors,
        params: req.params,
        body: req.body,
        query: req.query,
      });
      res.status(400).json({
        message: 'Validation error',
        errors,
      });
      return;
    }

    next();
  };
};

module.exports = { validate };
