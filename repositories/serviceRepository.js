const db = require('../config/db');
const { promisifyQuery } = require('../utils/dbHelpers');

const serviceRepository = {
  // Find all active services
  findActive: async () => {
    const sql = 'SELECT * FROM SERVICES WHERE IS_ACTIVE = 1 ORDER BY SERVICE_NAME';
    return await promisifyQuery(sql);
  },

  // Find service by ID
  findById: async (service_id) => {
    const sql = 'SELECT * FROM SERVICES WHERE SERVICE_ID = ?';
    const results = await promisifyQuery(sql, [service_id]);
    return results[0] || null;
  },

  // Create new service
  addService: async ({ name, description, price, duration }) => {
    const sql = `INSERT INTO SERVICES (NAME, DESCRIPTION, PRICE, DURATION, IS_ACTIVE) VALUES (?, ?, ?, ?, 1)`;
    const result = await promisifyQuery(sql, [name, description, price, duration]);
    return result.insertId;
  }
};




module.exports = serviceRepository;