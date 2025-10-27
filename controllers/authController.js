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
        data: result
      });
    } catch (error) {
      next(error);
    }
  }
};

module.exports = authController;