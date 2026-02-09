/**
 * app.js - Dendrogram Viewer Application Orchestrator
 *
 * Manages file loading, school tab switching, slider controls, ghost mode,
 * and coordinates data flow between JSON input and the DendrogramRenderer.
 *
 * Global class: DendrogramApp
 * Dependencies: spatial-hash.js (SpatialHashGrid), renderer.js (DendrogramRenderer)
 *
 * Boot: const app = new DendrogramApp(); app.init();
 */

class DendrogramApp {

    constructor() {
        /** @type {DendrogramRenderer|null} */
        this.renderer = null;

        /** @type {HTMLCanvasElement|null} */
        this.canvas = null;

        /**
         * Loaded school data. Keys are school names (e.g. "Destruction"),
         * values are { nodes: [...], meta: {...}, schoolColor: '...' }
         * @type {Map<string, object>}
         */
        this.schools = new Map();

        /** @type {string} Currently active school name */
        this.activeSchool = '';

        /** @type {object|null} Raw data from the most recently loaded JSON */
        this._lastLoadedData = null;
    }

    // ======================================================================
    //  INITIALIZATION
    // ======================================================================

    /** Set up canvas, renderer, controls, drag-and-drop. */
    init() {
        this.canvas = document.getElementById('tree-canvas');
        if (!this.canvas) {
            console.error('[DendrogramApp] #tree-canvas not found');
            return;
        }

        // Create renderer
        this.renderer = new DendrogramRenderer(this.canvas);

        // Bind controls
        this._bindSliders();
        this._bindButtons();
        this._bindDragDrop();
        this._bindSchoolTabs();

        // Update mode indicator
        this._updateModeIndicator('Waiting for data');

        console.log('[DendrogramApp] Initialized. Drop a spell_tree.json or click a school tab.');
    }

    // ======================================================================
    //  FILE LOADING
    // ======================================================================

    /**
     * Load and parse a spell_tree JSON object.
     * Resolves parent_id / children_ids to object references, then
     * hands data to the renderer.
     *
     * Expected JSON format:
     * {
     *   "school": "Destruction",
     *   "school_color": "#ef4444",
     *   "stats": { "total_spells": 42, "assigned": 38, ... },
     *   "nodes": [
     *     { "id": 0, "x": 0, "y": 0, "zone": "origin", "depth": 0,
     *       "parent_id": null, "children_ids": [1,2], "thickness": 5.2,
     *       "is_hub": false, "is_orbital": false,
     *       "spell": { "formId": "...", "name": "Flames", "skillLevel": "Novice", "magickaCost": 14 }
     *     }, ...
     *   ]
     * }
     */
    loadJSON(data) {
        if (!data || !data.nodes || !Array.isArray(data.nodes)) {
            this._showError('Invalid JSON: missing "nodes" array');
            return;
        }

        this._lastLoadedData = data;

        // Detect wheel mode
        if (data.mode === 'wheel') {
            this._loadWheelJSON(data);
            return;
        }

        var schoolName = data.school || 'Unknown';
        var schoolColor = data.school_color || this._guessSchoolColor(schoolName);

        // Resolve node references
        var nodes = this._resolveReferences(data.nodes);

        // Store in school map
        this.schools.set(schoolName, {
            nodes: nodes,
            meta: data.stats || {},
            schoolColor: schoolColor,
            rawData: data
        });

        // Activate this school
        this._activateSchool(schoolName);

        // Update UI
        this._refreshSchoolTabs();
        this._updateStats(data.stats);
        this._updateModeIndicator(schoolName + ' - ' + nodes.length + ' nodes');

        console.log('[DendrogramApp] Loaded ' + schoolName + ': ' + nodes.length + ' nodes');
    }

    /**
     * Load a wheel-mode JSON with all 5 schools on a shared grid.
     * Each node has a 'school' field determining its color.
     */
    _loadWheelJSON(data) {
        var self = this;
        var nodes = this._resolveReferences(data.nodes);

        // Assign per-node school color
        for (var i = 0; i < nodes.length; i++) {
            var n = nodes[i];
            n.schoolColor = this._guessSchoolColor(n.school || 'Unknown');
        }

        // Store ring data on nodes for renderer
        var ringData = data.ring || null;

        this.schools.set('Wheel', {
            nodes: nodes,
            meta: data.stats || {},
            schoolColor: '#ffffff',  // multi-color mode
            rawData: data,
            isWheel: true,
            ring: ringData
        });

        this._activateSchool('Wheel');
        this._refreshSchoolTabs();
        this._updateStats(data.stats);
        this._updateModeIndicator('Wheel - ' + nodes.length + ' nodes, 5 schools');

        console.log('[DendrogramApp] Loaded wheel: ' + nodes.length + ' nodes');
    }

    /**
     * Resolve parent_id and children_ids integer references to actual
     * object references. Also maps snake_case JSON fields to camelCase
     * expected by the renderer.
     *
     * @param {Array} rawNodes - Node array from JSON
     * @returns {Array} Resolved node array
     */
    _resolveReferences(rawNodes) {
        // Build id -> node lookup
        var nodeMap = new Map();
        for (var i = 0; i < rawNodes.length; i++) {
            var n = rawNodes[i];
            nodeMap.set(n.id, n);
        }

        // Resolve references and remap fields
        for (var i = 0; i < rawNodes.length; i++) {
            var n = rawNodes[i];

            // Resolve parent
            n.parent = (n.parent_id !== null && n.parent_id !== undefined)
                ? nodeMap.get(n.parent_id) || null
                : null;

            // Resolve children
            n.children = (n.children_ids || []).map(function (id) {
                return nodeMap.get(id);
            }).filter(Boolean);

            // Map spell object for renderer (expects .assignedSpell)
            n.assignedSpell = n.spell || null;

            // Map snake_case booleans to camelCase
            n.isHub = !!n.is_hub;
            n.isOrbital = !!n.is_orbital;

            // Map ring_ids for fruit cluster hub centers
            n.ringIds = n.ring_ids || [];

            // Ensure numeric defaults
            n.x = n.x || 0;
            n.y = n.y || 0;
            n.thickness = n.thickness || 1;
            n.depth = n.depth || 0;
            n.curveOffset = n.curve_offset || 0;
        }

        return rawNodes;
    }

    /**
     * Activate a loaded school: pass its nodes to the renderer.
     * @param {string} schoolName
     */
    _activateSchool(schoolName) {
        var schoolData = this.schools.get(schoolName);
        if (!schoolData) return;

        this.activeSchool = schoolName;

        // Pass to renderer
        this.renderer.render(
            schoolData.nodes,
            schoolData.schoolColor,
            {
                nodeSizeMultiplier: this.renderer.nodeSizeMultiplier,
                lineThicknessMultiplier: this.renderer.lineThicknessMultiplier,
                isWheel: !!schoolData.isWheel,
                ring: schoolData.ring || null
            }
        );

        // Reset view to fit the new tree
        this.renderer.resetView();

        // Auto-fit: compute bounding box and set camera
        this._autoFit(schoolData.nodes);

        // Update tab highlight
        this._highlightActiveTab(schoolName);
    }

    /**
     * Auto-fit the camera to show all nodes with some padding.
     * @param {Array} nodes
     */
    _autoFit(nodes) {
        if (!nodes || nodes.length === 0) return;

        var minX = Infinity, maxX = -Infinity;
        var minY = Infinity, maxY = -Infinity;

        for (var i = 0; i < nodes.length; i++) {
            var n = nodes[i];
            if (n.x < minX) minX = n.x;
            if (n.x > maxX) maxX = n.x;
            if (n.y < minY) minY = n.y;
            if (n.y > maxY) maxY = n.y;
        }

        var cx = (minX + maxX) * 0.5;
        var cy = (minY + maxY) * 0.5;
        var spanX = (maxX - minX) || 100;
        var spanY = (maxY - minY) || 100;

        // Scale to fit with 10% padding
        var canvasRect = this.canvas.getBoundingClientRect();
        var cssW = canvasRect.width || 800;
        var cssH = canvasRect.height || 600;

        var scaleX = cssW / (spanX * 1.2);
        var scaleY = cssH / (spanY * 1.2);
        var fitScale = Math.min(scaleX, scaleY);

        // Clamp to reasonable range
        fitScale = Math.max(0.05, Math.min(5, fitScale));

        this.renderer.panX = cx;
        this.renderer.panY = cy;
        this.renderer.scale = fitScale;
        this.renderer.textCache.clear();
        this.renderer._needsRedraw = true;
    }

    /**
     * Guess school color from name if not provided in JSON.
     * @param {string} name
     * @returns {string}
     */
    _guessSchoolColor(name) {
        var colors = DendrogramRenderer.SCHOOL_COLORS;
        if (colors[name]) return colors[name];
        // Try case-insensitive
        var lower = name.toLowerCase();
        var keys = Object.keys(colors);
        for (var i = 0; i < keys.length; i++) {
            if (keys[i].toLowerCase() === lower) return colors[keys[i]];
        }
        return '#22c55e'; // default to Alteration green
    }

    // ======================================================================
    //  DRAG & DROP
    // ======================================================================

    _bindDragDrop() {
        var self = this;
        var dropZone = document.getElementById('drop-zone') || this.canvas;

        // Prevent default drag behaviors on the whole document
        document.addEventListener('dragover', function (e) {
            e.preventDefault();
        });
        document.addEventListener('drop', function (e) {
            e.preventDefault();
        });

        // Drop zone highlighting
        dropZone.addEventListener('dragover', function (e) {
            e.preventDefault();
            dropZone.classList.add('drag-over');
        });
        dropZone.addEventListener('dragleave', function () {
            dropZone.classList.remove('drag-over');
        });

        // Handle file drop
        dropZone.addEventListener('drop', function (e) {
            e.preventDefault();
            dropZone.classList.remove('drag-over');

            var files = e.dataTransfer.files;
            if (!files || files.length === 0) return;

            // Load all JSON files
            for (var i = 0; i < files.length; i++) {
                self._readFile(files[i]);
            }
        });
    }

    /**
     * Read a dropped file and parse as JSON.
     * @param {File} file
     */
    _readFile(file) {
        var self = this;

        if (!file.name.endsWith('.json')) {
            self._showError('Expected .json file, got: ' + file.name);
            return;
        }

        var reader = new FileReader();
        reader.onload = function (e) {
            try {
                var data = JSON.parse(e.target.result);
                self.loadJSON(data);
            } catch (err) {
                self._showError('JSON parse error: ' + err.message);
            }
        };
        reader.onerror = function () {
            self._showError('Failed to read file: ' + file.name);
        };
        reader.readAsText(file);
    }

    // ======================================================================
    //  SCHOOL TABS
    // ======================================================================

    _bindSchoolTabs() {
        var self = this;
        var tabBar = document.getElementById('school-tabs');
        if (!tabBar) return;

        // Clicking a tab switches to that school
        tabBar.addEventListener('click', function (e) {
            var tab = e.target.closest('[data-school]');
            if (!tab) return;

            var schoolName = tab.getAttribute('data-school');

            // If already loaded, switch to it
            if (self.schools.has(schoolName)) {
                self._activateSchool(schoolName);
                self._updateStats(self.schools.get(schoolName).meta);
                self._updateModeIndicator(schoolName + ' - ' + self.schools.get(schoolName).nodes.length + ' nodes');
                return;
            }

            // Try to fetch from adjacent file
            self._fetchSchoolJSON(schoolName);
        });
    }

    /**
     * Attempt to fetch spell_tree_<school>.json from the parent directory.
     * @param {string} schoolName
     */
    _fetchSchoolJSON(schoolName) {
        var self = this;
        var filename = schoolName === 'Wheel'
            ? '../spell_tree_wheel.json'
            : '../spell_tree_' + schoolName + '.json';

        self._updateModeIndicator('Loading ' + schoolName + '...');

        fetch(filename)
            .then(function (resp) {
                if (!resp.ok) throw new Error('HTTP ' + resp.status);
                return resp.json();
            })
            .then(function (data) {
                self.loadJSON(data);
            })
            .catch(function (err) {
                self._showError('Could not load ' + filename + ': ' + err.message);
                self._updateModeIndicator('Load failed');
            });
    }

    /** Refresh school tab buttons to reflect loaded schools. */
    _refreshSchoolTabs() {
        var tabBar = document.getElementById('school-tabs');
        if (!tabBar) return;

        var tabs = tabBar.querySelectorAll('[data-school]');
        for (var i = 0; i < tabs.length; i++) {
            var name = tabs[i].getAttribute('data-school');
            if (this.schools.has(name)) {
                tabs[i].classList.add('loaded');
            }
        }

        this._highlightActiveTab(this.activeSchool);
    }

    /** Highlight the active school tab. */
    _highlightActiveTab(schoolName) {
        var tabBar = document.getElementById('school-tabs');
        if (!tabBar) return;

        var tabs = tabBar.querySelectorAll('[data-school]');
        for (var i = 0; i < tabs.length; i++) {
            var name = tabs[i].getAttribute('data-school');
            if (name === schoolName) {
                tabs[i].classList.add('active');
            } else {
                tabs[i].classList.remove('active');
            }
        }
    }

    // ======================================================================
    //  SLIDERS
    // ======================================================================

    _bindSliders() {
        var self = this;

        // Node size slider
        var nodeSizeSlider = document.getElementById('slider-node-size');
        var nodeSizeValue = document.getElementById('value-node-size');
        if (nodeSizeSlider) {
            nodeSizeSlider.addEventListener('input', function () {
                var val = parseFloat(this.value);
                self.renderer.nodeSizeMultiplier = val;
                if (nodeSizeValue) nodeSizeValue.textContent = val.toFixed(1) + 'x';
            });
        }

        // Line thickness slider
        var lineSlider = document.getElementById('slider-line-thickness');
        var lineValue = document.getElementById('value-line-thickness');
        if (lineSlider) {
            lineSlider.addEventListener('input', function () {
                var val = parseFloat(this.value);
                self.renderer.lineThicknessMultiplier = val;
                if (lineValue) lineValue.textContent = val.toFixed(1) + 'x';
            });
        }
    }

    // ======================================================================
    //  BUTTONS
    // ======================================================================

    _bindButtons() {
        var self = this;

        // Ghost Mode toggle
        var ghostBtn = document.getElementById('btn-ghost');
        if (ghostBtn) {
            ghostBtn.addEventListener('click', function () {
                self.renderer.ghostMode = !self.renderer.ghostMode;
                ghostBtn.classList.toggle('active', self.renderer.ghostMode);
                ghostBtn.textContent = self.renderer.ghostMode ? 'Ghost: ON' : 'Ghost Mode';
            });
        }

        // Reset View
        var resetBtn = document.getElementById('btn-reset-view');
        if (resetBtn) {
            resetBtn.addEventListener('click', function () {
                if (self.activeSchool && self.schools.has(self.activeSchool)) {
                    self._autoFit(self.schools.get(self.activeSchool).nodes);
                } else {
                    self.renderer.resetView();
                }
            });
        }

        // Export JSON
        var exportBtn = document.getElementById('btn-export');
        if (exportBtn) {
            exportBtn.addEventListener('click', function () {
                self._exportJSON();
            });
        }
    }

    /** Export the currently loaded tree data as a downloadable JSON file. */
    _exportJSON() {
        if (!this.activeSchool || !this.schools.has(this.activeSchool)) {
            this._showError('No data loaded to export');
            return;
        }

        var schoolData = this.schools.get(this.activeSchool);
        var rawData = schoolData.rawData;

        if (!rawData) {
            this._showError('No raw data available for export');
            return;
        }

        var json = JSON.stringify(rawData, null, 2);
        var blob = new Blob([json], { type: 'application/json' });
        var url = URL.createObjectURL(blob);

        var a = document.createElement('a');
        a.href = url;
        a.download = 'spell_tree_' + this.activeSchool.toLowerCase() + '.json';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    }

    // ======================================================================
    //  STATS DISPLAY
    // ======================================================================

    /**
     * Update the stats panel with metadata from the loaded JSON.
     * @param {object} stats
     */
    _updateStats(stats) {
        var panel = document.getElementById('stats-panel');
        if (!panel || !stats) {
            if (panel) panel.innerHTML = '<span class="stats-empty">No stats available</span>';
            return;
        }

        var html = '';

        if (stats.total_spells !== undefined) {
            html += '<div class="stat-row"><span class="stat-label">Total Spells</span><span class="stat-value">' + stats.total_spells + '</span></div>';
        }
        if (stats.assigned !== undefined) {
            html += '<div class="stat-row"><span class="stat-label">Assigned</span><span class="stat-value">' + stats.assigned + '</span></div>';
        }
        if (stats.unassigned !== undefined) {
            html += '<div class="stat-row"><span class="stat-label">Unassigned</span><span class="stat-value">' + stats.unassigned + '</span></div>';
        }
        if (stats.total_nodes !== undefined) {
            html += '<div class="stat-row"><span class="stat-label">Total Nodes</span><span class="stat-value">' + stats.total_nodes + '</span></div>';
        }
        if (stats.avg_similarity !== undefined) {
            html += '<div class="stat-row"><span class="stat-label">Avg Similarity</span><span class="stat-value">' + (typeof stats.avg_similarity === 'number' ? stats.avg_similarity.toFixed(3) : stats.avg_similarity) + '</span></div>';
        }
        if (stats.geo_time !== undefined) {
            html += '<div class="stat-row"><span class="stat-label">Geo Time</span><span class="stat-value">' + stats.geo_time + '</span></div>';
        }
        if (stats.nlp_time !== undefined) {
            html += '<div class="stat-row"><span class="stat-label">NLP Time</span><span class="stat-value">' + stats.nlp_time + '</span></div>';
        }

        // Show any other stats we haven't explicitly handled
        var handledKeys = ['total_spells', 'assigned', 'unassigned', 'total_nodes', 'avg_similarity', 'geo_time', 'nlp_time'];
        var keys = Object.keys(stats);
        for (var i = 0; i < keys.length; i++) {
            if (handledKeys.indexOf(keys[i]) === -1) {
                var val = stats[keys[i]];
                if (typeof val === 'number') {
                    val = val % 1 === 0 ? val : val.toFixed(3);
                }
                html += '<div class="stat-row"><span class="stat-label">' + keys[i] + '</span><span class="stat-value">' + val + '</span></div>';
            }
        }

        panel.innerHTML = html || '<span class="stats-empty">No stats available</span>';
    }

    // ======================================================================
    //  MODE INDICATOR
    // ======================================================================

    /**
     * Update the mode indicator text at the bottom.
     * @param {string} text
     */
    _updateModeIndicator(text) {
        var indicator = document.getElementById('mode-indicator');
        if (indicator) {
            indicator.textContent = text;
        }
    }

    // ======================================================================
    //  ERROR DISPLAY
    // ======================================================================

    /**
     * Show a transient error message.
     * @param {string} msg
     */
    _showError(msg) {
        console.error('[DendrogramApp] ' + msg);
        this._updateModeIndicator('Error: ' + msg);

        // Flash the mode indicator red briefly
        var indicator = document.getElementById('mode-indicator');
        if (indicator) {
            indicator.style.color = '#ef4444';
            setTimeout(function () {
                indicator.style.color = '';
            }, 3000);
        }
    }
}
