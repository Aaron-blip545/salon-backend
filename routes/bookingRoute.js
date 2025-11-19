const express = require('express');
const router = express.Router();
const bookingController = require('../controllers/bookingController');
const { authenticateToken, requireRole } = require('../middleware/auth');

// Public routes
router.get('/available-slots', bookingController.getAvailableSlots);

// Protected routes (require authentication)
router.post('/', authenticateToken, bookingController.createBooking);
router.get('/', authenticateToken, bookingController.getUserBookings);
router.delete('/:id', authenticateToken, bookingController.deleteBooking);
// Admin routes
router.get('/all', authenticateToken, requireRole(['admin']), bookingController.getAllBookings);
router.get('/pending', authenticateToken, requireRole(['admin']), bookingController.getPendingBookings);
router.get('/analytics', authenticateToken, requireRole(['admin']), bookingController.getAnalytics);
router.patch('/:id/status', authenticateToken, requireRole(['admin']), bookingController.updateBookingStatus);
router.patch('/:id/service-status', authenticateToken, requireRole(['admin']), bookingController.updateServiceStatus);
router.patch('/:id/confirm', authenticateToken, requireRole(['admin']), bookingController.confirmBooking);
router.patch('/:id/cancel', authenticateToken, requireRole(['admin']), bookingController.cancelBooking);
router.patch('/:id/complete', authenticateToken, requireRole(['admin']), bookingController.completeBooking);



module.exports = router;