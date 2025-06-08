// Utility functions
function debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
        const later = () => {
            clearTimeout(timeout);
            func(...args);
        };
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
    };
}

// Animation functions
function animateHistoryCards() {
    const cards = document.querySelectorAll('.history-card');
    const observer = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                entry.target.classList.add('show');
                observer.unobserve(entry.target);
            }
        });
    }, {
        threshold: 0.1,
        rootMargin: '50px'
    });

    cards.forEach(card => {
        observer.observe(card);
    });
}

// UI Component functions
const showModal = debounce((title, message, showConfirm = false) => {
    const modal = document.getElementById('modal');
    const modalTitle = document.getElementById('modal-title');
    const modalMessage = document.getElementById('modal-message');
    const modalConfirm = document.getElementById('modal-confirm');
    
    modalTitle.textContent = title;
    modalMessage.textContent = message;
    modalConfirm.style.display = showConfirm ? 'block' : 'none';
    
    modal.classList.remove('hidden');
    modal.classList.add('flex');
    requestAnimationFrame(() => {
        modal.classList.add('active');
    });
}, 100);

const showToast = debounce((message, duration = 2000) => {
    const toast = document.getElementById('toast');
    const toastMessage = document.getElementById('toast-message');
    
    toastMessage.textContent = message;
    toast.classList.add('show');
    
    setTimeout(() => {
        toast.classList.remove('show');
    }, duration);
}, 100);

const showLoading = debounce((message = 'Processing...') => {
    const overlay = document.getElementById('loading-overlay');
    const loadingMessage = document.getElementById('loading-message');
    
    loadingMessage.textContent = message;
    overlay.classList.remove('hidden');
    overlay.classList.add('flex', 'active');
}, 100);

function closeModal() {
    const modal = document.getElementById('modal');
    modal.classList.remove('active');
    setTimeout(() => {
        modal.classList.remove('flex');
        modal.classList.add('hidden');
    }, 300);
}

function closeToast() {
    const toast = document.getElementById('toast');
    toast.classList.remove('show');
}

function hideLoading() {
    const overlay = document.getElementById('loading-overlay');
    overlay.classList.remove('active');
    setTimeout(() => {
        overlay.classList.remove('flex');
        overlay.classList.add('hidden');
    }, 300);
}

// File handling functions
function validateFile(file) {
    const validTypes = ['image/jpeg', 'image/jpg', 'image/png'];
    const maxSize = 5 * 1024 * 1024; // 5MB

    if (!validTypes.includes(file.type)) {
        showModal('Invalid File Type', 'Please upload a valid image file (JPG, JPEG, or PNG)');
        return false;
    }

    if (file.size > maxSize) {
        showModal('File Too Large', 'File size should be less than 5MB');
        return false;
    }

    return true;
}

function previewImage(event) {
    const preview = document.getElementById('preview');
    const previewContainer = document.getElementById('image-preview');
    const file = event.target.files[0];
    
    if (file) {
        if (!validateFile(file)) {
            event.target.value = '';
            return;
        }

        previewContainer.classList.add('loading');
        
        const reader = new FileReader();
        reader.onload = function(e) {
            const img = new Image();
            img.onload = function() {
                preview.src = e.target.result;
                previewContainer.classList.remove('hidden', 'loading');
                previewContainer.classList.add('show');
            };
            img.src = e.target.result;
        }
        reader.readAsDataURL(file);
    }
}

// History management
let pendingAction = null;

function handleModalConfirm() {
    if (pendingAction === 'clearHistory') {
        clearHistory();
    }
    pendingAction = null;
    closeModal();
}

async function clearHistory() {
    const historyCards = document.querySelectorAll('.history-card');
    const fileInput = document.getElementById('food-image');
    const previewContainer = document.getElementById('image-preview');
    const preview = document.getElementById('preview');
    const historyEmpty = document.querySelector('.history-empty');
    
    try {
        // Clear file input and preview
        if (fileInput) fileInput.value = '';
        if (previewContainer) {
            previewContainer.classList.remove('show');
            previewContainer.classList.add('hidden');
        }
        if (preview) preview.src = '';

        // Animate cards out if they exist
        if (historyCards.length > 0) {
            historyCards.forEach((card, index) => {
                setTimeout(() => {
                    card.classList.add('hide');
                }, index * 50);
            });
            // Wait for cards to animate out
            await new Promise(resolve => setTimeout(resolve, historyCards.length * 50 + 300));
            // Remove cards from DOM
            historyCards.forEach(card => card.remove());
        }

        // Show empty state if available
        if (historyEmpty) {
            historyEmpty.classList.add('show');
        }

        showLoading('Clearing history...');
        showToast('History cleared successfully!');
        setTimeout(() => {
            hideLoading();
        }, 1000);
    } catch (error) {
        console.error('Clear history error:', error);
        if (historyCards.length > 0) {
            historyCards.forEach(card => card.classList.remove('hide'));
        }
        showModal(
            'Error Clearing History',
            'Failed to clear history. Please try again.'
        );
    } finally {
        hideLoading();
    }
}

// Drag and drop functionality
function preventDefaults(e) {
    e.preventDefault();
    e.stopPropagation();
}

function highlight(e) {
    e.currentTarget.classList.add('dragover');
}

function unhighlight(e) {
    e.currentTarget.classList.remove('dragover');
}

function handleDrop(e) {
    const dt = e.dataTransfer;
    const files = dt.files;
    
    if (files.length > 0) {
        const file = files[0];
        if (validateFile(file)) {
            const input = document.getElementById('food-image');
            input.files = files;
            
            const event = new Event('change');
            input.dispatchEvent(event);
        }
    }
}

// Event Listeners
document.addEventListener('DOMContentLoaded', () => {
    // Initialize animations
    animateHistoryCards();
    
    // Show empty state if no history
    const historyCards = document.querySelectorAll('.history-card');
    const historyEmpty = document.querySelector('.history-empty');
    if (historyCards.length === 0 && historyEmpty) {
        historyEmpty.classList.add('show');
    }

    // Form submission
    document.querySelector('form').addEventListener('submit', async (e) => {
        e.preventDefault();
        const formData = new FormData(e.target);
        const fileInput = document.getElementById('food-image');
        
        if (!fileInput.files[0]) {
            showModal('No Image Selected', 'Please select an image to upload');
            return;
        }

        showLoading('Analyzing your food image...');
        
        try {
            const response = await fetch('/upload', {
                method: 'POST',
                body: formData
            });
            
            const result = await response.json();
            
            if (response.ok) {
                showToast('Image uploaded successfully!');
                setTimeout(() => window.location.reload(), 1000);
            } else {
                showModal('Upload Error', result.error || 'Failed to upload image');
            }
        } catch (error) {
            console.error('Upload error:', error);
            showModal('Error', 'Error uploading image. Please try again.');
        } finally {
            hideLoading();
        }
    });

    // Clear history button
    document.querySelector('button[class*="text-indigo-500"]').addEventListener('click', () => {
        pendingAction = 'clearHistory';
        showModal(
            'Clear History',
            'Are you sure you want to clear all analysis history? This action cannot be undone.',
            true
        );
    });

    // Upload zone drag and drop
    const dropZone = document.querySelector('.upload-zone');
    ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName => {
        dropZone.addEventListener(eventName, preventDefaults, false);
    });

    ['dragenter', 'dragover'].forEach(eventName => {
        dropZone.addEventListener(eventName, highlight, false);
    });

    ['dragleave', 'drop'].forEach(eventName => {
        dropZone.addEventListener(eventName, unhighlight, false);
    });

    dropZone.addEventListener('drop', handleDrop, false);

    // Preview image click handler
    document.getElementById('image-preview')?.addEventListener('click', () => {
        document.getElementById('food-image').click();
    });

    // Button animations
    const uploadButton = document.querySelector('button[type="submit"]');
    uploadButton.addEventListener('mouseenter', () => {
        uploadButton.classList.add('pulse');
    });
    uploadButton.addEventListener('mouseleave', () => {
        uploadButton.classList.remove('pulse');
    });

    const clearHistoryButton = document.querySelector('button[class*="text-indigo-500"]');
    clearHistoryButton.addEventListener('mouseenter', () => {
        clearHistoryButton.classList.add('pulse');
    });
    clearHistoryButton.addEventListener('mouseleave', () => {
        clearHistoryButton.classList.remove('pulse');
    });
}); 