const express = require('express');
const router = express.Router();
const paymongoController = require('../controllers/paymongoController');
const { authenticateToken } = require('../middleware/auth');

// Create GCash payment
router.post('/create-source', authenticateToken, paymongoController.createGCashSource);

// Webhook (no authentication - PayMongo calls this)
router.post('/webhook', paymongoController.handleWebhook);

// Check payment status
router.get('/status/:booking_id', authenticateToken, paymongoController.checkPaymentStatus);

// Create refund
router.post('/refund', authenticateToken, paymongoController.createRefund);

module.exports = router;