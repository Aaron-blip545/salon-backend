const bookingService = require('../services/bookingService');
const ApiError = require('../utils/ApiError');

const bookingController = {
  // Create new booking
  createBooking: async (req, res, next) => {
    try {
      const { service_id, booking_date, booking_time } = req.body;
      const user_id = req.user.id;

       //Validate required fields
      if (!service_id || !booking_date || !booking_time) {
        throw new ApiError(400, 'Service, date, and time are required');
     }

      const result = await bookingService.createBooking({
        user_id,
        service_id,
        booking_date,
        booking_time   
      });

      res.status(201).json({
        success: true,
        message: result.message,
        data: { booking_id: result.booking_id }
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
  }
};

module.exports = bookingController;