/**
 * TreeGrowthGraph — Graph Growth Mode Orchestrator
 *
 * Wires together GraphSettings, GraphLayout, and GraphRenderer to
 * provide the "GRAPH" tab in the Tree Growth section. Uses Edmonds'
 * minimum spanning arborescence to find globally optimal directed trees.
 * Deterministic — same seed produces identical output.
 *
 * Self-registers with TreeGrowth via registerMode().
 *
 * Depends on:
 *   growthModeUtils.js    (GrowthModeUtils — shared lifecycle helpers)
 *   graphSettings.js      (GraphSettings)
 *   graphLayout.js        (GraphLayout)
 *   graphRenderer.js      (GraphRenderer)
 *   treePreviewUtils.js   (TreePreviewUtils)
 *   treePreview.js        (TreePreview.getOutput)
 *   treeGrowth.js         (TreeGrowth — registers into it)
 */

var TreeGrowthGraph = {

    // =========================================================================
    // STATE
    // =========================================================================

    tabLabel: 'GRAPH',

    settings: {
        ghostOpacity: 35,
        nodeRadius: 5,
        chaos: 30,
        forceBalance: 50,
        edgeStyle: 'straight',
        showAffinity: false
    },

    _treeData: null,
    _layoutData: null,
    _positionMap: null,
    _hasSpells: false,

    // =========================================================================
    // TREE GROWTH MODE INTERFACE (required by TreeGrowth orchestrator)
    // =========================================================================

    /**
     * Build the settings panel HTML for Graph mode.
     * @returns {string} HTML string
     */
    buildSettingsHTML: function () {
        return GraphSettings.buildHTML(this.settings);
    },

    /**
     * Bind DOM events for the settings panel.
     * Connects GraphSettings callbacks to internal methods.
     */
    bindEvents: function () {
        var self = this;

        GraphSettings.bindEvents({
            onSettingChanged: function (key, value) {
                self.settings[key] = value;
                // Layout-affecting settings: invalidate cached layout so it recomputes
                if (key === 'chaos' || key === 'forceBalance') {
                    if (self._treeData) {
                        self._layoutData = null; // triggers lazy re-layout on next render
                    }
                }
                TreeGrowth._markDirty();
            }
        });
    },

    /**
     * Render the Graph Growth overlay onto the shared canvas.
     *
     * @param {CanvasRenderingContext2D} ctx
     * @param {number} w  - Canvas logical width
     * @param {number} h  - Canvas logical height
     * @param {Object|null} baseData - Output from TreePreview.getOutput()
     */
    render: function (ctx, w, h, baseData) {
        if (!baseData) {
            GrowthModeUtils.renderPlaceholder(ctx, w, h);
            return;
        }

        // 1. Render the base grid underneath
        baseData.renderGrid(ctx, w, h);

        // 2. Lazy layout: if we have tree data but no layout yet, try now
        if (this._treeData && (!this._layoutData || !this._layoutData.schools)) {
            var lazyResult = GrowthModeUtils.tryLazyLayout(this, GraphLayout, GraphSettings, baseData, 'GraphGrowth');
            if (lazyResult) {
                this._zoomToFit();
            }
        }

        // 3. If still no layout data, just show the grid
        if (!this._layoutData || !this._layoutData.schools) return;

        var cx = w / 2;
        var cy = h / 2;
        var opacity = this.settings.ghostOpacity / 100;
        var nodeR = this.settings.nodeRadius;
        var curved = this.settings.edgeStyle === 'curved';

        // 4. For each school, render edges then nodes
        var schools = this._layoutData.schools;
        for (var schoolName in schools) {
            if (!schools.hasOwnProperty(schoolName)) continue;
            var school = schools[schoolName];

            // Edges first (underneath)
            GraphRenderer.renderEdges(ctx, cx, cy, school.nodes, school.color, opacity, curved);

            // Nodes on top
            GraphRenderer.renderNodes(ctx, cx, cy, school.nodes, school.color, opacity, nodeR);

            // Root markers
            for (var i = 0; i < school.nodes.length; i++) {
                if (school.nodes[i].isRoot) {
                    GraphRenderer.renderRootMarker(
                        ctx,
                        cx + school.nodes[i].x,
                        cy + school.nodes[i].y,
                        school.color,
                        nodeR
                    );
                }
            }
        }

        // 5. Affinity debug overlay (if enabled)
        if (this.settings.showAffinity && this._treeData && this._treeData.affinity_pairs) {
            var posMap = this._buildPosMap();
            GraphRenderer.renderAffinityOverlay(ctx, cx, cy, this._treeData.affinity_pairs, posMap, opacity);
        }
    },

    // =========================================================================
    // TREE BUILDING FLOW
    // =========================================================================

    /**
     * Build tree from scanned spells via C++ (ProceduralTreeGenerate).
     * Uses the graph builder command (Edmonds' arborescence).
     */
    buildTree: function () {
        var prep = GrowthModeUtils.prepareBuild(GraphSettings, 'Graph', '_graphGrowthBuildPending', 'tgBuildBtn');
        if (!prep) return;
        var spellsToProcess = prep.spellsToProcess;

        var config = {
            chaos: this.settings.chaos / 100,
            force_balance: this.settings.forceBalance / 100,
            max_children_per_node: 4,
            top_themes_per_school: 8,
            prefer_vanilla_roots: true,
            seed: Math.floor(Math.random() * 100000),
            grid_hint: prep.gridHint
        };

        // Defer to let UI render progress modal before blocking on JSON.stringify
        setTimeout(function() {
            window.callCpp('ProceduralTreeGenerate', JSON.stringify({
                command: 'build_tree_graph',
                spells: spellsToProcess,
                config: config
            }));
        }, 0);
    },

    /**
     * Receive tree data from the C++ backend callback.
     * Runs layout and triggers a re-render.
     *
     * @param {Object} data - Raw tree structure from the backend
     */
    loadTreeData: function (data) {
        this._treeData = data;
        this._positionMap = null;
        console.log('[GraphGrowth] loadTreeData called, schools:', data && data.schools ? Object.keys(data.schools) : 'none');
        this._layoutData = GrowthModeUtils.processLoadedTree(data, GraphLayout, GraphSettings, this.settings, 'GraphGrowth');
        GrowthModeUtils.zoomToFit(this._layoutData, 'GraphGrowth');
        TreeGrowth._markDirty();
    },

    /**
     * Save the current tree data to the game via C++ backend.
     * Bakes layout positions from _layoutData into the output JSON
     * so the spell tree viewer can render at exact positions.
     */
    applyTree: function () {
        this._positionMap = GrowthModeUtils.buildApplyOutput(
            this._treeData, this._layoutData, 'GraphGrowth', GraphSettings,
            null,
            null,
            null
        );
    },

    /**
     * Return the current layout position map (formId -> {x, y}).
     * Returns null if no tree has been built yet.
     */
    getPositionMap: function () {
        return GrowthModeUtils.getPositionMap(this._layoutData);
    },

    /**
     * Discard the current tree data and clear the preview.
     */
    clearTree: function () {
        this._treeData = null;
        this._layoutData = null;
        this._positionMap = null;

        GraphSettings.setTreeBuilt(false);
        if (typeof updateScanStatus === 'function') updateScanStatus(t('status.treeCleared'));

        TreeGrowth._markDirty();
    },

    // =========================================================================
    // ZOOM TO FIT
    // =========================================================================

    _zoomToFit: function () {
        GrowthModeUtils.zoomToFit(this._layoutData, 'GraphGrowth');
    },

    // =========================================================================
    // INTERNAL HELPERS
    // =========================================================================

    _buildPosMap: function () {
        var posMap = {};
        if (!this._layoutData || !this._layoutData.schools) return posMap;
        var schools = this._layoutData.schools;
        for (var name in schools) {
            if (!schools.hasOwnProperty(name)) continue;
            var nodes = schools[name].nodes || [];
            for (var i = 0; i < nodes.length; i++) {
                posMap[nodes[i].formId] = { x: nodes[i].x, y: nodes[i].y };
            }
        }
        return posMap;
    },

    // =========================================================================
    // EXTERNAL API
    // =========================================================================

    getSettings: function () {
        return GrowthModeUtils.shallowCopySettings(this.settings);
    }
};

// =============================================================================
// SELF-REGISTRATION
// =============================================================================

if (typeof TreeGrowth !== 'undefined') {
    TreeGrowth.registerMode('graph', TreeGrowthGraph);
}
