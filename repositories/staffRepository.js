const { promisifyQuery } = require('../utils/dbHelpers');

const staffRepository = {
  findAllActive: async () => {
    const sql = `
      SELECT 
        STAFF_ID as staff_id,
        FULL_NAME as full_name,
        EMAIL as email,
        ROLE as role,
        GENDER as gender,
        IS_ACTIVE as is_active
      FROM staff
      WHERE IS_ACTIVE = 1
      ORDER BY FULL_NAME ASC
    `;

    return promisifyQuery(sql);
  }
};

module.exports = staffRepository;
