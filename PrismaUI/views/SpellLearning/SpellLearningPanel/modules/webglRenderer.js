/**
 * WebGLRenderer Module - GPU-accelerated rendering for large spell trees
 * 
 * Uses WebGL 2.0 with instanced rendering for high performance.
 * Falls back to CanvasRenderer if WebGL is not available.
 * 
 * Depends on: TREE_CONFIG, settings, state, WebGLShaders, WebGLShapes
 */

var WebGLRenderer = {
    // WebGL context and canvas
    canvas: null,
    gl: null,
    container: null,
    
    // Label overlay canvas (for text)
    labelCanvas: null,
    labelCtx: null,
    
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
    
    // Interaction state
    isPanning: false,
    panStartX: 0,
    panStartY: 0,
    selectedNode: null,
    hoveredNode: null,
    
    // Spatial index for hit detection
    _nodeGrid: null,
    _gridCellSize: 50,
    
    // Performance
    _rafId: null,
    _needsRender: true,
    _needsLabelRender: true,
    _lastRenderTime: 0,
    
    // Node lookup
    _nodeMap: null,
    _nodeByFormId: null,
    
    // WebGL resources
    _programs: null,
    _shapeBuffers: null,
    _nodeInstanceBuffer: null,
    _nodeInstanceData: null,
    _edgeBuffer: null,
    _edgeColorBuffer: null,
    _hubBuffer: null,
    _dividerBuffer: null,
    
    // Cached counts
    _nodeCount: 0,
    _edgeVertexCount: 0,
    _visibleNodeCount: 0,
    
    // Dimensions
    _width: 0,
    _height: 0,
    
    // WebGL availability
    _webglAvailable: null,
    
    // =========================================================================
    // INITIALIZATION
    // =========================================================================
    
    /**
     * Initialize WebGL renderer
     * @param {HTMLElement} container
     * @returns {WebGLRenderer|null}
     */
    init: function(container) {
        this.container = container;
        
        // Check WebGL availability
        if (!this.checkWebGLSupport()) {
            console.warn('[WebGLRenderer] WebGL 2.0 not available, falling back to Canvas');
            return null;
        }
        
        // Create WebGL canvas
        if (!this.canvas) {
            this.canvas = document.createElement('canvas');
            this.canvas.id = 'tree-webgl';
            this.canvas.style.cssText = 'position: absolute; top: 0; left: 0; width: 100%; height: 100%; display: block;';
            
            // Get WebGL 2.0 context
            this.gl = this.canvas.getContext('webgl2', {
                alpha: true,
                antialias: true,
                premultipliedAlpha: false
            });
            
            if (!this.gl) {
                console.error('[WebGLRenderer] Failed to get WebGL 2.0 context');
                return null;
            }
            
            // Create label overlay canvas
            this.labelCanvas = document.createElement('canvas');
            this.labelCanvas.id = 'tree-webgl-labels';
            this.labelCanvas.style.cssText = 'position: absolute; top: 0; left: 0; width: 100%; height: 100%; pointer-events: none;';
            this.labelCtx = this.labelCanvas.getContext('2d');
            
            // Initialize shaders and buffers
            if (!this.initShaders()) {
                console.error('[WebGLRenderer] Failed to initialize shaders');
                return null;
            }
            
            this.initBuffers();
            this.setupEvents();
        }
        
        console.log('[WebGLRenderer] Initialized with container:', container ? container.id : 'null');
        return this;
    },
    
    /**
     * Check if WebGL 2.0 is supported
     * @returns {boolean}
     */
    checkWebGLSupport: function() {
        if (this._webglAvailable !== null) {
            return this._webglAvailable;
        }
        
        try {
            var testCanvas = document.createElement('canvas');
            var gl = testCanvas.getContext('webgl2');
            this._webglAvailable = !!gl;
            
            if (gl) {
                // Check for instanced rendering support (core in WebGL 2.0)
                var ext = gl.getExtension('ANGLE_instanced_arrays');
                // WebGL 2.0 has instancing built-in, no extension needed
                console.log('[WebGLRenderer] WebGL 2.0 available, max texture size:', gl.getParameter(gl.MAX_TEXTURE_SIZE));
            }
        } catch (e) {
            this._webglAvailable = false;
        }
        
        return this._webglAvailable;
    },
    
    /**
     * Initialize shader programs
     * @returns {boolean}
     */
    initShaders: function() {
        var gl = this.gl;
        
        this._programs = {};
        
        // Node shader program
        this._programs.node = WebGLShaders.createProgram(gl, WebGLShaders.nodeVertex, WebGLShaders.nodeFragment);
        if (!this._programs.node) return false;
        
        this._programs.nodeUniforms = WebGLShaders.getUniformLocations(gl, this._programs.node, 
            ['u_viewMatrix', 'u_resolution']);
        this._programs.nodeAttribs = WebGLShaders.getAttribLocations(gl, this._programs.node,
            ['a_shapeVertex', 'a_position', 'a_size', 'a_color', 'a_state']);
        
        // Edge shader program
        this._programs.edge = WebGLShaders.createProgram(gl, WebGLShaders.edgeVertex, WebGLShaders.edgeFragment);
        if (!this._programs.edge) return false;
        
        this._programs.edgeUniforms = WebGLShaders.getUniformLocations(gl, this._programs.edge,
            ['u_viewMatrix', 'u_resolution']);
        this._programs.edgeAttribs = WebGLShaders.getAttribLocations(gl, this._programs.edge,
            ['a_position', 'a_color']);
        
        // Hub shader program
        this._programs.hub = WebGLShaders.createProgram(gl, WebGLShaders.hubVertex, WebGLShaders.hubFragment);
        if (!this._programs.hub) return false;
        
        this._programs.hubUniforms = WebGLShaders.getUniformLocations(gl, this._programs.hub,
            ['u_viewMatrix', 'u_resolution', 'u_color']);
        this._programs.hubAttribs = WebGLShaders.getAttribLocations(gl, this._programs.hub,
            ['a_position']);
        
        console.log('[WebGLRenderer] Shaders compiled successfully');
        return true;
    },
    
    /**
     * Initialize vertex buffers
     */
    initBuffers: function() {
        var gl = this.gl;
        
        // Create shape template buffers
        this._shapeBuffers = WebGLShapes.createShapeBuffers(gl);
        
        // Create center hub buffer (filled circle, radius 45)
        var hubVertices = WebGLShapes.createFilledCircle(45, 32);
        this._hubBuffer = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, this._hubBuffer);
        gl.bufferData(gl.ARRAY_BUFFER, hubVertices, gl.STATIC_DRAW);
        this._hubVertexCount = hubVertices.length / 2;
        
        // Node instance buffer (will be filled in setData)
        this._nodeInstanceBuffer = gl.createBuffer();
        
        // Edge buffer (will be filled in setData)
        this._edgeBuffer = gl.createBuffer();
        this._edgeColorBuffer = gl.createBuffer();
        
        // School divider buffer (will be created in setData based on school count)
        this._dividerBuffer = gl.createBuffer();
        
        console.log('[WebGLRenderer] Buffers initialized');
    },
    
    // =========================================================================
    // EVENT HANDLING
    // =========================================================================
    
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
        
        window.addEventListener('resize', function() {
            self.updateCanvasSize();
        });
    },
    
    onMouseDown: function(e) {
        if (e.button === 0 || e.button === 2) {
            this.isPanning = true;
            this.panStartX = e.clientX - this.panX;
            this.panStartY = e.clientY - this.panY;
            this.canvas.style.cursor = 'grabbing';
            this._needsRender = true;
        }
    },
    
    onMouseMove: function(e) {
        if (this.isPanning) {
            this.panX = e.clientX - this.panStartX;
            this.panY = e.clientY - this.panStartY;
            this._needsRender = true;
            this._needsLabelRender = true;
        } else {
            // Hover detection
            var rect = this.canvas.getBoundingClientRect();
            var world = this.screenToWorld(e.clientX - rect.left, e.clientY - rect.top);
            var node = this.findNodeAt(world.x, world.y);
            
            if (node !== this.hoveredNode) {
                this.hoveredNode = node;
                this.canvas.style.cursor = node ? 'pointer' : 'grab';
                this._needsRender = true;
                
                if (node && typeof WheelRenderer !== 'undefined' && WheelRenderer.showTooltip) {
                    WheelRenderer.showTooltip(node, e);
                } else if (typeof WheelRenderer !== 'undefined' && WheelRenderer.hideTooltip) {
                    WheelRenderer.hideTooltip();
                }
            }
        }
    },
    
    onMouseUp: function(e) {
        this.isPanning = false;
        this.canvas.style.cursor = this.hoveredNode ? 'pointer' : 'grab';
        this._needsRender = true;
    },
    
    onWheel: function(e) {
        var zoomFactor = e.deltaY < 0 ? 1.1 : 0.9;
        var newZoom = this.zoom * zoomFactor;
        newZoom = Math.max(0.1, Math.min(5, newZoom));
        
        // Zoom toward mouse position
        var rect = this.canvas.getBoundingClientRect();
        var mouseX = e.clientX - rect.left - rect.width / 2;
        var mouseY = e.clientY - rect.top - rect.height / 2;
        
        this.panX = mouseX - (mouseX - this.panX) * (newZoom / this.zoom);
        this.panY = mouseY - (mouseY - this.panY) * (newZoom / this.zoom);
        this.zoom = newZoom;
        
        this._needsRender = true;
        this._needsLabelRender = true;
        
        var zoomEl = document.getElementById('zoom-level');
        if (zoomEl) zoomEl.textContent = Math.round(this.zoom * 100) + '%';
    },
    
    onClick: function(e) {
        var rect = this.canvas.getBoundingClientRect();
        var world = this.screenToWorld(e.clientX - rect.left, e.clientY - rect.top);
        var clickedNode = this.findNodeAt(world.x, world.y);
        
        if (clickedNode) {
            this.selectedNode = clickedNode;
            this._needsRender = true;
            
            console.log('[WebGLRenderer] Node clicked:', clickedNode.name || clickedNode.id);
            
            this.handleNodeClickRotation(clickedNode);
            
            if (typeof WheelRenderer !== 'undefined' && WheelRenderer.onNodeClick) {
                WheelRenderer.onNodeClick(clickedNode);
            }
        } else {
            if (this.selectedNode) {
                this.selectedNode = null;
                this._needsRender = true;
            }
        }
    },
    
    // =========================================================================
    // COORDINATE TRANSFORMS
    // =========================================================================
    
    screenToWorld: function(screenX, screenY) {
        var rotRad = this.rotation * Math.PI / 180;
        return ViewTransform.screenToWorld(screenX, screenY, this.panX, this.panY, this.zoom, rotRad, this._width, this._height);
    },
    
    /**
     * Create the view transformation matrix (3x3)
     * @returns {Float32Array}
     */
    createViewMatrix: function() {
        var cx = this._width / 2;
        var cy = this._height / 2;
        var rotRad = this.rotation * Math.PI / 180;
        var cos = Math.cos(rotRad);
        var sin = Math.sin(rotRad);
        var z = this.zoom;
        
        // Combined matrix: translate to center, apply pan, rotate, scale
        // Matrix is column-major for WebGL
        return new Float32Array([
            z * cos,  z * sin, 0,
            -z * sin, z * cos, 0,
            cx + this.panX, cy + this.panY, 1
        ]);
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
        
        // Update GPU buffers
        this.updateNodeBuffer();
        this.updateEdgeBuffer();
        this.updateDividerBuffer();
        
        this._needsRender = true;
        this._needsLabelRender = true;
        
        console.log('[WebGLRenderer] Data set:', this.nodes.length, 'nodes,', this.edges.length, 'edges');
    },
    
    _computeSchoolAngles: function() {
        var schoolNames = Object.keys(this.schools);
        if (schoolNames.length === 0) return;
        
        var sliceAngle = 360 / schoolNames.length;
        
        for (var i = 0; i < schoolNames.length; i++) {
            var name = schoolNames[i];
            if (!this.schools[name].startAngle) {
                this.schools[name].startAngle = i * sliceAngle - 90;
                this.schools[name].angleSpan = sliceAngle;
            }
        }
    },
    
    buildSpatialIndex: function() {
        this._spatialIndex = SpatialIndex.build(this.nodes, this._gridCellSize);
    },

    findNodeAt: function(worldX, worldY) {
        return SpatialIndex.findAt(this._spatialIndex, worldX, worldY, function(n) {
            return n.state === 'unlocked' ? 14 : 10;
        });
    }
};

// Export
window.WebGLRenderer = WebGLRenderer;
