/**
 * Plugin Whitelist Modal
 * UI for managing plugin whitelist (filter which mods' spells appear in trees)
 *
 * Depends on: state.js (settings), cppCallbacks.js (spell data)
 */

// =============================================================================
// WHITELIST MODAL - Plugin filtering for spell scanning
// =============================================================================

// Base game plugins that are always shown at the top
var BASE_GAME_PLUGINS = [
    'Skyrim.esm',
    'Update.esm',
    'Dawnguard.esm',
    'HearthFires.esm',
    'Dragonborn.esm'
];

/**
 * Extract plugin name from a spell object.
 * Uses persistentId format: "PluginName.esp|0x00123456"
 */
function extractPluginFromSpell(spell) {
    // Debug: log first spell's fields to see what's available
    if (!extractPluginFromSpell._logged && spell) {
        console.log('[Whitelist] Sample spell fields:', Object.keys(spell));
        console.log('[Whitelist] Sample spell data:', JSON.stringify(spell).substring(0, 500));
        extractPluginFromSpell._logged = true;
    }

    if (spell.persistentId && spell.persistentId.includes('|')) {
        return spell.persistentId.split('|')[0];
    }
    // Fallback: try source field if available
    if (spell.source) {
        return spell.source;
    }
    // Fallback: try plugin field
    if (spell.plugin) {
        return spell.plugin;
    }
    return null;
}

/**
 * Analyze cached spells and build plugin spell counts.
 * Returns: { 'PluginName.esp': 42, ... }
 */
function buildPluginSpellCounts() {
    var counts = {};

    // Debug: check state availability
    console.log('[Whitelist] state exists:', typeof state !== 'undefined');
    console.log('[Whitelist] state.lastSpellData exists:', state && typeof state.lastSpellData !== 'undefined');
    console.log('[Whitelist] state.lastSpellData.spells exists:', state && state.lastSpellData && typeof state.lastSpellData.spells !== 'undefined');

    if (state && state.lastSpellData) {
        console.log('[Whitelist] lastSpellData keys:', Object.keys(state.lastSpellData));
    }

    // Get spells from state.lastSpellData (populated after scan)
    var allSpells = [];
    if (state && state.lastSpellData && state.lastSpellData.spells) {
        allSpells = state.lastSpellData.spells;
    }
    // Fallback to scannedSpellData global
    if (allSpells.length === 0 && typeof scannedSpellData !== 'undefined' && scannedSpellData) {
        allSpells = scannedSpellData;
    }

    console.log('[Whitelist] Building plugin counts from ' + allSpells.length + ' spells');

    allSpells.forEach(function(spell) {
        var plugin = extractPluginFromSpell(spell);
        if (plugin) {
            counts[plugin] = (counts[plugin] || 0) + 1;
        }
    });

    console.log('[Whitelist] Found plugins:', Object.keys(counts));
    return counts;
}

/**
 * Show the whitelist modal and populate it with plugins.
 */
function showWhitelistModal() {
    var modal = document.getElementById('whitelist-modal');
    if (!modal) return;

    modal.classList.remove('hidden');

    var searchInput = document.getElementById('whitelist-search');
    if (searchInput) {
        searchInput.value = '';
    }

    renderWhitelistEntries();
    setupWhitelistListeners();
}

/**
 * Hide the whitelist modal and save settings.
 */
function hideWhitelistModal() {
    var modal = document.getElementById('whitelist-modal');
    if (modal) modal.classList.add('hidden');
    autoSaveSettings();
    if (typeof updatePrimedCount === 'function') updatePrimedCount();
}

/**
 * Render all plugin entries in the whitelist modal.
 */
function renderWhitelistEntries() {
    var baseContainer = document.getElementById('whitelist-base-entries');
    var modContainer = document.getElementById('whitelist-mod-entries');
    var baseCountEl = document.getElementById('whitelist-base-count');
    var modCountEl = document.getElementById('whitelist-mod-count');

    if (!baseContainer || !modContainer) return;

    // Build current plugin spell counts
    var pluginCounts = buildPluginSpellCounts();
    var allPlugins = Object.keys(pluginCounts).sort(function(a, b) {
        return a.toLowerCase().localeCompare(b.toLowerCase());
    });

    // Separate base game and mod plugins
    var basePlugins = [];
    var modPlugins = [];

    allPlugins.forEach(function(plugin) {
        var isBase = BASE_GAME_PLUGINS.some(function(bp) {
            return bp.toLowerCase() === plugin.toLowerCase();
        });
        if (isBase) {
            basePlugins.push(plugin);
        } else {
            modPlugins.push(plugin);
        }
    });

    // Also add base game plugins that might not have spells but should be shown
    BASE_GAME_PLUGINS.forEach(function(bp) {
        var exists = basePlugins.some(function(p) {
            return p.toLowerCase() === bp.toLowerCase();
        });
        if (!exists) {
            basePlugins.push(bp);
        }
    });

    // Get current whitelist state
    var whitelist = settings.pluginWhitelist || [];
    var whitelistMap = {};
    whitelist.forEach(function(entry) {
        whitelistMap[entry.plugin.toLowerCase()] = entry.enabled;
    });

    // Render base game plugins
    baseContainer.innerHTML = '';
    var enabledBaseCount = 0;

    basePlugins.forEach(function(plugin) {
        var count = pluginCounts[plugin] || 0;
        var isEnabled = whitelistMap[plugin.toLowerCase()] !== false; // Default to enabled
        if (isEnabled) enabledBaseCount++;

        // Ensure base game plugins are actually in the whitelist array (not just visually checked)
        if (isEnabled && whitelistMap[plugin.toLowerCase()] === undefined) {
            updateWhitelistEntry(plugin, true);
        }

        var div = createWhitelistEntry(plugin, count, isEnabled);
        baseContainer.appendChild(div);
    });

    if (baseCountEl) {
        baseCountEl.textContent = enabledBaseCount + '/' + basePlugins.length;
    }

    // Render mod plugins
    modContainer.innerHTML = '';
    var enabledModCount = 0;

    if (modPlugins.length === 0) {
        modContainer.innerHTML = '<div class="whitelist-empty">Scan spells first to see mod plugins</div>';
    } else {
        modPlugins.forEach(function(plugin) {
            var count = pluginCounts[plugin] || 0;
            var isEnabled = whitelistMap[plugin.toLowerCase()] !== false; // Default to enabled for all plugins
            if (isEnabled) enabledModCount++;

            // Ensure mod plugins are actually in the whitelist array (not just visually checked)
            if (isEnabled && whitelistMap[plugin.toLowerCase()] === undefined) {
                updateWhitelistEntry(plugin, true);
            }

            var div = createWhitelistEntry(plugin, count, isEnabled);
            modContainer.appendChild(div);
        });
    }

    if (modCountEl) {
        modCountEl.textContent = enabledModCount + '/' + modPlugins.length;
    }
}

/**
 * Create a single whitelist entry DOM element.
 */
function createWhitelistEntry(plugin, count, isEnabled) {
    var div = document.createElement('div');
    div.className = 'whitelist-entry';
    div.dataset.plugin = plugin.toLowerCase();

    div.innerHTML =
        '<div class="whitelist-entry-left">' +
            '<input type="checkbox" class="whitelist-checkbox" ' + (isEnabled ? 'checked' : '') + '>' +
            '<span class="whitelist-entry-name">' + plugin + '</span>' +
        '</div>' +
        '<span class="whitelist-entry-count">(' + count + ' spells)</span>';

    // Click anywhere on the row to toggle
    div.addEventListener('click', function(e) {
        var checkbox = div.querySelector('.whitelist-checkbox');
        if (e.target !== checkbox) {
            checkbox.checked = !checkbox.checked;
        }
        updateWhitelistEntry(plugin, checkbox.checked);
    });

    return div;
}

/**
 * Update a plugin's whitelist status.
 */
function updateWhitelistEntry(plugin, enabled) {
    if (!settings.pluginWhitelist) settings.pluginWhitelist = [];

    var found = false;
    settings.pluginWhitelist.forEach(function(entry) {
        if (entry.plugin.toLowerCase() === plugin.toLowerCase()) {
            entry.enabled = enabled;
            found = true;
        }
    });

    if (!found) {
        settings.pluginWhitelist.push({
            plugin: plugin,
            enabled: enabled,
            spellCount: 0
        });
    }

    // Update counts display
    updateWhitelistCounts();
}

/**
 * Update the count displays in the whitelist modal.
 */
function updateWhitelistCounts() {
    var baseContainer = document.getElementById('whitelist-base-entries');
    var modContainer = document.getElementById('whitelist-mod-entries');
    var baseCountEl = document.getElementById('whitelist-base-count');
    var modCountEl = document.getElementById('whitelist-mod-count');

    if (baseContainer && baseCountEl) {
        var baseEntries = baseContainer.querySelectorAll('.whitelist-entry');
        var checkedBase = baseContainer.querySelectorAll('.whitelist-checkbox:checked').length;
        baseCountEl.textContent = checkedBase + '/' + baseEntries.length;
    }

    if (modContainer && modCountEl) {
        var modEntries = modContainer.querySelectorAll('.whitelist-entry');
        var checkedMod = modContainer.querySelectorAll('.whitelist-checkbox:checked').length;
        modCountEl.textContent = checkedMod + '/' + modEntries.length;
    }
}

/**
 * Set all plugins to enabled or disabled.
 */
function setAllWhitelist(enabled) {
    var entries = document.querySelectorAll('#whitelist-modal .whitelist-entry');
    entries.forEach(function(entry) {
        var checkbox = entry.querySelector('.whitelist-checkbox');
        var plugin = entry.dataset.plugin;
        if (checkbox && plugin) {
            checkbox.checked = enabled;
            updateWhitelistEntry(plugin, enabled);
        }
    });
}

/**
 * Enable only base game plugins.
 */
function setBaseOnlyWhitelist() {
    var entries = document.querySelectorAll('#whitelist-modal .whitelist-entry');
    entries.forEach(function(entry) {
        var checkbox = entry.querySelector('.whitelist-checkbox');
        var plugin = entry.dataset.plugin;
        if (checkbox && plugin) {
            var isBase = BASE_GAME_PLUGINS.some(function(bp) {
                return bp.toLowerCase() === plugin.toLowerCase();
            });
            checkbox.checked = isBase;
            updateWhitelistEntry(plugin, isBase);
        }
    });
}

/**
 * Filter visible entries based on search term.
 */
function filterWhitelistEntries(searchTerm) {
    var entries = document.querySelectorAll('#whitelist-modal .whitelist-entry');
    var term = searchTerm.toLowerCase();

    entries.forEach(function(entry) {
        var plugin = entry.dataset.plugin || '';
        if (!term || plugin.indexOf(term) !== -1) {
            entry.classList.remove('hidden');
        } else {
            entry.classList.add('hidden');
        }
    });
}

/**
 * Set up event listeners for the whitelist modal.
 */
function setupWhitelistListeners() {
    var modal = document.getElementById('whitelist-modal');
    var searchInput = document.getElementById('whitelist-search');
    var closeBtn = document.getElementById('whitelist-modal-close');
    var doneBtn = document.getElementById('whitelist-done');
    var allBtn = document.getElementById('whitelist-all');
    var noneBtn = document.getElementById('whitelist-none');
    var baseOnlyBtn = document.getElementById('whitelist-base-only');
    var backdrop = modal ? modal.querySelector('.modal-backdrop') : null;

    // Clone search input to remove old listeners
    if (searchInput) {
        var newSearch = searchInput.cloneNode(true);
        searchInput.parentNode.replaceChild(newSearch, searchInput);
        searchInput = newSearch;

        searchInput.addEventListener('input', function() {
            filterWhitelistEntries(this.value);
        });
    }

    if (closeBtn) closeBtn.onclick = function() { hideWhitelistModal(); };
    if (doneBtn) doneBtn.onclick = function() { hideWhitelistModal(); };
    if (allBtn) allBtn.onclick = function() { setAllWhitelist(true); };
    if (noneBtn) noneBtn.onclick = function() { setAllWhitelist(false); };
    if (baseOnlyBtn) baseOnlyBtn.onclick = function() { setBaseOnlyWhitelist(); };
    if (backdrop) backdrop.onclick = function() { hideWhitelistModal(); };
}

// Export whitelist functions
window.showWhitelistModal = showWhitelistModal;
window.hideWhitelistModal = hideWhitelistModal;
window.extractPluginFromSpell = extractPluginFromSpell;
