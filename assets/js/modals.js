import { formatBytes } from './utils.js';
import { ToastManager } from './toastManager.js';

/**
 * Manages all Bootstrap modals in the application.
 */

let inputModal, inputModalEl, inputModalLabel, inputModalValue, inputModalForm, inputModalFormLabel, inputModalSaveBtn;
let confirmModal, confirmModalEl, confirmModalLabel, confirmModalBody, confirmModalConfirmBtn;
let uploadModal, uploadModalEl, uploadModalLabel, uploadModalFiles, uploadModalUploadBtn, uploadProgress, uploadProgressBar;
let infoModal, infoModalEl;

export const ModalManager = {
    init() {
        inputModalEl = document.getElementById('inputModal');
        inputModal = new bootstrap.Modal(inputModalEl);
        inputModalLabel = document.getElementById('inputModalLabel');
        inputModalValue = document.getElementById('inputModalValue');
        inputModalForm = document.getElementById('inputModalForm');
        inputModalFormLabel = inputModalForm.querySelector('.form-label');
        inputModalSaveBtn = document.getElementById('inputModalSave');

        confirmModalEl = document.getElementById('confirmModal');
        confirmModal = new bootstrap.Modal(confirmModalEl);
        confirmModalLabel = document.getElementById('confirmModalLabel');
        confirmModalBody = document.getElementById('confirmModalBody');
        confirmModalConfirmBtn = document.getElementById('confirmModalConfirm');

        // Dynamic z-index stacking for nested modal displays (e.g. over Admin Panel)
        confirmModalEl.addEventListener('show.bs.modal', () => {
            const openModals = document.querySelectorAll('.modal.show:not(#confirmModal)');
            if (openModals.length > 0) {
                confirmModalEl.style.zIndex = '1090';
                setTimeout(() => {
                    const backdrops = document.querySelectorAll('.modal-backdrop.show');
                    if (backdrops.length > 0) {
                        backdrops[backdrops.length - 1].style.zIndex = '1085';
                    }
                }, 50);
            }
        });
        confirmModalEl.addEventListener('hidden.bs.modal', () => {
            confirmModalEl.style.zIndex = '';
        });

        uploadModalEl = document.getElementById('uploadModal');
        uploadModal = new bootstrap.Modal(uploadModalEl);
        uploadModalLabel = document.getElementById('uploadModalLabel');
        uploadModalFiles = document.getElementById('uploadModalFiles');
        uploadModalUploadBtn = document.getElementById('uploadModalUpload');
        uploadProgress = document.getElementById('uploadProgress');
        uploadProgressBar = uploadProgress.querySelector('.progress-bar');

        infoModalEl = document.getElementById('infoModal');
        infoModal = new bootstrap.Modal(infoModalEl);
    },

    showInput(title, label, defaultValue = '', onSaveCallback) {
        inputModalLabel.textContent = title;
        inputModalFormLabel.textContent = label;
        inputModalValue.value = defaultValue;

        const saveHandler = () => {
            if (inputModalForm.checkValidity()) {
                onSaveCallback(inputModalValue.value);
                inputModal.hide();
            } else {
                inputModalForm.reportValidity();
            }
        };

        inputModalSaveBtn.onclick = saveHandler;
        inputModalForm.onsubmit = (e) => { e.preventDefault(); saveHandler(); };

        inputModalEl.addEventListener('shown.bs.modal', () => {
            inputModalValue.focus();
            inputModalValue.select();
        }, { once: true });

        inputModal.show();
    },

    showConfirm(title, body, onConfirmCallback) {
        confirmModalLabel.textContent = title;
        confirmModalBody.innerHTML = body;
        confirmModalConfirmBtn.onclick = () => { onConfirmCallback(); confirmModal.hide(); };
        confirmModal.show();
    },

    showUpload(path, onUploadComplete) {
        uploadModalLabel.textContent = `Upload to "${path || 'workspace root'}"`;
        uploadModalFiles.value = '';
        uploadProgress.style.display = 'none';

        const uploadHandler = () => {
            const files = uploadModalFiles.files;
            if (files.length === 0) {
                ToastManager.show('Please select at least one file to upload.', 'warning');
                return;
            }

            const formData = new FormData();
            formData.append('action', 'upload');
            formData.append('path', path);
            for (let i = 0; i < files.length; i++) {
                formData.append('files[]', files[i]);
            }

            const xhr = new XMLHttpRequest();
            xhr.open('POST', `${App.url}/api.php`, true);

            xhr.upload.onprogress = (event) => {
                if (event.lengthComputable) {
                    const percentComplete = Math.round((event.loaded / event.total) * 100);
                    uploadProgress.style.display = 'block';
                    uploadProgressBar.style.width = `${percentComplete}%`;
                    uploadProgressBar.textContent = `${percentComplete}%`;
                }
            };

            xhr.onload = () => {
                uploadProgress.style.display = 'none';
                if (xhr.status >= 200 && xhr.status < 400) {
                    const result = JSON.parse(xhr.responseText);
                    if (result.status === 'success') {
                        onUploadComplete();
                        uploadModal.hide();
                    } else {
                        ToastManager.show(`Upload failed: ${result.message}`, 'error');
                    }
                } else {
                    ToastManager.show(`Upload failed: Server responded with status ${xhr.status}`, 'error');
                }
            };
            xhr.onerror = () => {
                ToastManager.show('Upload failed: A network error occurred.', 'error');
            };
            xhr.send(formData);
        };
        uploadModalUploadBtn.onclick = uploadHandler;
        uploadModal.show();
    },

    showInfo(info) {
        document.getElementById('infoModalName').textContent = info.name;
        document.getElementById('infoModalPath').textContent = info.path;
        document.getElementById('infoModalSize').textContent = formatBytes(info.size);
        document.getElementById('infoModalType').textContent = info.type;
        document.getElementById('infoModalLastModified').textContent = new Date(info.last_modified * 1000).toLocaleString();
        infoModal.show();
    }
};