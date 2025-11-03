const db = require('../config/db');
const { promisifyQuery } = require('../utils/dbHelpers');

const bookingRepository = {
  // Get status ID by status name
  getStatusId: async (status_name) => {
    const sql = 'SELECT STATUS_ID FROM bookingstatus WHERE STATUS_NAME = ?';
    const results = await promisifyQuery(sql, [status_name]);
    return results[0] ? results[0].STATUS_ID : null;
  },

  // Create new booking
  create: async ({ user_id, service_id, booking_date, status_name }) => {
    // Get status ID
    const status_id = await bookingRepository.getStatusId(status_name);
    
    const sql = `
      INSERT INTO bookings (USER_ID, SERVICE_ID, BOOKING_DATE, STATUS_ID)
      VALUES (?, ?, ?, ?)
    `;
    const result = await promisifyQuery(sql, [user_id, service_id, booking_date, status_id]);
    return result.insertId;
  },

  
  // Find booking by ID with all details
  findById: async (booking_id) => {
    const sql = `
      SELECT 
        b.BOOKING_ID,
        b.USER_ID,
        b.SERVICE_ID,
        b.BOOKING_DATE,
        b.CREATED_AT,
        bs.STATUS_NAME
      FROM bookings b
      JOIN bookingstatus bs ON b.STATUS_ID = bs.STATUS_ID
      WHERE b.BOOKING_ID = ?
    `;
    const results = await promisifyQuery(sql, [booking_id]);
    return results[0] || null;
  },

  // Find bookings by user ID
  findByUserId: async (user_id) => {
    const sql = `
      SELECT 
        b.BOOKING_ID,
        b.BOOKING_DATE,
        b.CREATED_AT,
        bs.STATUS_NAME,
        s.NAME as SERVICE_NAME,
        s.DESCRIPTION,
        s.DURATION,
        s.PRICE
      FROM bookings b
      JOIN services s ON b.SERVICE_ID = s.SERVICE_ID
      JOIN bookingstatus bs ON b.STATUS_ID = bs.STATUS_ID
      WHERE b.USER_ID = ?
      ORDER BY b.BOOKING_DATE DESC
    `;
    return await promisifyQuery(sql, [user_id]);
  },

  // Find all bookings (for admin)
  findAll: async () => {
    const sql = `
      SELECT 
        b.BOOKING_ID,
        b.BOOKING_DATE,
        b.CREATED_AT,
        bs.STATUS_NAME,
        u.NAME as CUSTOMER_NAME,
        u.EMAIL_ADDRESS as CUSTOMER_EMAIL,
        u.PHONE as CUSTOMER_PHONE,
        s.NAME as SERVICE_NAME,
        s.DURATION,
        s.PRICE
      FROM bookings b
      JOIN user u ON b.USER_ID = u.USER_ID
      JOIN services s ON b.SERVICE_ID = s.SERVICE_ID
      JOIN bookingstatus bs ON b.STATUS_ID = bs.STATUS_ID
      ORDER BY b.BOOKING_DATE DESC
    `;
    return await promisifyQuery(sql);
  },

  // Find bookings by status
  findByStatus: async (status_name) => {
    const sql = `
      SELECT 
        b.BOOKING_ID,
        b.BOOKING_DATE,
        b.CREATED_AT,
        bs.STATUS_NAME,
        u.NAME as CUSTOMER_NAME,
        u.EMAIL_ADDRESS as CUSTOMER_EMAIL,
        u.PHONE as CUSTOMER_PHONE,
        s.NAME as SERVICE_NAME,
        s.DURATION,
        s.PRICE
      FROM bookings b
      JOIN user u ON b.USER_ID = u.USER_ID
      JOIN services s ON b.SERVICE_ID = s.SERVICE_ID
      JOIN bookingstatus bs ON b.STATUS_ID = bs.STATUS_ID
      WHERE bs.STATUS_NAME = ?
      ORDER BY b.CREATED_AT ASC
    `;
    return await promisifyQuery(sql, [status_name]);
  },

  // Check if time slot is available
  isTimeSlotAvailable: async (booking_date, booking_time) => {
    const sql = `
      SELECT COUNT(*) as count 
      FROM bookings b
      JOIN bookingstatus bs ON b.STATUS_ID = bs.STATUS_ID
      WHERE b.BOOKING_DATE = ?
      AND b.BOOKINTG_TIME = ?
      AND bs.STATUS_NAME IN ('pending', 'confirmed')
    `;
    const results = await promisifyQuery(sql, [booking_date, booking_time]);
    return results[0].count === 0;
  },

  // Get booked slots for a date
  getBookedSlots: async (date) => {
    const sql = `
      SELECT TIME(b.BOOKING_DATE) as BOOKING_TIME
      FROM bookings b
      JOIN bookingstatus bs ON b.STATUS_ID = bs.STATUS_ID
      WHERE DATE(b.BOOKING_DATE) = ?
      AND bs.STATUS_NAME IN ('pending', 'confirmed')
    `;
    const results = await promisifyQuery(sql, [date]);
    return results.map(r => r.BOOKING_TIME);
  },

  // Update booking status
  updateStatus: async (booking_id, status_name) => {
    const status_id = await bookingRepository.getStatusId(status_name);
    const sql = 'UPDATE bookings SET STATUS_ID = ? WHERE BOOKING_ID = ?';
    await promisifyQuery(sql, [status_id, booking_id]);
  },

  // Delete booking
  deleteById: async (booking_id) => {
    const sql = 'DELETE FROM bookings WHERE BOOKING_ID = ?';
    await promisifyQuery(sql, [booking_id]);
  }
};

module.exports = bookingRepository;