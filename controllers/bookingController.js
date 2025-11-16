const { isTimeSlotAvailable } = require('../repositories/bookingRepository');
const bookingService = require('../services/bookingService');
const transactionRepository = require('../repositories/transactionRepository');
const serviceRepository = require('../repositories/serviceRepository');
const ApiError = require('../utils/ApiError');
const path = require('path');

const bookingController = {
  // Create new booking
  createBooking: async (req, res, next) => {
    try {
      const { service_id, booking_date, booking_time, staff_id, payment_method } = req.body;
      const user_id = req.user.id;

      // Validate required fields
      if (!service_id || !booking_date || !booking_time || !staff_id) {
        throw new ApiError(400, 'Service, date, time, and staff are required');
      }

      // Check if time slot is available for this staff
      if (!(await isTimeSlotAvailable(booking_date, booking_time, staff_id))) {
        throw new ApiError(400, 'The selected time slot has been already booked');
      }
      
      // Create booking with pending payment status
      const result = await bookingService.createBooking({
        user_id,
        service_id,
        staff_id,
        booking_date,
        booking_time,
        status_name: 'pending_payment' // New status to indicate payment is pending
      });

      // Get service details to calculate transaction amounts
      const service = await serviceRepository.findById(service_id);
      if (!service) {
        throw new ApiError(404, 'Service not found');
      }

      const servicePrice = parseFloat(service.PRICE || service.price || 0);
      const paymentMethodUsed = payment_method || 'cash';

      // Create a corresponding transaction record so admin panel can see payment method
      try {
        await transactionRepository.createTransaction({
          booking_id: result.booking_id,
          user_id,
          service_id,
          amount: servicePrice,
          price: servicePrice,
          booking_fee: 0,
          remaining_balance: 0,
          payment_method: paymentMethodUsed.toUpperCase(),
          payment_status: paymentMethodUsed.toLowerCase() === 'cash' ? 'PENDING' : 'PENDING'
        });
        console.log('✅ Transaction created successfully for booking:', result.booking_id);
      } catch (txnError) {
        console.error('❌ Could not create transaction record:', txnError);
        console.error('Transaction data:', { booking_id: result.booking_id, user_id, service_id, amount: servicePrice, payment_method: paymentMethodUsed });
        // Don't fail the booking if transaction creation fails, just log it
      }

      // Return payment URL in the response
      res.status(201).json({
        success: true,
        message: 'Booking created. Please complete the payment to confirm your booking.',
        data: {
          ...result.details,
          payment_url: `/payment/${result.booking_id}`
        }
      });
    } catch (error) {
      next(error);
    }
  },

  // Get user's bookings
  getUserBookings: async (req, res, next) => {
    try {
      const user_id = req.user.id;
      const bookings = await bookingService.getUserBookings(user_id);

      // Add payment status to each booking
      const bookingsWithPaymentStatus = bookings.map(booking => ({
        ...booking,
        payment_status: booking.payment_status || 'pending',
        requires_payment: booking.booking_status === 'pending_payment'
      }));

      res.json({
        success: true,
        message: 'Bookings retrieved successfully',
        data: bookingsWithPaymentStatus
      });
    } catch (error) {
      next(error);
    }
  },

  // Get all bookings (Admin only)
  getAllBookings: async (req, res, next) => {
    try {
      const bookings = await bookingService.getAllBookings();

      res.json({
        success: true,
        message: 'All bookings retrieved successfully',
        data: bookings
      });
    } catch (error) {
      next(error);
    }
  },

  // Get pending bookings (Admin only)
  getPendingBookings: async (req, res, next) => {
    try {
      const bookings = await bookingService.getPendingBookings();

      res.json({
        success: true,
        message: 'Pending bookings retrieved successfully',
        data: bookings
      });
    } catch (error) {
      next(error);
    }
  },

  // Get available time slots
  getAvailableSlots: async (req, res, next) => {
    try {
      const { date } = req.query;

      if (!date) {
        throw new ApiError(400, 'Date is required');
      }             

      const slots = await bookingService.getAvailableSlots(date);

      res.json({
        success: true,
        message: 'Available slots retrieved',
        data: slots
      });
    } catch (error) {
      next(error);
    }
  },

  // Update booking status (Approve/Cancel by Admin or Cancel by User)
  updateBookingStatus: async (req, res, next) => {
    try {
      const { id } = req.params;
      const { status } = req.body;
      const user_id = req.user.id;
      const user_role = req.user.role;

      if (!status) {
        throw new ApiError(400, 'Status is required');
      }

      const result = await bookingService.updateBookingStatus({
        booking_id: id,
        status,
        user_id,
        user_role
      });

      res.json({
        success: true,
        message: result.message
      });
    } catch (error) {
      next(error);
    }
  },

  // Delete booking
  deleteBooking: async (req, res, next) => {
    try {
      const { id } = req.params;
      const user_id = req.user.id;
      const user_role = req.user.role;

      await bookingService.deleteBooking({
        booking_id: id,
        user_id,
        user_role
      });

      res.json({
        success: true,
        message: 'Booking deleted successfully'
      });
    } catch (error) {
      next(error);
    }
  },

  // Get analytics data (Admin only)
  getAnalytics: async (req, res, next) => {
    try {
      const bookings = await bookingService.getAllBookings();
      
      // Calculate analytics
      const totalBookings = bookings.length;
      const pendingBookings = bookings.filter(b => b.booking_status === 'pending').length;
      const confirmedBookings = bookings.filter(b => b.booking_status === 'confirmed').length;
      const canceledBookings = bookings.filter(b => b.booking_status === 'canceled').length;
      
      // Calculate revenue (confirmed bookings only)
      const totalRevenue = bookings
        .filter(b => b.booking_status === 'confirmed')
        .reduce((sum, b) => sum + (parseFloat(b.service_price) || 0), 0);
      
      // Count unique clients
      const uniqueClients = new Set(bookings.map(b => b.USER_ID)).size;
      
      // Get recent bookings (last 10)
      const recentBookings = bookings.slice(0, 10);

      res.json({
        success: true,
        message: 'Analytics retrieved successfully',
        data: {
          summary: {
            totalBookings,
            pendingBookings,
            confirmedBookings,
            canceledBookings,
            totalRevenue,
            activeClients: uniqueClients
          },
          recentBookings
        }
      });
    } catch (error) {
      next(error);
    }
  }
};

module.exports = bookingController;