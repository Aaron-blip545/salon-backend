const db = require('../config/db');

// Convert callback-based db.query to Promise
const promisifyQuery = (sql, params = []) => {
  return new Promise((resolve, reject) => {
    db.query(sql, params, (err, results) => {
      if (err) {
        reject(err);
      } else {
        resolve(results);
      }
    });
  });
};

module.exports = {
  promisifyQuery
};                                                      