const staffRepository = require('../repositories/staffRepository');
const ApiError = require('../utils/ApiError');

const staffController = {
  // Get all active staff
  getActiveStaff: async (req, res, next) => {
    try {
      const staff = await staffRepository.findAllActive();

      res.json({
        success: true,
        message: 'Active staff retrieved successfully',
        data: staff
      });
    } catch (error) {
      next(error);
    }
  }
};

module.exports = staffController;
