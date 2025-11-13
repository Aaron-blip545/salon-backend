const userService = require('../services/userService');
const { validationResult } = require('../utils/validation');
const ApiError = require('../utils/ApiError');

const authController = {
  // Register new user
  register: async (req, res, next) => {
    try {
      const { name, email_address, phone, password } = req.body;

      // Validate input
      const errors = validationResult({ name, email_address, phone, password });
      if (errors.length > 0) {
        throw new ApiError(400, 'Validation failed', errors);
      }

      // Create user
      const result = await userService.createUser({ name, email_address, phone, password });

      res.status(201).json({
        success: true,
        message: 'User registered successfully!',
        data: result
      });
    } catch (error) {
      next(error);
    }
  },

  // Login user
  login: async (req, res, next) => {
    try {
      const { email_address, password } = req.body;

      // Validate input
      if (!email_address || !password) {
        throw new ApiError(400, 'Email and password are required');
      }

      // Authenticate user
      const result = await userService.authenticateUser({ email_address, password });

      res.json({
        success: true,
        message: 'Login successful',
        // return token at top-level for frontend convenience
        token: result.token,
        data: { user: result.user }
      });
    } catch (error) {
      next(error);
    }
  }
  ,

  // Get current authenticated user
  me: async (req, res, next) => {
    try {
      const userId = req.user && (req.user.id || req.user.user_id);
      if (!userId) throw new ApiError(401, 'User not authenticated');

      const user = await userService.getUserById(userId);
      res.json({ success: true, data: user });
    } catch (error) {
      next(error);
    }
  },

  // Update current authenticated user
  updateMe: async (req, res, next) => {
    try {
      const userId = req.user && (req.user.id || req.user.user_id);
      if (!userId) throw new ApiError(401, 'User not authenticated');

      const { name, email_address, phone } = req.body;
      const updated = await userService.updateUser(userId, { name, email_address, phone });
      res.json({ success: true, message: 'Profile updated', data: updated });
    } catch (error) {
      next(error);
    }
  }
};

module.exports = authController;