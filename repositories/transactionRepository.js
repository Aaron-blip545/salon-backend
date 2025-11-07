const db = require('../config/db');
const { promisifyQuery } = require('../utils/dbHelpers');
const { BOOKING_FEE_PERCENTAGE } = require('../utils/constant');

const transactionRepository = {
    // Create a new transaction
    createTransac: async ({ transaction_id, booking_id, user_id, service_id, status_name, amount, price, discount, payment_method, payment_status,  created_at })  => {
        const sql = `
            INSERT INTO transactions (TRANSACTION_ID, BOOKING_ID, USER_ID, SERVICE_ID, STATUS_ID, 
            AMOUNT, PRICE, DISCOUNT, PAYMENT_METHOD, PAYMENT_STATUS, CREATED_AT)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `;
        const result = await promisifyQuery(sql, [transaction_id, booking_id, user_id, service_id, status_name, amount, price, discount, 
                                                    payment_method, payment_status, paid_at, created_at]);
        return result.insertId; 
    },
}

module.exports = transactionRepository;