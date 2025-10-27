const serviceRepository = require('../repositories/serviceRepository');

const serviceService = {
  // Get all active services
  getAllActiveServices: async () => {
    const services = await serviceRepository.findActive();
    return services;
  }
};

module.exports = serviceService;