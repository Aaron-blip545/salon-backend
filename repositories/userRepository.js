const db = require('../config/db');
const { promisifyQuery } = require('../utils/dbHelpers');

const userRepository = {
  // Create new user
  create: async ({ name, email_address, phone, password_hash, role, gender }) => {
    console.log('Creating user with gender:', gender); // DEBUG
    const sql = 'INSERT INTO user (NAME, EMAIL_ADDRESS, PHONE, PASSWORD_HASH, ROLE, GENDER) VALUES (?, ?, ?, ?, ?, ?)';
    const result = await promisifyQuery(sql, [name, email_address, phone, password_hash, role, gender]);
    console.log('User created:', result.insertId); // DEBUG
    return result.insertId;
  },

  // Find user by email
  findByEmail: async (email_address) => {
    const sql = 'SELECT * FROM user WHERE EMAIL_ADDRESS = ?';
    const results = await promisifyQuery(sql, [email_address]);
    return results[0] || null;
  },

  // Find user by phone
  findByPhone: async (phone) => {
    const sql = 'SELECT * FROM user WHERE PHONE = ?';
    const results = await promisifyQuery(sql, [phone]);
    return results[0] || null;
  },

  // Find user by ID
  findById: async (user_id) => {
    const sql = 'SELECT USER_ID, NAME, EMAIL_ADDRESS, PHONE, ROLE, GENDER, CREATED_AT FROM user WHERE USER_ID = ?';
    const results = await promisifyQuery(sql, [user_id]);
    return results[0] || null;
  },

  // Update user by ID
  updateById: async (user_id, { name, phone }) => {
    const sql = 'UPDATE user SET NAME = ?, PHONE = ? WHERE USER_ID = ?';
    const result = await promisifyQuery(sql, [name, phone, user_id]);
    return result.affectedRows > 0;
  },

  // Get all users
  findAll: async () => {
    try {
      console.log('[findAll] Executing query for all customers');
      const sql = 'SELECT USER_ID, NAME, EMAIL_ADDRESS, PHONE, ROLE, GENDER, CREATED_AT FROM user WHERE ROLE = "customer" ORDER BY CREATED_AT DESC';
      const results = await promisifyQuery(sql, []);
      console.log('[findAll] Query returned:', results ? results.length : 0, 'results');
      return results || [];
    } catch (error) {
      console.error('[findAll] Repository error:', error);
      throw error;
    }
  }
};

module.exports = userRepository;