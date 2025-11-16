const express = require('express');
const router = express.Router();
const reviewController = require('../controllers/reviewController');

// Public: anyone can read reviews
router.get('/', reviewController.getLatest);

// Public: allow anyone to submit a review (user_id will be null when not logged in)
router.post('/', reviewController.create);

module.exports = router;
