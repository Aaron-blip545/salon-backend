const bookingRepository = require('../repositories/bookingRepository');
const ApiError = require('../utils/ApiError');
const { BOOKING_STATUS, BUSINESS_HOURS } = require('../utils/constant');

const bookingService = {
  // Create new booking
  createBooking: async ({ user_id, service_id, booking_date, booking_time, notes }) => {
    // Check if time slot is available
    const isAvailable = await bookingRepository.isTimeSlotAvailable(booking_date, booking_time);
    if (!isAvailable) {
      throw new ApiError(409, 'Time slot already booked');
    }

  

    // Create booking
    const bookingId = await bookingRepository.create({
      user_id,
      service_id,
      booking_date,
      booking_time,
      status: BOOKING_STATUS.PENDING,
      notes
    });

    return { booking_id: bookingId };
  },

  // Get user's bookings
  getUserBookings: async (user_id) => {
    const bookings = await bookingRepository.findByUserId(user_id);
    return bookings;
  },

  // Get all bookings
  getAllBookings: async () => {
    const bookings = await bookingRepository.findAll();
    return bookings;
  },

  // Get available time slots for a date
  getAvailableSlots: async (date) => {
    const bookedSlots = await bookingRepository.getBookedSlots(date);
    const availableSlots = BUSINESS_HOURS.filter(slot => !bookedSlots.includes(slot));

    return {
      date,
      available_slots: availableSlots,
      booked_slots: bookedSlots
    };
  },

  // Update booking status
  updateBookingStatus: async ({ booking_id, status, user_id, user_role }) => {
    // Validate status
    const validStatuses = Object.values(BOOKING_STATUS);
    if (!validStatuses.includes(status)) {
      throw new ApiError(400, 'Invalid status');
    }

    // Get booking
    const booking = await bookingRepository.findById(booking_id);
    if (!booking) {
      throw new ApiError(404, 'Booking not found');
    }
    // Update status
    await bookingRepository.updateStatus(booking_id, status);
  },

  // Delete booking
  deleteBooking: async ({ booking_id, user_id, user_role }) => {
    // Get booking
    const booking = await bookingRepository.findById(booking_id);
    if (!booking) {
      throw new ApiError(404, 'Booking not found');
    }

    // Delete booking
    await bookingRepository.deleteById(booking_id);
  }

};

module.exports = bookingService;