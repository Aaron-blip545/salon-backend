const express = require('express');
const router = express.Router();
const authController = require('../controllers/authController');
const { authenticateToken } = require('../middleware/auth');

// POST /api/auth/register
router.post('/register', authController.register);

// POST /api/auth/login
router.post('/login', authController.login);

// GET /api/auth/me (authenticated)
router.get('/me', authenticateToken, authController.me);

// PUT /api/auth/me (authenticated) - update profile
router.put('/me', authenticateToken, authController.updateMe);

module.exports = router;