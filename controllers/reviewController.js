const reviewService = require('../services/reviewService');

const reviewController = {
  getLatest: async (req, res, next) => {
    try {
      const reviews = await reviewService.getLatestReviews();
      res.json({ success: true, data: reviews });
    } catch (error) {
      next(error);
    }
  },

  create: async (req, res, next) => {
    try {
      const user_id = req.user ? req.user.id : null;
      const { name, rating, comment } = req.body;

      const result = await reviewService.createReview({ user_id, name, rating, comment });
      res.status(201).json({ success: true, message: 'Review submitted', data: result });
    } catch (error) {
      next(error);
    }
  }
};

module.exports = reviewController;
