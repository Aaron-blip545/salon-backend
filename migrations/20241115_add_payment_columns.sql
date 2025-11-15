-- Add payment_status and receipt_image columns to bookings table
ALTER TABLE bookings
ADD COLUMN payment_status ENUM('pending', 'paid', 'failed') DEFAULT 'pending' AFTER STATUS_NAME,
ADD COLUMN receipt_image VARCHAR(255) DEFAULT NULL AFTER payment_status;

-- Update existing bookings to have payment_status as 'paid' if they were previously confirmed
UPDATE bookings 
SET payment_status = 'paid' 
WHERE STATUS_NAME = 'confirmed';

-- Update existing pending bookings to have payment_status as 'pending'
UPDATE bookings 
SET payment_status = 'pending' 
WHERE STATUS_NAME = 'pending';
