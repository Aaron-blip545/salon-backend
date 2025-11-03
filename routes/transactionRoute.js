const express = require('express');
const router = express.Router();
const transactionController = require('../controllers/transactionController');

// POST /api/transactions/create
router.post('/create', transactionController.createTransaction);