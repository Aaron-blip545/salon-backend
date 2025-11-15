import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import axios from 'axios';
import { toast } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';

const Payment = () => {
  const { bookingId } = useParams();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [paymentDetails, setPaymentDetails] = useState(null);
  const [selectedFile, setSelectedFile] = useState(null);
  const [preview, setPreview] = useState('');

  useEffect(() => {
    const fetchPaymentDetails = async () => {
      try {
        const token = localStorage.getItem('token');
        const response = await axios.get(`/api/payments/${bookingId}`, {
          headers: { Authorization: `Bearer ${token}` }
        });
        setPaymentDetails(response.data.data);
        setLoading(false);
      } catch (error) {
        console.error('Error fetching payment details:', error);
        toast.error('Failed to load payment details');
        setLoading(false);
      }
    };

    fetchPaymentDetails();
  }, [bookingId]);

  const handleFileChange = (e) => {
    const file = e.target.files[0];
    if (file) {
      setSelectedFile(file);
      setPreview(URL.createObjectURL(file));
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!selectedFile) {
      toast.error('Please select a receipt image');
      return;
    }

    const formData = new FormData();
    formData.append('receipt', selectedFile);

    try {
      setUploading(true);
      const token = localStorage.getItem('token');
      await axios.post(
        `/api/payments/${bookingId}/receipt`,
        formData,
        {
          headers: {
            'Content-Type': 'multipart/form-data',
            Authorization: `Bearer ${token}`
          }
        }
      );
      
      toast.success('Receipt uploaded successfully! Your payment is being verified.');
      navigate('/my-bookings');
    } catch (error) {
      console.error('Error uploading receipt:', error);
      toast.error(error.response?.data?.message || 'Failed to upload receipt');
    } finally {
      setUploading(false);
    }
  };

  if (loading) {
    return <div className="flex justify-center items-center h-64">Loading payment details...</div>;
  }

  if (!paymentDetails) {
    return <div className="text-center text-red-500">Failed to load payment details</div>;
  }

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="max-w-3xl mx-auto bg-white rounded-lg shadow-md overflow-hidden">
        <div className="p-6">
          <h1 className="text-2xl font-bold text-gray-800 mb-6">Complete Your Payment</h1>
          
          <div className="mb-8">
            <h2 className="text-lg font-semibold mb-2">Booking Details</h2>
            <div className="bg-gray-50 p-4 rounded-lg">
              <p><span className="font-medium">Service:</span> {paymentDetails.SERVICE_NAME}</p>
              <p><span className="font-medium">Date:</span> {new Date(paymentDetails.BOOKING_DATE).toLocaleDateString()}</p>
              <p><span className="font-medium">Time:</span> {paymentDetails.BOOKING_TIME}</p>
              <p className="text-xl font-bold mt-2">
                Amount: ₱{parseFloat(paymentDetails.service_price).toFixed(2)}
              </p>
            </div>
          </div>

          <div className="mb-8">
            <h2 className="text-lg font-semibold mb-4">Payment Instructions</h2>
            <div className="bg-blue-50 p-4 rounded-lg mb-6">
              <ol className="list-decimal pl-5 space-y-2">
                {paymentDetails.paymentInstructions.map((step, index) => (
                  <li key={index} className="text-gray-700">{step}</li>
                ))}
              </ol>
              
              <div className="mt-6 text-center">
                <div className="inline-block bg-white p-4 rounded-lg shadow-md">
                  <img 
                    src={paymentDetails.qrCodeImage} 
                    alt="GCash QR Code" 
                    className="w-48 h-48 mx-auto"
                  />
                  <p className="mt-2 text-sm text-gray-600">Scan this QR code with GCash app</p>
                </div>
                
                <div className="mt-4 text-left">
                  <p className="font-medium">Or send payment to:</p>
                  <p>Account Name: <span className="font-semibold">{paymentDetails.accountName}</span></p>
                  <p>GCash Number: <span className="font-semibold">{paymentDetails.accountNumber}</span></p>
                  <p className="mt-2 text-red-600 font-medium">
                    Amount: ₱{parseFloat(paymentDetails.amount).toFixed(2)}
                  </p>
                </div>
              </div>
            </div>
          </div>

          <div className="border-t pt-6">
            <h2 className="text-lg font-semibold mb-4">Upload Payment Receipt</h2>
            <form onSubmit={handleSubmit}>
              <div className="mb-4">
                <label className="block text-gray-700 text-sm font-bold mb-2" htmlFor="receipt">
                  Upload proof of payment (screenshot or photo of receipt)
                </label>
                <input
                  type="file"
                  id="receipt"
                  accept="image/*,.pdf"
                  onChange={handleFileChange}
                  className="block w-full text-sm text-gray-500
                    file:mr-4 file:py-2 file:px-4
                    file:rounded-md file:border-0
                    file:text-sm file:font-semibold
                    file:bg-blue-50 file:text-blue-700
                    hover:file:bg-blue-100"
                />
                <p className="mt-1 text-sm text-gray-500">
                  Accepted formats: JPG, PNG, PDF (Max 5MB)
                </p>
              </div>

              {preview && (
                <div className="mb-4">
                  <p className="text-sm font-medium text-gray-700 mb-2">Preview:</p>
                  <div className="max-w-xs border rounded-lg overflow-hidden">
                    <img 
                      src={preview} 
                      alt="Receipt preview" 
                      className="w-full h-auto"
                    />
                  </div>
                </div>
              )}

              <div className="flex justify-end space-x-4">
                <button
                  type="button"
                  onClick={() => navigate('/my-bookings')}
                  className="px-4 py-2 border border-gray-300 rounded-md text-gray-700 bg-white hover:bg-gray-50"
                  disabled={uploading}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-6 py-2 border border-transparent rounded-md shadow-sm text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50"
                  disabled={!selectedFile || uploading}
                >
                  {uploading ? 'Uploading...' : 'Submit Receipt'}
                </button>
              </div>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Payment;
