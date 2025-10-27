const express = require('express');
const router = express.Router();
const bookingController = require('../controllers/bookingController');
const { authenticateToken, requireRole } = require('../middleware/auth');

// Public routes
router.get('/available-slots', bookingController.getAvailableSlots);

// Protected routes (require authentication)
router.post('/', authenticateToken, bookingController.createBooking);
router.get('/', authenticateToken, bookingController.getUserBookings);
router.patch('/:id/status', authenticateToken, bookingController.updateBookingStatus);
router.delete('/:id', authenticateToken, bookingController.deleteBooking);



module.exports = router;