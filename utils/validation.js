const validationResult = (data) => {
  const errors = [];

  if (data.name && data.name.trim().length < 2) {
    errors.push('Name must be at least 2 characters');
  }

  if (data.phone && data.phone.trim().length < 7) {
    errors.push('Phone number must be at least 7 characters');
  }

  if (data.password && data.password.length < 6) {
    errors.push('Password must be at least 6 characters');
  }

  return errors;
};

module.exports = {
  validationResult
};