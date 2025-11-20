const bookingRepository = require('../repositories/bookingRepository');
const transactionRepository = require('../repositories/transactionRepository');
const ApiError = require('../utils/ApiError');
const { BOOKING_STATUS, BUSINESS_HOURS } = require('../utils/constant');

const bookingService = {
  // Create new booking
  createBooking: async ({ user_id, service_id, staff_id, booking_date, booking_time, status_name }) => {
    // Prevent multiple bookings for the same service and date by the same user
    const alreadyBooked = await bookingRepository.userHasBookingForServiceOnDate(
      user_id,
      service_id,
      booking_date
    );
    if (alreadyBooked) {
      throw new ApiError(409, 'You already have a booking for this service on this date');
    }

    // Check if time slot is available for this staff
    const isAvailable = await bookingRepository.isTimeSlotAvailable(booking_date, booking_time, staff_id);
    if (!isAvailable) {
      throw new ApiError(409, 'Time slot already booked');
    }
    
    // Create booking
    const bookingId = await bookingRepository.create({
      user_id,
      service_id,
      staff_id,
      booking_date,
      booking_time,
      status_name
    });

    // Fetch full booking details to return to client
    const bookingDetails = await bookingRepository.findById(bookingId);

    return { 
      booking_id: bookingId,
      message: 'Booking created successfully',
      details: bookingDetails
    };
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

  // Get pending bookings
  getPendingBookings: async () => {
    const bookings = await bookingRepository.findPendingBookings();
    return bookings;
  },

  // Get available time slots for a date (optionally scoped to a staff member)
  getAvailableSlots: async (date, staff_id) => {
    const bookedSlots = await bookingRepository.getBookedSlots(date, staff_id);
    const availableSlots = BUSINESS_HOURS.filter(slot => !bookedSlots.includes(slot));

    return {
      date,
      available_slots: availableSlots,
      booked_slots: bookedSlots
    };
  },

  // Update booking status
  updateBookingStatus: async ({ booking_id, status, user_id, user_role }) => {
    // Validate status - normalize to lowercase and check
    const normalizedStatus = status.toLowerCase();
    const validStatuses = ['pending', 'confirmed', 'completed', 'canceled', 'cancelled'];
    
    if (!validStatuses.includes(normalizedStatus)) {
      throw new ApiError(400, 'Invalid status. Must be: pending, confirmed, completed, or canceled');
    }

    // Get booking
    const booking = await bookingRepository.findById(booking_id);
    if (!booking) {
      throw new ApiError(404, 'Booking not found');
    }
    // Update status with normalized status
    await bookingRepository.updateStatus(booking_id, normalizedStatus);

    // If confirming the booking, also approve the payment BUT ONLY
    // for FULLY PAID transactions. Down payment logic remains handled
    // separately in updateServiceStatus when the service is completed.
    if (normalizedStatus === 'confirmed') {
      try {
        const txn = await transactionRepository.getTransactionByBookingIdOnly(booking_id);
        if (txn) {
          const method = String(txn.PAYMENT_METHOD || '').toUpperCase();
          const remainingRaw =
            txn.REMAINING_BALANCE !== undefined
              ? txn.REMAINING_BALANCE
              : (txn.remaining_balance !== undefined ? txn.remaining_balance : 0);
          const remaining = Number(remainingRaw) || 0;

          const isFullPaymentMethod = method.includes('FULL');
          const isZeroBalance = remaining <= 0;

          // Only auto-approve when this is clearly a fully-paid transaction
          if (isFullPaymentMethod || isZeroBalance) {
            await transactionRepository.updatePaymentStatus(booking_id, 'COMPLETED');
          }
        }
      } catch (err) {
        console.error('Failed to update transaction payment status on confirm', { booking_id, err });
        // Do not block confirming the booking if transaction update fails.
      }
    }

    // If this is a cancellation, also mark any related transaction
    // as REJECTED so payment status is clear in user/admin views.
    if (normalizedStatus === 'canceled' || normalizedStatus === 'cancelled') {
      try {
        await transactionRepository.updatePaymentStatus(booking_id, 'REJECTED');
      } catch (err) {
        console.error('Failed to update transaction payment status on cancel', { booking_id, err });
        // Do not block cancelling the booking if transaction update fails.
      }
    }

    return {
      message: 'Booking status updated successfully'
    };
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
  },

  // Update service status (client arrival and service completion tracking)
  updateServiceStatus: async ({ booking_id, service_status }) => {
    // Get booking to verify it exists
    const booking = await bookingRepository.findById(booking_id);
    if (!booking) {
      throw new ApiError(404, 'Booking not found');
    }

    // Update service status
    await bookingRepository.updateServiceStatus(booking_id, service_status);
    
    // If marking as completed, also update booking status and any
    // related DOWN PAYMENT transaction so the remaining balance is
    // cleared and payment is treated as fully paid.
    if (service_status === 'completed') {
      await bookingRepository.updateStatus(booking_id, 'completed');

      try {
        const txn = await transactionRepository.getTransactionByBookingIdOnly(booking_id);
        if (txn && String(txn.PAYMENT_METHOD).toUpperCase() === 'DOWN PAYMENT') {
          // Clear any remaining balance
          await transactionRepository.updateRemainingBalance(booking_id, 0);
          // Mark payment as fully paid/completed for UI mapping
          await transactionRepository.updatePaymentStatus(booking_id, 'COMPLETED');
        }
      } catch (err) {
        console.error('Failed to update transaction on service completion', { booking_id, err });
        // Do not block service completion if transaction update fails
      }
    }
    
    return {
      booking_id,
      service_status,
      message: `Service status updated to ${service_status}`
    };
  }

};

module.exports = bookingService;