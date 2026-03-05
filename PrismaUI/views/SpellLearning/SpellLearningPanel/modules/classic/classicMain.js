/**
 * TreeGrowthClassic — Classic Growth Mode Orchestrator
 *
 * Wires together ClassicSettings, ClassicLayout, and ClassicRenderer to
 * provide the "CLASSIC" tab in the Tree Growth section. Manages tree build
 * state, delegates rendering to ClassicRenderer, and communicates with the
 * C++ backend via window.callCpp for tree building and saving.
 *
 * Self-registers with TreeGrowth via registerMode().
 *
 * Depends on:
 *   classicSettings.js  (ClassicSettings)
 *   classicLayout*.js   (ClassicLayout — core, grid, spell modules)
 *   classicRenderer.js  (ClassicRenderer)
 *   treePreviewUtils.js (TreePreviewUtils)
 *   treePreview.js      (TreePreview.getOutput)
 *   treeGrowth.js       (TreeGrowth — registers into it)
 */

var TreeGrowthClassic = {

    // =========================================================================
    // STATE
    // =========================================================================

    settings: {
        ghostOpacity: 35,
        nodeRadius: 5,
        spread: 50,
        radialBias: 50,
        centerMask: 3,
        spellMatching: 'layered',
        dynamicGridExpansion: true,  // Expand grid when schools run out of space
        tierZones: {
            Novice:     { min: 0,  max: 40 },
            Apprentice: { min: 10, max: 55 },
            Adept:      { min: 30, max: 75 },
            Expert:     { min: 50, max: 90 },
            Master:     { min: 65, max: 100 }
        }
    },

    _treeData: null,
    _layoutData: null,
    _hasSpells: false,

    // =========================================================================
    // TREE GROWTH MODE INTERFACE (required by TreeGrowth orchestrator)
    // =========================================================================

    /**
     * Build the settings panel HTML for Classic mode.
     * @returns {string} HTML string
     */
    buildSettingsHTML: function () {
        return ClassicSettings.buildHTML(this.settings);
    },

    /**
     * Bind DOM events for the settings panel.
     * Connects ClassicSettings callbacks to internal methods.
     */
    bindEvents: function () {
        var self = this;

        ClassicSettings.bindEvents({
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
                if (key === 'spread' || key === 'radialBias' || key === 'centerMask' || key === 'spellMatching') {
                    if (self._treeData) {
                        self._layoutData = null; // triggers lazy re-layout on next render
                    }
                }
                TreeGrowth._markDirty();
            },
            onTierZoneChanged: function (tier, min, max) {
                if (!self.settings.tierZones) self.settings.tierZones = {};
                self.settings.tierZones[tier] = { min: min, max: max };
                if (self._treeData) {
                    self._layoutData = null; // triggers re-layout
                }
                TreeGrowth._markDirty();
            }
        });
    },

    /**
     * Render the Classic Growth overlay onto the shared canvas.
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

        // 1b. Draw globe mask ring (non-root exclusion zone around globe)
        if (this.settings.centerMask > 0 && baseData.grid) {
            var maskR = this.settings.centerMask * (baseData.grid.tierSpacing || 30);
            var globeOff = (typeof TreeCore !== 'undefined' && TreeCore.getOutput)
                ? TreeCore.getOutput() : { x: 0, y: 0 };
            var mcx = w / 2 + globeOff.x;
            var mcy = h / 2 + globeOff.y;
            ctx.save();
            ctx.beginPath();
            ctx.arc(mcx, mcy, maskR, 0, Math.PI * 2);
            ctx.strokeStyle = 'rgba(255, 60, 60, 0.25)';
            ctx.lineWidth = 1.5;
            ctx.setLineDash([4, 4]);
            ctx.stroke();
            ctx.fillStyle = 'rgba(255, 60, 60, 0.04)';
            ctx.fill();
            ctx.restore();
        }

        // 2. Lazy layout: if we have tree data but no layout yet, try now
        if (this._treeData && (!this._layoutData || !this._layoutData.schools)) {
            var lazyResult = GrowthModeUtils.tryLazyLayout(this, ClassicLayout, ClassicSettings, baseData, 'ClassicGrowth');
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

        // 3. For each school, render edges then nodes
        var schools = this._layoutData.schools;
        for (var schoolName in schools) {
            if (!schools.hasOwnProperty(schoolName)) continue;
            var school = schools[schoolName];

            // Edges first (underneath)
            ClassicRenderer.renderEdges(ctx, cx, cy, school.nodes, school.color, opacity);

            // Nodes on top
            ClassicRenderer.renderNodes(ctx, cx, cy, school.nodes, school.color, opacity, nodeR);

            // Root markers
            for (var i = 0; i < school.nodes.length; i++) {
                if (school.nodes[i].isRoot) {
                    ClassicRenderer.renderRootMarker(
                        ctx,
                        cx + school.nodes[i].x,
                        cy + school.nodes[i].y,
                        school.color,
                        nodeR
                    );
                }
            }
        }

        // 4. Draw per-school tier zone arcs (visual debug overlay)
        // Each school has its own tree height, so zone rings differ per school.
        var zi = this._layoutData.zoneInfo;
        if (zi && this.settings.tierZones) {
            var tierVis = [
                { key: 'Novice',     color: 'rgba(100,180,100,' },
                { key: 'Apprentice', color: 'rgba(80,150,200,' },
                { key: 'Adept',      color: 'rgba(180,160,80,' },
                { key: 'Expert',     color: 'rgba(200,120,60,' },
                { key: 'Master',     color: 'rgba(180,60,60,' }
            ];

            ctx.save();
            for (var zSchoolName in schools) {
                if (!schools.hasOwnProperty(zSchoolName)) continue;
                var zSchool = schools[zSchoolName];
                var treeMaxR = zSchool.treeMaxRadius || 0;
                var growRange = treeMaxR - zi.ringRadius;
                if (growRange < 1) continue;

                // Determine angular span for this school from its root nodes
                var zNodes = zSchool.nodes || [];
                var avgAngle = 0;
                var rootCount = 0;
                for (var zni = 0; zni < zNodes.length; zni++) {
                    if (zNodes[zni].isRoot) {
                        avgAngle += Math.atan2(zNodes[zni].y, zNodes[zni].x);
                        rootCount++;
                    }
                }
                if (rootCount === 0) continue;
                avgAngle /= rootCount;

                // Draw zone arcs as 60-degree wedge centered on school direction
                var arcSpan = Math.PI / 3; // 60 degrees
                var arcStart = avgAngle - arcSpan / 2;
                var arcEnd = avgAngle + arcSpan / 2;

                for (var tvi = 0; tvi < tierVis.length; tvi++) {
                    var tv = tierVis[tvi];
                    var zone = this.settings.tierZones[tv.key];
                    if (!zone) continue;

                    var innerR = zi.ringRadius + (zone.min / 100) * growRange;
                    var outerR = zi.ringRadius + (zone.max / 100) * growRange;

                    // Outer boundary arc
                    ctx.beginPath();
                    ctx.arc(cx, cy, outerR, arcStart, arcEnd);
                    ctx.strokeStyle = tv.color + '0.3)';
                    ctx.lineWidth = 1;
                    ctx.setLineDash([3, 4]);
                    ctx.stroke();

                    // Inner boundary arc
                    ctx.beginPath();
                    ctx.arc(cx, cy, innerR, arcStart, arcEnd);
                    ctx.strokeStyle = tv.color + '0.2)';
                    ctx.lineWidth = 1;
                    ctx.stroke();

                    // Label at the midpoint of the outer arc
                    if (tvi === 0 || tvi === 4) { // Only label Novice and Master to avoid clutter
                        ctx.setLineDash([]);
                        var labelAngle = avgAngle;
                        var labelR = outerR + 6;
                        ctx.font = '8px sans-serif';
                        ctx.fillStyle = tv.color + '0.5)';
                        ctx.textAlign = 'center';
                        ctx.textBaseline = 'middle';
                        ctx.fillText(tv.key, cx + Math.cos(labelAngle) * labelR, cy + Math.sin(labelAngle) * labelR);
                    }
                }
            }
            ctx.setLineDash([]);
            ctx.restore();
        }
    },

    // =========================================================================
    // TREE BUILDING FLOW
    // =========================================================================

    /**
     * Build tree from scanned spells via C++ (ProceduralTreeGenerate)
     * with JS fallback if C++ bridge is unavailable.
     */
    buildTree: function () {
        var prep = GrowthModeUtils.prepareBuild(ClassicSettings, 'Classic', '_classicGrowthBuildPending', 'tgClassicBuildBtn');
        if (!prep) return;
        var spellsToProcess = prep.spellsToProcess;
        var gridHint = prep.gridHint;

        var config = {
            shape: 'organic',
            density: 0.6,
            symmetry: 0.3,
            max_children_per_node: 3,
            top_themes_per_school: 8,
            convergence_chance: 0.4,
            prefer_vanilla_roots: true,
            tier_zones: TreeGrowthClassic.settings.tierZones,
            grid_hint: gridHint,
            selected_roots: typeof TreePreview !== 'undefined' ? TreePreview._flattenSelectedRoots() : {}
        };

        // Defer to let UI render progress modal before blocking on JSON.stringify
        setTimeout(function() {
            window.callCpp('ProceduralTreeGenerate', JSON.stringify({
                command: 'build_tree_classic',
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
        console.log('[ClassicGrowth] loadTreeData called, schools:', data && data.schools ? Object.keys(data.schools) : 'none');
        this._layoutData = GrowthModeUtils.processLoadedTree(data, ClassicLayout, ClassicSettings, this.settings, 'ClassicGrowth');
        GrowthModeUtils.zoomToFit(this._layoutData, 'ClassicGrowth');
        TreeGrowth._markDirty();
    },

    /**
     * Save the current tree data to the game via C++ backend.
     * Bakes layout positions from _layoutData into the output JSON
     * so the spell tree viewer can render at exact positions.
     */
    applyTree: function () {
        GrowthModeUtils.buildApplyOutput(
            this._treeData, this._layoutData, 'ClassicGrowth', ClassicSettings,
            null, null, null
        );
    },

    /**
     * Return the current layout position map (formId → {x, y}) for preview rendering.
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

        ClassicSettings.setTreeBuilt(false);
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
        GrowthModeUtils.zoomToFit(this._layoutData, 'ClassicGrowth');
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
    TreeGrowth.registerMode('classic', TreeGrowthClassic);
}
