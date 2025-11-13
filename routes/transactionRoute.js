const express = require('express');
const router = express.Router();
const transactionController = require('../controllers/transactionController');
const { authenticateToken } = require('../middleware/auth');

// Create transaction (booking + payment)
router.post('/', authenticateToken, transactionController.createTransaction);

// Get user's transactions
router.get('/', authenticateToken, transactionController.getUserTransactions);

// Get specific transaction by booking ID
router.get('/booking/:booking_id', authenticateToken, transactionController.getTransactionByBookingId);

// GCash payment routes
router.post('/gcash/create', authenticateToken, transactionController.createGCashPayment);
router.post('/gcash/confirm', authenticateToken, transactionController.confirmGCashPayment);

module.exports = router;
