/**
 * TreeGrowthThematic -- Thematic Growth Mode Orchestrator
 *
 * Wires together ThematicSettings, ThematicLayout, and ThematicRenderer to
 * provide the "THEMATIC" tab in the Tree Growth section. Manages tree build
 * state, delegates rendering to ThematicRenderer, and communicates with the
 * C++ backend via window.callCpp for tree building and saving.
 *
 * Self-registers with TreeGrowth via registerMode().
 *
 * Depends on:
 *   growthModeUtils.js   (GrowthModeUtils)
 *   thematicSettings.js  (ThematicSettings)
 *   thematicLayout.js    (ThematicLayout)
 *   thematicRenderer.js  (ThematicRenderer)
 *   treePreviewUtils.js  (TreePreviewUtils)
 *   treePreview.js       (TreePreview.getOutput)
 *   treeGrowth.js        (TreeGrowth -- registers into it)
 */

var TreeGrowthThematic = {

    // =========================================================================
    // STATE
    // =========================================================================

    tabLabel: 'THEMATIC',

    settings: {
        ghostOpacity: 35,
        nodeRadius: 5,
        layoutMode: 'themed',
        branchSpacing: 30,
        showLabels: true,
        showSpines: true
    },

    _treeData: null,
    _layoutData: null,
    _positionMap: null,
    _hasSpells: false,

    // =========================================================================
    // TREE GROWTH MODE INTERFACE (required by TreeGrowth orchestrator)
    // =========================================================================

    /**
     * Build the settings panel HTML for Thematic mode.
     * @returns {string} HTML string
     */
    buildSettingsHTML: function () {
        return ThematicSettings.buildHTML(this.settings);
    },

    /**
     * Bind DOM events for the settings panel.
     * Connects ThematicSettings callbacks to internal methods.
     */
    bindEvents: function () {
        var self = this;

        ThematicSettings.bindEvents({
            onBuild: function () {
                self.buildTree();
            },
            onApply: function () {
                self.applyTree();
            },
            onClear: function () {
                self.clearTree();
            },
            onSettingChanged: function (key, value) {
                self.settings[key] = value;
                // Layout-affecting settings: invalidate cached layout so it recomputes
                if (key === 'layoutMode' || key === 'branchSpacing') {
                    if (self._treeData) {
                        self._layoutData = null; // triggers lazy re-layout on next render
                    }
                }
                TreeGrowth._markDirty();
            }
        });
    },

    /**
     * Render the Thematic Growth overlay onto the shared canvas.
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

        // 1. Render the base grid underneath (ghost nodes only in Normal mode)
        if (this.settings.layoutMode === 'normal') {
            baseData.renderGrid(ctx, w, h);
        } else {
            // In themed mode, render grid without ghost nodes for cleaner look
            baseData.renderGrid(ctx, w, h);
        }

        // 2. Lazy layout: if we have tree data but no layout yet, try now
        if (this._treeData && (!this._layoutData || !this._layoutData.schools)) {
            var lazyResult = GrowthModeUtils.tryLazyLayout(this, ThematicLayout, ThematicSettings, baseData, 'ThematicGrowth');
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
        var isThemed = this.settings.layoutMode === 'themed';

        // 4. For each school, render: branch spines, edges, nodes, labels, trunk, roots
        var schools = this._layoutData.schools;
        for (var schoolName in schools) {
            if (!schools.hasOwnProperty(schoolName)) continue;
            var school = schools[schoolName];
            var schoolBranches = school.branches || [];

            // Branch spines (if themed + showSpines)
            if (isThemed && this.settings.showSpines) {
                ThematicRenderer.renderBranchSpines(ctx, cx, cy, schoolBranches, this._layoutData, opacity);
            }

            // Edges
            ThematicRenderer.renderEdges(ctx, cx, cy, school.nodes, opacity);

            // Nodes
            ThematicRenderer.renderNodes(ctx, cx, cy, school.nodes, opacity, nodeR);

            // Branch labels (if themed + showLabels)
            if (isThemed && this.settings.showLabels) {
                ThematicRenderer.renderBranchLabels(ctx, cx, cy, schoolBranches, this._layoutData, opacity);
            }

            // Trunk emphasis (if themed, find trunk branch and its nodes)
            if (isThemed) {
                var trunkNodes = this._getTrunkNodes(school);
                if (trunkNodes.length > 1) {
                    ThematicRenderer.renderTrunkEmphasis(ctx, cx, cy, trunkNodes, opacity);
                }
            }

            // Root markers
            for (var i = 0; i < school.nodes.length; i++) {
                if (school.nodes[i].isRoot) {
                    ThematicRenderer.renderRootMarker(
                        ctx,
                        cx + school.nodes[i].x,
                        cy + school.nodes[i].y,
                        school.color,
                        nodeR
                    );
                }
            }
        }
    },

    // =========================================================================
    // TREE BUILDING FLOW
    // =========================================================================

    /**
     * Build tree from scanned spells via C++ (ProceduralTreeGenerate).
     * Uses the thematic builder command.
     */
    buildTree: function () {
        var prep = GrowthModeUtils.prepareBuild(ThematicSettings, 'Thematic', '_thematicGrowthBuildPending', 'tgBuildBtn');
        if (!prep) return;
        var spellsToProcess = prep.spellsToProcess;

        var config = {
            chaos: this.settings.ghostOpacity / 100,
            max_children_per_node: 3,
            branch_style: 'thematic',
            seed: Math.floor(Math.random() * 100000),
            grid_hint: prep.gridHint
        };

        // Defer to let UI render progress modal before blocking on JSON.stringify
        setTimeout(function() {
            window.callCpp('ProceduralTreeGenerate', JSON.stringify({
                command: 'build_tree_thematic',
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
        this._layoutData = null;
        this._positionMap = null;
        console.log('[ThematicGrowth] loadTreeData called, schools:', data && data.schools ? Object.keys(data.schools) : 'none');

        // Extract branches per school (Thematic-specific)
        if (data && data.schools) {
            for (var schoolName in data.schools) {
                if (!data.schools.hasOwnProperty(schoolName)) continue;
                var schoolTree = data.schools[schoolName];
                if (!schoolTree.branches) {
                    console.log('[ThematicGrowth] No branches metadata for ' + schoolName + ', will use fallback');
                }
            }
        }

        this._layoutData = GrowthModeUtils.processLoadedTree(data, ThematicLayout, ThematicSettings, this.settings, 'ThematicGrowth');
        GrowthModeUtils.zoomToFit(this._layoutData, 'ThematicGrowth');
        TreeGrowth._markDirty();
    },

    /**
     * Save the current tree data to the game via C++ backend.
     * Bakes layout positions from _layoutData into the output JSON
     * so the spell tree viewer can render at exact positions.
     * Bakes themeColor per node.
     */
    applyTree: function () {
        this._positionMap = GrowthModeUtils.buildApplyOutput(
            this._treeData, this._layoutData, 'ThematicGrowth', ThematicSettings,
            function (srcNode, outNode, extraLookups) {
                if (extraLookups.themeColorLookup && extraLookups.themeColorLookup[srcNode.formId]) {
                    outNode.themeColor = extraLookups.themeColorLookup[srcNode.formId];
                }
            },
            null,
            function (layoutSchools) {
                var themeColorLookup = {};
                if (layoutSchools) {
                    for (var lsName in layoutSchools) {
                        if (!layoutSchools.hasOwnProperty(lsName)) continue;
                        var lsNodes = layoutSchools[lsName].nodes || [];
                        for (var li = 0; li < lsNodes.length; li++) {
                            if (lsNodes[li].themeColor) {
                                themeColorLookup[lsNodes[li].formId] = lsNodes[li].themeColor;
                            }
                        }
                    }
                }
                return { themeColorLookup: themeColorLookup };
            }
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

        ThematicSettings.setTreeBuilt(false);
        if (typeof updateScanStatus === 'function') updateScanStatus(t('status.treeCleared'));

        TreeGrowth._markDirty();
    },

    // =========================================================================
    // ZOOM TO FIT
    // =========================================================================

    /**
     * Auto-zoom the Growth canvas so the full tree is visible with padding.
     * Reads all positioned node coordinates and computes the bounding box.
     */
    _zoomToFit: function () {
        GrowthModeUtils.zoomToFit(this._layoutData, 'ThematicGrowth');
    },

    // =========================================================================
    // INTERNAL HELPERS
    // =========================================================================

    /**
     * Extract ordered trunk nodes from a school's layout data.
     * Trunk is identified by branches marked with isTrunk.
     * @private
     */
    _getTrunkNodes: function (school) {
        var trunkNodes = [];
        if (!school || !school.branches || !school.nodes) return trunkNodes;

        // Find the trunk branch
        var trunkBranch = null;
        for (var bi = 0; bi < school.branches.length; bi++) {
            if (school.branches[bi].isTrunk) {
                trunkBranch = school.branches[bi];
                break;
            }
        }
        if (!trunkBranch) return trunkNodes;

        var trunkIds = {};
        var trunkFormIds = trunkBranch.nodeFormIds || [];
        for (var ti = 0; ti < trunkFormIds.length; ti++) {
            trunkIds[trunkFormIds[ti]] = true;
        }

        // Collect matching nodes in layout order
        for (var ni = 0; ni < school.nodes.length; ni++) {
            if (trunkIds[school.nodes[ni].formId]) {
                trunkNodes.push(school.nodes[ni]);
            }
        }

        return trunkNodes;
    },

    // =========================================================================
    // EXTERNAL API
    // =========================================================================

    /**
     * Return a shallow copy of the current settings.
     * @returns {Object}
     */
    getSettings: function () {
        return GrowthModeUtils.shallowCopySettings(this.settings);
    }
};

// =============================================================================
// SELF-REGISTRATION
// =============================================================================

if (typeof TreeGrowth !== 'undefined') {
    TreeGrowth.registerMode('thematic', TreeGrowthThematic);
}
