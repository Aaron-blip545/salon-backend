const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const userRepository = require('../repositories/userRepository');
const ApiError = require('../utils/ApiError');

const userService = {
  // Create new user
  createUser: async ({ name, email_address, phone, password, gender  }) => {
    console.log('Service received gender:', gender); // DEBUG
    // Check if email already exists
    const existingUser = await userRepository.findByEmail(email_address);
    if (existingUser) {
      throw new ApiError(409, 'Email address already registered');
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(password, 10);

    // Trim and limit phone to 15 characters
    const trimmedPhone = (phone || '').trim().substring(0, 15);

    // Create user
    const userId = await userRepository.create({
      name,
      email_address,
      phone: trimmedPhone,
      password_hash: hashedPassword,
      role: 'customer',
      gender
    });

    return { user_id: userId };
  },

  // Authenticate user
  authenticateUser: async ({ email_address, password }) => {
    // Find user by email
    const user = await userRepository.findByEmail(email_address);
    if (!user) {
      throw new ApiError(401, 'Invalid email or password');
    }

    // Verify password
    const isMatch = await bcrypt.compare(password, user.PASSWORD_HASH);
    if (!isMatch) {
      throw new ApiError(401, 'Invalid email or password');
    }

    // Generate JWT token
    const token = jwt.sign(
      { id: user.USER_ID, role: user.ROLE },
      process.env.JWT_SECRET,
      { expiresIn: '8h' }
    );

    return {
      token,
      user: {
        id: user.USER_ID,
        name: user.NAME,
        email: user.EMAIL_ADDRESS,
        phone: user.PHONE,
        role: user.ROLE,
        gender: user.GENDER
      }
    };
  }
  ,

  // Get user by ID
  getUserById: async (user_id) => {
    const user = await userRepository.findById(user_id);
    if (!user) throw new ApiError(404, 'User not found');
    return {
      id: user.USER_ID,
      name: user.NAME,
      email: user.EMAIL_ADDRESS,
      phone: user.PHONE,
      role: user.ROLE,
      gender: user.GENDER
    };
  },

  // Update user profile
  updateUser: async (user_id, { name, email_address, phone, gender }) => {
    // Basic validation
    if (!name || !email_address) {
      throw new ApiError(400, 'Name and email are required');
    }

    // Optional: check for duplicate email (if email changed)
    const existing = await userRepository.findByEmail(email_address);
    if (existing && existing.USER_ID !== user_id) {
      throw new ApiError(409, 'Email address already used by another account');
    }

    // Trim and limit phone to 15 characters
    const trimmedPhone = (phone || '').trim().substring(0, 15);

    const updated = await userRepository.updateById(user_id, { name, email_address, phone: trimmedPhone, gender });
    if (!updated) throw new ApiError(500, 'Failed to update user');

    return await userService.getUserById(user_id);
  },

  // Get all users (admin only)
  getAllUsers: async () => {
    try {
      console.log('[getAllUsers] Service called');
      const users = await userRepository.findAll();
      console.log('[getAllUsers] Repository returned:', users ? users.length : 0, 'users');
      return users || [];
    } catch (error) {
      console.error('[getAllUsers] Service error:', error);
      throw error;
    }
  }
};

module.exports = userService;