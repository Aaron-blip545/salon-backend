const transactionRepository = require('../repositories/transactionRepository');
const { BOOKING_FEE_PERCENTAGE } = require('../utils/constant');
const { PRICES } = require('../utils/constant');


const TransactionService = {
    createTransaction: async ({ transaction_id, booking_id, user_id, service_id, status_id, amount, price, discount, payment_method, payment_status,  created_at }) => {
    // Calculate total amount with booking fee
    const bookingFee = price * BOOKING_FEE_PERCENTAGE;
    const totalAmount = price + bookingFee - (discount || 0);

    const transactionData = {
        transaction_id,
        booking_id,
        user_id,  
        service_id,
        status_id,
        amount: totalAmount,
        price,
        discount: discount || 0,
        payment_method,
        payment_status,
        created_at
    };

    const transactionId = await transactionRepository.createTransac(transactionData);
    return transactionId;
    }
};
module.exports = { createTransaction };
    