const express = require('express');
const router = express.Router();
const authController = require('../controllers/authController');
const { authenticateToken, requireRole } = require('../middleware/auth');

// POST /api/auth/register
router.post('/register', authController.register);

// POST /api/auth/login
router.post('/login', authController.login);

// GET /api/auth/me (authenticated)
router.get('/me', authenticateToken, authController.me);

// PUT /api/auth/me (authenticated) - update profile
router.put('/me', authenticateToken, authController.updateMe);

// GET /api/auth/users (admin only) - get all users
router.get('/users', authenticateToken, requireRole('admin'), authController.getAllUsers);

module.exports = router;