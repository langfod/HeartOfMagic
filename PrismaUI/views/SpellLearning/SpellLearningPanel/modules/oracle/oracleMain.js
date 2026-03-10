/**
 * TreeGrowthOracle - Oracle Growth Mode Orchestrator
 *
 * Wires together OracleSettings, OracleLayout, and OracleRenderer to
 * provide the "ORACLE" tab in the Tree Growth section. Produces parallel
 * lane trees where each thematic chain runs as a separate lane, side by
 * side - like parallel railroad tracks, each chain being a track with
 * spells as stations.
 *
 * The C++ builder returns extra metadata: chains with names and
 * narratives, and each node has a `chain` property identifying which
 * chain it belongs to.
 *
 * Self-registers with TreeGrowth via registerMode().
 *
 * Depends on:
 *   oracleSettings.js   (OracleSettings)
 *   oracleLayout.js     (OracleLayout)
 *   oracleRenderer.js   (OracleRenderer)
 *   growthModeUtils.js   (GrowthModeUtils - shared lifecycle methods)
 *   treePreviewUtils.js  (TreePreviewUtils)
 *   treePreview.js       (TreePreview.getOutput)
 *   treeGrowth.js        (TreeGrowth - registers into it)
 */

var TreeGrowthOracle = {

    // =========================================================================
    // STATE
    // =========================================================================

    tabLabel: 'ORACLE',

    settings: {
        ghostOpacity: 35,
        nodeRadius: 5,
        chaos: 0,
        batchSize: 20,
        chainStyle: 'linear',
        showNarrative: false
    },

    _treeData: null,
    _layoutData: null,
    _positionMap: null,
    _hasSpells: false,

    // =========================================================================
    // TREE GROWTH MODE INTERFACE (required by TreeGrowth orchestrator)
    // =========================================================================

    /**
     * Build the settings panel HTML for Oracle mode.
     * @returns {string} HTML string
     */
    buildSettingsHTML: function () {
        return OracleSettings.buildHTML(this.settings);
    },

    /**
     * Bind DOM events for the settings panel.
     * Connects OracleSettings callbacks to internal methods.
     */
    bindEvents: function () {
        var self = this;

        OracleSettings.bindEvents({
            onSettingChanged: function (key, value) {
                self.settings[key] = value;
                // Layout-affecting settings: invalidate cached layout so it recomputes
                if (key === 'chaos' || key === 'chainStyle' || key === 'batchSize') {
                    if (self._treeData) {
                        self._layoutData = null; // triggers lazy re-layout on next render
                    }
                }
                TreeGrowth._markDirty();
            }
        });
    },

    /**
     * Render the Oracle Growth overlay onto the shared canvas.
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
            var lazyResult = GrowthModeUtils.tryLazyLayout(this, OracleLayout, OracleSettings, baseData, 'OracleGrowth');
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
        var showNarrative = this.settings.showNarrative;

        // 4. For each school, render chain lanes, edges, then nodes
        var schools = this._layoutData.schools;
        for (var schoolName in schools) {
            if (!schools.hasOwnProperty(schoolName)) continue;
            var school = schools[schoolName];
            var schoolNodes = school.nodes;

            // Build chain metadata and lane positions for this school
            var schoolTree = this._treeData.schools ? this._treeData.schools[schoolName] : null;
            var chainMeta = OracleLayout.buildChainMeta(schoolTree, school.color);
            var lanePositions = OracleLayout.buildLanePositions(schoolNodes);

            // Chain lane ribbons (underneath everything)
            OracleRenderer.renderChainLanes(ctx, cx, cy, chainMeta, lanePositions, opacity);

            // Edges
            OracleRenderer.renderEdges(ctx, cx, cy, schoolNodes, school.color, opacity);

            // Nodes on top
            OracleRenderer.renderNodes(ctx, cx, cy, schoolNodes, school.color, opacity, nodeR);

            // Root markers
            for (var i = 0; i < schoolNodes.length; i++) {
                if (schoolNodes[i].isRoot) {
                    OracleRenderer.renderRootMarker(
                        ctx,
                        cx + schoolNodes[i].x,
                        cy + schoolNodes[i].y,
                        school.color,
                        nodeR
                    );
                }
            }

            // Narrative labels (if enabled and chain data available)
            if (showNarrative && chainMeta.length > 0 && lanePositions.length > 0) {
                OracleRenderer.renderNarrativeLabels(ctx, cx, cy, chainMeta, lanePositions, opacity);
            }
        }
    },

    // =========================================================================
    // TREE BUILDING FLOW
    // =========================================================================

    /**
     * Build tree from scanned spells via C++ (ProceduralTreeGenerate)
     * with the oracle builder command.
     */
    buildTree: function () {
        var prep = GrowthModeUtils.prepareBuild(OracleSettings, 'Oracle', '_oracleGrowthBuildPending', 'tgBuildBtn');
        if (!prep) return;
        var spellsToProcess = prep.spellsToProcess;

        // Read LLM config from settings (written by OracleSettings UI)
        var llmApi = (typeof settings !== 'undefined' && settings.treeGeneration && settings.treeGeneration.llm_api)
            ? settings.treeGeneration.llm_api
            : {};

        var config = {
            chaos: this.settings.chaos / 100,
            batch_size: this.settings.batchSize,
            chain_style: this.settings.chainStyle,
            max_children_per_node: 4,
            seed: Math.floor(Math.random() * 100000),
            llm_api: llmApi,
            grid_hint: prep.gridHint
        };

        // Defer to let UI render progress modal before blocking on JSON.stringify
        setTimeout(function() {
            window.callCpp('ProceduralTreeGenerate', JSON.stringify({
                command: 'build_tree_oracle',
                spells: spellsToProcess,
                config: config
            }));
        }, 0);
    },

    /**
     * Receive tree data from the C++ backend callback.
     * Parses chain metadata, runs layout, and triggers a re-render.
     *
     * @param {Object} data - Raw tree structure from the backend, includes
     *                        schools[].chains[] with name/narrative metadata
     *                        and nodes[].chain identifying chain membership
     */
    loadTreeData: function (data) {
        this._treeData = data;
        this._layoutData = null;
        this._positionMap = null;
        console.log('[OracleGrowth] loadTreeData called, schools:', data && data.schools ? Object.keys(data.schools) : 'none');

        // Log chain metadata if present (Oracle-specific)
        if (data && data.schools) {
            for (var sn in data.schools) {
                if (!data.schools.hasOwnProperty(sn)) continue;
                var school = data.schools[sn];
                var chainCount = school.chains ? school.chains.length : 0;
                var nodeCount = school.nodes ? school.nodes.length : 0;
                console.log('[OracleGrowth] School "' + sn + '": ' + nodeCount + ' nodes, ' + chainCount + ' chains');
                if (school.chains) {
                    for (var ci = 0; ci < school.chains.length; ci++) {
                        var c = school.chains[ci];
                        console.log('[OracleGrowth]   Chain "' + (c.name || ci) + '": ' +
                            (c.nodes ? c.nodes.length : 0) + ' nodes' +
                            (c.narrative ? ' [narrative]' : ''));
                    }
                }
            }
        }

        this._layoutData = GrowthModeUtils.processLoadedTree(data, OracleLayout, OracleSettings, this.settings, 'OracleGrowth');
        GrowthModeUtils.zoomToFit(this._layoutData, 'OracleGrowth');
        TreeGrowth._markDirty();
    },

    /**
     * Save the current tree data to the game via C++ backend.
     * Bakes layout positions from _layoutData into the output JSON
     * so the spell tree viewer can render at exact positions.
     */
    applyTree: function () {
        this._positionMap = GrowthModeUtils.buildApplyOutput(
            this._treeData, this._layoutData, 'OracleGrowth', OracleSettings,
            function (srcNode, outNode) {
                if (srcNode.chain) outNode.chain = srcNode.chain;
            },
            function (schoolName, srcSchool, outSchool) {
                if (srcSchool.chains) outSchool.chains = srcSchool.chains;
            },
            null
        );
    },

    /**
     * Return the current layout position map (formId -> {x, y}) for preview rendering.
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

        OracleSettings.setTreeBuilt(false);
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
        GrowthModeUtils.zoomToFit(this._layoutData, 'OracleGrowth');
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
    TreeGrowth.registerMode('oracle', TreeGrowthOracle);
}
