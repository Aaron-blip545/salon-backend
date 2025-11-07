const db = require('../config/db');
const { promisifyQuery } = require('../utils/dbHelpers');


const bookingRepository = {
//Create new booking

  create: async ({ user_id, service_id, booking_date, booking_time, status_name }) => {

    const sql = `
      INSERT INTO bookings (USER_ID, SERVICE_ID, BOOKING_DATE, BOOKING_TIME, STATUS_NAME) 
      VALUES (?, ?, ?, ?, ?)
    `;
    const result = await promisifyQuery(sql, [user_id, service_id, booking_date, booking_time, status_name]);
    return result.insertId;
  } ,

  // Check if time slot is available
  isTimeSlotAvailable: async (booking_date, booking_time) => {
    const sql = `
      SELECT COUNT(*) as count 
      FROM bookings b
      WHERE b.BOOKING_DATE = ?
      AND b.BOOKING_TIME = ?
    `;
    const results = await promisifyQuery(sql, [booking_date, booking_time]);
    return results[0].count === 0;
  },

  // Get booked slots for a date
  getBookedSlots: async (date) => {
    const sql = `
      SELECT TIME(b.BOOKING_DATE) as BOOKING_TIME
      FROM bookings b
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