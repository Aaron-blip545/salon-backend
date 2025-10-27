const serviceService = require('../services/serviceService');

const serviceController = {
  // Get all services
  getAllServices: async (req, res, next) => {
    try {
      const services = await serviceService.getAllServices();

      res.json({
        success: true,
        message: 'Services retrieved successfully',
        data: services
      });
    } catch (error) {
      next(error);
    }
  },

  // Get service by ID
  getServiceById: async (req, res, next) => {
    try {
      const { id } = req.params;
      const service = await serviceService.getServiceById(id);

      if (!service) {
        return res.status(404).json({
          success: false,
          message: 'Service not found'
        });
      }

      res.json({
        success: true,
        message: 'Service retrieved successfully',
        data: service
      });
    } catch (error) {
      next(error);
    }
  },

  // Create new service (Admin only)
  createService: async (req, res, next) => {
    try {
      const { name, description, price, duration } = req.body;

      if (!name || !price) {
        return res.status(400).json({
          success: false,
          message: 'Name and price are required'
        });
      }

      const result = await serviceService.createService({
        name,
        description,
        price,
        duration
      });

      res.status(201).json({
        success: true,
        message: 'Service created successfully',
        data: result
      });
    } catch (error) {
      next(error);
    }
  },

  // Update service (Admin only)
  updateService: async (req, res, next) => {
    try {
      const { id } = req.params;
      const { name, description, price, duration } = req.body;

      await serviceService.updateService(id, {
        name,
        description,
        price,
        duration
      });

      res.json({
        success: true,
        message: 'Service updated successfully'
      });
    } catch (error) {
      next(error);
    }
  },

  // Delete service (Admin only)
  deleteService: async (req, res, next) => {
    try {
      const { id } = req.params;

      await serviceService.deleteService(id);

      res.json({
        success: true,
        message: 'Service deleted successfully'
      });
    } catch (error) {
      next(error);
    }
  }
};

module.exports = serviceController;