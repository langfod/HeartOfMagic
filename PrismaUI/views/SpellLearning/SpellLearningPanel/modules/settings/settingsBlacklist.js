/**
 * Spell Blacklist Modal
 * UI for managing spell blacklist (exclude spells from tree building)
 *
 * Depends on: state.js (settings)
 */

// =============================================================================
// SPELL BLACKLIST PANEL
// =============================================================================

function showBlacklistModal() {
    var modal = document.getElementById('blacklist-modal');
    if (!modal) return;

    modal.classList.remove('hidden');

    var searchInput = document.getElementById('blacklist-search');
    if (searchInput) {
        searchInput.value = '';
        searchInput.focus();
    }

    var dropdown = document.getElementById('blacklist-search-results');
    if (dropdown) dropdown.classList.add('hidden');

    renderBlacklistEntries();
    setupBlacklistListeners();
}

function hideBlacklistModal() {
    var modal = document.getElementById('blacklist-modal');
    if (modal) modal.classList.add('hidden');
    autoSaveSettings();
    if (typeof updatePrimedCount === 'function') updatePrimedCount();
}

/**
 * Load all available spells for blacklist search.
 * Reuses the same 3-source pattern from editMode.js loadAllSpells().
 */
function loadBlacklistSpellSources() {
    var allSpells = [];
    var seenIds = {};

    function addSpell(formId, name, school) {
        if (!formId || seenIds[formId]) return;
        seenIds[formId] = true;
        allSpells.push({ formId: formId, name: name || formId, school: school || 'Unknown' });
    }

    // Source 1: Scanned spell data
    if (state.lastSpellData && state.lastSpellData.spells) {
        state.lastSpellData.spells.forEach(function(spell) {
            addSpell(spell.formId || spell.id, spell.name || spell.spellName, spell.school);
        });
    }

    // Source 2: CanvasRenderer nodes
    if (typeof CanvasRenderer !== 'undefined' && CanvasRenderer.nodes) {
        CanvasRenderer.nodes.forEach(function(node) {
            addSpell(node.formId || node.id, node.name, node.school);
        });
    }

    // Source 3: Tree rawData
    if (state.treeData && state.treeData.rawData && state.treeData.rawData.schools) {
        var rawSchools = state.treeData.rawData.schools;
        for (var schoolName in rawSchools) {
            var school = rawSchools[schoolName];
            if (school.nodes) {
                school.nodes.forEach(function(node) {
                    addSpell(node.formId || node.id || node.spellId, node.name || node.spellName, schoolName);
                });
            }
        }
    }

    return allSpells;
}

function renderBlacklistSearchResults(searchTerm) {
    var dropdown = document.getElementById('blacklist-search-results');
    if (!dropdown) return;

    if (!searchTerm || searchTerm.length < 2) {
        dropdown.classList.add('hidden');
        return;
    }

    var allSpells = loadBlacklistSpellSources();
    var term = searchTerm.toLowerCase();

    var blacklistedIds = {};
    (settings.spellBlacklist || []).forEach(function(entry) {
        blacklistedIds[entry.formId] = true;
    });

    var filtered = allSpells.filter(function(spell) {
        if (blacklistedIds[spell.formId]) return false;
        var nameMatch = (spell.name || '').toLowerCase().indexOf(term) !== -1;
        var schoolMatch = (spell.school || '').toLowerCase().indexOf(term) !== -1;
        var idMatch = (spell.formId || '').toLowerCase().indexOf(term) !== -1;
        return nameMatch || schoolMatch || idMatch;
    });

    filtered.sort(function(a, b) {
        return (a.name || '').localeCompare(b.name || '');
    });

    filtered = filtered.slice(0, 10);

    if (filtered.length === 0) {
        dropdown.innerHTML = '<div class="spawn-no-results">No matching spells found</div>';
        dropdown.classList.remove('hidden');
        return;
    }

    dropdown.innerHTML = '';
    filtered.forEach(function(spell) {
        var item = document.createElement('div');
        item.className = 'spawn-spell-item';
        item.innerHTML =
            '<div class="spawn-spell-name">' + (spell.name || spell.formId) + '</div>' +
            '<div class="spawn-spell-info"><span>' + (spell.school || 'Unknown') + '</span></div>';

        item.addEventListener('click', function() {
            addToBlacklist(spell);
        });

        dropdown.appendChild(item);
    });

    dropdown.classList.remove('hidden');
}

function addToBlacklist(spell) {
    if (!settings.spellBlacklist) settings.spellBlacklist = [];

    // Use stable plugin:localFormId key for matching (survives load order changes)
    var localId = typeof getLocalFormId === 'function' ? getLocalFormId(spell.formId) : '';
    var plugin = spell.plugin || '';

    var exists = settings.spellBlacklist.some(function(entry) {
        // Match by stable key if available, fall back to raw formId
        if (entry.plugin && entry.localFormId && plugin && localId) {
            return entry.plugin.toLowerCase() === plugin.toLowerCase() && entry.localFormId === localId;
        }
        return entry.formId === spell.formId;
    });

    if (!exists) {
        settings.spellBlacklist.push({
            formId: spell.formId,
            name: spell.name || spell.formId,
            school: spell.school || 'Unknown',
            plugin: plugin,
            localFormId: localId
        });
        console.log('[SpellLearning] Blacklisted spell:', spell.name, '(' + plugin + ':' + localId + ')');
    }

    var searchInput = document.getElementById('blacklist-search');
    if (searchInput) searchInput.value = '';
    var dropdown = document.getElementById('blacklist-search-results');
    if (dropdown) dropdown.classList.add('hidden');

    renderBlacklistEntries();
    autoSaveSettings();
}

function removeFromBlacklist(plugin, localFormId, formId) {
    if (!settings.spellBlacklist) return;

    settings.spellBlacklist = settings.spellBlacklist.filter(function(entry) {
        // Match by stable key if available
        if (plugin && localFormId && entry.plugin && entry.localFormId) {
            return !(entry.plugin.toLowerCase() === plugin.toLowerCase() && entry.localFormId === localFormId);
        }
        // Fall back to raw formId
        return entry.formId !== formId;
    });

    console.log('[SpellLearning] Removed from blacklist:', plugin + ':' + localFormId);
    renderBlacklistEntries();
    autoSaveSettings();
}

function clearBlacklist() {
    settings.spellBlacklist = [];
    console.log('[SpellLearning] Blacklist cleared');
    renderBlacklistEntries();
    autoSaveSettings();
}

function renderBlacklistEntries() {
    var container = document.getElementById('blacklist-entries');
    var countEl = document.getElementById('blacklist-count');
    if (!container) return;

    var blacklist = settings.spellBlacklist || [];

    if (countEl) countEl.textContent = blacklist.length;

    if (blacklist.length === 0) {
        container.innerHTML = '<div class="blacklist-empty">No spells blacklisted</div>';
        return;
    }

    container.innerHTML = '';
    blacklist.forEach(function(entry) {
        var div = document.createElement('div');
        div.className = 'blacklist-entry';
        var subtitle = (entry.school || '');
        if (entry.plugin) subtitle += (subtitle ? ' - ' : '') + entry.plugin;
        div.innerHTML =
            '<div class="blacklist-entry-info">' +
                '<div class="blacklist-entry-name">' + (entry.name || entry.formId) + '</div>' +
                '<div class="blacklist-entry-school">' + subtitle + '</div>' +
            '</div>' +
            '<button class="blacklist-remove-btn" title="Remove from blacklist">&times;</button>';

        var removeBtn = div.querySelector('.blacklist-remove-btn');
        removeBtn.addEventListener('click', function() {
            removeFromBlacklist(entry.plugin, entry.localFormId, entry.formId);
        });

        container.appendChild(div);
    });
}

function setupBlacklistListeners() {
    var modal = document.getElementById('blacklist-modal');
    var searchInput = document.getElementById('blacklist-search');
    var closeBtn = document.getElementById('blacklist-modal-close');
    var doneBtn = document.getElementById('blacklist-done');
    var clearBtn = document.getElementById('blacklist-clear-all');
    var backdrop = modal ? modal.querySelector('.modal-backdrop') : null;

    // Clone search input to remove old listeners
    if (searchInput) {
        var newSearch = searchInput.cloneNode(true);
        searchInput.parentNode.replaceChild(newSearch, searchInput);
        searchInput = newSearch;

        searchInput.addEventListener('input', function() {
            renderBlacklistSearchResults(this.value);
        });
    }

    if (closeBtn) closeBtn.onclick = function() { hideBlacklistModal(); };
    if (doneBtn) doneBtn.onclick = function() { hideBlacklistModal(); };
    if (clearBtn) clearBtn.onclick = function() { clearBlacklist(); };
    if (backdrop) backdrop.onclick = function() { hideBlacklistModal(); };
}

// Export blacklist functions
window.showBlacklistModal = showBlacklistModal;
window.hideBlacklistModal = hideBlacklistModal;
