const express = require('express');
const router = express.Router();
const authController = require('../controllers/authController');
const { authenticateToken } = require('../middleware/auth');

// POST /api/auth/register
router.post('/register', authController.register);

// POST /api/auth/login
router.post('/login', authController.login);

// Get current user info (requires valid token)
router.get('/me', authenticateToken, (req, res) => {
	res.json({ success: true, data: req.user });
});

module.exports = router;