const reviewRepository = require('../repositories/reviewRepository');

const reviewService = {
  getLatestReviews: async () => {
    const reviews = await reviewRepository.findLatest(20);
    return reviews;
  },

  createReview: async ({ user_id, name, rating, comment }) => {
    if (!name || !comment) {
      const err = new Error('Name and comment are required');
      err.statusCode = 400;
      throw err;
    }
    const numericRating = Number(rating);
    if (!numericRating || numericRating < 1 || numericRating > 5) {
      const err = new Error('Rating must be between 1 and 5');
      err.statusCode = 400;
      throw err;
    }

    const id = await reviewRepository.create({ user_id, name, rating: numericRating, comment });
    return { review_id: id };
  }
};

module.exports = reviewService;
