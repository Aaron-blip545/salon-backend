import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { toast } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';

const PaymentVerification = () => {
  const [payments, setPayments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [verifying, setVerifying] = useState(null);

  useEffect(() => {
    fetchPendingPayments();
  }, []);

  const fetchPendingPayments = async () => {
    try {
      const token = localStorage.getItem('token');
      const response = await axios.get('/api/bookings/pending', {
        headers: { Authorization: `Bearer ${token}` }
      });
      setPayments(response.data.data);
    } catch (error) {
      console.error('Error fetching pending payments:', error);
      toast.error('Failed to load pending payments');
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyPayment = async (bookingId, status) => {
    try {
      setVerifying(bookingId);
      const token = localStorage.getItem('token');
      await axios.post(
        `/api/payments/${bookingId}/verify`,
        { status },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      
      toast.success(`Payment marked as ${status}`);
      fetchPendingPayments(); // Refresh the list
    } catch (error) {
      console.error('Error verifying payment:', error);
      toast.error(error.response?.data?.message || 'Failed to verify payment');
    } finally {
      setVerifying(null);
    }
  };

  if (loading) {
    return <div className="flex justify-center items-center h-64">Loading pending payments...</div>;
  }

  return (
    <div className="container mx-auto px-4 py-8">
      <h1 className="text-2xl font-bold text-gray-800 mb-6">Payment Verifications</h1>
      
      {payments.length === 0 ? (
        <div className="bg-white rounded-lg shadow p-6 text-center">
          <p className="text-gray-600">No pending payments to verify</p>
        </div>
      ) : (
        <div className="bg-white shadow overflow-hidden sm:rounded-md">
          <ul className="divide-y divide-gray-200">
            {payments.map((payment) => (
              <li key={payment.BOOKING_ID} className="p-4 hover:bg-gray-50">
                <div className="flex items-center justify-between">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-blue-600 truncate">
                      Booking #{payment.BOOKING_ID}
                    </p>
                    <p className="text-sm text-gray-500">
                      {payment.client_name} • {payment.SERVICE_NAME}
                    </p>
                    <p className="text-sm text-gray-900 font-medium mt-1">
                      ₱{parseFloat(payment.service_price).toFixed(2)}
                    </p>
                    {payment.receipt_image && (
                      <a 
                        href={payment.receipt_image} 
                        target="_blank" 
                        rel="noopener noreferrer"
                        className="text-sm text-blue-600 hover:underline mt-1 inline-block"
                      >
                        View Receipt
                      </a>
                    )}
                  </div>
                  <div className="ml-4 flex-shrink-0 flex space-x-2">
                    <button
                      onClick={() => handleVerifyPayment(payment.BOOKING_ID, 'paid')}
                      disabled={verifying === payment.BOOKING_ID}
                      className="px-3 py-1 bg-green-100 text-green-800 text-sm font-medium rounded hover:bg-green-200 disabled:opacity-50"
                    >
                      {verifying === payment.BOOKING_ID ? 'Verifying...' : 'Approve'}
                    </button>
                    <button
                      onClick={() => handleVerifyPayment(payment.BOOKING_ID, 'failed')}
                      disabled={verifying === payment.BOOKING_ID}
                      className="px-3 py-1 bg-red-100 text-red-800 text-sm font-medium rounded hover:bg-red-200 disabled:opacity-50"
                    >
                      Reject
                    </button>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
};

export default PaymentVerification;
