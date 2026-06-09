/**
 * Manages Bootstrap toasts for non-blocking notifications.
 */
export const ToastManager = {
    toastContainerEl: null,

    init: function() {
        // Create a container for toasts and add it to the body.
        const container = document.createElement('div');
        container.className = 'toast-container position-fixed bottom-0 end-0 p-3';
        container.style.zIndex = '2050'; // Higher than most elements
        document.body.appendChild(container);
        this.toastContainerEl = container;
    },

    show: function(message, type = 'info', duration = 4000) {
        if (!this.toastContainerEl) {
            console.error('ToastManager not initialized.');
            return;
        }

        const toastId = `toast-${Date.now()}`;
        const toastTypeClasses = {
            success: 'bg-success text-white',
            error: 'bg-danger text-white',
            warning: 'bg-warning text-dark',
            info: 'bg-info text-dark'
        };

        const toastHeaderClass = toastTypeClasses[type] || 'bg-secondary text-white';

        const toastHTML = `
            <div id="${toastId}" class="toast" role="alert" aria-live="assertive" aria-atomic="true">
              <div class="toast-header ${toastHeaderClass}">
                <strong class="me-auto">${type.charAt(0).toUpperCase() + type.slice(1)}</strong>
                <button type="button" class="btn-close btn-close-white" data-bs-dismiss="toast" aria-label="Close"></button>
              </div>
              <div class="toast-body bg-light text-dark">${message}</div>
            </div>
        `;

        this.toastContainerEl.insertAdjacentHTML('beforeend', toastHTML);

        const toastEl = document.getElementById(toastId);
        const toast = new bootstrap.Toast(toastEl, { delay: duration, autohide: true });
        toastEl.addEventListener('hidden.bs.toast', () => toastEl.remove());
        toast.show();
    }
};