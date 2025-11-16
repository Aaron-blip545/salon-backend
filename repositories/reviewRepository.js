const { promisifyQuery } = require('../utils/dbHelpers');

const reviewRepository = {
  findLatest: async (limit = 10) => {
    const sql = `SELECT REVIEW_ID, USER_ID, NAME, RATING, COMMENT, CREATED_AT
                 FROM reviews
                 ORDER BY CREATED_AT DESC
                 LIMIT ?`;
    return await promisifyQuery(sql, [limit]);
  },

  create: async ({ user_id, name, rating, comment }) => {
    const sql = `INSERT INTO reviews (USER_ID, NAME, RATING, COMMENT) VALUES (?, ?, ?, ?)`;
    const result = await promisifyQuery(sql, [user_id || null, name, rating, comment]);
    return result.insertId;
  }
};

module.exports = reviewRepository;
