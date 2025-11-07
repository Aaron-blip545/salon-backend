const express = require('express');
const router = express.Router();
const transasctionController = require('../controllers/transactionController');
const { authenticateToken } = require('../middleware/auth');

//Protected routes (require authenticaiton)
router.post('/:id/createTransaction', authenticateToken, transasctionController.createTransaction);