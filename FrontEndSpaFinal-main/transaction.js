const API_BASE_URL = 'http://localhost:3000/api';

let selectedPayment = null;
let selectedProvider = null;
let bookingDetails = null;

// Load booking details from session storage
function loadBookingDetails() {
    bookingDetails = JSON.parse(sessionStorage.getItem('bookingDetails'));
    
    if (!bookingDetails) {
        Swal.fire({
            icon: 'error',
            title: 'No Booking Found',
            text: 'No booking details found. Please start from booking form.',
            confirmButtonColor: '#d33'
        }).then(() => {
            window.location.href = 'booking-form.html';
        });
        return;
    }
    
    // Calculate booking fee (10% of service price)
    const servicePrice = parseFloat(bookingDetails.price);
    const bookingFee = servicePrice * 0.10;
    // Grand total for full payment = service price + booking fee
    const grandTotal = servicePrice + bookingFee;
    // Down payment = 20% of (service price + booking fee)
    const downPaymentAmount = grandTotal * 0.20;

    // Store calculated values in bookingDetails for use in payment processing
    bookingDetails.bookingFee = bookingFee;
    bookingDetails.grandTotal = grandTotal;
    bookingDetails.downPaymentAmount = downPaymentAmount;
    
    // Display booking summary
    document.getElementById('service-name').textContent = bookingDetails.service_name;
    const staffNameEl = document.getElementById('staff-name');
    if (staffNameEl) {
        staffNameEl.textContent = bookingDetails.staff_name || '-';
    }
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
        // By default (before user selects payment type), show the grand total
        document.getElementById('total-price').textContent = `₱${grandTotal.toFixed(2)}`;
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

// Down payment option (10% via GCash)
document.getElementById('cash-option').addEventListener('click', function() {
    this.classList.add('selected');
    document.getElementById('online-option').classList.remove('selected');
    // Show GCash instructions/QR as well
    document.getElementById('online-details').classList.add('active');
    selectedPayment = 'CASH'; // still treated separately in logic, but UI is GCash-based
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
    const totalPriceEl = document.getElementById('total-price');
    const servicePrice = bookingDetails ? parseFloat(bookingDetails.price) : 0;
    const bookingFee = bookingDetails ? (bookingDetails.bookingFee || servicePrice * 0.10) : 0;
    const grandTotal = bookingDetails ? (bookingDetails.grandTotal || (servicePrice + bookingFee)) : (servicePrice + bookingFee);
    const downPaymentAmount = bookingDetails ? (bookingDetails.downPaymentAmount || (grandTotal * 0.20)) : (grandTotal * 0.20);
    
    if (selectedPayment === 'CASH') {
        submitBtn.disabled = false;
        submitBtn.textContent = 'Upload GCash Receipt (Down Payment)';
        if (totalPriceEl) {
            // Show amount to pay now = 20% of (service price + booking fee)
            totalPriceEl.textContent = `₱${downPaymentAmount.toFixed(2)}`;
        }
    } else if (selectedPayment === 'ONLINE') {
        // Only GCash is supported
        submitBtn.disabled = false;
        submitBtn.textContent = 'Upload GCash Receipt (Full Payment)';
        if (totalPriceEl) {
            // Show full amount = service price + booking fee
            totalPriceEl.textContent = `₱${grandTotal.toFixed(2)}`;
        }
    } else {
        submitBtn.disabled = true;
        submitBtn.textContent = 'Select Payment Method';
        if (totalPriceEl) {
            totalPriceEl.textContent = grandTotal
                ? `₱${grandTotal.toFixed(2)}`
                : '₱0.00';
        }
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

// Process down payment (20% of total) with GCash receipt
async function processCashPayment() {
    const loadingEl = document.getElementById('loading');
    const submitBtn = document.getElementById('submit-btn');
    const fileInput = document.getElementById('receipt-file');

    // Require receipt just like full GCash payment
    if (!fileInput || !fileInput.files.length) {
        Swal.fire({
            icon: 'warning',
            title: 'Receipt Required',
            text: 'Please upload a screenshot/photo of your GCash receipt for the down payment.',
            confirmButtonColor: '#3085d6'
        });
        return;
    }

    if (!bookingDetails || !bookingDetails.booking_id) {
        Swal.fire({
            icon: 'error',
            title: 'Missing Information',
            text: 'Missing booking information. Please re-book the service.',
            confirmButtonColor: '#d33'
        });
        return;
    }

    loadingEl.classList.add('active');
    submitBtn.disabled = true;

    try {
        // 1) Create/Update transaction with DOWN_PAYMENT type
        const txnResponse = await fetch(`${API_BASE_URL}/payments/${bookingDetails.booking_id}/down-payment`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${getToken()}`
            },
            body: JSON.stringify({
                service_id: bookingDetails.service_id,
                booking_id: bookingDetails.booking_id
            })
        });

        const txnData = await txnResponse.json();

        if (!txnResponse.ok || !txnData.success) {
            throw new Error(txnData.message || 'Failed to process payment');
        }

        // 2) Upload receipt image
        const uploadForm = new FormData();
        uploadForm.append('receipt', fileInput.files[0]);

        const uploadResponse = await fetch(`${API_BASE_URL}/payments/${bookingDetails.booking_id}/receipt`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${getToken()}`
            },
            body: uploadForm
        });

        const uploadData = await uploadResponse.json();

        if (!uploadResponse.ok || !uploadData.success) {
            throw new Error(uploadData.message || 'Failed to upload receipt');
        }

        sessionStorage.removeItem('bookingDetails');
        sessionStorage.setItem('bookingSuccess', 'Down payment confirmed! Please pay the remaining balance on service day. Pending admin approval.');
        window.location.href = 'bookedservices.html';
    } catch (error) {
        console.error('Error:', error);
        Swal.fire({
            icon: 'error',
            title: 'Transaction Failed',
            text: error.message || 'Transaction failed. Please try again.',
            confirmButtonColor: '#d33'
        });
    } finally {
        loadingEl.classList.remove('active');
        submitBtn.disabled = false;
    }
}

// Process full GCash payment: create transaction with FULL_PAYMENT type and upload receipt
async function processGCashPayment() {
    const loadingEl = document.getElementById('loading');
    const submitBtn = document.getElementById('submit-btn');
    const fileInput = document.getElementById('receipt-file');

    if (!fileInput || !fileInput.files.length) {
        Swal.fire({
            icon: 'warning',
            title: 'Receipt Required',
            text: 'Please upload a screenshot/photo of your GCash receipt first.',
            confirmButtonColor: '#3085d6'
        });
        return;
    }

    if (!bookingDetails || !bookingDetails.booking_id) {
        Swal.fire({
            icon: 'error',
            title: 'Missing Information',
            text: 'Missing booking information. Please re-book the service.',
            confirmButtonColor: '#d33'
        });
        return;
    }

    loadingEl.classList.add('active');
    submitBtn.disabled = true;

    try {
        // 1) Create/Update transaction with FULL_PAYMENT type
        const txnResponse = await fetch(`${API_BASE_URL}/payments/${bookingDetails.booking_id}/full-payment`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${getToken()}`
            },
            body: JSON.stringify({
                service_id: bookingDetails.service_id,
                booking_id: bookingDetails.booking_id
            })
        });

        const txnData = await txnResponse.json();

        if (!txnResponse.ok || !txnData.success) {
            throw new Error(txnData.message || 'Failed to process payment');
        }

        // 2) Upload receipt image
        const uploadForm = new FormData();
        uploadForm.append('receipt', fileInput.files[0]);

        const uploadResponse = await fetch(`${API_BASE_URL}/payments/${bookingDetails.booking_id}/receipt`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${getToken()}`
            },
            body: uploadForm
        });

        const uploadData = await uploadResponse.json();

        if (!uploadResponse.ok || !uploadData.success) {
            throw new Error(uploadData.message || 'Failed to upload receipt');
        }

        sessionStorage.removeItem('bookingDetails');
        sessionStorage.setItem(
            'bookingSuccess',
            'Full payment confirmed! Your booking is pending admin approval.'
        );
        window.location.href = 'bookedservices.html';
    } catch (error) {
        console.error('Error:', error);
        Swal.fire({
            icon: 'error',
            title: 'Payment Failed',
            text: error.message || 'Payment failed. Please try again.',
            confirmButtonColor: '#d33'
        });
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