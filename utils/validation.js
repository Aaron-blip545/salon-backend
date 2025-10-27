const validationResult = (data) => {
  const errors = [];

  if (data.name && data.name.trim().length < 2) {
    errors.push('Name must be at least 2 characters');
  }

  if (data.phone && !/^09\d{9}$/.test(data.phone)) {
    errors.push('Invalid phone number format (should be 09XXXXXXXXX)');
  }

  if (data.password && data.password.length < 6) {
    errors.push('Password must be at least 6 characters');
  }

  return errors;
};

module.exports = {
  validationResult
};