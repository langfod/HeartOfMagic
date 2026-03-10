/**
 * TreePreview Root Selection — Root selection modal, list rendering, and output.
 *
 * Loaded after: treePreview.js
 *
 * Adds click handling, the root-selection modal (reuses #spawn-spell-modal),
 * selected-root visual overlays, flattening helpers, and getOutput().
 *
 * Depends on: treePreview.js (TreePreview object), state.js (settings)
 */

// =========================================================================
// CLICK HANDLING
// =========================================================================

/** Handle a click (not a pan) on the preview canvas. */
TreePreview._handleClick = function(e) {
    var hitNode = this._hitTestRootNode(e);
    if (hitNode && hitNode.school) {
        this.showRootSelectionModal(hitNode.school, hitNode.rootIndex || 0);
    }
};

// =========================================================================
// ROOT SELECTION MODAL (reuses #spawn-spell-modal)
// =========================================================================

TreePreview.showRootSelectionModal = function(school, rootIndex) {
    this._rootSelectionSchool = school;
    this._rootSelectionIndex = rootIndex || 0;

    var modal = document.getElementById('spawn-spell-modal');
    if (!modal) {
        console.warn('[TreePreview] #spawn-spell-modal not found');
        return;
    }

    // Update title
    var title = modal.querySelector('.modal-header h3');
    if (title) {
        var label = 'Select Root \u2014 ' + school;
        if (this._rootSelectionIndex > 0) {
            label += ' #' + (this._rootSelectionIndex + 1);
        }
        title.textContent = label;
    }

    // Load primed spells for this school
    if (typeof getPrimedSpellsForSchool === 'function') {
        this._rootSelectionSpells = getPrimedSpellsForSchool(school);
    } else {
        this._rootSelectionSpells = [];
    }

    // Show modal
    modal.classList.remove('hidden');

    // Focus search
    var searchInput = document.getElementById('spawn-search');
    if (searchInput) {
        searchInput.value = '';
        searchInput.focus();
    }

    // Render initial list
    this._renderRootSelectionList('');

    // Set up listeners
    this._setupRootSelectionListeners();
};

TreePreview.hideRootSelectionModal = function() {
    var modal = document.getElementById('spawn-spell-modal');
    if (modal) {
        modal.classList.add('hidden');
    }
    this._rootSelectionSchool = null;
    this._rootSelectionIndex = 0;

    // Restore original title
    var title = modal ? modal.querySelector('.modal-header h3') : null;
    if (title) {
        title.textContent = 'Spawn Spell Node';
    }
};

TreePreview._renderRootSelectionList = function(searchTerm) {
    var spellList = document.getElementById('spawn-spell-list');
    if (!spellList) return;

    var self = this;
    var school = this._rootSelectionSchool;
    searchTerm = (searchTerm || '').toLowerCase();

    // Filter by search term
    var filtered = this._rootSelectionSpells.filter(function(spell) {
        if (!searchTerm) return true;
        var nameMatch = (spell.name || '').toLowerCase().indexOf(searchTerm) !== -1;
        var idMatch = (spell.formId || '').toLowerCase().indexOf(searchTerm) !== -1;
        var levelMatch = (spell.skillLevel || spell.level || '').toLowerCase().indexOf(searchTerm) !== -1;
        return nameMatch || idMatch || levelMatch;
    });

    // Sort alphabetically
    filtered.sort(function(a, b) {
        return (a.name || '').localeCompare(b.name || '');
    });

    // Limit results
    filtered = filtered.slice(0, 50);

    // Check current selection (indexed by school:rootIndex)
    var rootKey = this._rootKey(school, this._rootSelectionIndex);
    var currentRoot = settings.selectedRoots ? settings.selectedRoots[rootKey] : null;
    var currentFormId = currentRoot ? currentRoot.formId : null;

    if (filtered.length === 0 && !searchTerm) {
        spellList.innerHTML = '<div class="spawn-no-results">No primed spells for ' + school + '</div>';
        return;
    }
    if (filtered.length === 0) {
        spellList.innerHTML = '<div class="spawn-no-results">No matching spells</div>';
        return;
    }

    spellList.innerHTML = '';
    filtered.forEach(function(spell) {
        var isSelected = spell.formId === currentFormId;
        var item = document.createElement('div');
        item.className = 'spawn-spell-item' + (isSelected ? ' on-tree' : '');
        item.dataset.formId = spell.formId;

        var badge = isSelected ? '<span class="spawn-on-tree-badge">CURRENT</span>' : '';
        item.innerHTML =
            '<div class="spawn-spell-name">' + (spell.name || spell.formId) + badge + '</div>' +
            '<div class="spawn-spell-info">' +
                '<span>' + (spell.skillLevel || spell.level || '') + '</span>' +
                '<span style="opacity:0.5">' + (spell.formId || '') + '</span>' +
            '</div>';

        item.addEventListener('click', function() {
            self._selectRoot(spell);
        });

        spellList.appendChild(item);
    });
};

TreePreview._setupRootSelectionListeners = function() {
    var self = this;
    var modal = document.getElementById('spawn-spell-modal');
    if (!modal) return;

    // Clone search input to remove old listeners
    var searchInput = document.getElementById('spawn-search');
    if (searchInput) {
        var newInput = searchInput.cloneNode(true);
        searchInput.parentNode.replaceChild(newInput, searchInput);
        newInput.addEventListener('input', function() {
            self._renderRootSelectionList(this.value);
        });
    }

    // Close button
    var closeBtn = document.getElementById('spawn-modal-close');
    if (closeBtn) {
        closeBtn.onclick = function() { self.hideRootSelectionModal(); };
    }

    // Cancel button — repurpose as "Clear Selection" if a root is selected
    var cancelBtn = document.getElementById('spawn-cancel');
    if (cancelBtn) {
        var rootKey = this._rootKey(this._rootSelectionSchool, this._rootSelectionIndex);
        var hasSelection = settings.selectedRoots && settings.selectedRoots[rootKey];
        if (hasSelection) {
            cancelBtn.textContent = 'Clear Selection';
            cancelBtn.onclick = function() {
                self._clearRoot(rootKey);
            };
        } else {
            cancelBtn.textContent = 'Cancel';
            cancelBtn.onclick = function() { self.hideRootSelectionModal(); };
        }
    }

    // Backdrop click
    var backdrop = modal.querySelector('.modal-backdrop');
    if (backdrop) {
        backdrop.onclick = function() { self.hideRootSelectionModal(); };
    }
};

TreePreview._selectRoot = function(spell) {
    var school = this._rootSelectionSchool;
    if (!school) return;

    if (!settings.selectedRoots) {
        settings.selectedRoots = {};
    }

    var rootKey = this._rootKey(school, this._rootSelectionIndex);
    settings.selectedRoots[rootKey] = {
        formId: spell.formId,
        name: spell.name || spell.formId,
        school: school,
        rootIndex: this._rootSelectionIndex,
        plugin: spell.plugin || '',
        localFormId: typeof getLocalFormId === 'function' ? getLocalFormId(spell.formId) : spell.formId
    };

    console.log('[TreePreview] Selected root for ' + rootKey + ': ' + spell.name + ' (' + spell.formId + ')');

    if (typeof autoSaveSettings === 'function') {
        autoSaveSettings();
    }

    this.hideRootSelectionModal();
    this._markDirty(true);
};

TreePreview._clearRoot = function(rootKey) {
    if (settings.selectedRoots && settings.selectedRoots[rootKey]) {
        delete settings.selectedRoots[rootKey];
        console.log('[TreePreview] Cleared root selection for ' + rootKey);

        if (typeof autoSaveSettings === 'function') {
            autoSaveSettings();
        }
    }

    this.hideRootSelectionModal();
    this._markDirty(true);
};

// =========================================================================
// SELECTED ROOT VISUAL OVERLAYS
// =========================================================================

TreePreview._renderSelectedRootOverlays = function(ctx, w, h, modeModule) {
    if (!settings.selectedRoots) return;
    if (!modeModule || !modeModule._lastRenderData) return;
    var rootNodes = modeModule._lastRenderData.rootNodes;
    if (!rootNodes || rootNodes.length === 0) return;

    var nodeSize = modeModule.settings ? (modeModule.settings.nodeSize || 6) : 6;

    for (var i = 0; i < rootNodes.length; i++) {
        var n = rootNodes[i];
        var rootKey = this._rootKey(n.school, n.rootIndex);
        var sel = settings.selectedRoots[rootKey];
        if (!sel) continue;

        var nx = n.x + w / 2;
        var ny = n.y + h / 2;

        // Gold selection ring
        ctx.beginPath();
        ctx.arc(nx, ny, nodeSize + 5, 0, Math.PI * 2);
        ctx.strokeStyle = '#b8a878';
        ctx.lineWidth = 2;
        ctx.stroke();

        // Outer glow
        ctx.beginPath();
        ctx.arc(nx, ny, nodeSize + 8, 0, Math.PI * 2);
        ctx.strokeStyle = 'rgba(184, 168, 120, 0.25)';
        ctx.lineWidth = 3;
        ctx.stroke();

        // Spell name label below the node
        ctx.font = '9px sans-serif';
        ctx.fillStyle = '#b8a878';
        ctx.textAlign = 'center';
        ctx.fillText(sel.name || sel.formId, nx, ny + nodeSize + 18);
    }
};

// =========================================================================
// DATA OUTPUT — Universal format for downstream sections
// =========================================================================

/**
 * Convert indexed selectedRoots ("School:0", "School:1") to per-school
 * format for the C++ builder. Returns { school: { formId, ... } } using
 * the first root (index 0) as primary, plus a "all_roots" array per school.
 */
TreePreview._flattenSelectedRoots = function() {
    var roots = settings.selectedRoots || {};
    var result = {};
    var allRoots = {};
    var keys = Object.keys(roots);
    for (var i = 0; i < keys.length; i++) {
        var key = keys[i];
        var entry = roots[key];
        var school = entry.school || key.split(':')[0];
        if (!allRoots[school]) allRoots[school] = [];
        allRoots[school].push(entry);
        // Use the lowest-indexed root as the primary for the builder
        var idx = entry.rootIndex || 0;
        if (!result[school] || idx < (result[school]._idx || 0)) {
            result[school] = entry;
            result[school]._idx = idx;
        }
    }
    // Clean up temp _idx and attach all_roots
    var schools = Object.keys(result);
    for (var j = 0; j < schools.length; j++) {
        delete result[schools[j]]._idx;
    }
    // Attach full list as separate key for future multi-root support
    result._allRoots = allRoots;
    return result;
};

TreePreview.getOutput = function() {
    var modeModule = this.modes[this.activeMode];
    if (!modeModule) return null;
    var gridData = modeModule.getGridData ? modeModule.getGridData() : null;
    var lastData = modeModule._lastRenderData;
    if (!lastData) return null;

    var self = this;
    return {
        mode: gridData ? gridData.mode : self.activeMode,
        schools: gridData ? gridData.schools : [],
        rootNodes: lastData.rootNodes || [],
        grid: gridData ? gridData.grid : null,
        gridPoints: gridData ? (gridData.gridPoints || []) : [],
        schoolData: self.schoolData || {},
        selectedRoots: settings.selectedRoots || {},
        renderGrid: function(ctx, w, h) {
            modeModule.render(ctx, w, h, self.schoolData);
        }
    };
};
