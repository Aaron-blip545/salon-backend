const express = require('express');
const router = express.Router();
const staffController = require('../controllers/staffController');
const { authenticateToken, requireRole } = require('../middleware/auth');

// Public: list active staff members (for booking selection)
router.get('/active', staffController.getActiveStaff);

// Admin: get all staff
router.get('/', authenticateToken, requireRole('admin'), staffController.getAllStaff);

// Admin: get bookings for a staff member (MUST be before /:id route)
router.get('/:id/bookings', authenticateToken, requireRole('admin'), staffController.getStaffBookings);

// Admin: get staff by ID
router.get('/:id', authenticateToken, requireRole('admin'), staffController.getStaffById);

// Admin: create new staff
router.post('/', authenticateToken, requireRole('admin'), staffController.createStaff);

// Admin: update staff
router.put('/:id', authenticateToken, requireRole('admin'), staffController.updateStaff);

// Admin: delete staff (soft delete)
router.delete('/:id', authenticateToken, requireRole('admin'), staffController.deleteStaff);

module.exports = router;
