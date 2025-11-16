const db = require('../config/db');
const { promisifyQuery } = require('../utils/dbHelpers');

class TransactionRepository {
  // Create booking and transaction together (atomic operation)
  async createBookingWithTransaction(data) {
    const {
      user_id,
      service_id,
      booking_date,
      booking_time,
      amount,
      price,
      booking_fee,
      remaining_balance,
      payment_method,
      payment_status
    } = data;

    try {
      // Start transaction
      await promisifyQuery('START TRANSACTION');

      const insertBookingSql = `
        INSERT INTO bookings (USER_ID, SERVICE_ID, BOOKING_DATE, BOOKING_TIME, STATUS_NAME, CREATED_AT)
        VALUES (?, ?, ?, ?, 'pending', NOW())
      `;

      console.log('Inserting booking with:', { user_id, service_id, booking_date, booking_time });
      const bookingRes = await promisifyQuery(insertBookingSql, [user_id, service_id, booking_date, booking_time]);
      const bookingId = bookingRes.insertId;
      console.log('Booking created with ID:', bookingId);

      const transactionReference = `TXN-${Date.now()}-${bookingId}`;

      const insertTransactionSql = `
        INSERT INTO transactions (
          BOOKING_ID, SERVICE_ID, USER_ID, AMOUNT, PRICE, DISCOUNT,
          PAYMENT_METHOD, PAYMENT_STATUS, TRANSACTION_REFERENCE,
          BOOKING_FEE, REMAINING_BALANCE, PAYMONGO_SOURCE_ID, PAYMONGO_PAYMENT_ID, CREATED_AT
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())
      `;

      console.log('Inserting transaction with:', { bookingId, service_id, user_id, amount, payment_method, payment_status });
      const transactionRes = await promisifyQuery(insertTransactionSql, [
        bookingId,
        service_id,
        user_id,
        amount,
        price,
        0,
        payment_method,
        payment_status,
        transactionReference,
        booking_fee,
        remaining_balance,
        null,
        null
      ]);

      await promisifyQuery('COMMIT');
      console.log('Transaction committed successfully');

      // Fetch inserted rows
      const bookingRows = await promisifyQuery('SELECT * FROM bookings WHERE BOOKING_ID = ?', [bookingId]);
      const transactionRows = await promisifyQuery('SELECT * FROM transactions WHERE TRANSACTION_ID = ?', [transactionRes.insertId]);

      return {
        booking: bookingRows[0],
        transaction: transactionRows[0]
      };
    } catch (error) {
      console.error('Transaction error:', error);
      await promisifyQuery('ROLLBACK');
      throw error;
    }
  }

  // Create transaction for an existing booking
  async createTransaction(data) {
    const {
      booking_id,
      service_id,
      user_id,
      amount,
      price,
      booking_fee = 0,
      remaining_balance = 0,
      payment_method,
      payment_status
    } = data;

    const transactionReference = `TXN-${Date.now()}-${booking_id}`;

    const insertTransactionSql = `
      INSERT INTO transactions (
        BOOKING_ID, SERVICE_ID, USER_ID, AMOUNT, PRICE, DISCOUNT,
        PAYMENT_METHOD, PAYMENT_STATUS, TRANSACTION_REFERENCE,
        booking_fee, remaining_balance, CREATED_AT
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())
    `;

    const result = await promisifyQuery(insertTransactionSql, [
      booking_id,
      service_id,
      user_id,
      amount,
      price,
      0, // discount
      payment_method,
      payment_status,
      transactionReference,
      booking_fee,
      remaining_balance
    ]);

    return result.insertId;
  }


  // Get all transactions for a user
  async getUserTransactions(user_id) {
    const sql = `
      SELECT 
        t.TRANSACTION_ID as transaction_id,
        t.BOOKING_ID as booking_id,
        t.AMOUNT as amount,
        t.PRICE as price,
        t.BOOKING_FEE as booking_fee,
        t.REMAINING_BALANCE as remaining_balance,
        t.DISCOUNT as discount,
        t.PAYMENT_METHOD as payment_method,
        t.PAYMENT_STATUS as payment_status,
        t.TRANSACTION_REFERENCE as transaction_reference,
        t.PAYMONGO_SOURCE_ID as paymongo_source_id,
        t.PAYMONGO_PAYMENT_ID as paymongo_payment_id,
        t.CREATED_AT as created_at,
        b.BOOKING_DATE as booking_date,
        b.BOOKING_TIME as booking_time,
        b.STATUS_NAME as booking_status,
        s.SERVICE_NAME as service_name,
        s.DURATION as duration
      FROM transactions t
      JOIN bookings b ON t.BOOKING_ID = b.BOOKING_ID
      JOIN services s ON t.SERVICE_ID = s.SERVICE_ID
      WHERE t.USER_ID = ?
      ORDER BY t.CREATED_AT DESC
    `;

    const results = await promisifyQuery(sql, [user_id]);
    return results;
  }

  // Get transaction by booking ID with user verification
  async getTransactionByBookingId(booking_id, user_id) {
    const sql = `
      SELECT 
        t.*,
        b.BOOKING_DATE as booking_date,
        b.BOOKING_TIME as booking_time,
        b.STATUS_NAME as booking_status,
        s.SERVICE_NAME as service_name,
        s.PRICE as service_price
      FROM transactions t
      JOIN bookings b ON t.BOOKING_ID = b.BOOKING_ID
      JOIN services s ON t.SERVICE_ID = s.SERVICE_ID
      WHERE t.BOOKING_ID = ? AND t.USER_ID = ?
    `;

    const results = await promisifyQuery(sql, [booking_id, user_id]);
    return results[0] || null;
  }

  // Get transaction by booking ID only (for admin)
  async getTransactionByBookingIdOnly(booking_id) {
    const results = await promisifyQuery('SELECT * FROM transactions WHERE BOOKING_ID = ?', [booking_id]);
    return results[0] || null;
  }

  // Update payment status
  async updatePaymentStatus(booking_id, status) {
    await promisifyQuery('UPDATE transactions SET PAYMENT_STATUS = ? WHERE BOOKING_ID = ?', [status, booking_id]);
  }

  // Update PayMongo source ID
  async updatePayMongoSourceId(booking_id, source_id) {
    await promisifyQuery('UPDATE transactions SET PAYMONGO_SOURCE_ID = ? WHERE BOOKING_ID = ?', [source_id, booking_id]);
  }

  // Update PayMongo payment ID
  async updatePayMongoPaymentId(booking_id, payment_id) {
    await promisifyQuery('UPDATE transactions SET PAYMONGO_PAYMENT_ID = ? WHERE BOOKING_ID = ?', [payment_id, booking_id]);
  }

  // Update transaction status by transaction ID
  async updateTransactionStatus(transaction_id, status) {
    await promisifyQuery('UPDATE transactions SET PAYMENT_STATUS = ? WHERE TRANSACTION_ID = ?', [status, transaction_id]);
    const rows = await promisifyQuery('SELECT * FROM transactions WHERE TRANSACTION_ID = ?', [transaction_id]);
    return rows[0] || null;
  }

  // Get transaction by transaction ID
  async getTransactionById(transaction_id) {
    const rows = await promisifyQuery('SELECT * FROM transactions WHERE TRANSACTION_ID = ?', [transaction_id]);
    return rows[0] || null;
  }

  // Get transaction by PayMongo source ID
  async getTransactionBySourceId(source_id) {
    const rows = await promisifyQuery('SELECT * FROM transactions WHERE PAYMONGO_SOURCE_ID = ?', [source_id]);
    return rows[0] || null;
  }

  // Update remaining balance
  async updateRemainingBalance(booking_id, new_balance) {
    await promisifyQuery('UPDATE transactions SET REMAINING_BALANCE = ? WHERE BOOKING_ID = ?', [new_balance, booking_id]);
  }

  // Mark transaction as refunded
  async markAsRefunded(booking_id) {
    await promisifyQuery('UPDATE transactions SET PAYMENT_STATUS = ? WHERE BOOKING_ID = ?', ['REFUNDED', booking_id]);
  }

  // Mark transaction as cancelled
  async markAsCancelled(booking_id) {
    await promisifyQuery('UPDATE transactions SET PAYMENT_STATUS = ? WHERE BOOKING_ID = ?', ['CANCELLED', booking_id]);
  }

  // Get all pending transactions (for admin)
  async getPendingTransactions() {
    const sql = `
      SELECT 
        t.*,
        b.BOOKING_DATE as booking_date,
        b.BOOKING_TIME as booking_time,
        b.STATUS_NAME as booking_status,
        u.NAME as user_name,
        u.EMAIL as user_email,
        s.SERVICE_NAME as service_name
      FROM transactions t
      JOIN bookings b ON t.BOOKING_ID = b.BOOKING_ID
      JOIN users u ON t.USER_ID = u.USER_ID
      JOIN services s ON t.SERVICE_ID = s.SERVICE_ID
      WHERE t.PAYMENT_STATUS IN ('PENDING', 'PARTIAL_PENDING', 'PARTIAL_PAID')
      ORDER BY t.CREATED_AT DESC
    `;

    const results = await promisifyQuery(sql);
    return results;
  }

  // Get completed transactions (for admin)
  async getCompletedTransactions() {
    const sql = `
      SELECT 
        t.*,
        b.BOOKING_DATE as booking_date,
        b.BOOKING_TIME as booking_time,
        b.STATUS_NAME as booking_status,
        u.NAME as user_name,
        u.EMAIL as user_email,
        s.SERVICE_NAME as service_name
      FROM transactions t
      JOIN bookings b ON t.BOOKING_ID = b.BOOKING_ID
      JOIN users u ON t.USER_ID = u.USER_ID
      JOIN services s ON t.SERVICE_ID = s.SERVICE_ID
      WHERE t.PAYMENT_STATUS = 'COMPLETED'
      ORDER BY t.CREATED_AT DESC
    `;

    const results = await promisifyQuery(sql);
    return results;
  }

  // Get transaction statistics for a user
  async getUserTransactionStats(user_id) {
    const sql = `
      SELECT 
        COUNT(*) as total_transactions,
        SUM(CASE WHEN PAYMENT_STATUS = 'COMPLETED' THEN AMOUNT ELSE 0 END) as total_paid,
        SUM(CASE WHEN PAYMENT_STATUS IN ('PENDING', 'PARTIAL_PENDING') THEN AMOUNT ELSE 0 END) as total_pending,
        SUM(CASE WHEN PAYMENT_STATUS = 'REFUNDED' THEN AMOUNT ELSE 0 END) as total_refunded
      FROM transactions
      WHERE USER_ID = ?
    `;

    const results = await promisifyQuery(sql, [user_id]);
    return results[0] || { total_transactions: 0, total_paid: 0, total_pending: 0, total_refunded: 0 };
  }

  // Get all transactions (for admin dashboard)
  async getAllTransactions(limit = 50, offset = 0) {
    const sql = `
      SELECT 
        t.*,
        b.BOOKING_DATE as booking_date,
        b.BOOKING_TIME as booking_time,
        b.STATUS_NAME as booking_status,
        u.NAME as user_name,
        u.EMAIL as user_email,
        s.SERVICE_NAME as service_name
      FROM transactions t
      JOIN bookings b ON t.BOOKING_ID = b.BOOKING_ID
      JOIN users u ON t.USER_ID = u.USER_ID
      JOIN services s ON t.SERVICE_ID = s.SERVICE_ID
      ORDER BY t.CREATED_AT DESC
      LIMIT ? OFFSET ?
    `;

    const results = await promisifyQuery(sql, [limit, offset]);
    return results;
  }

  // Get transactions by date range
  async getTransactionsByDateRange(start_date, end_date) {
    const sql = `
      SELECT 
        t.*,
        b.BOOKING_DATE as booking_date,
        b.BOOKING_TIME as booking_time,
        b.STATUS_NAME as booking_status,
        u.NAME as user_name,
        s.SERVICE_NAME as service_name
      FROM transactions t
      JOIN bookings b ON t.BOOKING_ID = b.BOOKING_ID
      JOIN users u ON t.USER_ID = u.USER_ID
      JOIN services s ON t.SERVICE_ID = s.SERVICE_ID
      WHERE DATE(t.CREATED_AT) BETWEEN ? AND ?
      ORDER BY t.CREATED_AT DESC
    `;

    const results = await promisifyQuery(sql, [start_date, end_date]);
    return results;
  }

  // Get transactions by payment method
  async getTransactionsByPaymentMethod(payment_method) {
    const sql = `
      SELECT 
        t.*,
        b.BOOKING_DATE as booking_date,
        b.BOOKING_TIME as booking_time,
        u.NAME as user_name,
        s.SERVICE_NAME as service_name
      FROM transactions t
      JOIN bookings b ON t.BOOKING_ID = b.BOOKING_ID
      JOIN users u ON t.USER_ID = u.USER_ID
      JOIN services s ON t.SERVICE_ID = s.SERVICE_ID
      WHERE t.PAYMENT_METHOD = ?
      ORDER BY t.CREATED_AT DESC
    `;

    const results = await promisifyQuery(sql, [payment_method]);
    return results;
  }

  // Get total revenue (for admin)
  async getTotalRevenue() {
    const sql = `
      SELECT 
        SUM(AMOUNT) as total_revenue,
        COUNT(*) as total_transactions,
        AVG(AMOUNT) as average_transaction
      FROM transactions
      WHERE PAYMENT_STATUS = 'COMPLETED'
    `;

    const results = await promisifyQuery(sql);
    return results[0] || { total_revenue: 0, total_transactions: 0, average_transaction: 0 };
  }

  // Get revenue by service
  async getRevenueByService() {
    const sql = `
      SELECT 
        s.SERVICE_NAME as service_name,
        COUNT(t.TRANSACTION_ID) as booking_count,
        SUM(t.AMOUNT) as total_revenue,
        AVG(t.AMOUNT) as average_revenue
      FROM transactions t
      JOIN services s ON t.SERVICE_ID = s.SERVICE_ID
      WHERE t.PAYMENT_STATUS = 'COMPLETED'
      GROUP BY s.SERVICE_ID, s.SERVICE_NAME
      ORDER BY total_revenue DESC
    `;

    const results = await promisifyQuery(sql);
    return results;
  }

  // Search transactions
  async searchTransactions(searchTerm) {
    const sql = `
      SELECT 
        t.*,
        b.BOOKING_DATE as booking_date,
        b.BOOKING_TIME as booking_time,
        u.NAME as user_name,
        u.EMAIL as user_email,
        s.SERVICE_NAME as service_name
      FROM transactions t
      JOIN bookings b ON t.BOOKING_ID = b.BOOKING_ID
      JOIN users u ON t.USER_ID = u.USER_ID
      JOIN services s ON t.SERVICE_ID = s.SERVICE_ID
      WHERE 
        t.TRANSACTION_REFERENCE LIKE ? OR
        u.NAME LIKE ? OR
        u.EMAIL LIKE ? OR
        s.SERVICE_NAME LIKE ?
      ORDER BY t.CREATED_AT DESC
      LIMIT 50
    `;

    const results = await promisifyQuery(sql, [`%${searchTerm}%`, `%${searchTerm}%`, `%${searchTerm}%`, `%${searchTerm}%`]);
    return results;
  }
}

module.exports = new TransactionRepository();