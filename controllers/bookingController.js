const { isTimeSlotAvailable } = require('../repositories/bookingRepository');
const bookingService = require('../services/bookingService');
const ApiError = require('../utils/ApiError');

const bookingController = {
  // Create new booking
  createBooking: async (req, res, next) => {
    try {
      const { service_id, booking_date, booking_time, status_name} = req.body;
      const user_id = req.user.id;

       //Validate required fields
      if (!service_id || !booking_date ||! booking_time) {
        throw new ApiError(400, 'Service, date, and time are required');
     }
      if (!isTimeSlotAvailable(booking_date, booking_time)) {
        throw new ApiError(400, 'The selected time slot has been already booked');
      }
      
      const result = await bookingService.createBooking({
        user_id,
        service_id,
        booking_date,
        booking_time, 
        status_name: 'pending' 
      });

      res.status(201).json({
        success: true,
        message: result.message,
        data: result.details
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

      res.json({
        success: true,
        message: 'Bookings retrieved successfully',
        data: bookings
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