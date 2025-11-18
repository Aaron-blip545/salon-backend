const { promisifyQuery } = require('../utils/dbHelpers');

const staffRepository = {
  findAllActive: async () => {
    const sql = `
      SELECT 
        staff_id,
        full_name,
        email,
        phone,
        role,
        gender,
        is_active,
        created_at
      FROM staff
      WHERE is_active = 1
      ORDER BY full_name ASC
    `;
    
    console.log('[staffRepository.findAllActive] Executing query for active staff');
    const results = await promisifyQuery(sql);
    console.log('[staffRepository.findAllActive] Found staff:', results.length);
    return results;
  },
  
  findAll: async () => {
    const sql = `
      SELECT 
        staff_id,
        full_name,
        email,
        phone,
        role,
        gender,
        is_active,
        created_at
      FROM staff
      WHERE full_name IS NOT NULL AND full_name != ''
      ORDER BY created_at DESC
    `;
    
    console.log('[staffRepository.findAll] Executing query for all staff');
    const results = await promisifyQuery(sql);
    console.log('[staffRepository.findAll] Found staff:', results.length);
    return results;
  },
  
  findById: async (id) => {
    const sql = `
      SELECT 
        staff_id,
        full_name,
        email,
        phone,
        role,
        gender,
        is_active,
        created_at
      FROM staff
      WHERE staff_id = ?
    `;
    
    const results = await promisifyQuery(sql, [id]);
    return results.length > 0 ? results[0] : null;
  },
  
  findByEmail: async (email) => {
    const sql = `
      SELECT 
        staff_id,
        full_name,
        email,
        phone,
        role,
        gender,
        is_active,
        created_at
      FROM staff
      WHERE email = ?
    `;
    
    const results = await promisifyQuery(sql, [email]);
    return results.length > 0 ? results[0] : null;
  },
  
  create: async (staffData) => {
    const sql = `
      INSERT INTO staff (full_name, email, phone, role, gender, is_active, created_at)
      VALUES (?, ?, ?, ?, ?, ?, NOW())
    `;
    
    const params = [
      staffData.full_name,
      staffData.email,
      staffData.phone,
      staffData.role,
      staffData.gender,
      staffData.is_active
    ];
    
    return await promisifyQuery(sql, params);
  },
  
  update: async (id, staffData) => {
    const sql = `
      UPDATE staff
      SET full_name = ?, email = ?, phone = ?, role = ?, gender = ?, is_active = ?
      WHERE staff_id = ?
    `;
    
    const params = [
      staffData.full_name,
      staffData.email,
      staffData.phone,
      staffData.role,
      staffData.gender,
      staffData.is_active,
      id
    ];
    
    return await promisifyQuery(sql, params);
  }
};

module.exports = staffRepository;
