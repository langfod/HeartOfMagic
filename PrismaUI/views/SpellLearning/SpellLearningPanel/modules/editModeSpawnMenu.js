/**
 * Edit Mode Spawn Menu — Spell spawn menu and spell data processing.
 * Loaded after: editModeOps.js
 *
 * Method-extension of EditMode (defined in editModeCore.js).
 * Contains the spell spawn menu UI, spell loading, and C++ callbacks
 * for receiving spell data.
 */

// =========================================================================
// SPELL SPAWN MENU
// =========================================================================

/** Show the spawn spell menu at a grid position */
EditMode.showSpawnMenu = function(gridPos) {
    console.log('[EditMode] showSpawnMenu called with:', gridPos);
    this.spawnPosition = gridPos;

    var modal = document.getElementById('spawn-spell-modal');
    var searchInput = document.getElementById('spawn-search');

    console.log('[EditMode] Modal element:', modal);
    if (!modal) {
        console.error('[EditMode] spawn-spell-modal not found!');
        return;
    }

    modal.classList.remove('hidden');
    console.log('[EditMode] Modal shown');

    if (searchInput) {
        searchInput.value = '';
        searchInput.focus();
    }

    if (!this.spellsLoaded) {
        this.loadAllSpells();
    } else {
        this.renderSpellList('');
    }
    this.setupSpawnMenuListeners();
};

/** Hide the spawn spell menu */
EditMode.hideSpawnMenu = function() {
    var modal = document.getElementById('spawn-spell-modal');
    if (modal) modal.classList.add('hidden');
    this.spawnPosition = null;
};

/** Load all available spells from every source we can find */
EditMode.loadAllSpells = function() {
    var self = this;
    var spellList = document.getElementById('spawn-spell-list');
    if (spellList) {
        spellList.innerHTML = '<div class="spawn-loading">Loading spells...</div>';
    }

    this.allSpells = [];
    var seenIds = {};

    // Helper to resolve a spell name from all available sources
    function resolveName(formId, rawName) {
        if (rawName && rawName !== 'null' && rawName !== 'undefined') return rawName;
        if (typeof SpellCache !== 'undefined') {
            var cached = SpellCache.get(formId);
            if (cached && cached.name) return cached.name;
        }
        if (CanvasRenderer._nodeMap) {
            var node = CanvasRenderer._nodeMap.get(formId);
            if (node && node.name) return node.name;
        }
        return formId;
    }

    function addSpell(formId, name, school, level) {
        if (!formId || seenIds[formId]) return;
        seenIds[formId] = true;
        self.allSpells.push({
            formId: formId,
            name: resolveName(formId, name),
            school: school || 'Unknown',
            level: level || 'Unknown'
        });
    }

    // Ensure updateSpellData hook is installed
    if (typeof _installUpdateSpellDataHook === 'function') {
        _installUpdateSpellDataHook();
    }

    // Source 1: Scanned spell data (state.lastSpellData from Spell Scan tab)
    if (state.lastSpellData && state.lastSpellData.spells && state.lastSpellData.spells.length > 0) {
        console.log('[EditMode] Source: lastSpellData -', state.lastSpellData.spells.length, 'spells');
        state.lastSpellData.spells.forEach(function(spell) {
            addSpell(
                spell.formId || spell.id,
                spell.name || spell.spellName,
                spell.school,
                spell.skillLevel || spell.level
            );
        });
    }

    // Source 2: Live CanvasRenderer nodes
    if (CanvasRenderer.nodes && CanvasRenderer.nodes.length > 0) {
        console.log('[EditMode] Source: CanvasRenderer -', CanvasRenderer.nodes.length, 'nodes');
        CanvasRenderer.nodes.forEach(function(node) {
            addSpell(node.formId || node.id, node.name, node.school, node.level);
        });
    }

    // Source 3: Tree rawData
    if (state.treeData && state.treeData.rawData && state.treeData.rawData.schools) {
        var rawSchools = state.treeData.rawData.schools;
        for (var schoolName in rawSchools) {
            var school = rawSchools[schoolName];
            if (school.nodes) {
                school.nodes.forEach(function(node) {
                    addSpell(
                        node.formId || node.id || node.spellId,
                        node.name || node.spellName,
                        schoolName,
                        node.level || node.skillLevel
                    );
                });
            }
        }
    }

    console.log('[EditMode] Total spells loaded:', this.allSpells.length);
    if (this.allSpells.length > 0) {
        this.spellsLoaded = true;
        this.renderSpellList('');
    } else {
        console.log('[EditMode] No spell data from any source, requesting scan...');
        if (spellList) {
            spellList.innerHTML = '<div class="spawn-loading">Scanning game spells... (use Spell Scan tab first if this persists)</div>';
        }
        this.spellsLoaded = false;
        if (window.callCpp) {
            window.callCpp('ScanSpells', JSON.stringify({
                fields: state.fields || {},
                scanMode: 'all'
            }));
        }
    }
};

/** Render the spell list with optional search filter */
EditMode.renderSpellList = function(searchTerm) {
    var spellList = document.getElementById('spawn-spell-list');
    if (!spellList) return;
    var self = this;
    searchTerm = (searchTerm || '').toLowerCase();

    // Build set of existing node formIds
    var existingIds = new Set();
    if (CanvasRenderer.nodes) {
        CanvasRenderer.nodes.forEach(function(n) { existingIds.add(n.formId || n.id); });
    }

    // Filter spells by search term (show ALL spells, including ones on tree)
    var filtered = this.allSpells.filter(function(spell) {
        if (searchTerm) {
            var nameMatch = (spell.name || '').toLowerCase().indexOf(searchTerm) !== -1;
            var schoolMatch = (spell.school || '').toLowerCase().indexOf(searchTerm) !== -1;
            var idMatch = (spell.formId || '').toLowerCase().indexOf(searchTerm) !== -1;
            return nameMatch || schoolMatch || idMatch;
        }
        return true;
    });

    // Sort: new spells first, then existing ones
    filtered.sort(function(a, b) {
        var aExists = existingIds.has(a.formId) ? 1 : 0;
        var bExists = existingIds.has(b.formId) ? 1 : 0;
        if (aExists !== bExists) return aExists - bExists;
        return (a.name || '').localeCompare(b.name || '');
    });
    filtered = filtered.slice(0, 50);

    if (filtered.length === 0) {
        spellList.innerHTML = '<div class="spawn-no-results">No matching spells found</div>';
        return;
    }

    spellList.innerHTML = '';
    filtered.forEach(function(spell) {
        var isOnTree = existingIds.has(spell.formId);
        var item = document.createElement('div');
        item.className = 'spawn-spell-item' + (isOnTree ? ' on-tree' : '');
        item.dataset.formId = spell.formId;
        var badge = isOnTree ? '<span class="spawn-on-tree-badge">ON TREE</span>' : '';
        item.innerHTML =
            '<div class="spawn-spell-name">' + (spell.name || spell.formId) + badge + '</div>' +
            '<div class="spawn-spell-info">' +
                '<span>' + (spell.school || 'Unknown') + '</span>' +
                '<span>' + (spell.level || '') + '</span>' +
            '</div>';
        item.addEventListener('click', function() { self.spawnSpell(spell); });
        spellList.appendChild(item);
    });
};

/** Pan the canvas view to center on a spell node */
EditMode.panToSpell = function(formId) {
    var node = CanvasRenderer._nodeMap ? CanvasRenderer._nodeMap.get(formId) : null;
    if (!node) {
        console.log('[EditMode] Node not found for panTo:', formId);
        return;
    }
    CanvasRenderer.panX = -node.x * CanvasRenderer.zoom;
    CanvasRenderer.panY = -node.y * CanvasRenderer.zoom;
    CanvasRenderer._needsRender = true;

    state.selectedNode = node;
    if (typeof showSpellDetails === 'function') showSpellDetails(node);
    console.log('[EditMode] Panned to:', node.name || formId);
    if (typeof setTreeStatus === 'function') {
        setTreeStatus('Focused: ' + (node.name || formId));
    }
    this.hideSpawnMenu();
};

/** Set up spawn menu event listeners */
EditMode.setupSpawnMenuListeners = function() {
    var self = this;
    var modal = document.getElementById('spawn-spell-modal');
    var searchInput = document.getElementById('spawn-search');
    var closeBtn = document.getElementById('spawn-modal-close');
    var cancelBtn = document.getElementById('spawn-cancel');
    var backdrop = modal ? modal.querySelector('.modal-backdrop') : null;

    // Remove old listeners by cloning elements
    if (searchInput) {
        var newSearch = searchInput.cloneNode(true);
        searchInput.parentNode.replaceChild(newSearch, searchInput);
        searchInput = newSearch;
        searchInput.addEventListener('input', function() {
            self.renderSpellList(this.value);
        });
    }
    if (closeBtn) closeBtn.onclick = function() { self.hideSpawnMenu(); };
    if (cancelBtn) cancelBtn.onclick = function() { self.hideSpawnMenu(); };
    if (backdrop) backdrop.onclick = function() { self.hideSpawnMenu(); };
};

/** Spawn a spell at the selected grid position */
EditMode.spawnSpell = function(spell) {
    if (!this.spawnPosition || !spell) {
        this.hideSpawnMenu();
        return;
    }
    var pos = this.spawnPosition;
    console.log('[EditMode] Spawning spell:', spell.name, 'at', Math.round(pos.x), Math.round(pos.y));

    // Generate unique ID if this formId already exists on the tree
    var nodeId = spell.formId;
    var isDuplicate = false;
    if (CanvasRenderer._nodeMap && CanvasRenderer._nodeMap.has(nodeId)) {
        nodeId = spell.formId + '_dup_' + Date.now();
        isDuplicate = true;
        console.log('[EditMode] Duplicate spawn, using unique ID:', nodeId);
    }

    // Get the state from the original node if this is a duplicate
    var inheritedState = 'available';
    if (isDuplicate) {
        var originalNode = CanvasRenderer._nodeMap.get(spell.formId);
        if (originalNode) inheritedState = originalNode.state || 'available';
    }

    var newNode = {
        id: nodeId,
        formId: nodeId,
        originalFormId: isDuplicate ? spell.formId : null,
        name: spell.name,
        school: spell.school || pos.school || 'Unknown',
        level: spell.level || 'Novice',
        x: pos.x,
        y: pos.y,
        tier: pos.tier || 0,
        state: inheritedState,
        prerequisites: [],
        hardPrereqs: [],
        softPrereqs: [],
        softNeeded: 0,
        children: [],
        isRoot: false
    };

    if (CanvasRenderer.nodes) CanvasRenderer.nodes.push(newNode);
    if (CanvasRenderer._nodeMap) CanvasRenderer._nodeMap.set(newNode.formId, newNode);
    this.addNodeToRawData(newNode);
    if (state.treeData && state.treeData.nodes) state.treeData.nodes.push(newNode);

    this.saveTree();
    CanvasRenderer.buildSpatialIndex();
    CanvasRenderer._needsRender = true;
    if (typeof setTreeStatus === 'function') setTreeStatus('Spawned: ' + spell.name);
    this.hideSpawnMenu();
};

/** Add a node to rawData */
EditMode.addNodeToRawData = function(node) {
    if (!state.treeData || !state.treeData.rawData) return;
    var rawData = state.treeData.rawData;
    var schoolName = node.school;

    if (!rawData.schools) rawData.schools = {};
    if (!rawData.schools[schoolName]) rawData.schools[schoolName] = { nodes: [] };
    if (!rawData.schools[schoolName].nodes) rawData.schools[schoolName].nodes = [];

    rawData.schools[schoolName].nodes.push({
        formId: node.formId,
        id: node.id,
        name: node.name,
        school: node.school,
        level: node.level,
        x: node.x,
        y: node.y,
        tier: node.tier,
        prerequisites: node.prerequisites || [],
        hardPrereqs: node.hardPrereqs || [],
        softPrereqs: node.softPrereqs || [],
        softNeeded: node.softNeeded || 0,
        children: node.children || []
    });
    console.log('[EditMode] Added node to rawData:', node.formId);
};

// =========================================================================
// C++ CALLBACKS
// =========================================================================

// Callback for C++ to provide all spells (direct call)
window.onAllSpellsReceived = function(dataStr) {
    try {
        var data = typeof dataStr === 'string' ? JSON.parse(dataStr) : dataStr;
        if (data.spells && Array.isArray(data.spells)) {
            EditMode._processSpellData(data.spells);
        }
    } catch (e) {
        console.error('[EditMode] Failed to parse all spells:', e);
    }
};

// Hook into updateSpellData AFTER all scripts have loaded
function _installUpdateSpellDataHook() {
    if (window._editModeHookInstalled) return;
    var originalUpdateSpellData = window.updateSpellData;
    if (originalUpdateSpellData) {
        window._editModeHookInstalled = true;
        window.updateSpellData = function(jsonStr) {
            originalUpdateSpellData.call(this, jsonStr);
            try {
                var data = JSON.parse(jsonStr);
                if (data.spells && Array.isArray(data.spells)) {
                    console.log('[EditMode] Intercepted spell scan data:', data.spells.length, 'spells');
                    EditMode._processSpellData(data.spells);
                }
            } catch (e) {
                // Ignore parse errors - original handler will deal with them
            }
        };
        console.log('[EditMode] updateSpellData hook installed');
    }
}

// Defer hook installation until DOM is ready and all scripts have loaded
if (document.readyState === 'complete') {
    setTimeout(_installUpdateSpellDataHook, 0);
} else {
    window.addEventListener('load', _installUpdateSpellDataHook);
}

// Helper to process spell data from any source
EditMode._processSpellData = function(spells) {
    if (!spells || !Array.isArray(spells)) return;
    var existingIds = new Set(this.allSpells.map(function(s) { return s.formId; }));
    var self = this;
    var addedCount = 0;

    spells.forEach(function(spell) {
        var id = spell.formId || spell.id;
        if (id && !existingIds.has(id)) {
            self.allSpells.push({
                formId: id,
                name: spell.name || spell.spellName || 'Unknown',
                school: spell.school || 'Unknown',
                level: spell.skillLevel || spell.level || 'Unknown'
            });
            existingIds.add(id);
            addedCount++;
        }
    });
    console.log('[EditMode] Added', addedCount, 'new spells, total:', this.allSpells.length);

    if (this.allSpells.length > 0) this.spellsLoaded = true;

    // Re-render if spawn menu is open
    var modal = document.getElementById('spawn-spell-modal');
    if (modal && !modal.classList.contains('hidden')) {
        var searchInput = document.getElementById('spawn-search');
        this.renderSpellList(searchInput ? searchInput.value : '');
    }
};
