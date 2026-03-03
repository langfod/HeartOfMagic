/**
 * CanvasRenderer Core - Canvas 2D Tree Rendering (Core + State)
 * Base object declaration with state properties, init, data management,
 * spatial index, coordinate transforms, and pan/zoom setup.
 *
 * Depends on:
 * - config.js (TREE_CONFIG, GRID_CONFIG)
 * - shapeProfiles.js (SHAPE_PROFILES, getShapeProfile)
 * - settings, state
 *
 * Extended by: canvasRender.js, canvasNodes.js, canvasInteraction.js, canvasSearch.js
 */

var CanvasRenderer = {
    canvas: null,
    ctx: null,
    container: null,

    // Data
    nodes: [],
    edges: [],
    schools: {},

    // Transform state
    zoom: 1,
    panX: 0,
    panY: 0,
    rotation: 0,
    isAnimating: false,
    noRotate: false,

    // Interaction state
    isPanning: false,
    panStartX: 0,
    panStartY: 0,
    selectedNode: null,
    hoveredNode: null,

    // Spatial index for hit detection
    _nodeGrid: null,
    _gridCellSize: 50,

    // LOD (Level of Detail) - zoom-based rendering tiers
    _lodTier: 'full',        // 'full' | 'simple' | 'minimal'
    _activeDpr: 0,           // Current effective DPR (for tier-transition resize)
    _nodeBuckets: null,      // { 'school|state': [node, ...] } for batched minimal rendering
    _cachedDividerGradients: null,  // Cached CanvasGradient objects for school dividers
    _dividerCacheKey: '',    // String key to detect when divider settings change

    // Performance
    _rafId: null,
    _needsRender: true,
    _animationOnlyRender: false,  // True when only animations need update (can be throttled)
    _lastRenderTime: 0,
    _logNextRender: false,
    _pendingPanX: 0,
    _pendingPanY: 0,
    _panRafPending: false,

    // Node lookup
    _nodeMap: null,
    _nodeByFormId: null,

    // Discovery mode visibility
    _discoveryVisibleIds: null,

    // Dimensions
    _width: 0,
    _height: 0,

    // Cached DOM elements
    _zoomLevelEl: null,

    // Debug grid
    showDebugGrid: false,

    // Heartbeat animation for central hub (configurable via settings)
    _heartbeatPhase: 0,
    _heartbeatSpeed: 0.2,   // Radians per frame (default 0.2)
    _heartPulseDelay: 5.0,  // Time (in seconds) between pulse groups (default 5s)
    _heartAnimationEnabled: true,
    _heartBgOpacity: 1.0,
    _heartBgColor: '#000000',
    _bgColor: '#000000',
    _heartRingColor: '#b8a878',
    _learningPathColor: '#00ffff',
    _globeBgFill: true,

    // Learning path animation (glowing line from center to newly learned spell)
    _learningPath: null,       // { nodeId, path: [{x,y}...], progress: 0-1, startTime, color }
    _learningPathDuration: 1200,  // ms for the path to animate
    _learningPathAnimationComplete: true,  // Static path only shows after animation
    _animatingPathNodes: null,    // Set of node IDs in the CURRENTLY ANIMATING path only

    // Persistent learning state - tracks which nodes are being learned
    _learningNodeIds: null,       // Set of node IDs currently in learning state
    _learningPathNodes: null,     // Set of all node IDs along paths to learning nodes

    // Traveling pulse particles along learning paths
    _learningPulses: [],          // Array of {x, y, progress, pathIndex, speed}
    _lastHeartbeatPulse: false,   // Track heartbeat state for pulse spawning
    _learningPathSegments: [],    // Cached path segments [{from:{x,y}, to:{x,y}, nodeId}...]
    _learningPulseSpeed: 0.015,   // Default pulse travel speed (configurable)
    _learningPulseSize: 4,        // Default pulse size (configurable)

    // 3D Globe (uses Globe3D module)
    _globeEnabled: true,

    // Starfield background (uses Starfield module)
    _starfieldEnabled: true,
    _starfieldFixed: false,  // true = fixed to screen, false = moves with world
    _starfieldColor: '#ffffff',
    _starfieldDensity: 200,
    _starfieldMaxSize: 2.5,
    _starfieldSeed: 42,

    // =========================================================================
    // SELF-CONTAINED SCHOOL COLORS (no TREE_CONFIG dependency)
    // =========================================================================

    _defaultSchoolColors: {
        'Destruction': '#ef4444',
        'Restoration': '#facc15',
        'Alteration': '#22c55e',
        'Conjuration': '#a855f7',
        'Illusion': '#38bdf8'
    },

    /**
     * Get school color - checks settings first, then defaults
     * Replaces TREE_CONFIG.getSchoolColor()
     */
    _getSchoolColor: function(school) {
        if (typeof settings !== 'undefined' && settings.schoolColors && settings.schoolColors[school]) {
            return settings.schoolColors[school];
        }
        if (typeof getOrAssignSchoolColor === 'function') {
            return getOrAssignSchoolColor(school);
        }
        return this._defaultSchoolColors[school] || '#888888';
    },

    // =========================================================================
    // PATH2D CACHE - Pre-computed shapes for performance
    // =========================================================================

    _shapePaths: null,

    /**
     * Initialize Path2D cache for all school shapes
     * Called once at startup - shapes are reused for all nodes
     */
    _initShapePaths: function() {
        this._shapePaths = {};

        // Diamond - Destruction (aggressive, sharp)
        var diamond = new Path2D();
        diamond.moveTo(0, -1);
        diamond.lineTo(1, 0);
        diamond.lineTo(0, 1);
        diamond.lineTo(-1, 0);
        diamond.closePath();
        this._shapePaths['Destruction'] = diamond;

        // Circle - Restoration (healing, soft) - NOT oval!
        var circle = new Path2D();
        circle.arc(0, 0, 1, 0, Math.PI * 2);
        this._shapePaths['Restoration'] = circle;

        // Hexagon - Alteration (transformation)
        var hexagon = new Path2D();
        var hexW = 0.9;
        var hexH = 0.5;
        hexagon.moveTo(0, -1);
        hexagon.lineTo(hexW, -hexH);
        hexagon.lineTo(hexW, hexH);
        hexagon.lineTo(0, 1);
        hexagon.lineTo(-hexW, hexH);
        hexagon.lineTo(-hexW, -hexH);
        hexagon.closePath();
        this._shapePaths['Alteration'] = hexagon;

        // Pentagon - Conjuration (summoning, mystical)
        var pentagon = new Path2D();
        for (var i = 0; i < 5; i++) {
            var angle = (i * 72 - 90) * Math.PI / 180;
            var x = Math.cos(angle);
            var y = Math.sin(angle);
            if (i === 0) {
                pentagon.moveTo(x, y);
            } else {
                pentagon.lineTo(x, y);
            }
        }
        pentagon.closePath();
        this._shapePaths['Conjuration'] = pentagon;

        // Triangle - Illusion (tip pointing INWARD toward origin)
        // Since nodes are placed radially, "inward" means toward (0,0)
        // We draw a downward-pointing triangle, but it will be drawn at each node's position
        // pointing toward center due to how canvas coordinates work
        var triangle = new Path2D();
        triangle.moveTo(0, 1);       // Tip pointing down (toward origin when node is above center)
        triangle.lineTo(-0.85, -0.6); // Top-left
        triangle.lineTo(0.85, -0.6);  // Top-right
        triangle.closePath();
        this._shapePaths['Illusion'] = triangle;

        // Default circle for unknown schools
        this._shapePaths['default'] = circle;

        console.log('[CanvasRenderer] Path2D cache initialized for', Object.keys(this._shapePaths).length, 'shapes');
    },

    /**
     * Get cached Path2D for a school
     */
    _getShapePath: function(school) {
        return this._shapePaths[school] || this._shapePaths['default'];
    },

    // =========================================================================
    // LOD (Level of Detail) SYSTEM
    // =========================================================================

    /**
     * Compute LOD tier based on current zoom level.
     * Returns 'full', 'simple', or 'minimal'.
     * Forces 'full' when EditMode is active.
     */
    _computeLODTier: function() {
        // EditMode always needs full detail for accurate editing
        if (typeof EditMode !== 'undefined' && EditMode.isActive) {
            return 'full';
        }
        if (this.zoom >= 0.45) return 'full';
        if (this.zoom >= 0.25) return 'simple';
        return 'minimal';
    },

    /**
     * Build node buckets grouped by 'school|state' for batched minimal rendering.
     * Pre-caches school color on each node to avoid per-node lookups.
     */
    _buildNodeBuckets: function() {
        this._nodeBuckets = {};
        for (var i = 0; i < this.nodes.length; i++) {
            var node = this.nodes[i];
            var key = (node.school || 'unknown') + '|' + (node.state || 'locked');
            if (!this._nodeBuckets[key]) {
                this._nodeBuckets[key] = [];
            }
            this._nodeBuckets[key].push(node);
            // Pre-cache school color on node
            node._cachedSchoolColor = node.themeColor || this._getSchoolColor(node.school);
        }
    },

    // =========================================================================
    // INITIALIZATION
    // =========================================================================

    init: function(container) {
        this.container = container;

        // Initialize Path2D cache
        if (!this._shapePaths) {
            this._initShapePaths();
        }

        // Cache frequently-accessed DOM elements
        this._zoomLevelEl = document.getElementById('zoom-level');

        // Create canvas element if not already created
        if (!this.canvas) {
            this.canvas = document.createElement('canvas');
            this.canvas.id = 'tree-canvas';
            this.canvas.style.cssText = 'position: absolute; top: 0; left: 0; width: 100%; height: 100%; display: block; z-index: 1;';
            this.ctx = this.canvas.getContext('2d');

            this.setupEvents();
        }

        console.log('[CanvasRenderer] Initialized');
        return this;
    },

    updateCanvasSize: function() {
        if (!this.container || !this.canvas) return;

        var rect = this.container.getBoundingClientRect();
        var width = rect.width || 800;
        var height = rect.height || 600;
        var dpr = window.devicePixelRatio || 1;

        this.canvas.width = width * dpr;
        this.canvas.height = height * dpr;
        this.canvas.style.width = width + 'px';
        this.canvas.style.height = height + 'px';

        this.ctx.setTransform(1, 0, 0, 1, 0, 0);
        this.ctx.scale(dpr, dpr);

        this._width = width;
        this._height = height;
        this._needsRender = true;
    },

    setupEvents: function() {
        var self = this;

        this.canvas.addEventListener('mousedown', function(e) {
            self.onMouseDown(e);
        });

        this.canvas.addEventListener('mousemove', function(e) {
            self.onMouseMove(e);
        });

        this.canvas.addEventListener('mouseup', function(e) {
            self.onMouseUp(e);
        });

        this.canvas.addEventListener('mouseleave', function(e) {
            self.onMouseUp(e);
        });

        this.canvas.addEventListener('wheel', function(e) {
            e.preventDefault();
            self.onWheel(e);
        }, { passive: false });

        this.canvas.addEventListener('click', function(e) {
            self.onClick(e);
        });

        // Window resize handler
        window.addEventListener('resize', function() {
            self.updateCanvasSize();
        });

        // ResizeObserver for container size changes (more reliable than window resize)
        // This catches cases where the panel resizes without the window changing
        if (typeof ResizeObserver !== 'undefined' && this.container) {
            this._resizeObserver = new ResizeObserver(function(entries) {
                // Debounce resize updates
                if (self._resizeTimeout) {
                    clearTimeout(self._resizeTimeout);
                }
                self._resizeTimeout = setTimeout(function() {
                    self.updateCanvasSize();
                }, 50);
            });
            this._resizeObserver.observe(this.container);
        }
    },

    // =========================================================================
    // DATA MANAGEMENT
    // =========================================================================

    setData: function(nodes, edges, schools) {
        this.selectedNode = null;
        this.hoveredNode = null;
        this.rotation = 0;

        this.nodes = nodes || [];
        this.edges = edges || [];
        this.schools = schools || {};

        // Check if nodes need position calculation (all at center = no positions)
        var nodesNeedLayout = false;
        if (this.nodes.length > 0) {
            var nodesWithPositions = this.nodes.filter(function(n) {
                return (n.x !== 0 || n.y !== 0) || n._fromVisualFirst || n._fromLayoutEngine;
            }).length;
            nodesNeedLayout = nodesWithPositions < this.nodes.length * 0.1; // <10% have positions
            console.log('[CanvasRenderer] Position check: ' + nodesWithPositions + '/' + this.nodes.length + ' have positions, needLayout=' + nodesNeedLayout);
        }

        // If nodes don't have positions, use simple spiral layout as fallback
        if (nodesNeedLayout) {
            console.log('[CanvasRenderer] FALLBACK: Applying spiral layout for ' + this.nodes.length + ' nodes');
            this._applySpiralLayout();
        }

        // Build lookup maps
        this._nodeMap = new Map();
        this._nodeByFormId = new Map();
        for (var i = 0; i < this.nodes.length; i++) {
            var node = this.nodes[i];
            this._nodeMap.set(node.id, node);
            if (node.formId) {
                this._nodeByFormId.set(node.formId, node);
                this._nodeMap.set(node.formId, node);
            }
        }

        this.buildSpatialIndex();
        this._computeSchoolAngles();
        this._buildDiscoveryVisibility();
        this._buildLearningPaths();
        this._buildNodeBuckets();

        this._needsRender = true;
        this._logNextRender = true;

        console.log('[CanvasRenderer] Data set:', this.nodes.length, 'nodes,', this.edges.length, 'edges');
    },

    _computeSchoolAngles: function() {
        var schoolNames = Object.keys(this.schools);
        if (schoolNames.length === 0) return;

        var self = this;
        var numSchools = schoolNames.length;
        var sliceAngle = 360 / numSchools;

        // Build a lookup map { schoolName: [nodes] } once — O(n) instead of
        // O(n * numSchools) from repeated .filter() calls per school
        var schoolNodeMap = {};
        var i;
        for (i = 0; i < schoolNames.length; i++) {
            schoolNodeMap[schoolNames[i]] = [];
        }
        for (i = 0; i < this.nodes.length; i++) {
            var n = this.nodes[i];
            if (n.school && schoolNodeMap[n.school]) {
                schoolNodeMap[n.school].push(n);
            }
        }

        // DATA-DRIVEN: Derive sector centers from actual root node positions
        // This ensures dividers always align with nodes regardless of generation formula
        for (i = 0; i < schoolNames.length; i++) {
            var name = schoolNames[i];
            var school = self.schools[name];

            // Skip if already set from external data
            if (school.spokeAngle !== undefined && school.startAngle !== undefined) {
                continue;
            }

            var allSchoolNodes = schoolNodeMap[name];

            // Find root node(s) for this school from pre-built lookup
            var rootNodes = [];
            var j;
            for (j = 0; j < allSchoolNodes.length; j++) {
                if (allSchoolNodes[j].isRoot) {
                    rootNodes.push(allSchoolNodes[j]);
                }
            }

            // Fallback: find node closest to center
            if (rootNodes.length === 0 && allSchoolNodes.length > 0) {
                var closest = allSchoolNodes[0];
                var closestDist = closest.x * closest.x + closest.y * closest.y;
                for (j = 1; j < allSchoolNodes.length; j++) {
                    var dist = allSchoolNodes[j].x * allSchoolNodes[j].x + allSchoolNodes[j].y * allSchoolNodes[j].y;
                    if (dist < closestDist) {
                        closest = allSchoolNodes[j];
                        closestDist = dist;
                    }
                }
                rootNodes = [closest];
            }

            if (rootNodes.length > 0) {
                // Average angle of all root nodes = sector center
                var sumSin = 0, sumCos = 0;
                for (j = 0; j < rootNodes.length; j++) {
                    var a = Math.atan2(rootNodes[j].y, rootNodes[j].x);
                    sumSin += Math.sin(a);
                    sumCos += Math.cos(a);
                }
                var avgAngle = Math.atan2(sumSin, sumCos) * 180 / Math.PI;

                school.spokeAngle = avgAngle;
                school.startAngle = avgAngle - sliceAngle / 2;
                school.endAngle = avgAngle + sliceAngle / 2;
                school.angleSpan = sliceAngle;
            } else {
                // No nodes at all — fallback to even distribution
                var startAngle = i * sliceAngle - 90;
                school.startAngle = startAngle;
                school.endAngle = startAngle + sliceAngle;
                school.angleSpan = sliceAngle;
                school.spokeAngle = startAngle + sliceAngle / 2;
            }
        }
    },

    /**
     * Simple spiral fallback layout for nodes without pre-baked positions.
     * Groups nodes by school, places roots around the center, spirals children outward.
     */
    _applySpiralLayout: function() {
        var schoolNames = Object.keys(this.schools);
        if (schoolNames.length === 0) {
            // No schools: simple spiral for all nodes
            var spacing = 55;
            for (var i = 0; i < this.nodes.length; i++) {
                var angle = i * 2.4;  // golden angle approximation
                var radius = 100 + i * spacing * 0.15;
                this.nodes[i].x = Math.cos(angle) * radius;
                this.nodes[i].y = Math.sin(angle) * radius;
            }
            return;
        }

        var numSchools = schoolNames.length;
        var sliceAngle = (2 * Math.PI) / numSchools;
        var self = this;

        // Build parent lookup from edges
        var childrenOf = {};
        for (var e = 0; e < this.edges.length; e++) {
            var edge = this.edges[e];
            if (!childrenOf[edge.from]) childrenOf[edge.from] = [];
            childrenOf[edge.from].push(edge.to);
        }

        schoolNames.forEach(function(name, schoolIdx) {
            var school = self.schools[name];
            var schoolNodes = self.nodes.filter(function(n) { return n.school === name; });
            if (schoolNodes.length === 0) return;

            var baseAngle = schoolIdx * sliceAngle - Math.PI / 2;
            var baseRadius = 100;
            var tierSpacing = 55;
            var arcSpread = sliceAngle * 0.7;

            // BFS from root(s)
            var rootId = school.root;
            var rootNode = rootId ? schoolNodes.find(function(n) { return n.id === rootId || n.formId === rootId; }) : null;
            if (!rootNode) rootNode = schoolNodes[0];

            // Place root
            rootNode.x = Math.cos(baseAngle) * baseRadius;
            rootNode.y = Math.sin(baseAngle) * baseRadius;

            var placed = new Set([rootNode.id]);
            var queue = [{ node: rootNode, depth: 0 }];
            var depthCounters = {};

            while (queue.length > 0) {
                var item = queue.shift();
                var parentNode = item.node;
                var depth = item.depth + 1;
                var radius = baseRadius + depth * tierSpacing;

                var kids = childrenOf[parentNode.id] || [];
                if (kids.length === 0 && parentNode.formId) {
                    kids = childrenOf[parentNode.formId] || [];
                }

                if (!depthCounters[depth]) depthCounters[depth] = 0;

                for (var k = 0; k < kids.length; k++) {
                    var childId = kids[k];
                    if (placed.has(childId)) continue;

                    var childNode = schoolNodes.find(function(n) { return n.id === childId || n.formId === childId; });
                    if (!childNode) continue;

                    var idx = depthCounters[depth]++;
                    var totalAtDepth = Math.max(kids.length, 3);
                    var angleOffset = (idx - (totalAtDepth - 1) / 2) * (arcSpread / Math.max(totalAtDepth - 1, 1));
                    childNode.x = Math.cos(baseAngle + angleOffset) * radius;
                    childNode.y = Math.sin(baseAngle + angleOffset) * radius;

                    placed.add(childNode.id);
                    queue.push({ node: childNode, depth: depth });
                }
            }

            // Place any unplaced nodes (orphans) in a spiral within the school sector
            var orphanIdx = 0;
            schoolNodes.forEach(function(n) {
                if (!placed.has(n.id)) {
                    var oAngle = baseAngle + (orphanIdx * 0.5 - arcSpread / 2);
                    var oRadius = baseRadius + 200 + orphanIdx * 30;
                    n.x = Math.cos(oAngle) * oRadius;
                    n.y = Math.sin(oAngle) * oRadius;
                    orphanIdx++;
                }
            });
        });

        console.log('[CanvasRenderer] Spiral layout applied to ' + this.nodes.length + ' nodes');
    },

    /**
     * Build discovery mode visibility set
     * Shows: unlocked, available, and locked nodes ONE STEP from available/unlocked
     */
    _buildDiscoveryVisibility: function() {
        if (!settings.discoveryMode || settings.cheatMode) {
            this._discoveryVisibleIds = null;
            return;
        }

        var visible = new Set();
        var availableOrUnlockedIds = new Set();

        // First pass: collect unlocked, learning, and available nodes
        for (var i = 0; i < this.nodes.length; i++) {
            var node = this.nodes[i];
            if (node.state === 'unlocked' || node.state === 'learning' || node.state === 'available') {
                visible.add(node.id);
                if (node.formId) visible.add(node.formId);
                availableOrUnlockedIds.add(node.id);
                if (node.formId) availableOrUnlockedIds.add(node.formId);
            }
        }

        // Second pass: find locked nodes ONE STEP away from visible
        for (var i = 0; i < this.edges.length; i++) {
            var edge = this.edges[i];
            var fromVisible = availableOrUnlockedIds.has(edge.from);
            var toVisible = availableOrUnlockedIds.has(edge.to);

            if (fromVisible && !toVisible) {
                visible.add(edge.to);
            }
            if (toVisible && !fromVisible) {
                visible.add(edge.from);
            }
        }

        this._discoveryVisibleIds = visible;
    },

    buildSpatialIndex: function() {
        this._nodeGrid = {};

        for (var i = 0; i < this.nodes.length; i++) {
            var node = this.nodes[i];
            var cellX = Math.floor(node.x / this._gridCellSize);
            var cellY = Math.floor(node.y / this._gridCellSize);
            var key = cellX + ',' + cellY;

            if (!this._nodeGrid[key]) {
                this._nodeGrid[key] = [];
            }
            this._nodeGrid[key].push(node);
        }
    },

    // =========================================================================
    // COORDINATE TRANSFORMS
    // =========================================================================

    screenToWorld: function(screenX, screenY) {
        var cx = this._width / 2;
        var cy = this._height / 2;

        var x = (screenX - cx - this.panX) / this.zoom;
        var y = (screenY - cy - this.panY) / this.zoom;

        // Undo rotation
        var rotRad = -this.rotation * Math.PI / 180;
        var cos = Math.cos(rotRad);
        var sin = Math.sin(rotRad);
        var worldX = x * cos - y * sin;
        var worldY = x * sin + y * cos;

        return { x: worldX, y: worldY };
    }
};
