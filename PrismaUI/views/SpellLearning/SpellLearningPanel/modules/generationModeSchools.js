/**
 * Generation Mode Schools
 * Per-school control panels with shape/density settings, school tree
 * building, and merge operations.
 *
 * Depends on: state.js (state, settings), generationModeCore.js (initGenerationModeUI, getGenerationOptions, getAutoConfigPrompt, getGroupPrompt),
 *             uiHelpers.js (updateStatus)
 */

// =============================================================================
// PER-SCHOOL CONTROL PANELS
// =============================================================================

function showSchoolControlPanels(schoolData) {
    var section = document.getElementById('schoolControlsSection');
    var container = document.getElementById('schoolControlsContainer');

    if (!section || !container || !schoolData) return;

    section.classList.remove('hidden');
    container.innerHTML = '';

    var schools = Object.keys(schoolData).sort();

    schools.forEach(function(schoolName) {
        var spellCount = schoolData[schoolName].length || 0;
        var panel = createSchoolControlPanel(schoolName, spellCount);
        container.appendChild(panel);
    });

    // IMPORTANT: Update developer mode visibility for newly created elements
    // School control panels are created dynamically, so we need to reapply visibility
    if (typeof updateDeveloperModeVisibility === 'function') {
        var devModeEnabled = settings && settings.developerMode;
        updateDeveloperModeVisibility(devModeEnabled);
    }

    // Add "Regenerate Selected" button at the bottom if not already present
    var existingBtn = document.getElementById('regenerateSelectedBtn');
    if (!existingBtn) {
        var btnContainer = document.createElement('div');
        btnContainer.className = 'regenerate-selected-container';
        btnContainer.innerHTML =
            '<button class="btn btn-primary" id="regenerateSelectedBtn" onclick="regenerateSelectedSchools()">' +
                '<span class="btn-icon">[R]</span> Regenerate Selected' +
            '</button>' +
            '<button class="btn btn-secondary btn-sm" onclick="selectAllSchools(true)">Select All</button>' +
            '<button class="btn btn-secondary btn-sm" onclick="selectAllSchools(false)">Deselect All</button>';
        section.appendChild(btnContainer);
    }
}

function selectAllSchools(select) {
    var checkboxes = document.querySelectorAll('.school-select-input');
    checkboxes.forEach(function(cb) { cb.checked = select; });
}

function regenerateSelectedSchools() {
    var checkboxes = document.querySelectorAll('.school-select-input:checked');
    var selectedSchools = [];

    checkboxes.forEach(function(cb) {
        var schoolName = cb.id.replace('school-select-', '').replace(/-/g, ' ');
        // Capitalize words
        schoolName = schoolName.replace(/\b\w/g, function(c) { return c.toUpperCase(); });
        selectedSchools.push(schoolName);
    });

    if (selectedSchools.length === 0) {
        updateStatus('Select at least one school to regenerate');
        setStatusIcon('!');
        return;
    }

    console.log('[GenerationModeUI] Regenerating selected schools:', selectedSchools);
    updateStatus('Regenerating ' + selectedSchools.length + ' school(s)...');
    setStatusIcon('...');

    // Regenerate each selected school, preserving existing pie slices
    var delay = 0;
    selectedSchools.forEach(function(schoolName) {
        setTimeout(function() {
            rerunSchool(schoolName, 'visualfirst', true); // true = use existing slice
        }, delay);
        delay += 100;
    });

    setTimeout(function() {
        updateStatus('Regenerated ' + selectedSchools.length + ' school(s)');
        setStatusIcon('OK');
    }, delay + 500);
}

function createSchoolControlPanel(schoolName, spellCount) {
    var panel = document.createElement('div');
    panel.className = 'school-control-panel';
    panel.id = 'school-control-' + schoolName.replace(/\s+/g, '-');
    var safeId = schoolName.replace(/\s+/g, '-');

    panel.innerHTML =
        '<div class="school-control-header">' +
            '<label class="school-select-checkbox" onclick="event.stopPropagation()">' +
                '<input type="checkbox" id="school-select-' + safeId + '" class="school-select-input">' +
            '</label>' +
            '<span class="school-header-clickable" onclick="toggleSchoolPanel(\'' + schoolName + '\')">' +
                '<span class="school-control-name">' + schoolName + '</span>' +
                '<span class="school-control-spell-count">(' + spellCount + ' spells)</span>' +
            '</span>' +
            '<span class="school-control-toggle" onclick="toggleSchoolPanel(\'' + schoolName + '\')">▼</span>' +
        '</div>' +
        '<div class="school-control-content">' +
            createSchoolControlsHTML(schoolName) +
        '</div>';

    return panel;
}

function createSchoolControlsHTML(schoolName) {
    var safeId = schoolName.replace(/\s+/g, '-');

    // Main settings (always visible)
    var html = '' +
        '<div class="school-control-row">' +
            '<span class="school-control-label">Slice Weight:</span>' +
            '<input type="range" class="school-control-slider" id="school-slice-weight-' + safeId + '" ' +
                'min="50" max="200" value="100" oninput="updateSchoolSliderValue(this, 100)">' +
            '<span class="school-control-value" id="school-slice-weight-val-' + safeId + '">1.0</span>' +
        '</div>' +
        '<div class="school-control-row">' +
            '<span class="school-control-label">Growth Style:</span>' +
            '<select class="school-control-select" id="school-growth-behavior-' + safeId + '">' +
                '<option value="auto" selected>Auto (school default)</option>' +
                '<option value="fire_explosion">Fire Explosion</option>' +
                '<option value="gentle_bloom">Gentle Bloom</option>' +
                '<option value="mountain_builder">Mountain Builder</option>' +
                '<option value="portal_network">Portal Network</option>' +
                '<option value="spider_web">Spider Web</option>' +
                '<option value="ocean_wave">Ocean Wave</option>' +
                '<option value="ancient_tree">Ancient Tree</option>' +
                '<option value="crystal_growth">Crystal Growth</option>' +
                '<option value="vine_crawl">Vine Crawl</option>' +
                '<option value="nebula_burst">Nebula Burst</option>' +
            '</select>' +
        '</div>';

    // Shape control - visible to all users (affects tree visual pattern)
    html += '' +
        '<div class="school-control-row">' +
            '<span class="school-control-label">Shape:</span>' +
            '<select class="school-control-select" id="school-shape-' + safeId + '">' +
                AVAILABLE_SHAPES.map(function(s) {
                    return '<option value="' + s + '"' + (s === 'organic' ? ' selected' : '') + '>' + s + '</option>';
                }).join('') +
            '</select>' +
        '</div>' +
        '<div class="school-control-row">' +
            '<span class="school-control-label">Symmetry:</span>' +
            '<input type="range" class="school-control-slider" id="school-symmetry-' + safeId + '" ' +
                'min="0" max="100" value="30" oninput="updateSchoolSliderValue(this, 100)">' +
            '<span class="school-control-value" id="school-symmetry-val-' + safeId + '">30%</span>' +
        '</div>' +
        '<div class="school-control-row">' +
            '<span class="school-control-label">Outward Growth:</span>' +
            '<input type="range" class="school-control-slider" id="school-outward-' + safeId + '" ' +
                'min="0" max="100" value="50" oninput="updateSchoolSliderValue(this, 100)">' +
            '<span class="school-control-value" id="school-outward-val-' + safeId + '">50%</span>' +
        '</div>';

    // Developer-only settings (hidden unless developer mode is on)
    html += '' +
        '<div class="school-control-row dev-only">' +
            '<span class="school-control-label">Density:</span>' +
            '<input type="range" class="school-control-slider" id="school-density-' + safeId + '" ' +
                'min="30" max="90" value="60" oninput="updateSchoolSliderValue(this)">' +
            '<span class="school-control-value" id="school-density-val-' + safeId + '">0.6</span>' +
        '</div>' +
        '<div class="school-control-row dev-only">' +
            '<span class="school-control-label">Convergence:</span>' +
            '<input type="range" class="school-control-slider" id="school-convergence-' + safeId + '" ' +
                'min="20" max="70" value="40" oninput="updateSchoolSliderValue(this, 100)">' +
            '<span class="school-control-value" id="school-convergence-val-' + safeId + '">40%</span>' +
        '</div>' +
        '<div class="school-control-row dev-only">' +
            '<span class="school-control-label">Branching:</span>' +
            '<select class="school-control-select" id="school-branching-mode-' + safeId + '">' +
                '<option value="fuzzy_groups" selected>Fuzzy Groups (organic)</option>' +
                '<option value="proximity">Proximity (grid)</option>' +
            '</select>' +
        '</div>' +
        '<details class="school-control-advanced dev-only">' +
            '<summary>Branching Energy</summary>' +
            '<div class="school-control-row">' +
                '<span class="school-control-label">Branch Chance:</span>' +
                '<input type="range" class="school-control-slider" id="school-branch-chance-' + safeId + '" ' +
                    'min="10" max="50" value="25" oninput="updateSchoolSliderValue(this, 100)">' +
                '<span class="school-control-value" id="school-branch-chance-val-' + safeId + '">25%</span>' +
            '</div>' +
            '<div class="school-control-row">' +
                '<span class="school-control-label">Energy Gain:</span>' +
                '<input type="range" class="school-control-slider" id="school-branch-energy-' + safeId + '" ' +
                    'min="5" max="25" value="12" oninput="updateSchoolSliderValue(this, 100)">' +
                '<span class="school-control-value" id="school-branch-energy-val-' + safeId + '">0.12</span>' +
            '</div>' +
            '<div class="school-control-row">' +
                '<span class="school-control-label">Energy Threshold:</span>' +
                '<input type="range" class="school-control-slider" id="school-branch-threshold-' + safeId + '" ' +
                    'min="10" max="30" value="18" oninput="updateSchoolSliderValue(this, 10)">' +
                '<span class="school-control-value" id="school-branch-threshold-val-' + safeId + '">1.8</span>' +
            '</div>' +
            '<div class="school-control-row">' +
                '<span class="school-control-label">Fuzzy Subdivide:</span>' +
                '<input type="checkbox" id="school-branch-subdivide-' + safeId + '" checked>' +
            '</div>' +
        '</details>' +
        '<details class="school-control-advanced dev-only">' +
            '<summary>Alternate Paths</summary>' +
            '<div class="school-control-row">' +
                '<span class="school-control-label">Min Path Dist:</span>' +
                '<input type="range" class="school-control-slider" id="school-alt-min-path-' + safeId + '" ' +
                    'min="2" max="8" value="4" oninput="updateSchoolSliderValue(this, 1, \'\', true)">' +
                '<span class="school-control-value" id="school-alt-min-path-val-' + safeId + '">4</span>' +
            '</div>' +
            '<div class="school-control-row">' +
                '<span class="school-control-label">Max Spatial:</span>' +
                '<input type="range" class="school-control-slider" id="school-alt-max-spatial-' + safeId + '" ' +
                    'min="2" max="8" value="4" oninput="updateSchoolSliderValue(this, 1, \'\', true)">' +
                '<span class="school-control-value" id="school-alt-max-spatial-val-' + safeId + '">4</span>' +
            '</div>' +
            '<div class="school-control-row">' +
                '<span class="school-control-label">Probability:</span>' +
                '<input type="range" class="school-control-slider" id="school-alt-probability-' + safeId + '" ' +
                    'min="10" max="70" value="30" oninput="updateSchoolSliderValue(this, 100)">' +
                '<span class="school-control-value" id="school-alt-probability-val-' + safeId + '">30%</span>' +
            '</div>' +
            '<div class="school-control-row">' +
                '<span class="school-control-label">Max Per Node:</span>' +
                '<input type="range" class="school-control-slider" id="school-alt-max-per-node-' + safeId + '" ' +
                    'min="1" max="4" value="2" oninput="updateSchoolSliderValue(this, 1, \'\', true)">' +
                '<span class="school-control-value" id="school-alt-max-per-node-val-' + safeId + '">2</span>' +
            '</div>' +
        '</details>';

    // Generate buttons - Complex and Simple (JS only)
    html += '' +
        '<div class="school-control-actions">' +
            '<button class="btn btn-accent btn-sm" onclick="rerunSchool(\'' + schoolName + '\', \'complex\', true)" title="Regenerate with settings-aware builder (uses scoring, element isolation, tier ordering)">Complex</button>' +
            '<button class="btn btn-secondary btn-sm" onclick="rerunSchool(\'' + schoolName + '\', \'simple\', true)" title="Regenerate with simple JS builder (basic theme grouping)">Simple</button>' +
        '</div>';

    return html;
}

function toggleSchoolPanel(schoolName) {
    var safeId = schoolName.replace(/\s+/g, '-');
    var panel = document.getElementById('school-control-' + safeId);
    if (panel) {
        panel.classList.toggle('expanded');
        var toggle = panel.querySelector('.school-control-toggle');
        if (toggle) toggle.textContent = panel.classList.contains('expanded') ? '▲' : '▼';
    }
}

function collapseAllSchoolPanels() {
    var panels = document.querySelectorAll('.school-control-panel');
    panels.forEach(function(panel) {
        panel.classList.remove('expanded');
        var toggle = panel.querySelector('.school-control-toggle');
        if (toggle) toggle.textContent = '▼';
    });
}

function updateSchoolSliderValue(slider, divisor, isInt) {
    divisor = divisor || 100;
    var safeId = slider.id.replace('school-', '').replace(/-[^-]+$/, '');
    var valSpan = document.getElementById(slider.id.replace(/-([^-]+)$/, '-val-$1'));

    if (valSpan) {
        var val = slider.value / divisor;
        if (isInt) {
            valSpan.textContent = slider.value;
        } else {
            valSpan.textContent = val.toFixed(1);
        }
    }
}

function getSchoolConfig(schoolName) {
    var safeId = schoolName.replace(/\s+/g, '-');

    var branchingMode = document.getElementById('school-branching-mode-' + safeId)?.value || 'fuzzy_groups';
    var growthBehavior = document.getElementById('school-growth-behavior-' + safeId)?.value || 'auto';

    return {
        slice_weight: (document.getElementById('school-slice-weight-' + safeId)?.value || 100) / 100,
        shape: document.getElementById('school-shape-' + safeId)?.value || 'organic',
        symmetry: (document.getElementById('school-symmetry-' + safeId)?.value || 30) / 100,
        outward_growth: (document.getElementById('school-outward-' + safeId)?.value || 50) / 100,
        density: (document.getElementById('school-density-' + safeId)?.value || 60) / 100,
        convergence: (document.getElementById('school-convergence-' + safeId)?.value || 40) / 100,
        branching_mode: branchingMode,
        growth_behavior: growthBehavior === 'auto' ? null : growthBehavior,
        // Branching energy parameters
        branch_chance: (document.getElementById('school-branch-chance-' + safeId)?.value || 25) / 100,
        branch_energy_gain: (document.getElementById('school-branch-energy-' + safeId)?.value || 12) / 100,
        branch_energy_threshold: (document.getElementById('school-branch-threshold-' + safeId)?.value || 18) / 10,
        branch_subdivide_pool: document.getElementById('school-branch-subdivide-' + safeId)?.checked !== false,
        // Alternate path parameters
        alt_path_min_distance: parseInt(document.getElementById('school-alt-min-path-' + safeId)?.value) || 4,
        alt_path_max_distance: parseInt(document.getElementById('school-alt-max-spatial-' + safeId)?.value) || 4,
        alt_path_probability: (document.getElementById('school-alt-probability-' + safeId)?.value || 30) / 100,
        alt_path_max_per_node: parseInt(document.getElementById('school-alt-max-per-node-' + safeId)?.value) || 2
    };
}

// =============================================================================
// EXPORTS
// =============================================================================

window.showSchoolControlPanels = showSchoolControlPanels;
window.toggleSchoolPanel = toggleSchoolPanel;
window.collapseAllSchoolPanels = collapseAllSchoolPanels;
window.updateSchoolSliderValue = updateSchoolSliderValue;
window.getSchoolConfig = getSchoolConfig;
window.selectAllSchools = selectAllSchools;
window.regenerateSelectedSchools = regenerateSelectedSchools;

console.log('[GenerationModeSchools] Loaded');
