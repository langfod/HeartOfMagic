/**
 * Preset Base Module
 * Shared UI logic for preset chip rendering, delete confirmation,
 * rename flow, inline rename, and default-key lookup.
 *
 * Used by settingsPresets.js and scannerPresets.js — each provides
 * domain-specific callbacks while this module owns the common DOM/UX code.
 *
 * Depends on:
 * - DOM (document.createElement, getElementById, etc.)
 *
 * Exports (global):
 * - PresetBase.getDefaultKey(presets, defaultName)
 * - PresetBase.renderChips(container, presets, activeKey, defaultName, callbacks)
 * - PresetBase.handleDelete(deleteBtn, presetKey, presets, activeKey, defaultName, type, callbacks)
 * - PresetBase.handleRename(oldName, newName, presets, defaultName, type, callbacks)
 * - PresetBase.startInlineRename(presetKey, nameSpan, presets, renameFn)
 */

var PresetBase = {

    /**
     * Find the default preset key (case-insensitive search for defaultName).
     * @param {Object} presets - The presets dictionary
     * @param {string} defaultName - The default name to search for
     * @returns {string|null}
     */
    getDefaultKey: function(presets, defaultName) {
        var keys = Object.keys(presets);
        for (var i = 0; i < keys.length; i++) {
            if (keys[i].toLowerCase() === defaultName.toLowerCase()) {
                return keys[i];
            }
        }
        return null;
    },

    /**
     * Render a row of preset chips into a container element.
     * @param {HTMLElement} container - The DOM element to render into
     * @param {Object} presets - The presets dictionary
     * @param {string} activeKey - Currently active preset key
     * @param {string} defaultName - Name of the default preset (cannot delete/rename)
     * @param {Object} callbacks - { onApply, onSave, onDelete, onInlineRename }
     */
    renderChips: function(container, presets, activeKey, defaultName, callbacks) {
        container.innerHTML = '';
        var defaultKey = PresetBase.getDefaultKey(presets, defaultName);
        var keys = Object.keys(presets);

        for (var i = 0; i < keys.length; i++) {
            var key = keys[i];
            var preset = presets[key];
            var chipName = preset.name || key;
            var isDefault = (key === defaultKey);

            var chip = document.createElement('div');
            chip.className = 'scanner-preset-chip';
            if (key === activeKey) {
                chip.className += ' active';
            }
            if (isDefault) {
                chip.className += ' default';
            }

            var nameSpan = document.createElement('span');
            nameSpan.className = 'scanner-preset-name';
            nameSpan.textContent = chipName;
            nameSpan.setAttribute('data-preset', key);

            // Single click to apply
            nameSpan.addEventListener('click', (function(k) {
                return function() {
                    callbacks.onApply(k);
                };
            })(key));

            // Double click to rename (not on default)
            if (!isDefault) {
                nameSpan.addEventListener('dblclick', (function(k, span) {
                    return function(e) {
                        e.preventDefault();
                        e.stopPropagation();
                        callbacks.onInlineRename(k, span);
                    };
                })(key, nameSpan));
            }

            chip.appendChild(nameSpan);

            // Update button on active preset
            if (key === activeKey) {
                var updateBtn = document.createElement('span');
                updateBtn.className = 'scanner-preset-update';
                updateBtn.innerHTML = '&#8635;';
                updateBtn.title = 'Update preset with current settings';
                updateBtn.addEventListener('click', (function(k) {
                    return function(e) {
                        e.stopPropagation();
                        callbacks.onSave(k);
                    };
                })(key));
                chip.appendChild(updateBtn);
            }

            // Delete button (not on default)
            if (!isDefault) {
                var deleteBtn = document.createElement('span');
                deleteBtn.className = 'scanner-preset-delete';
                deleteBtn.textContent = '\u00d7';
                deleteBtn.title = 'Delete preset';
                deleteBtn.addEventListener('click', (function(k, btn) {
                    return function(e) {
                        e.stopPropagation();
                        callbacks.onDelete(k, btn);
                    };
                })(key, deleteBtn));
                chip.appendChild(deleteBtn);
            }

            container.appendChild(chip);
        }
    },

    /**
     * Handle delete with double-click arm/disarm confirmation.
     * @param {HTMLElement} deleteBtn - The delete button element
     * @param {string} presetKey - Key of the preset to delete
     * @param {Object} presets - The presets dictionary
     * @param {string} defaultName - Default preset name (cannot delete)
     * @param {string} type - 'settings' or 'scanner' (for callCpp)
     * @param {Object} callbacks - { getDefaultKey, getActiveKey, setActiveKey, onDefaultReset, onUpdateUI, onAutoSave }
     * @returns {boolean} true if deletion happened
     */
    handleDelete: function(deleteBtn, presetKey, presets, defaultName, type, callbacks) {
        if (!presets[presetKey]) return false;

        // Cannot delete the default preset
        if (presetKey === callbacks.getDefaultKey()) return false;

        // Second-click confirmation
        if (!deleteBtn || deleteBtn.getAttribute('data-armed') !== 'true') {
            if (deleteBtn) {
                deleteBtn.setAttribute('data-armed', 'true');
                deleteBtn.classList.add('armed');
                deleteBtn.title = 'Click again to confirm delete';
                setTimeout(function() {
                    deleteBtn.removeAttribute('data-armed');
                    deleteBtn.classList.remove('armed');
                    deleteBtn.title = 'Delete preset';
                }, 2000);
            }
            return false;
        }

        delete presets[presetKey];

        // Delete the preset file via C++
        if (window.callCpp) {
            window.callCpp('DeletePreset', JSON.stringify({ type: type, name: presetKey }));
        }

        if (callbacks.getActiveKey() === presetKey) {
            callbacks.setActiveKey(callbacks.onDefaultReset);
        }

        callbacks.onUpdateUI();
        callbacks.onAutoSave();

        console.log('[' + type + 'Presets] Deleted preset file:', presetKey);
        return true;
    },

    /**
     * Handle rename with validation and callCpp bridge calls.
     * @param {string} oldName - Current preset name
     * @param {string} newName - Requested new name
     * @param {Object} presets - The presets dictionary
     * @param {string} defaultName - Default preset name (cannot rename)
     * @param {string} type - 'settings' or 'scanner' (for callCpp)
     * @param {string} confirmKey - i18n key for overwrite confirm dialog
     * @param {Object} callbacks - { getDefaultKey, getActiveKey, setActiveKey, onUpdateUI, onAutoSave }
     * @returns {boolean} true if rename happened
     */
    handleRename: function(oldName, newName, presets, defaultName, type, confirmKey, callbacks) {
        if (!newName || newName.trim() === '' || !presets[oldName]) return false;
        newName = newName.trim();

        if (newName === oldName) return false;

        // Cannot rename default
        if (oldName === callbacks.getDefaultKey()) {
            callbacks.onUpdateUI();
            return false;
        }

        // Cannot rename to default name (reserved)
        if (newName.toLowerCase() === defaultName.toLowerCase()) {
            callbacks.onUpdateUI();
            return false;
        }

        // Check duplicate
        if (presets[newName]) {
            if (!confirm(t(confirmKey, {name: newName}))) {
                callbacks.onUpdateUI();
                return false;
            }
            delete presets[newName];
        }

        var preset = presets[oldName];
        preset.name = newName;
        presets[newName] = preset;
        delete presets[oldName];

        // Delete old file, save new file
        if (window.callCpp) {
            window.callCpp('DeletePreset', JSON.stringify({ type: type, name: oldName }));
            window.callCpp('SavePreset', JSON.stringify({ type: type, name: newName, data: preset }));
        }

        if (callbacks.getActiveKey() === oldName) {
            callbacks.setActiveKey(newName);
        }

        callbacks.onUpdateUI();
        callbacks.onAutoSave();

        console.log('[' + type + 'Presets] Renamed preset:', oldName, '->', newName);
        return true;
    },

    /**
     * Create an inline rename input field replacing the name span.
     * @param {string} presetKey - The preset key
     * @param {HTMLElement} nameSpan - The name span element to replace
     * @param {Object} presets - The presets dictionary
     * @param {Function} renameFn - function(oldName, newName) to call on commit
     */
    startInlineRename: function(presetKey, nameSpan, presets, renameFn) {
        var currentName = presets[presetKey] ? presets[presetKey].name : presetKey;
        var chip = nameSpan.parentElement;

        var input = document.createElement('input');
        input.type = 'text';
        input.className = 'scanner-preset-rename';
        input.value = currentName;
        input.style.width = Math.max(60, currentName.length * 7) + 'px';

        nameSpan.style.display = 'none';
        chip.insertBefore(input, nameSpan);
        input.focus();
        input.select();

        var committed = false;

        function commit() {
            if (committed) return;
            committed = true;

            var newName = input.value.trim();
            if (input.parentElement) {
                input.parentElement.removeChild(input);
            }
            nameSpan.style.display = '';

            if (newName && newName !== currentName) {
                renameFn(presetKey, newName);
            }
        }

        input.addEventListener('blur', commit);
        input.addEventListener('keydown', function(e) {
            if (e.key === 'Enter') {
                e.preventDefault();
                commit();
            } else if (e.key === 'Escape') {
                e.preventDefault();
                committed = true;
                if (input.parentElement) {
                    input.parentElement.removeChild(input);
                }
                nameSpan.style.display = '';
            }
        });
    }
};

window.PresetBase = PresetBase;

console.log('[PresetBase] Loaded');
