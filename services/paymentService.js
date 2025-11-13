const axios = require('axios');

const PAYMENT_MODE = process.env.PAYMENT_MODE || 'mock';
const PAYMONGO_SECRET_KEY = process.env.PAYMONGO_SECRET_KEY;
const PAYMONGO_API = 'https://api.paymongo.com/v1';
const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:3000';

class PaymentService {
  
  // Create Base64 encoded auth header
  getAuthHeader() {
    const auth = Buffer.from(PAYMONGO_SECRET_KEY + ':').toString('base64');
    return `Basic ${auth}`;
  }

  // Create GCash payment source
  async createGCashPayment(amount, bookingId, description) {
    console.log('Payment Mode:', PAYMENT_MODE);
    
    // MOCK MODE - Use custom page
    if (PAYMENT_MODE === 'mock') {
      return {
        success: true,
        checkout_url: `${FRONTEND_URL}/gcash-checkout.html?booking_id=${bookingId}&amount=${amount}`,
        mode: 'mock',
        source_id: null
      };
    }

    // PAYMONGO MODE - Real API integration
    try {
      // Convert to centavos (PayMongo requirement)
      const amountInCentavos = Math.round(amount * 100);

      console.log('Creating PayMongo source:', {
        amount: amountInCentavos,
        bookingId,
        description
      });

      const response = await axios.post(
        `${PAYMONGO_API}/sources`,
        {
          data: {
            attributes: {
              amount: amountInCentavos,
              redirect: {
                success: `${FRONTEND_URL}/payment-success.html?booking_id=${bookingId}`,
                failed: `${FRONTEND_URL}/payment-failed.html?booking_id=${bookingId}`
              },
              type: 'gcash',
              currency: 'PHP',
              description: description || `Salon Booking #${bookingId}`
            }
          }
        },
        {
          headers: {
            'Authorization': this.getAuthHeader(),
            'Content-Type': 'application/json'
          }
        }
      );

      const source = response.data.data;

      console.log('PayMongo source created:', source.id);

      return {
        success: true,
        checkout_url: source.attributes.redirect.checkout_url,
        source_id: source.id,
        mode: 'paymongo'
      };

    } catch (error) {
      console.error('PayMongo API Error:', error.response?.data || error.message);
      
      // Fallback to mock on error
      console.log('Falling back to mock mode due to error');
      return {
        success: true,
        checkout_url: `${FRONTEND_URL}/gcash-checkout.html?booking_id=${bookingId}&amount=${amount}`,
        mode: 'mock-fallback',
        error: error.response?.data?.errors || error.message
      };
    }
  }

  // Confirm payment (called after user completes payment)
  async confirmPayment(bookingId, sourceId = null) {
    
    if (PAYMENT_MODE === 'mock' || !sourceId) {
      return {
        success: true,
        status: 'paid',
        mode: 'mock'
      };
    }

    // For PayMongo, webhook handles payment capture
    // This is just for immediate confirmation
    return {
      success: true,
      status: 'paid',
      mode: 'paymongo'
    };
  }

  // Create payment from source (called by webhook)
  async capturePayment(sourceId, amount) {
    try {
      console.log('Capturing payment for source:', sourceId);

      const response = await axios.post(
        `${PAYMONGO_API}/payments`,
        {
          data: {
            attributes: {
              amount: amount,
              source: {
                id: sourceId,
                type: 'source'
              },
              currency: 'PHP'
            }
          }
        },
        {
          headers: {
            'Authorization': this.getAuthHeader(),
            'Content-Type': 'application/json'
          }
        }
      );

      const payment = response.data.data;

      console.log('Payment captured:', payment.id);

      return {
        success: true,
        payment_id: payment.id,
        status: payment.attributes.status
      };

    } catch (error) {
      console.error('Payment capture error:', error.response?.data || error.message);
      return {
        success: false,
        error: error.message
      };
    }
  }
}

module.exports = new PaymentService();