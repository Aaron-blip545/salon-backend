const transactionRepository = require('../repositories/transactionRepository');
const bookingRepository = require('../repositories/bookingRepository');
const serviceRepository = require('../repositories/serviceRepository');
const { BOOKING_FEE_PERCENTAGE } = require('../utils/constant');

class TransactionService {
  
  // Create booking with transaction
  async createBookingWithTransaction(data) {
    const { user_id, service_id, booking_date, booking_time, payment_method, payment_type } = data;

    // Get service details (repository exposes findById)
    const service = await serviceRepository.findById(service_id);

    if (!service) {
      throw new Error('Service not found');
    }

    // service object comes from DB and uses uppercase column names (e.g. PRICE, SERVICE_NAME)
    const servicePrice = parseFloat(service.PRICE || service.price || 0);

    // Calculate amounts based on payment type
    let bookingFee = 0;
    let remainingBalance = 0;
    let amountToPay = 0;
    let paymentStatus = '';

    if (payment_type === 'BOOKING_FEE') {
      // Pay configured booking fee percentage (e.g. 10%)
      bookingFee = servicePrice * BOOKING_FEE_PERCENTAGE;

      remainingBalance = servicePrice - bookingFee;
      amountToPay = bookingFee;

      paymentStatus = payment_method === 'CASH' ? 'PARTIAL_PENDING' : 'PARTIAL_PAID';

    } else if (payment_type === 'FULL_PAYMENT') {
      // Pay full amount
      bookingFee = 0;
      remainingBalance = 0;
      amountToPay = servicePrice;

      paymentStatus = payment_method === 'CASH' ? 'PENDING' : 'COMPLETED';

    } else {
      throw new Error('Invalid payment type. Use BOOKING_FEE or FULL_PAYMENT');
    }

    // Create booking and transaction in a database transaction
    const result = await transactionRepository.createBookingWithTransaction({
      user_id,
      service_id,
      booking_date,
      booking_time,
      amount: amountToPay,
      price: servicePrice,
      booking_fee: bookingFee,
      remaining_balance: remainingBalance,
      payment_method,
      payment_status: paymentStatus
    });

    return {
      booking: result.booking,
      transaction: result.transaction,
      payment_breakdown: {
        service_name: service.SERVICE_NAME || service.service_name,
        service_price: servicePrice,
        booking_fee: bookingFee,
        amount_paid_now: amountToPay,
        remaining_balance: remainingBalance,
        payment_status: paymentStatus
      }
    };
  }

  // Get user transactions
  async getUserTransactions(user_id) {
    return await transactionRepository.getUserTransactions(user_id);
  }

  // Confirm payment (for online payments like GCash)
  async confirmPayment(booking_id, user_id) {
    const transaction = await transactionRepository.getTransactionByBookingId(booking_id, user_id);
    
    if (!transaction) {
      throw new Error('Transaction not found');
    }

    if (transaction.payment_status === 'COMPLETED') {
      throw new Error('Payment already completed');
    }

    await transactionRepository.updatePaymentStatus(booking_id, 'COMPLETED');
  }

  // Create GCash payment link (mock implementation)
  async createGCashPaymentLink(amount, booking_id) {
    // In production, integrate with PayMongo or similar payment gateway
    // For now, return mock URL
    return `http://localhost:3000/gcash-checkout.html?booking_id=${booking_id}&amount=${amount}`;
  }

  // Get transaction by booking ID
  async getTransactionByBookingId(booking_id, user_id) {
    return await transactionRepository.getTransactionByBookingId(booking_id, user_id);
  }

  // Update transaction status
  async updateTransactionStatus(transaction_id, status) {
    return await transactionRepository.updateTransactionStatus(transaction_id, status);
  }

  // Calculate refund amount
  async calculateRefund(booking_id) {
    const transaction = await transactionRepository.getTransactionByBookingIdOnly(booking_id);
    
    if (!transaction) {
      return 0;
    }

    // If fully paid, refund full amount
    if (transaction.payment_status === 'COMPLETED') {
      return parseFloat(transaction.amount);
    }

    // If partially paid, refund booking fee
    if (transaction.payment_status === 'PARTIAL_PAID') {
      return parseFloat(transaction.booking_fee);
    }

    return 0;
  }
}

module.exports = new TransactionService();