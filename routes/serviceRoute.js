const express = require('express');
const router = express.Router();
const serviceController = require('../controllers/serviceController');
const { authenticateToken, requireRole } = require('../middleware/auth');

// Public routes
router.get('/', serviceController.getAllServices);
router.get('/:id', serviceController.getServiceById);
router.post('/createservice', authenticateToken, requireRole('admin'), serviceController.createService);



module.exports = router;