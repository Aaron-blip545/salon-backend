const express = require('express');
const router = express.Router();
const paymentController = require('../controllers/paymentController');
const { authenticateToken, requireRole } = require('../middleware/auth');

// Protected routes (require authentication)
router.get('/:bookingId', authenticateToken, paymentController.getPaymentDetails);
router.post('/:bookingId/receipt', authenticateToken, paymentController.uploadReceipt);

// Admin routes
router.post('/:bookingId/verify', authenticateToken, requireRole(['admin']), paymentController.verifyPayment);

module.exports = router;
