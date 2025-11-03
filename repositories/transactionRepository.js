const db = require('../config/db');
const { promisifyQuery } = require('../utils/dbHelpers');

const transactionRepository = {
    createTransaction: async (transactionData) => {
        const sql = 'INSERT INTO transactions (user_id, amount, transaction_date, status) VALUES (?, ?, ?, ?)';
        const result = await promisifyQuery(sql, [
            transactionData.user_id,
            transactionData.amount,])

        return result.insertId;
    }

}

module.exports = transactionRepository;