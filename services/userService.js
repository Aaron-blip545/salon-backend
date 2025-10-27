const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const userRepository = require('../repositories/userRepository');
const ApiError = require('../utils/ApiError');

const userService = {
  // Create new user
  createUser: async ({ name, email_address, phone, password }) => {
    // Check if email already exists
    const existingUser = await userRepository.findByEmail(email_address);
    if (existingUser) {
      throw new ApiError(409, 'Email address already registered');
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(password, 10);

    // Create user
    const userId = await userRepository.create({
      name,
      email_address,
      phone,
      password_hash: hashedPassword,
      role: 'customer'
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
        role: user.ROLE
      }
    };
  }
};

module.exports = userService;