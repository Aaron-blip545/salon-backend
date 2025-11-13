const express = require('express');
const router = express.Router();
const serviceController = require('../controllers/serviceController');
const { authenticateToken, requireRole } = require('../middleware/auth');

// Public routes
router.get('/', serviceController.getAllServices);
router.get('/:id', serviceController.getServiceById);

// Protected routes (Admin only)
router.post('/createservice', authenticateToken, requireRole(['admin']), serviceController.createService);
// TEMPORARY: Simple test endpoint without auth (REMOVE AFTER TESTING)
router.post('/test-create', async (req, res) => {
  try {
    const db = require('../config/db');
    const { promisifyQuery } = require('../utils/dbHelpers');
    
    const { service_name, description, price, duration } = req.body;
    const sql = `INSERT INTO SERVICES (SERVICE_NAME, DESCRIPTION, PRICE, DURATION, IS_ACTIVE) VALUES (?, ?, ?, ?, 1)`;
    const result = await promisifyQuery(sql, [service_name || 'Test Service', description || 'Test Description', price || 100, duration || '30']);
    
    res.json({
      success: true,
      message: 'Service created successfully (test endpoint)',
      data: { insertId: result.insertId }
    });
  } catch (error) {
    console.error('Test create error:', error);
    res.status(500).json({
      success: false,
      message: 'Test creation failed',
      error: error.message
    });
  }
});

// TEMPORARY: Delete endpoint for admin (REMOVE AFTER TESTING)
router.delete('/:id', async (req, res) => {
  try {
    const db = require('../config/db');
    const { promisifyQuery } = require('../utils/dbHelpers');
    
    const { id } = req.params;
    const sql = `UPDATE SERVICES SET IS_ACTIVE = 0 WHERE SERVICE_ID = ?`;
    const result = await promisifyQuery(sql, [id]);
    
    res.json({
      success: true,
      message: 'Service deleted successfully',
      data: { affectedRows: result.affectedRows }
    });
  } catch (error) {
    console.error('Delete service error:', error);
    res.status(500).json({
      success: false,
      message: 'Service deletion failed',
      error: error.message
    });
  }
});



module.exports = router;