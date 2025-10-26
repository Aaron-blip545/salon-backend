const jwt = require('jsonwebtoken');
const ApiError = require('../utils/ApiError');

// Verify JWT token
const authenticateToken = (req, res, next) => {
  try {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (!token) {
      throw new ApiError(401, 'Access token required');
    }

    jwt.verify(token, process.env.JWT_SECRET, (err, user) => {
      if (err) {
        throw new ApiError(403, 'Invalid or expired token');
      }
      req.user = user;
      next();
    });
  } catch (error) {
    next(error);
  }
};

// Check user role
const requireRole = (allowedRoles) => {
  return (req, res, next) => {
    try {
      if (!req.user) {
        throw new ApiError(401, 'Authentication required');
      }

      if (!allowedRoles.includes(req.user.role)) {
        throw new ApiError(403, 'Access denied. Insufficient permissions.');
      }

      next();
    } catch (error) {
      next(error);
    }
  };
};

module.exports = {
  authenticateToken,
  requireRole
};