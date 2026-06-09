/**
 * Manages a global loading spinner overlay.
 */
export const LoadingIndicator = {
    spinnerEl: null,

    init: function() {
        const spinnerHTML = `
            <div class="loading-overlay d-none">
                <div class="spinner-border text-light" role="status">
                    <span class="visually-hidden">Loading...</span>
                </div>
            </div>
        `;
        document.body.insertAdjacentHTML('beforeend', spinnerHTML);
        this.spinnerEl = document.querySelector('.loading-overlay');

        const style = document.createElement('style');
        style.textContent = `
            .loading-overlay {
                position: fixed; top: 0; left: 0; width: 100%; height: 100%;
                background-color: rgba(0, 0, 0, 0.5);
                z-index: 2100; /* Higher than modals */
                display: flex; align-items: center; justify-content: center;
            }
        `;
        document.head.appendChild(style);
    },

    show: () => LoadingIndicator.spinnerEl.classList.remove('d-none'),
    hide: () => LoadingIndicator.spinnerEl.classList.add('d-none'),
};