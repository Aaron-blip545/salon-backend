const serviceRepository = require('../repositories/serviceRepository');

const serviceService = {
  // Get all active services
  getAllActiveServices: async () => {
    const services = await serviceRepository.findActive();
    return services;
  }
};
 
  // Get service by ID
  serviceService.getServiceById = async (service_id) => {
    const service = await serviceRepository.findById(service_id);
    return service;
  };

  // Create new service
  serviceService.createServices = async ({ name, description, price, duration }) => {
    const serviceId = await serviceRepository.addService({ name, description, price, duration });
    return serviceId;
  }   


module.exports = serviceService;