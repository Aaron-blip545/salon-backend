const express = require('express');
const router = express.Router();
const staffController = require('../controllers/staffController');

// Public: list active staff members
router.get('/', staffController.getActiveStaff);

module.exports = router;
