const db = require('../config/db');
const { promisifyQuery } = require('../utils/dbHelpers');

const userRepository = {
  // Create new user
  create: async ({ name, email_address, phone, password_hash, role }) => {
    const sql = 'INSERT INTO user (NAME, EMAIL_ADDRESS, PHONE, PASSWORD_HASH, ROLE) VALUES (?, ?, ?, ?, ?)';
    const result = await promisifyQuery(sql, [name, email_address, phone, password_hash, role]);
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
    const sql = 'SELECT USER_ID, NAME, EMAIL_ADDRESS, PHONE, ROLE, CREATED_AT FROM user WHERE USER_ID = ?';
    const results = await promisifyQuery(sql, [user_id]);
    return results[0] || null;
  }
  ,
  // Update user by ID
  updateById: async (user_id, { name, email_address, phone }) => {
    const sql = 'UPDATE user SET NAME = ?, EMAIL_ADDRESS = ?, PHONE = ? WHERE USER_ID = ?';
    const result = await promisifyQuery(sql, [name, email_address, phone, user_id]);
    return result.affectedRows > 0;
  }
};

module.exports = userRepository;