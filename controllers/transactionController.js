const transactionService = require('../services/transactionService');
const paymentService = require('../services/paymentService'); // ADD THIS LINE
const ApiError = require('../utils/ApiError');

const transactionController = {
  // Create a booking and a transaction
  createTransaction: async (req, res, next) => {
    try {
      const userId = req.user && (req.user.id || req.user.user_id);
      if (!userId) throw new ApiError(401, 'User not authenticated');

      const { service_id, booking_date, booking_time, payment_method, payment_type } = req.body;
      
      console.log('createTransaction request:', { userId, service_id, booking_date, booking_time, payment_method, payment_type });

      const result = await transactionService.createBookingWithTransaction({
        user_id: userId,
        service_id,
        booking_date,
        booking_time,
        payment_method,
        payment_type
      });

      res.status(201).json({ success: true, message: 'Booking created', data: result });
    } catch (error) {
      console.error('createTransaction error:', error);
      next(error);
    }
  },

  // Get transactions for the authenticated user
  getUserTransactions: async (req, res, next) => {
    try {
      const userId = req.user && (req.user.id || req.user.user_id);
      if (!userId) throw new ApiError(401, 'User not authenticated');

      const results = await transactionService.getUserTransactions(userId);
      res.json({ success: true, message: 'User transactions fetched', data: results });
    } catch (error) {
      next(error);
    }
  },

  // Get transaction by booking id for the authenticated user
  getTransactionByBookingId: async (req, res, next) => {
    try {
      const userId = req.user && (req.user.id || req.user.user_id);
      if (!userId) throw new ApiError(401, 'User not authenticated');

      const bookingId = req.params.booking_id;
      const result = await transactionService.getTransactionByBookingId(bookingId, userId);
      if (!result) throw new ApiError(404, 'Transaction not found');

      res.json({ success: true, message: 'Transaction fetched', data: result });
    } catch (error) {
      next(error);
    }
  },

  // Create GCash payment (returns a mock/checkout URL)
  createGCashPayment: async (req, res) => {
  try {
    const { amount, booking_id } = req.body;

    console.log('Creating GCash payment:', { amount, booking_id });

    const result = await paymentService.createGCashPayment(
      amount, 
      booking_id, 
      `Salon Service Payment - Booking #${booking_id}`
    );

    console.log('Payment created:', result);

    res.json({
      success: true,
      checkout_url: result.checkout_url,
      payment_mode: result.mode,
      source_id: result.source_id || null
    });

  } catch (error) {
    console.error('Error creating payment:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to create payment'
    });
  }
},

  // Confirm GCash payment (or other online payments)
  confirmGCashPayment: async (req, res) => {
  try {
    const { booking_id } = req.body;
    const user_id = req.user.id;

    console.log('Confirming payment:', { booking_id, user_id });

    await transactionService.confirmPayment(booking_id, user_id);

    res.json({
      success: true,
      message: 'Payment confirmed successfully'
    });

  } catch (error) {
    console.error('Error confirming payment:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to confirm payment'
    });
  }
}
}
module.exports = transactionController;