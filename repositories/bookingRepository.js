const db = require('../config/db');
const { promisifyQuery } = require('../utils/dbHelpers');

const bookingRepository = {
  // Create new booking
  create: async ({ user_id, service_id, staff_id, booking_date, booking_time, status_name }) => {
    const sql = `
      INSERT INTO bookings (USER_ID, SERVICE_ID, staff_id, BOOKING_DATE, BOOKING_TIME, STATUS_NAME) 
      VALUES (?, ?, ?, ?, ?, ?)
    `;
    const result = await promisifyQuery(sql, [user_id, service_id, staff_id, booking_date, booking_time, status_name]);
    return result.insertId;
  },

  // Get booking by ID
  // Check if time slot is available
  isTimeSlotAvailable: async (booking_date, booking_time, staff_id) => {
    const sql = `
      SELECT COUNT(*) as count 
      FROM bookings b
      WHERE b.BOOKING_DATE = ?
      AND b.BOOKING_TIME = ?
      AND b.staff_id = ?
      AND b.STATUS_NAME IN ('pending', 'pending_payment', 'confirmed')
    `;
    const results = await promisifyQuery(sql, [booking_date, booking_time, staff_id]);
    return results[0].count === 0;
  },

  // Get booked slots for a date
  getBookedSlots: async (date, staff_id) => {
    const sql = `
      SELECT b.BOOKING_TIME
      FROM bookings b
      WHERE b.BOOKING_DATE = ?
      AND b.STATUS_NAME IN ('pending', 'pending_payment', 'confirmed')
      ${staff_id ? 'AND b.staff_id = ?' : ''}
    `;
    const params = staff_id ? [date, staff_id] : [date];
    const results = await promisifyQuery(sql, params);
    return results.map(r => r.BOOKING_TIME);
  },

  // Find bookings for a user, include service and transaction info
  findByUserId: async (user_id) => {
    const sql = `
      SELECT
        b.BOOKING_ID,
        b.BOOKING_DATE,
        b.BOOKING_TIME,
        b.STATUS_NAME as booking_status,
        b.staff_id,
        st.FULL_NAME as staff_name,
        s.SERVICE_NAME,
        s.PRICE as service_price,

        t.AMOUNT as paid_amount,
        t.PRICE as transaction_price,
        t.BOOKING_FEE as booking_fee,
        t.REMAINING_BALANCE as remaining_balance,
        t.PAYMENT_STATUS as payment_status,
        t.RECEIPT_IMAGE as receipt_image,
        t.PAYMENT_METHOD as payment_method
      FROM bookings b
      LEFT JOIN services s ON b.SERVICE_ID = s.SERVICE_ID
      LEFT JOIN transactions t ON t.BOOKING_ID = b.BOOKING_ID
      LEFT JOIN staff st ON b.staff_id = st.STAFF_ID

      WHERE b.USER_ID = ?
      ORDER BY b.BOOKING_DATE DESC, b.BOOKING_TIME DESC
    `;

    const results = await promisifyQuery(sql, [user_id]);
    return results;
  },

  // Find all bookings with full details (for admin)
  findAll: async () => {
    const sql = `
      SELECT
        b.BOOKING_ID,
        b.BOOKING_DATE,
        b.BOOKING_TIME,
        b.STATUS_NAME as booking_status,
        b.USER_ID,
        COALESCE(u.NAME, 'Guest') as client_name,
        u.EMAIL_ADDRESS as client_email,
        b.staff_id,
        st.FULL_NAME as staff_name,
        s.SERVICE_NAME,
        s.DESCRIPTION as service_description,
        s.PRICE as service_price,
        s.DURATION as service_duration,
        t.PAYMENT_METHOD,
        t.PAYMENT_STATUS as payment_status,
        t.RECEIPT_IMAGE as receipt_image
      FROM bookings b
      LEFT JOIN user u ON b.USER_ID = u.USER_ID
      LEFT JOIN services s ON b.SERVICE_ID = s.SERVICE_ID
      LEFT JOIN staff st ON b.staff_id = st.STAFF_ID
      LEFT JOIN transactions t ON t.BOOKING_ID = b.BOOKING_ID
      ORDER BY b.BOOKING_DATE DESC, b.BOOKING_TIME DESC
    `;

    const results = await promisifyQuery(sql, []);
    return results;
  },

  // Find booking by ID with full details
  findById: async (booking_id) => {
    const sql = `
      SELECT
        b.BOOKING_ID,
        b.BOOKING_DATE,
        b.BOOKING_TIME,
        b.STATUS_NAME as booking_status,
        b.USER_ID,
        COALESCE(u.NAME, 'Guest') as client_name,
        u.EMAIL_ADDRESS as client_email,
        b.staff_id,
        st.FULL_NAME as staff_name,
        s.SERVICE_ID,
        s.SERVICE_NAME,
        s.DESCRIPTION as service_description,
        s.PRICE as service_price,
        s.DURATION as service_duration
      FROM bookings b
      LEFT JOIN user u ON b.USER_ID = u.USER_ID
      LEFT JOIN services s ON b.SERVICE_ID = s.SERVICE_ID
      LEFT JOIN staff st ON b.staff_id = st.STAFF_ID
      WHERE b.BOOKING_ID = ?

    `;
    const results = await promisifyQuery(sql, [booking_id]);
    return results.length > 0 ? results[0] : null;
  },

  // Get pending bookings (for admin)
  findPendingBookings: async () => {
    const sql = `
      SELECT
        b.BOOKING_ID,
        b.BOOKING_DATE,
        b.BOOKING_TIME,
        b.STATUS_NAME as booking_status,
        b.USER_ID,
        COALESCE(u.NAME, 'Guest') as client_name,
        u.EMAIL_ADDRESS as client_email,
        b.staff_id,
        st.FULL_NAME as staff_name,
        s.SERVICE_NAME,
        s.PRICE as service_price
      FROM bookings b
      LEFT JOIN user u ON b.USER_ID = u.USER_ID
      LEFT JOIN services s ON b.SERVICE_ID = s.SERVICE_ID
      LEFT JOIN staff st ON b.staff_id = st.STAFF_ID
      WHERE b.STATUS_NAME = 'pending'

      ORDER BY b.BOOKING_DATE ASC, b.BOOKING_TIME ASC
    `;
    const results = await promisifyQuery(sql, []);
    return results;
  },

  // Update booking status
  updateStatus: async (booking_id, status_name) => {
    const sql = 'UPDATE bookings SET STATUS_NAME = ? WHERE BOOKING_ID = ?';
    await promisifyQuery(sql, [status_name, booking_id]);
  },

  // Delete booking
  deleteById: async (booking_id) => {
    const sql = 'DELETE FROM bookings WHERE BOOKING_ID = ?';
    await promisifyQuery(sql, [booking_id]);
  }
};

module.exports = bookingRepository;