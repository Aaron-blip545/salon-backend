const multer = require('multer');
const path = require('path');
const fs = require('fs');
const db = require('../config/db');
const { promisifyQuery } = require('../utils/dbHelpers');
const ApiError = require('../utils/ApiError');

// Configure multer for file uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadDir = path.join(__dirname, '../uploads/receipts');
    // Create uploads directory if it doesn't exist
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
    cb(null, `receipt-${uniqueSuffix}${path.extname(file.originalname)}`);
  }
});

const upload = multer({
  storage,
  fileFilter: (req, file, cb) => {
    const filetypes = /jpeg|jpg|png|pdf/;
    const extname = filetypes.test(path.extname(file.originalname).toLowerCase());
    const mimetype = filetypes.test(file.mimetype);

    if (extname && mimetype) {
      return cb(null, true);
    } else {
      cb(new ApiError(400, 'Only image (JPEG, JPG, PNG) and PDF files are allowed'));
    }
  },
  limits: { fileSize: 5 * 1024 * 1024 } // 5MB limit
}).single('receipt');

const paymentController = {
  // Upload receipt for a booking
  uploadReceipt: async (req, res, next) => {
    upload(req, res, async (err) => {
      try {
        if (err) {
          if (err.code === 'LIMIT_FILE_SIZE') {
            throw new ApiError(400, 'File size too large. Maximum size is 5MB');
          }
          throw err;
        }

        const { bookingId } = req.params;
        const userId = req.user.id;

        if (!req.file) {
          throw new ApiError(400, 'No file uploaded');
        }

        // Verify booking exists and belongs to user
        const booking = await promisifyQuery(
          'SELECT * FROM bookings WHERE BOOKING_ID = ? AND USER_ID = ?',
          [bookingId, userId]
        );

        if (booking.length === 0) {
          // Delete the uploaded file if booking not found
          fs.unlinkSync(req.file.path);
          throw new ApiError(404, 'Booking not found or access denied');
        }

        // Update transaction with receipt image path and payment method
        const receiptPath = `/uploads/receipts/${req.file.filename}`;
        
        // Check if transaction exists
        const existingTransaction = await promisifyQuery(
          'SELECT * FROM transactions WHERE BOOKING_ID = ?',
          [bookingId]
        );

        if (existingTransaction.length === 0) {
          // Create transaction if it doesn't exist (fallback safety).
          // Default to FULLY PAID here, but for normal flows we expect
          // the transaction to already exist (down payment or full).
          const bookingDetails = booking[0];
          await promisifyQuery(
            `INSERT INTO transactions (BOOKING_ID, SERVICE_ID, USER_ID, AMOUNT, PRICE, DISCOUNT, 
             PAYMENT_METHOD, PAYMENT_STATUS, RECEIPT_IMAGE, TRANSACTION_REFERENCE, booking_fee, remaining_balance, CREATED_AT) 
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())`,
            [bookingId, bookingDetails.SERVICE_ID, userId, 0, 0, 0, 
             'FULLY PAID', 'PENDING', receiptPath, `TXN-${Date.now()}-${bookingId}`, 0, 0]
          );
        } else {
          // Update existing transaction: only attach the receipt image.
          // Keep PAYMENT_METHOD / PAYMENT_STATUS as they are so that
          // DOWN PAYMENT vs FULLY PAID labels remain correct.
          await promisifyQuery(
            'UPDATE transactions SET RECEIPT_IMAGE = ? WHERE BOOKING_ID = ?',
            [receiptPath, bookingId]
          );
        }

        res.json({
          success: true,
          message: 'Receipt uploaded successfully',
          data: {
            receiptUrl: receiptPath
          }
        });
      } catch (error) {
        // Clean up file if there was an error
        if (req.file && fs.existsSync(req.file.path)) {
          fs.unlinkSync(req.file.path);
        }
        next(error);
      }
    });
  },

  // Verify payment (Admin only)
  verifyPayment: async (req, res, next) => {
    try {
      const { bookingId } = req.params;
      const { status, adminNotes } = req.body;

      if (!['paid', 'failed'].includes(status)) {
        throw new ApiError(400, 'Invalid status. Must be either "paid" or "failed"');
      }

      // Update transaction payment status
      await promisifyQuery(
        'UPDATE transactions SET PAYMENT_STATUS = ? WHERE BOOKING_ID = ?',
        [status, bookingId]
      );

      // If payment is verified, update booking status to confirmed
      if (status === 'paid') {
        await promisifyQuery(
          'UPDATE bookings SET STATUS_NAME = ? WHERE BOOKING_ID = ?',
          ['confirmed', bookingId]
        );
      }

      // TODO: Send notification to user about payment verification

      res.json({
        success: true,
        message: `Payment marked as ${status} successfully`
      });
    } catch (error) {
      next(error);
    }
  },

  // Get payment details for a booking
  getPaymentDetails: async (req, res, next) => {
    try {
      const { bookingId } = req.params;
      const userId = req.user.id;
      const isAdmin = req.user.role === 'admin';

      let query = `
        SELECT 
          b.BOOKING_ID,
          b.BOOKING_DATE,
          b.BOOKING_TIME,
          b.STATUS_NAME as booking_status,
          t.PAYMENT_STATUS as payment_status,
          t.RECEIPT_IMAGE as receipt_image,
          s.SERVICE_NAME,
          s.PRICE as service_price,
          u.NAME as client_name,
          u.EMAIL_ADDRESS as client_email
        FROM bookings b
        JOIN services s ON b.SERVICE_ID = s.SERVICE_ID
        JOIN user u ON b.USER_ID = u.USER_ID
        LEFT JOIN transactions t ON t.BOOKING_ID = b.BOOKING_ID
        WHERE b.BOOKING_ID = ?
      `;

      const params = [bookingId];
      
      // Non-admin users can only view their own bookings
      if (!isAdmin) {
        query += ' AND b.USER_ID = ?';
        params.push(userId);
      }

      const results = await promisifyQuery(query, params);

      if (results.length === 0) {
        throw new ApiError(404, 'Booking not found or access denied');
      }

      const booking = results[0];
      
      // Add GCash QR code information
      const paymentDetails = {
        ...booking,
        paymentMethod: 'GCash',
        paymentInstructions: [
          'Open your GCash app',
          'Tap on "Scan QR"',
          'Scan the QR code below',
          'Enter the exact amount',
          'Upload the payment receipt after completing the transaction'
        ],
        qrCodeImage: '/images/gcash-qr-code.png', // You'll need to add this image to your public folder
        accountName: 'Your Business Name',
        accountNumber: '09123456789', // Your GCash number
        amount: booking.service_price
      };

      res.json({
        success: true,
        data: paymentDetails
      });
    } catch (error) {
      next(error);
    }
  },

  // Process down payment (20% of total via GCash)
  processDownPayment: async (req, res, next) => {
    try {
      const { bookingId } = req.params;
      const { service_id } = req.body;
      const userId = req.user.id;

      // Verify booking exists and belongs to user
      const booking = await promisifyQuery(
        'SELECT * FROM bookings WHERE BOOKING_ID = ? AND USER_ID = ?',
        [bookingId, userId]
      );

      if (booking.length === 0) {
        throw new ApiError(404, 'Booking not found or access denied');
      }

      // Get service details
      const service = await promisifyQuery(
        'SELECT * FROM services WHERE SERVICE_ID = ?',
        [service_id]
      );

      if (service.length === 0) {
        throw new ApiError(404, 'Service not found');
      }

      const servicePrice = parseFloat(service[0].PRICE || 0);
      const bookingFee = servicePrice * 0.10; // 10% booking fee
      const grandTotal = servicePrice + bookingFee;
      const downPaymentAmount = grandTotal * 0.20; // 20% down payment
      const remainingBalance = grandTotal - downPaymentAmount;

      // Create or update transaction with DOWN PAYMENT
      const existingTransaction = await promisifyQuery(
        'SELECT * FROM transactions WHERE BOOKING_ID = ?',
        [bookingId]
      );

      if (existingTransaction.length === 0) {
        // Create new transaction
        await promisifyQuery(
          `INSERT INTO transactions (BOOKING_ID, SERVICE_ID, USER_ID, AMOUNT, PRICE, DISCOUNT,
           PAYMENT_METHOD, PAYMENT_STATUS, booking_fee, remaining_balance, TRANSACTION_REFERENCE, CREATED_AT) 
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())`,
          [bookingId, service_id, userId, downPaymentAmount, servicePrice, 0,
           'DOWN PAYMENT', 'PENDING', bookingFee, remainingBalance, `TXN-${Date.now()}-${bookingId}`]
        );
      } else {
        // Update existing transaction
        await promisifyQuery(
          `UPDATE transactions SET PAYMENT_METHOD = ?, AMOUNT = ?, PRICE = ?, 
           booking_fee = ?, remaining_balance = ?, PAYMENT_STATUS = ? WHERE BOOKING_ID = ?`,
          ['DOWN PAYMENT', downPaymentAmount, servicePrice, bookingFee, remainingBalance, 'PENDING', bookingId]
        );
      }

      res.json({
        success: true,
        message: 'Down payment initiated successfully',
        data: {
          amount: downPaymentAmount,
          remaining_balance: remainingBalance,
          payment_method: 'DOWN PAYMENT'
        }
      });
    } catch (error) {
      next(error);
    }
  },

  // Process full payment (100% of total via GCash)
  processFullPayment: async (req, res, next) => {
    try {
      const { bookingId } = req.params;
      const { service_id } = req.body;
      const userId = req.user.id;

      // Verify booking exists and belongs to user
      const booking = await promisifyQuery(
        'SELECT * FROM bookings WHERE BOOKING_ID = ? AND USER_ID = ?',
        [bookingId, userId]
      );

      if (booking.length === 0) {
        throw new ApiError(404, 'Booking not found or access denied');
      }

      // Get service details
      const service = await promisifyQuery(
        'SELECT * FROM services WHERE SERVICE_ID = ?',
        [service_id]
      );

      if (service.length === 0) {
        throw new ApiError(404, 'Service not found');
      }

      const servicePrice = parseFloat(service[0].PRICE || 0);
      const bookingFee = servicePrice * 0.10; // 10% booking fee
      const grandTotal = servicePrice + bookingFee;

      // Create or update transaction with FULLY PAID
      const existingTransaction = await promisifyQuery(
        'SELECT * FROM transactions WHERE BOOKING_ID = ?',
        [bookingId]
      );

      if (existingTransaction.length === 0) {
        // Create new transaction
        await promisifyQuery(
          `INSERT INTO transactions (BOOKING_ID, SERVICE_ID, USER_ID, AMOUNT, PRICE, DISCOUNT,
           PAYMENT_METHOD, PAYMENT_STATUS, booking_fee, remaining_balance, TRANSACTION_REFERENCE, CREATED_AT) 
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())`,
          [bookingId, service_id, userId, grandTotal, servicePrice, 0,
           'FULLY PAID', 'PENDING', bookingFee, 0, `TXN-${Date.now()}-${bookingId}`]
        );
      } else {
        // Update existing transaction
        await promisifyQuery(
          `UPDATE transactions SET PAYMENT_METHOD = ?, AMOUNT = ?, PRICE = ?, 
           booking_fee = ?, remaining_balance = ?, PAYMENT_STATUS = ? WHERE BOOKING_ID = ?`,
          ['FULLY PAID', grandTotal, servicePrice, bookingFee, 0, 'PENDING', bookingId]
        );
      }

      res.json({
        success: true,
        message: 'Full payment initiated successfully',
        data: {
          amount: grandTotal,
          remaining_balance: 0,
          payment_method: 'FULLY PAID'
        }
      });
    } catch (error) {
      next(error);
    }
  }
};

module.exports = paymentController;
