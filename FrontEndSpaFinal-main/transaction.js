const API_BASE_URL = 'http://localhost:3000/api';

let selectedPayment = null;
let selectedProvider = null;
let bookingDetails = null;

// Load booking details from session storage
function loadBookingDetails() {
    bookingDetails = JSON.parse(sessionStorage.getItem('bookingDetails'));
    
    if (!bookingDetails) {
        alert('No booking details found. Please start from booking form.');
        window.location.href = 'booking-form.html';
        return;
    }
    
    // Calculate booking fee (20% of service price)
    const servicePrice = parseFloat(bookingDetails.price);
    const bookingFee = servicePrice * 0.20;
    const totalAmount = servicePrice; // Total is full service price (booking fee is part of it)
    
    // Store calculated values in bookingDetails for use in payment processing
    bookingDetails.bookingFee = bookingFee;
    bookingDetails.totalAmount = totalAmount;
    
    // Display booking summary
    document.getElementById('service-name').textContent = bookingDetails.service_name;
    document.getElementById('booking-date').textContent = formatDate(bookingDetails.booking_date);
    document.getElementById('booking-time').textContent = formatTime(bookingDetails.booking_time);
    
    // Display username if available
    if (document.getElementById('username')) {
        document.getElementById('username').textContent = bookingDetails.username || 'Guest';
    }
    
    // Display price breakdown
    if (document.getElementById('service-price')) {
        document.getElementById('service-price').textContent = `₱${servicePrice.toFixed(2)}`;
    }
    if (document.getElementById('booking-fee')) {
        document.getElementById('booking-fee').textContent = `₱${bookingFee.toFixed(2)}`;
    }
    if (document.getElementById('total-price')) {
        document.getElementById('total-price').textContent = `₱${totalAmount.toFixed(2)}`;
    }
}

// Format date
function formatDate(dateString) {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', { 
        year: 'numeric', 
        month: 'long', 
        day: 'numeric' 
    });
}

// Format time with AM/PM
function formatTime(timeString) {
    if (!timeString) return '';
    
    // Parse time (assuming format HH:MM or HH:MM:SS)
    const [hours, minutes] = timeString.split(':');
    const hour = parseInt(hours);
    const meridiem = hour >= 12 ? 'PM' : 'AM';
    const displayHour = hour % 12 || 12;
    
    return `${displayHour}:${minutes} ${meridiem}`;
}

// Get token
function getToken() {
    return localStorage.getItem('token');
}

// Cash payment option
document.getElementById('cash-option').addEventListener('click', function() {
    this.classList.add('selected');
    document.getElementById('online-option').classList.remove('selected');
    document.getElementById('online-details').classList.remove('active');
    selectedPayment = 'CASH';
    selectedProvider = null;
    updateSubmitButton();
});

// Online payment option
document.getElementById('online-option').addEventListener('click', function() {
    this.classList.add('selected');
    document.getElementById('cash-option').classList.remove('selected');
    document.getElementById('online-details').classList.add('active');
    selectedPayment = 'ONLINE';
    updateSubmitButton();
});

// Provider selection
document.querySelectorAll('.provider-btn').forEach(btn => {
    btn.addEventListener('click', function(e) {
        e.stopPropagation();
        document.querySelectorAll('.provider-btn').forEach(b => b.classList.remove('selected'));
        this.classList.add('selected');
        selectedProvider = this.dataset.provider;
        updateSubmitButton();
    });
});

// Update submit button text
function updateSubmitButton() {
    const submitBtn = document.getElementById('submit-btn');
    
    if (selectedPayment === 'CASH') {
        submitBtn.disabled = false;
        submitBtn.textContent = 'Confirm Booking (Pay Cash on Service Day)';
    } else if (selectedPayment === 'ONLINE') {
        // Only GCash is supported
        submitBtn.disabled = false;
        submitBtn.textContent = 'Upload GCash Receipt';
    } else {
        submitBtn.disabled = true;
        submitBtn.textContent = 'Select Payment Method';
    }
}

// Submit button click
document.getElementById('submit-btn').addEventListener('click', async function() {
    if (selectedPayment === 'CASH') {
        await processCashPayment();
    } else if (selectedPayment === 'ONLINE') {
        await processGCashPayment();
    }
});

// Process cash payment
async function processCashPayment() {
    const loadingEl = document.getElementById('loading');
    const submitBtn = document.getElementById('submit-btn');
    
    loadingEl.classList.add('active');
    submitBtn.disabled = true;

    try {
        const response = await fetch(`${API_BASE_URL}/transactions/`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${getToken()}`
            },
            body: JSON.stringify({
                service_id: bookingDetails.service_id,
                booking_date: bookingDetails.booking_date,
                booking_time: bookingDetails.booking_time,
                payment_method: 'CASH',
                payment_type: 'FULL_PAYMENT'
            })
        });

        const data = await response.json();

        if (data.success) {
            sessionStorage.removeItem('bookingDetails');
            sessionStorage.setItem('bookingSuccess', 'Booking confirmed! Please pay cash on service day. Pending admin approval.');
            window.location.href = 'bookedservices.html';
        } else {
            alert('Failed to create booking: ' + data.message);
        }
    } catch (error) {
        console.error('Error:', error);
        alert('Transaction failed. Please try again.');
    } finally {
        loadingEl.classList.remove('active');
        submitBtn.disabled = false;
    }
}

// Process GCash payment: upload receipt for existing booking
async function processGCashPayment() {
    const loadingEl = document.getElementById('loading');
    const submitBtn = document.getElementById('submit-btn');
    const fileInput = document.getElementById('receipt-file');

    if (!fileInput || !fileInput.files.length) {
        alert('Please upload a screenshot/photo of your GCash receipt first.');
        return;
    }

    const file = fileInput.files[0];

    if (!bookingDetails || !bookingDetails.booking_id) {
        alert('Missing booking information. Please re-book the service.');
        return;
    }

    loadingEl.classList.add('active');
    submitBtn.disabled = true;

    try {
        const formData = new FormData();
        formData.append('receipt', file);

        const response = await fetch(`${API_BASE_URL}/payments/${bookingDetails.booking_id}/receipt`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${getToken()}`
            },
            body: formData
        });

        const data = await response.json();

        if (!response.ok || !data.success) {
            throw new Error(data.message || 'Failed to upload receipt');
        }

        sessionStorage.removeItem('bookingDetails');
        sessionStorage.setItem(
            'bookingSuccess',
            'GCash payment receipt uploaded successfully. Your payment will be verified by the admin.'
        );
        window.location.href = 'bookedservices.html';
    } catch (error) {
        console.error('Error:', error);
        alert(error.message || 'Payment failed. Please try again.');
    } finally {
        loadingEl.classList.remove('active');
        submitBtn.disabled = false;
    }
}

// Wire receipt file name display
const receiptInput = document.getElementById('receipt-file');
const receiptNameEl = document.getElementById('receipt-file-name');
if (receiptInput && receiptNameEl) {
    receiptInput.addEventListener('change', () => {
        receiptNameEl.textContent = receiptInput.files.length
            ? receiptInput.files[0].name
            : 'No file selected';
    });
}

// Initialize on page load
window.addEventListener('DOMContentLoaded', () => {
    loadBookingDetails();
});