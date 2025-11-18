const staffRepository = require('../repositories/staffRepository');
const bookingRepository = require('../repositories/bookingRepository');
const ApiError = require('../utils/ApiError');

const staffController = {
  // Get all active staff
  getActiveStaff: async (req, res, next) => {
    try {
      console.log('[staffController.getActiveStaff] Fetching active staff');
      const staff = await staffRepository.findAllActive();
      console.log('[staffController.getActiveStaff] Staff retrieved:', staff.length);

      res.json({
        success: true,
        message: 'Active staff retrieved successfully',
        data: staff
      });
    } catch (error) {
      console.error('[staffController.getActiveStaff] Error:', error);
      next(error);
    }
  },
  
  // Get all staff (for admin panel)
  getAllStaff: async (req, res, next) => {
    try {
      console.log('[staffController.getAllStaff] Fetching all staff');
      const staff = await staffRepository.findAll();
      console.log('[staffController.getAllStaff] Staff retrieved:', staff.length);

      res.json({
        success: true,
        message: 'All staff retrieved successfully',
        data: staff
      });
    } catch (error) {
      console.error('[staffController.getAllStaff] Error:', error);
      next(error);
    }
  },
  
  // Get staff by ID
  getStaffById: async (req, res, next) => {
    try {
      const { id } = req.params;
      console.log('[staffController.getStaffById] Fetching staff:', id);
      
      const staff = await staffRepository.findById(id);
      
      if (!staff) {
        throw new ApiError(404, 'Staff member not found');
      }

      res.json({
        success: true,
        message: 'Staff retrieved successfully',
        data: staff
      });
    } catch (error) {
      console.error('[staffController.getStaffById] Error:', error);
      next(error);
    }
  },
  
  // Create new staff
  createStaff: async (req, res, next) => {
    try {
      const { full_name, email, phone, role, gender } = req.body;
      
      console.log('[staffController.createStaff] Creating staff:', { full_name, email });
      
      // Validation
      if (!full_name || !email) {
        throw new ApiError(400, 'Full name and email are required');
      }
      
      // Check if email already exists
      const existingStaff = await staffRepository.findByEmail(email);
      if (existingStaff) {
        throw new ApiError(409, 'Staff member with this email already exists');
      }
      
      const staffData = {
        full_name,
        email,
        phone: phone || null,
        role: role || 'Staff',
        gender: gender || null,
        is_active: 1
      };
      
      const result = await staffRepository.create(staffData);
      
      res.status(201).json({
        success: true,
        message: 'Staff member created successfully',
        data: { staff_id: result.insertId, ...staffData }
      });
    } catch (error) {
      console.error('[staffController.createStaff] Error:', error);
      next(error);
    }
  },
  
  // Update staff
  updateStaff: async (req, res, next) => {
    try {
      const { id } = req.params;
      const { full_name, email, phone, role, gender, is_active } = req.body;
      
      console.log('[staffController.updateStaff] Updating staff:', id);
      
      // Check if staff exists
      const existing = await staffRepository.findById(id);
      if (!existing) {
        throw new ApiError(404, 'Staff member not found');
      }
      
      // Check if email is being changed to an existing email
      if (email && email !== existing.email) {
        const emailExists = await staffRepository.findByEmail(email);
        if (emailExists && emailExists.staff_id !== parseInt(id)) {
          throw new ApiError(409, 'Email already in use by another staff member');
        }
      }
      
      const staffData = {
        full_name: full_name || existing.full_name,
        email: email || existing.email,
        phone: phone !== undefined ? phone : existing.phone,
        role: role || existing.role,
        gender: gender !== undefined ? gender : existing.gender,
        is_active: is_active !== undefined ? is_active : existing.is_active
      };
      
      await staffRepository.update(id, staffData);
      
      res.json({
        success: true,
        message: 'Staff member updated successfully',
        data: { staff_id: parseInt(id), ...staffData }
      });
    } catch (error) {
      console.error('[staffController.updateStaff] Error:', error);
      next(error);
    }
  },
  
  // Delete staff
  deleteStaff: async (req, res, next) => {
    try {
      const { id } = req.params;
      
      console.log('[staffController.deleteStaff] Deleting staff:', id);
      
      // Check if staff exists
      const existing = await staffRepository.findById(id);
      if (!existing) {
        throw new ApiError(404, 'Staff member not found');
      }
      
      // Soft delete by setting is_active to 0
      await staffRepository.update(id, { is_active: 0 });
      
      res.json({
        success: true,
        message: 'Staff member deleted successfully'
      });
    } catch (error) {
      console.error('[staffController.deleteStaff] Error:', error);
      next(error);
    }
  },

  // Get bookings for a specific staff member
  getStaffBookings: async (req, res, next) => {
    try {
      const { id } = req.params;
      
      console.log('[staffController.getStaffBookings] Fetching bookings for staff:', id);
      
      // Check if staff exists
      const staff = await staffRepository.findById(id);
      if (!staff) {
        throw new ApiError(404, 'Staff member not found');
      }
      
      const bookings = await bookingRepository.findByStaffId(id);
      
      res.json({
        success: true,
        message: 'Staff bookings retrieved successfully',
        data: {
          staff: {
            staff_id: staff.staff_id,
            full_name: staff.full_name,
            email: staff.email,
            role: staff.role
          },
          bookings: bookings
        }
      });
    } catch (error) {
      console.error('[staffController.getStaffBookings] Error:', error);
      next(error);
    }
  }
};

module.exports = staffController;
