// ========================================================================
// 🎨 SISTEMA DE MODAIS CUSTOMIZADOS - ULTRA PROFISSIONAL
// Substitui todos os alert(), prompt() e confirm() por modais bonitos
// ========================================================================

const NaxioUI = {
    // ========================================================================
    // 📢 ALERT CUSTOMIZADO
    // ========================================================================
    alert: (title, message, type = 'info') => {
        return new Promise((resolve) => {
            const icons = {
                success: 'ri-checkbox-circle-line',
                error: 'ri-error-warning-line',
                warning: 'ri-alert-line',
                info: 'ri-information-line'
            };

            const colors = {
                success: '#10b981',
                error: '#ef4444',
                warning: '#f59e0b',
                info: '#3b82f6'
            };

            const modal = document.createElement('div');
            modal.className = 'naxio-modal-overlay';
            modal.innerHTML = `
                <div class="naxio-modal-container" style="max-width: 450px;">
                    <div class="naxio-modal-icon" style="color: ${colors[type]};">
                        <i class="${icons[type]}" style="font-size: 4rem;"></i>
                    </div>
                    <h3 class="naxio-modal-title">${title}</h3>
                    <p class="naxio-modal-message">${message}</p>
                    <div class="naxio-modal-actions">
                        <button class="naxio-btn naxio-btn-primary" id="naxio-alert-ok">
                            OK
                        </button>
                    </div>
                </div>
            `;

            document.body.appendChild(modal);
            setTimeout(() => modal.classList.add('active'), 10);

            const okBtn = modal.querySelector('#naxio-alert-ok');

            const close = () => {
                modal.classList.remove('active');
                setTimeout(() => {
                    modal.remove();
                    document.removeEventListener('keydown', handleEsc);
                    resolve(true);
                }, 300);
            };

            const handleEsc = (e) => {
                if (e.key === 'Escape') close();
            };

            document.addEventListener('keydown', handleEsc);
            okBtn.onclick = close;
            okBtn.focus();
        });
    },

    // ========================================================================
    // ❓ CONFIRM CUSTOMIZADO
    // ========================================================================
    confirm: (title, message, confirmText = 'Confirmar', cancelText = 'Cancelar') => {
        return new Promise((resolve) => {
            const modal = document.createElement('div');
            modal.className = 'naxio-modal-overlay';
            modal.innerHTML = `
                <div class="naxio-modal-container" style="max-width: 500px;">
                    <div class="naxio-modal-icon" style="color: #f59e0b;">
                        <i class="ri-question-line" style="font-size: 4rem;"></i>
                    </div>
                    <h3 class="naxio-modal-title">${title}</h3>
                    <p class="naxio-modal-message">${message}</p>
                    <div class="naxio-modal-actions">
                        <button class="naxio-btn naxio-btn-secondary" id="naxio-confirm-cancel">
                            ${cancelText}
                        </button>
                        <button class="naxio-btn naxio-btn-primary" id="naxio-confirm-ok">
                            ${confirmText}
                        </button>
                    </div>
                </div>
            `;

            document.body.appendChild(modal);
            setTimeout(() => modal.classList.add('active'), 10);

            const cancelBtn = modal.querySelector('#naxio-confirm-cancel');
            const okBtn = modal.querySelector('#naxio-confirm-ok');

            const close = (result) => {
                modal.classList.remove('active');
                setTimeout(() => {
                    modal.remove();
                    document.removeEventListener('keydown', handleEsc);
                    resolve(result);
                }, 300);
            };

            const handleEsc = (e) => {
                if (e.key === 'Escape') close(false);
            };

            document.addEventListener('keydown', handleEsc);
            cancelBtn.onclick = () => close(false);
            okBtn.onclick = () => close(true);
            okBtn.focus();
        });
    },

    // ========================================================================
    // ✏️ PROMPT CUSTOMIZADO
    // ========================================================================
    prompt: (title, message, defaultValue = '', placeholder = '', type = 'text') => {
        return new Promise((resolve) => {
            const modal = document.createElement('div');
            modal.className = 'naxio-modal-overlay';
            modal.innerHTML = `
                <div class="naxio-modal-container" style="max-width: 500px;">
                    <div class="naxio-modal-icon" style="color: #8b5cf6;">
                        <i class="ri-edit-line" style="font-size: 3rem;"></i>
                    </div>
                    <h3 class="naxio-modal-title">${title}</h3>
                    <p class="naxio-modal-message">${message}</p>
                    <div class="naxio-input-wrapper">
                        <input 
                            type="${type === 'password' ? 'text' : type}" 
                            id="naxio-prompt-input" 
                            class="naxio-input" 
                            style="${type === 'password' ? '-webkit-text-security: disc; text-security: disc;' : ''}"
                            placeholder="${placeholder}"
                            value="${defaultValue}"
                            autocomplete="new-password"
                            spellcheck="false"
                        >
                    </div>
                    <div class="naxio-modal-actions">
                        <button class="naxio-btn naxio-btn-secondary" id="naxio-prompt-cancel">
                            Cancelar
                        </button>
                        <button class="naxio-btn naxio-btn-primary" id="naxio-prompt-ok">
                            Confirmar
                        </button>
                    </div>
                </div>
            `;

            document.body.appendChild(modal);
            setTimeout(() => modal.classList.add('active'), 10);

            const input = modal.querySelector('#naxio-prompt-input');
            const cancelBtn = modal.querySelector('#naxio-prompt-cancel');
            const okBtn = modal.querySelector('#naxio-prompt-ok');

            const close = (result) => {
                modal.classList.remove('active');
                setTimeout(() => {
                    modal.remove();
                    document.removeEventListener('keydown', handleEsc);
                    resolve(result);
                }, 300);
            };

            const handleEsc = (e) => {
                if (e.key === 'Escape') close(null);
            };

            document.addEventListener('keydown', handleEsc);
            cancelBtn.onclick = () => close(null);
            okBtn.onclick = () => {
                const value = input.value.trim();
                close(value);
            };

            input.onkeypress = (e) => {
                if (e.key === 'Enter') {
                    const value = input.value.trim();
                    close(value);
                }
            };

            input.focus();
            input.select();
        });
    },

    // ========================================================================
    // 📝 TEXTAREA CUSTOMIZADO (para textos longos)
    // ========================================================================
    textarea: (title, message, defaultValue = '', placeholder = '', minLength = 0) => {
        return new Promise((resolve) => {
            const modal = document.createElement('div');
            modal.className = 'naxio-modal-overlay';
            modal.innerHTML = `
                <div class="naxio-modal-container" style="max-width: 600px;">
                    <div class="naxio-modal-icon" style="color: #8b5cf6;">
                        <i class="ri-file-text-line" style="font-size: 3rem;"></i>
                    </div>
                    <h3 class="naxio-modal-title">${title}</h3>
                    <p class="naxio-modal-message">${message}</p>
                    <div class="naxio-input-wrapper">
                        <textarea 
                            id="naxio-textarea-input" 
                            class="naxio-textarea" 
                            placeholder="${placeholder}"
                            rows="5"
                        >${defaultValue}</textarea>
                        ${minLength > 0 ? `<small class="naxio-hint">Mínimo ${minLength} caracteres</small>` : ''}
                    </div>
                    <div class="naxio-modal-actions">
                        <button class="naxio-btn naxio-btn-secondary" id="naxio-textarea-cancel">
                            Cancelar
                        </button>
                        <button class="naxio-btn naxio-btn-primary" id="naxio-textarea-ok">
                            Confirmar
                        </button>
                    </div>
                </div>
            `;

            document.body.appendChild(modal);
            setTimeout(() => modal.classList.add('active'), 10);

            const textarea = modal.querySelector('#naxio-textarea-input');
            const cancelBtn = modal.querySelector('#naxio-textarea-cancel');
            const okBtn = modal.querySelector('#naxio-textarea-ok');

            const close = (result) => {
                modal.classList.remove('active');
                setTimeout(() => {
                    modal.remove();
                    resolve(result);
                }, 300);
            };

            cancelBtn.onclick = () => close(null);
            okBtn.onclick = () => {
                const value = textarea.value.trim();
                if (minLength > 0 && value.length < minLength) {
                    NaxioUI.alert('Atenção', `O texto deve ter no mínimo ${minLength} caracteres.`, 'warning');
                    return;
                }
                close(value || null);
            };

            textarea.focus();
        });
    },

    // ========================================================================
    // 🎯 SELECT CUSTOMIZADO (escolha de opções)
    // ========================================================================
    select: (title, message, options = []) => {
        return new Promise((resolve) => {
            const modal = document.createElement('div');
            modal.className = 'naxio-modal-overlay';

            const optionsHtml = options.map((opt, index) => `
                <button class="naxio-select-option" data-value="${opt.value || opt}">
                    ${opt.icon ? `<i class="${opt.icon}"></i>` : ''}
                    <div>
                        <div class="naxio-select-option-title">${opt.label || opt}</div>
                        ${opt.description ? `<div class="naxio-select-option-desc">${opt.description}</div>` : ''}
                    </div>
                </button>
            `).join('');

            modal.innerHTML = `
                <div class="naxio-modal-container" style="max-width: 550px;">
                    <div class="naxio-modal-icon" style="color: #3b82f6;">
                        <i class="ri-list-check" style="font-size: 3rem;"></i>
                    </div>
                    <h3 class="naxio-modal-title">${title}</h3>
                    <p class="naxio-modal-message">${message}</p>
                    <div class="naxio-select-options">
                        ${optionsHtml}
                    </div>
                    <div class="naxio-modal-actions">
                        <button class="naxio-btn naxio-btn-secondary" id="naxio-select-cancel">
                            Cancelar
                        </button>
                    </div>
                </div>
            `;

            document.body.appendChild(modal);
            setTimeout(() => modal.classList.add('active'), 10);

            const cancelBtn = modal.querySelector('#naxio-select-cancel');
            const optionBtns = modal.querySelectorAll('.naxio-select-option');

            const close = (result) => {
                modal.classList.remove('active');
                setTimeout(() => {
                    modal.remove();
                    resolve(result);
                }, 300);
            };

            cancelBtn.onclick = () => close(null);

            optionBtns.forEach(btn => {
                btn.onclick = () => close(btn.dataset.value);
            });
        });
    },

    // ========================================================================
    // 📅 DATE PICKER CUSTOMIZADO
    // ========================================================================
    datePicker: (title, message, defaultDate = '') => {
        return new Promise((resolve) => {
            const today = new Date().toISOString().split('T')[0];
            const modal = document.createElement('div');
            modal.className = 'naxio-modal-overlay';
            modal.innerHTML = `
                <div class="naxio-modal-container" style="max-width: 450px;">
                    <div class="naxio-modal-icon" style="color: #8b5cf6;">
                        <i class="ri-calendar-line" style="font-size: 3rem;"></i>
                    </div>
                    <h3 class="naxio-modal-title">${title}</h3>
                    <p class="naxio-modal-message">${message}</p>
                    <div class="naxio-input-wrapper">
                        <input 
                            type="date" 
                            id="naxio-date-input" 
                            class="naxio-input" 
                            value="${defaultDate || today}"
                        >
                    </div>
                    <div class="naxio-modal-actions">
                        <button class="naxio-btn naxio-btn-secondary" id="naxio-date-cancel">
                            Cancelar
                        </button>
                        <button class="naxio-btn naxio-btn-primary" id="naxio-date-ok">
                            Confirmar
                        </button>
                    </div>
                </div>
            `;

            document.body.appendChild(modal);
            setTimeout(() => modal.classList.add('active'), 10);

            const input = modal.querySelector('#naxio-date-input');
            const cancelBtn = modal.querySelector('#naxio-date-cancel');
            const okBtn = modal.querySelector('#naxio-date-ok');

            const close = (result) => {
                modal.classList.remove('active');
                setTimeout(() => {
                    modal.remove();
                    resolve(result);
                }, 300);
            };

            cancelBtn.onclick = () => close(null);
            okBtn.onclick = () => close(input.value || null);
            input.focus();
        });
    },

    // ========================================================================
    // 📅⌚ DATETIME PICKER CUSTOMIZADO
    // ========================================================================
    datetimePicker: (title, message, defaultDateTime = '') => {
        return new Promise((resolve) => {
            const today = new Date(new Date().getTime() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 16);
            const modal = document.createElement('div');
            modal.className = 'naxio-modal-overlay';
            modal.innerHTML = `
                <div class="naxio-modal-container" style="max-width: 450px;">
                    <div class="naxio-modal-icon" style="color: #8b5cf6;">
                        <i class="ri-calendar-event-line" style="font-size: 3rem;"></i>
                    </div>
                    <h3 class="naxio-modal-title">${title}</h3>
                    <p class="naxio-modal-message">${message}</p>
                    <div class="naxio-input-wrapper">
                        <input 
                            type="datetime-local" 
                            id="naxio-datetime-input" 
                            class="naxio-input" 
                            value="${defaultDateTime || today}"
                        >
                    </div>
                    <div class="naxio-modal-actions">
                        <button class="naxio-btn naxio-btn-secondary" id="naxio-datetime-cancel">
                            Cancelar
                        </button>
                        <button class="naxio-btn naxio-btn-primary" id="naxio-datetime-ok">
                            Confirmar
                        </button>
                    </div>
                </div>
            `;

            document.body.appendChild(modal);
            setTimeout(() => modal.classList.add('active'), 10);

            const input = modal.querySelector('#naxio-datetime-input');
            const cancelBtn = modal.querySelector('#naxio-datetime-cancel');
            const okBtn = modal.querySelector('#naxio-datetime-ok');

            const close = (result) => {
                modal.classList.remove('active');
                setTimeout(() => {
                    modal.remove();
                    resolve(result);
                }, 300);
            };

            cancelBtn.onclick = () => close(null);
            okBtn.onclick = () => close(input.value || null);
            input.focus();
        });
    },

    // ========================================================================
    // ⏰ TIME PICKER CUSTOMIZADO
    // ========================================================================
    timePicker: (title, message, defaultTime = '') => {
        return new Promise((resolve) => {
            const now = new Date();
            const currentTime = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;

            const modal = document.createElement('div');
            modal.className = 'naxio-modal-overlay';
            modal.innerHTML = `
                <div class="naxio-modal-container" style="max-width: 450px;">
                    <div class="naxio-modal-icon" style="color: #f59e0b;">
                        <i class="ri-time-line" style="font-size: 3rem;"></i>
                    </div>
                    <h3 class="naxio-modal-title">${title}</h3>
                    <p class="naxio-modal-message">${message}</p>
                    <div class="naxio-input-wrapper">
                        <input 
                            type="time" 
                            id="naxio-time-input" 
                            class="naxio-input" 
                            value="${defaultTime || currentTime}"
                        >
                    </div>
                    <div class="naxio-modal-actions">
                        <button class="naxio-btn naxio-btn-secondary" id="naxio-time-cancel">
                            Cancelar
                        </button>
                        <button class="naxio-btn naxio-btn-primary" id="naxio-time-ok">
                            Confirmar
                        </button>
                    </div>
                </div>
            `;

            document.body.appendChild(modal);
            setTimeout(() => modal.classList.add('active'), 10);

            const input = modal.querySelector('#naxio-time-input');
            const cancelBtn = modal.querySelector('#naxio-time-cancel');
            const okBtn = modal.querySelector('#naxio-time-ok');

            const close = (result) => {
                modal.classList.remove('active');
                setTimeout(() => {
                    modal.remove();
                    resolve(result);
                }, 300);
            };

            cancelBtn.onclick = () => close(null);
            okBtn.onclick = () => close(input.value || null);
            input.focus();
        });
    },

    // ========================================================================
    // 🎨 LOADING OVERLAY
    // ========================================================================
    showLoading: (message = 'Carregando...') => {
        const existing = document.getElementById('naxio-loading-overlay');
        if (existing) existing.remove();

        const overlay = document.createElement('div');
        overlay.id = 'naxio-loading-overlay';
        overlay.className = 'naxio-loading-overlay';
        overlay.innerHTML = `
            <div class="naxio-loading-container">
                <div class="naxio-loading-spinner"></div>
                <p class="naxio-loading-text">${message}</p>
            </div>
        `;

        document.body.appendChild(overlay);
        setTimeout(() => overlay.classList.add('active'), 10);
    },

    hideLoading: () => {
        const overlay = document.getElementById('naxio-loading-overlay');
        if (overlay) {
            overlay.classList.remove('active');
            setTimeout(() => overlay.remove(), 300);
        }
    }
};

// Exporta para uso global
window.NaxioUI = NaxioUI;

console.log('✨ Sistema de Modais Customizados Naxio carregado!');
