/**
 * WheelRenderer Core - SVG Radial Tree Rendering (Core + State)
 * Base object declaration with state properties, init, data management, and LOD helpers.
 *
 * Depends on:
 * - config.js (TREE_CONFIG, GRID_CONFIG)
 * - shapeProfiles.js (SHAPE_PROFILES, getShapeProfile)
 * - layoutEngine.js (LayoutEngine) - optional
 * - settings, state, SpellCache, TreeParser, GROWTH_DSL
 *
 * Extended by: wheelLayout.js, wheelRender.js, wheelChrome.js, wheelInteraction.js, wheelGrowthDSL.js
 */

var WheelRenderer = {
    svg: null,
    wheelGroup: null,
    spokesLayer: null,
    edgesLayer: null,
    nodesLayer: null,
    debugGridLayer: null,  // Debug grid visualization layer
    showDebugGrid: false,  // Toggle for debug grid
    centerHub: null,
    nodes: [],
    edges: [],
    schools: {},
    nodeElements: new Map(),
    edgeElements: new Map(),
    rotation: 0,
    zoom: 1,
    panX: 0,
    panY: 0,
    isAnimating: false,
    isPanning: false,
    panStartX: 0,
    panStartY: 0,
    selectedNode: null,

    // Performance optimization state
    _edgePathCache: {},
    _viewportUpdatePending: false,
    _lastViewportUpdate: 0,
    _lodLevel: 'full',
    _visibleNodes: new Set(),
    _renderedNodes: new Set(),  // Tracks which nodes have DOM elements
    _renderedEdges: new Set(),  // Tracks which edges have DOM elements
    _layoutCalculated: false,
    _nodeMap: null,  // O(1) node lookup by ID
    _delegatedEventsSetup: false,
    _svgEventsSetup: false,  // Guard for SVG event listeners
    _virtualizeThreshold: 200,  // Use virtualization above this node count (lowered for better perf)
    _viewportPadding: 150,      // Extra padding to prevent pop-in
    _ultraLightThreshold: 800,  // Ultra-light mode for massive trees
    _rafPending: false,         // RAF throttle for pan
    _pendingPanX: 0,
    _pendingPanY: 0,

    // Growth recipes per school
    growthRecipes: {},

    // School configs from C++ NLP (shape, density, etc.)
    schoolConfigs: {},

    // LLM-enhanced themed groups (with colors)
    llmGroups: {},

    // Node-to-group mapping for color overrides
    nodeGroupMap: {},

    // Visual shape modifiers - FALLBACK ONLY when shapeProfiles.js not loaded
    // Prefer using getShapeProfile() from shapeProfiles.js (unified source)
    shapeVisualModifiers: {
        organic: {
            radiusJitter: 0.20,      // Noticeable radius variation
            angleJitter: 12,         // Flowing angle jitter (degrees)
            tierSpacingMult: 0.9,    // Slightly compact
            spreadMult: 0.95,        // Fill pie slice well
            fillPieSlice: true,      // Ensure nodes fill the slice
            curveEdges: true
        },
        spiky: {
            radiusJitter: 0.35,      // DRAMATIC radius changes
            angleJitter: 20,         // Sharp angular spikes
            tierSpacingMult: 1.4,    // Elongated outward
            spreadMult: 0.6,         // Narrow spikes
            fillPieSlice: false,     // Let spikes poke out
            curveEdges: false
        },
        radial: {
            radiusJitter: 0.08,      // Very uniform
            angleJitter: 3,          // Evenly spread
            tierSpacingMult: 0.85,   // Compact tiers
            spreadMult: 1.0,         // Full pie usage
            fillPieSlice: true,
            curveEdges: true
        },
        mountain: {
            radiusJitter: 0.20,
            angleJitter: 15,         // More scatter to fill space
            tierSpacingMult: 0.6,    // Very compressed tiers = nodes packed vertically
            spreadMult: 1.0,         // Use full pie width
            fillPieSlice: true,
            curveEdges: true,
            taperSpread: true,       // Narrows toward tips
            taperAmount: 0.4,        // How much to narrow (0.4 = 40% width at peak)
            fillTriangle: true       // Special flag: distribute nodes to fill triangular area
        },
        cloud: {
            radiusJitter: 0.30,      // Clustered groupings
            angleJitter: 18,         // Irregular
            tierSpacingMult: 1.0,
            spreadMult: 0.85,
            fillPieSlice: true,
            curveEdges: true,
            clusterNodes: true
        },
        cascade: {
            radiusJitter: 0.06,
            angleJitter: 4,
            tierSpacingMult: 1.3,    // Clear tier separation
            spreadMult: 1.0,
            fillPieSlice: true,
            curveEdges: false
        },
        linear: {
            radiusJitter: 0.05,
            angleJitter: 2,
            tierSpacingMult: 1.1,
            spreadMult: 0.5,         // Narrow focused beam
            fillPieSlice: false,     // Intentionally narrow
            curveEdges: true
        },
        grid: {
            radiusJitter: 0.0,       // Perfect grid
            angleJitter: 0,
            tierSpacingMult: 0.95,
            spreadMult: 1.0,
            fillPieSlice: true,
            curveEdges: false
        }
    },

    // Toggle for strict pie slice containment
    strictPieSlices: true,

    init: function(svgElement) {
        this.svg = svgElement;
        this.wheelGroup = svgElement.querySelector('#wheel-group');
        this.spokesLayer = svgElement.querySelector('#spokes-layer');
        this.edgesLayer = svgElement.querySelector('#edges-layer');
        this.nodesLayer = svgElement.querySelector('#nodes-layer');
        this.centerHub = svgElement.querySelector('#center-hub');
        this._edgePathCache = {};

        // Create debug grid layer (behind edges)
        this.debugGridLayer = document.createElementNS('http://www.w3.org/2000/svg', 'g');
        this.debugGridLayer.setAttribute('id', 'debug-grid-layer');
        this.debugGridLayer.style.display = 'none';
        if (this.edgesLayer && this.edgesLayer.parentNode) {
            this.edgesLayer.parentNode.insertBefore(this.debugGridLayer, this.edgesLayer);
        }

        this.setupEvents();
    },

    // Toggle debug grid visibility
    toggleDebugGrid: function() {
        this.showDebugGrid = !this.showDebugGrid;
        if (this.debugGridLayer) {
            this.debugGridLayer.style.display = this.showDebugGrid ? 'block' : 'none';
        }
        console.log('[WheelRenderer] Debug grid:', this.showDebugGrid ? 'ON' : 'OFF');
        if (this.showDebugGrid) {
            this.renderDebugGrid();
        }
        return this.showDebugGrid;
    },

    // Render debug grid showing all candidate positions
    renderDebugGrid: function() {
        if (!this.debugGridLayer) return;

        // Clear existing
        while (this.debugGridLayer.firstChild) {
            this.debugGridLayer.removeChild(this.debugGridLayer.firstChild);
        }

        // Get layout config - Use unified source from config.js
        var gridCfg = GRID_CONFIG.getComputedConfig();
        var nodeSize = gridCfg.nodeSize;
        var baseRadius = gridCfg.baseRadius;
        var tierSpacing = gridCfg.tierSpacing;
        var arcSpacing = gridCfg.arcSpacing;
        var maxTiers = gridCfg.maxTiers;

        // Get school slices (match wheelRenderer sector calculation with padding)
        var numSchools = 5;
        var schoolPadding = TREE_CONFIG.wheel.schoolPadding || 5;
        var totalPadding = numSchools * schoolPadding;
        var availableAngle = 360 - totalPadding;
        var sliceAngle = availableAngle / numSchools;

        var colors = ['#ff6666', '#66ff66', '#6666ff', '#ffff66', '#ff66ff'];

        console.log('[DebugGrid] Rendering with tierSpacing=' + tierSpacing + ', arcSpacing=' + arcSpacing);

        for (var schoolIdx = 0; schoolIdx < numSchools; schoolIdx++) {
            var startAngle = schoolIdx * (sliceAngle + schoolPadding) - 90;
            var endAngle = startAngle + sliceAngle;
            var color = colors[schoolIdx];

            // Draw sector boundary lines
            var startRad = startAngle * Math.PI / 180;
            var endRad = endAngle * Math.PI / 180;
            var outerRadius = baseRadius + maxTiers * tierSpacing;

            // Start boundary
            var line1 = document.createElementNS('http://www.w3.org/2000/svg', 'line');
            line1.setAttribute('x1', 0);
            line1.setAttribute('y1', 0);
            line1.setAttribute('x2', Math.cos(startRad) * outerRadius);
            line1.setAttribute('y2', Math.sin(startRad) * outerRadius);
            line1.setAttribute('stroke', color);
            line1.setAttribute('stroke-width', '1');
            line1.setAttribute('stroke-opacity', '0.3');
            this.debugGridLayer.appendChild(line1);

            // End boundary
            var line2 = document.createElementNS('http://www.w3.org/2000/svg', 'line');
            line2.setAttribute('x1', 0);
            line2.setAttribute('y1', 0);
            line2.setAttribute('x2', Math.cos(endRad) * outerRadius);
            line2.setAttribute('y2', Math.sin(endRad) * outerRadius);
            line2.setAttribute('stroke', color);
            line2.setAttribute('stroke-width', '1');
            line2.setAttribute('stroke-opacity', '0.3');
            this.debugGridLayer.appendChild(line2);

            // Draw grid points for this school
            for (var tier = 0; tier < maxTiers; tier++) {
                var radius = baseRadius + tier * tierSpacing;

                // Calculate arc length and candidate count
                var arcLength = (sliceAngle / 360) * 2 * Math.PI * radius;
                var candidateCount = Math.max(3, Math.floor(arcLength / arcSpacing));

                // Draw tier arc
                var arc = document.createElementNS('http://www.w3.org/2000/svg', 'path');
                var arcStartX = Math.cos(startRad) * radius;
                var arcStartY = Math.sin(startRad) * radius;
                var arcEndX = Math.cos(endRad) * radius;
                var arcEndY = Math.sin(endRad) * radius;
                var largeArc = sliceAngle > 180 ? 1 : 0;
                arc.setAttribute('d', 'M ' + arcStartX + ' ' + arcStartY +
                                     ' A ' + radius + ' ' + radius + ' 0 ' + largeArc + ' 1 ' +
                                     arcEndX + ' ' + arcEndY);
                arc.setAttribute('stroke', color);
                arc.setAttribute('stroke-width', '0.5');
                arc.setAttribute('stroke-opacity', '0.2');
                arc.setAttribute('fill', 'none');
                this.debugGridLayer.appendChild(arc);

                // Draw candidate positions as small circles
                var usableAngle = sliceAngle * 0.85;  // Match layoutGenerator
                var angleStep = candidateCount > 1 ? usableAngle / (candidateCount - 1) : 0;
                var centerAngle = startAngle + sliceAngle / 2;
                var halfSpread = usableAngle / 2;

                for (var i = 0; i < candidateCount; i++) {
                    var angle = candidateCount === 1
                        ? centerAngle
                        : (centerAngle - halfSpread + i * angleStep);
                    var rad = angle * Math.PI / 180;
                    var x = Math.cos(rad) * radius;
                    var y = Math.sin(rad) * radius;

                    var dot = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
                    dot.setAttribute('cx', x);
                    dot.setAttribute('cy', y);
                    dot.setAttribute('r', 4);
                    dot.setAttribute('fill', color);
                    dot.setAttribute('fill-opacity', '0.5');
                    this.debugGridLayer.appendChild(dot);
                }
            }
        }

        console.log('[DebugGrid] Rendered grid points');
    },

    // Store school configs from C++ NLP for visual rendering
    setSchoolConfigs: function(configs) {
        this.schoolConfigs = configs || {};
        console.log('[WheelRenderer] School configs loaded:', Object.keys(this.schoolConfigs));
        for (var school in this.schoolConfigs) {
            var cfg = this.schoolConfigs[school];
            console.log('[WheelRenderer]   ' + school + ': shape=' + cfg.shape +
                ', density=' + (cfg.density || 0.6).toFixed(2));
        }
    },

    // Store LLM-enhanced groups for color overrides
    setLLMGroups: function(groups) {
        this.llmGroups = groups || {};
        this.nodeGroupMap = {}; // Will be populated during node processing
        console.log('[WheelRenderer] LLM groups loaded:', Object.keys(this.llmGroups));
        for (var groupKey in this.llmGroups) {
            var grp = this.llmGroups[groupKey];
            console.log('[WheelRenderer]   ' + groupKey + ': name="' + (grp.group_name || grp.original_theme) +
                '", color=' + (grp.group_color || '#888') + ', style=' + (grp.growth_style || 'default'));
        }
    },

    // Get visual modifier for a school based on its shape config
    // Uses unified SHAPE_PROFILES from shapeProfiles.js when available
    getSchoolVisualModifier: function(schoolName) {
        var cfg = this.schoolConfigs[schoolName];
        var shape = cfg ? cfg.shape : 'organic';

        // Use unified shapeProfiles.js module when available (preferred)
        var modifier;
        if (typeof getShapeProfile === 'function') {
            modifier = getShapeProfile(shape);
        } else {
            // Fallback to inline definitions (backwards compatibility)
            modifier = this.shapeVisualModifiers[shape] || this.shapeVisualModifiers.organic;
        }

        // Get config values with defaults
        var density = cfg ? (cfg.density || 0.6) : 0.6;
        var symmetry = cfg ? (cfg.symmetry || 0.3) : 0.3;
        var convergence = cfg ? (cfg.convergence_chance || 0.4) : 0.4;

        // DRAMATIC scaling based on density and symmetry
        // Low density = more jitter/spread, High density = compact/uniform
        var densityFactor = 1.5 - density;  // 0.3 density -> 1.2x jitter, 0.9 density -> 0.6x jitter
        var symmetryFactor = 1 - symmetry * 0.8;  // High symmetry = less randomness

        return {
            // Jitter scales inversely with density (sparse = more random)
            radiusJitter: modifier.radiusJitter * densityFactor * symmetryFactor,
            angleJitter: modifier.angleJitter * densityFactor * symmetryFactor,

            // Tier spacing: low density = spread out, high density = compact
            tierSpacingMult: modifier.tierSpacingMult * (0.6 + density * 0.8),

            // Spread: fill pie slice based on density (low = narrow, high = wide)
            spreadMult: modifier.spreadMult * (0.5 + density * 0.7),

            // Pass through shape-specific flags
            curveEdges: modifier.curveEdges,
            taperSpread: modifier.taperSpread || false,
            clusterNodes: modifier.clusterNodes || false,
            fillPieSlice: modifier.fillPieSlice !== false,
            fillTriangle: modifier.fillTriangle || false,
            taperAmount: modifier.taperAmount || 0.4,

            // Config values for reference
            symmetry: symmetry,
            density: density,
            convergence: convergence,
            shape: shape
        };
    },

    // Get full group settings for a node (if it belongs to an LLM-enhanced group)
    getNodeGroup: function(node) {
        if (!node || !node.school) return null;

        var nodeName = (node.name || '').toLowerCase();
        var nodeTheme = (node.theme || '').toLowerCase();

        for (var groupKey in this.llmGroups) {
            var grp = this.llmGroups[groupKey];
            if (grp.school !== node.school) continue;

            var theme = (grp.original_theme || '').toLowerCase();
            if (theme && (nodeName.indexOf(theme) >= 0 || nodeTheme.indexOf(theme) >= 0)) {
                return grp;
            }
        }
        return null;
    },

    // Get group color for a node (if it belongs to an LLM-enhanced group)
    getNodeGroupColor: function(node) {
        var grp = this.getNodeGroup(node);
        return grp ? (grp.group_color || null) : null;
    },

    // Apply group visual modifiers to a node's position
    applyGroupModifiers: function(node, baseRadius, baseAngle, spokeAngle) {
        var grp = this.getNodeGroup(node);
        if (!grp) return { radius: baseRadius, angle: baseAngle };

        var radius = baseRadius;
        var angle = baseAngle;

        // Apply radius offset from group
        if (grp.radius_offset) {
            radius += grp.radius_offset;
        }

        // Apply angle spread from group
        if (grp.angle_spread && grp.angle_spread !== 1.0) {
            var angleFromSpoke = baseAngle - spokeAngle;
            angle = spokeAngle + (angleFromSpoke * grp.angle_spread);
        }

        return { radius: radius, angle: angle };
    },

    getLOD: function() {
        if (this.zoom > 0.8) return 'full';
        if (this.zoom > 0.4) return 'simple';
        return 'minimal';
    },

    getViewportBounds: function() {
        if (!this.svg) return null;
        var rect = this.svg.getBoundingClientRect();
        var invZoom = 1 / this.zoom;
        var halfW = (rect.width / 2) * invZoom;
        var halfH = (rect.height / 2) * invZoom;
        var worldCenterX = -this.panX * invZoom;
        var worldCenterY = -this.panY * invZoom;

        // Scale padding with inverse zoom for consistent coverage
        // Tighter viewport for ultra-light mode
        var basePadding = this._lodLevel === 'ultralight' ? 50 : this._viewportPadding;
        var padding = basePadding * invZoom;

        return {
            left: worldCenterX - halfW,
            right: worldCenterX + halfW,
            top: worldCenterY - halfH,
            bottom: worldCenterY + halfH,
            paddedLeft: worldCenterX - halfW - padding,
            paddedRight: worldCenterX + halfW + padding,
            paddedTop: worldCenterY - halfH - padding,
            paddedBottom: worldCenterY + halfH + padding
        };
    },

    isNodeInViewport: function(node, bounds) {
        if (!bounds) return true;
        return node.x >= bounds.paddedLeft &&
               node.x <= bounds.paddedRight &&
               node.y >= bounds.paddedTop &&
               node.y <= bounds.paddedBottom;
    },

    setupEvents: function() {
        var self = this;

        // Guard against duplicate event listeners (memory leak prevention)
        if (this._svgEventsSetup) {
            return;
        }
        this._svgEventsSetup = true;

        this.svg.addEventListener('contextmenu', function(e) { e.preventDefault(); });
        this.svg.addEventListener('mousedown', function(e) { self.onMouseDown(e); });
        this.svg.addEventListener('mousemove', function(e) { self.onMouseMove(e); });
        this.svg.addEventListener('mouseup', function(e) { self.onMouseUp(e); });
        this.svg.addEventListener('mouseleave', function(e) { self.onMouseUp(e); });
        this.svg.addEventListener('wheel', function(e) { self.onWheel(e); }, { passive: false });

        // Event delegation for nodes (instead of per-node listeners)
        if (!this._delegatedEventsSetup) {
            this._delegatedEventsSetup = true;

            this.nodesLayer.addEventListener('click', function(e) {
                var nodeEl = e.target.closest('.spell-node, .mystery-node');
                if (nodeEl) {
                    e.stopPropagation();
                    var nodeId = nodeEl.getAttribute('data-id');
                    var node = self._nodeMap ? self._nodeMap.get(nodeId) : null;
                    if (node) self.onNodeClick(node);
                }
            });

            this.nodesLayer.addEventListener('mouseenter', function(e) {
                var nodeEl = e.target.closest('.spell-node, .mystery-node');
                if (nodeEl) {
                    var nodeId = nodeEl.getAttribute('data-id');
                    var node = self._nodeMap ? self._nodeMap.get(nodeId) : null;
                    if (node) self.showTooltip(node, e);
                }
            }, true);

            this.nodesLayer.addEventListener('mouseleave', function(e) {
                var nodeEl = e.target.closest('.spell-node, .mystery-node');
                if (nodeEl) {
                    self.hideTooltip();
                }
            }, true);
        }
    },

    setData: function(nodes, edges, schools) {
        this.nodes = nodes;
        this.edges = edges;
        this.schools = schools;

        // Build O(1) lookup maps for nodes
        this._nodeMap = new Map();
        this._nodeByFormId = new Map();
        for (var i = 0; i < nodes.length; i++) {
            var node = nodes[i];
            this._nodeMap.set(node.id, node);
            if (node.formId) {
                this._nodeByFormId.set(node.formId, node);
            }
        }

        this._edgePathCache = {};
        this._layoutCalculated = false;
        this._visibleNodes.clear();

        if (typeof detectAllSchools === 'function') {
            detectAllSchools(nodes);
        }
        if (typeof updateSchoolColorPickerUI === 'function') {
            updateSchoolColorPickerUI();
        }

        this.layout();

        this.render();
        this.centerView();
    }
};
