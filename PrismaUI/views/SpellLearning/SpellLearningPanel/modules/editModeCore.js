/**
 * Edit Mode -- Core
 * Core infrastructure for the edit mode system: state, toolbar,
 * mode switching, event handler management, undo stack, and
 * mouse event dispatch to the active tool.
 *
 * Depends on:
 * - modules/canvasRenderer.js (CanvasRenderer)
 * - modules/config.js (GRID_CONFIG)
 * - modules/state.js (state)
 *
 * Exports (global):
 * - EditMode
 */

var EditMode = {
    // =========================================================================
    // STATE
    // =========================================================================

    // Mode state
    isActive: false,
    currentTool: 'move', // 'move', 'pen', 'eraser'

    // Move tool state
    isDragging: false,
    draggedNode: null,
    draggedGlobe: null,
    dragStartX: 0,
    dragStartY: 0,
    originalNodeX: 0,
    originalNodeY: 0,
    originalGlobeX: 0,
    originalGlobeY: 0,

    // Pen tool state
    penStartNode: null,
    penCurrentX: 0,
    penCurrentY: 0,
    isPenDrawing: false,

    // Eraser tool state
    isErasing: false,
    eraserPath: [], // Array of {x, y} points

    // Cached grid positions for snapping
    gridPositions: [],

    // Undo stack (max 5 entries)
    undoStack: [],
    maxUndoSize: 5,

    // References to original handlers
    _originalOnMouseDown: null,
    _originalOnMouseMove: null,
    _originalOnMouseUp: null,
    _originalOnClick: null,
    _keydownHandler: null,

    // Spawn menu state
    spawnPosition: null,
    allSpells: [],
    spellsLoaded: false,

    // =========================================================================
    // INIT & TOOLBAR
    // =========================================================================

    /**
     * Initialize edit mode (call once on page load)
     */
    init: function() {
        var btn = document.getElementById('edit-tree-btn');
        if (!btn) {
            console.warn('[EditMode] Button not found');
            return;
        }

        var self = this;
        btn.addEventListener('click', function(e) {
            e.stopPropagation();
            self.toggle();
        });

        // Tool button handlers
        var moveBtn = document.getElementById('edit-tool-move');
        var penBtn = document.getElementById('edit-tool-pen');
        var eraserBtn = document.getElementById('edit-tool-eraser');

        if (moveBtn) {
            moveBtn.addEventListener('click', function(e) {
                e.stopPropagation();
                self.selectTool('move');
            });
        }
        if (penBtn) {
            penBtn.addEventListener('click', function(e) {
                e.stopPropagation();
                self.selectTool('pen');
            });
        }
        if (eraserBtn) {
            eraserBtn.addEventListener('click', function(e) {
                e.stopPropagation();
                self.selectTool('eraser');
            });
        }

        console.log('[EditMode] Initialized');
    },

    /**
     * Select a tool
     */
    selectTool: function(tool) {
        this.currentTool = tool;

        // Update button states
        var buttons = document.querySelectorAll('.edit-tool');
        buttons.forEach(function(btn) {
            btn.classList.remove('active');
        });

        var activeBtn = document.getElementById('edit-tool-' + tool);
        if (activeBtn) {
            activeBtn.classList.add('active');
        }

        // Update cursor
        if (typeof CanvasRenderer !== 'undefined' && CanvasRenderer.canvas) {
            if (tool === 'move') {
                CanvasRenderer.canvas.style.cursor = 'grab';
            } else if (tool === 'pen') {
                CanvasRenderer.canvas.style.cursor = 'crosshair';
            } else if (tool === 'eraser') {
                CanvasRenderer.canvas.style.cursor = 'not-allowed';
            }
        }

        console.log('[EditMode] Tool selected:', tool);
    },

    // =========================================================================
    // MODE SWITCHING
    // =========================================================================

    /**
     * Toggle edit mode on/off
     */
    toggle: function() {
        if (this.isActive) {
            this.deactivate();
        } else {
            this.activate();
        }
        return this.isActive;
    },

    /**
     * Activate edit mode
     */
    activate: function() {
        if (this.isActive) return;
        this.isActive = true;

        // Update button appearance
        var btn = document.getElementById('edit-tree-btn');
        if (btn) {
            btn.textContent = '\u2713';
            btn.title = t('editMode.exitEditMode');
            btn.classList.add('active');
        }

        // Show edit tools
        var editTools = document.getElementById('edit-tools');
        if (editTools) {
            editTools.style.display = 'inline-flex';
        }

        // Select move tool by default
        this.selectTool('move');

        // Show debug grid
        if (typeof CanvasRenderer !== 'undefined') {
            CanvasRenderer.showDebugGrid = true;
            CanvasRenderer._needsRender = true;
        }

        // Build grid positions for snapping
        this.buildGridPositions();

        // Override canvas event handlers
        this.installEventHandlers();

        // Install keyboard handler for Ctrl+Z undo
        this.installKeyboardHandler();

        // Clear undo stack on fresh activation
        this.undoStack = [];

        console.log('[EditMode] Activated');
    },

    /**
     * Deactivate edit mode
     */
    deactivate: function() {
        if (!this.isActive) return;
        this.isActive = false;

        // Update button appearance
        var btn = document.getElementById('edit-tree-btn');
        if (btn) {
            btn.textContent = '\u270E';
            btn.title = t('editMode.editTree');
            btn.classList.remove('active');
        }

        // Hide edit tools
        var editTools = document.getElementById('edit-tools');
        if (editTools) {
            editTools.style.display = 'none';
        }

        // Hide debug grid and rebuild discovery visibility
        if (typeof CanvasRenderer !== 'undefined') {
            CanvasRenderer.showDebugGrid = false;
            CanvasRenderer._buildDiscoveryVisibility();
            CanvasRenderer._needsRender = true;
        }

        // Restore original event handlers
        this.uninstallEventHandlers();

        // Remove keyboard handler
        this.uninstallKeyboardHandler();

        // Clear all tool states
        this.isDragging = false;
        this.draggedNode = null;
        this.isPenDrawing = false;
        this.penStartNode = null;
        this.isErasing = false;
        this.eraserPath = [];

        // Refresh details panel to re-apply reveal rules
        if (state.selectedNode && typeof showSpellDetails === 'function') {
            showSpellDetails(state.selectedNode);
        }

        console.log('[EditMode] Deactivated');
    },

    // =========================================================================
    // GRID BUILDING
    // =========================================================================

    /**
     * Build array of all valid grid positions for snapping
     */
    buildGridPositions: function() {
        this.gridPositions = [];
        var spacing = 50;
        var extent = 1300;
        for (var gx = -extent; gx <= extent; gx += spacing) {
            for (var gy = -extent; gy <= extent; gy += spacing) {
                this.gridPositions.push({ x: gx, y: gy });
            }
        }
        console.log('[EditMode] Built ' + this.gridPositions.length + ' square grid positions');
    },

    /**
     * Find the nearest empty grid position to a given point
     */
    findNearestEmptyGridPosition: function(x, y, excludeNode) {
        var minDist = Infinity;
        var nearest = null;

        var occupiedPositions = new Set();
        if (CanvasRenderer.nodes) {
            for (var i = 0; i < CanvasRenderer.nodes.length; i++) {
                var node = CanvasRenderer.nodes[i];
                if (node !== excludeNode) {
                    var key = Math.round(node.x) + ',' + Math.round(node.y);
                    occupiedPositions.add(key);
                }
            }
        }

        for (var i = 0; i < this.gridPositions.length; i++) {
            var pos = this.gridPositions[i];
            var key = Math.round(pos.x) + ',' + Math.round(pos.y);
            if (occupiedPositions.has(key)) continue;
            var dx = pos.x - x;
            var dy = pos.y - y;
            var dist = dx * dx + dy * dy;
            if (dist < minDist) {
                minDist = dist;
                nearest = pos;
            }
        }
        return nearest;
    },

    /**
     * Find the nearest grid position to a given point (regardless of occupancy)
     */
    findNearestGridPosition: function(x, y) {
        var minDist = Infinity;
        var nearest = null;
        for (var i = 0; i < this.gridPositions.length; i++) {
            var pos = this.gridPositions[i];
            var dx = pos.x - x;
            var dy = pos.y - y;
            var dist = dx * dx + dy * dy;
            if (dist < minDist) {
                minDist = dist;
                nearest = pos;
            }
        }
        return nearest;
    },

    // =========================================================================
    // EVENT HANDLER MANAGEMENT
    // =========================================================================

    /**
     * Install custom event handlers
     */
    installEventHandlers: function() {
        if (typeof CanvasRenderer === 'undefined' || !CanvasRenderer.canvas) return;
        var self = this;
        // Store original handlers
        this._originalOnMouseDown = CanvasRenderer.onMouseDown.bind(CanvasRenderer);
        this._originalOnMouseMove = CanvasRenderer.onMouseMove.bind(CanvasRenderer);
        this._originalOnMouseUp = CanvasRenderer.onMouseUp.bind(CanvasRenderer);
        this._originalOnClick = CanvasRenderer.onClick.bind(CanvasRenderer);
        // Override with edit mode handlers
        CanvasRenderer.onMouseDown = function(e) { self.handleMouseDown(e); };
        CanvasRenderer.onMouseMove = function(e) { self.handleMouseMove(e); };
        CanvasRenderer.onMouseUp = function(e) { self.handleMouseUp(e); };
        CanvasRenderer.onClick = function(e) { self.handleClick(e); };
    },

    /**
     * Restore original event handlers
     */
    uninstallEventHandlers: function() {
        if (typeof CanvasRenderer === 'undefined') return;
        if (this._originalOnMouseDown) CanvasRenderer.onMouseDown = this._originalOnMouseDown;
        if (this._originalOnMouseMove) CanvasRenderer.onMouseMove = this._originalOnMouseMove;
        if (this._originalOnMouseUp) CanvasRenderer.onMouseUp = this._originalOnMouseUp;
        if (this._originalOnClick) CanvasRenderer.onClick = this._originalOnClick;
        this._originalOnMouseDown = null;
        this._originalOnMouseMove = null;
        this._originalOnMouseUp = null;
        this._originalOnClick = null;
    },

    /**
     * Install keyboard handler for Ctrl+Z undo
     */
    installKeyboardHandler: function() {
        var self = this;
        this._keydownHandler = function(e) {
            if (e.ctrlKey && e.key === 'z' && self.isActive) {
                e.preventDefault();
                self.undo();
            }
        };
        document.addEventListener('keydown', this._keydownHandler);
    },

    /**
     * Remove keyboard handler
     */
    uninstallKeyboardHandler: function() {
        if (this._keydownHandler) {
            document.removeEventListener('keydown', this._keydownHandler);
            this._keydownHandler = null;
        }
    },

    // =========================================================================
    // UNDO SYSTEM
    // =========================================================================

    /**
     * Push an action to the undo stack
     * @param {Object} action - { type, data }
     */
    pushUndo: function(action) {
        this.undoStack.push(action);
        if (this.undoStack.length > this.maxUndoSize) {
            this.undoStack.shift(); // Remove oldest
        }
        console.log('[EditMode] Undo stack size:', this.undoStack.length);
    },

    /**
     * Undo the last action
     */
    undo: function() {
        if (this.undoStack.length === 0) {
            console.log('[EditMode] Nothing to undo');
            if (typeof setTreeStatus === 'function') {
                setTreeStatus(t('editMode.nothingToUndo'));
            }
            return;
        }

        var action = this.undoStack.pop();
        console.log('[EditMode] Undoing:', action.type);

        switch (action.type) {
            case 'move':
                this._undoMove(action.data);
                break;
            case 'moveGlobe':
                this._undoMoveGlobe(action.data);
                break;
            case 'addPrereq':
                this._undoAddPrereq(action.data);
                break;
            case 'removePrereq':
                this._undoRemovePrereq(action.data);
                break;
            case 'togglePrereqType':
                this._undoTogglePrereqType(action.data);
                break;
            case 'updateSoftNeeded':
                this._undoUpdateSoftNeeded(action.data);
                break;
        }

        if (typeof setTreeStatus === 'function') {
            setTreeStatus(t('editMode.undoAction', {action: action.type}));
        }
    },

    _undoMove: function(data) {
        var node = CanvasRenderer._nodeMap ? CanvasRenderer._nodeMap.get(data.nodeId) : null;
        if (node) {
            node.x = data.oldX;
            node.y = data.oldY;
            this.syncNodePositionToRawData(node);
            this.saveTree();
            CanvasRenderer._needsRender = true;
            CanvasRenderer.buildSpatialIndex();
        }
    },

    _undoMoveGlobe: function(data) {
        var globe = (state.treeData && state.treeData.globe);
        if (globe) {
            globe.x = data.oldX;
            globe.y = data.oldY;
            this.syncGlobePositionToRawData();
            this.saveTree();
            CanvasRenderer._needsRender = true;
        }
    },

    _undoAddPrereq: function(data) {
        var toNode = CanvasRenderer._nodeMap ? CanvasRenderer._nodeMap.get(data.toId) : null;
        var fromNode = CanvasRenderer._nodeMap ? CanvasRenderer._nodeMap.get(data.fromId) : null;
        if (toNode) {
            if (toNode.prerequisites) {
                var idx = toNode.prerequisites.indexOf(data.fromId);
                if (idx !== -1) toNode.prerequisites.splice(idx, 1);
            }
            if (toNode.hardPrereqs) {
                var idx = toNode.hardPrereqs.indexOf(data.fromId);
                if (idx !== -1) toNode.hardPrereqs.splice(idx, 1);
            }
            if (toNode.softPrereqs) {
                var idx = toNode.softPrereqs.indexOf(data.fromId);
                if (idx !== -1) toNode.softPrereqs.splice(idx, 1);
            }
        }
        if (fromNode && fromNode.children) {
            var idx = fromNode.children.indexOf(data.toId);
            if (idx !== -1) fromNode.children.splice(idx, 1);
        }
        if (CanvasRenderer.edges) {
            for (var i = CanvasRenderer.edges.length - 1; i >= 0; i--) {
                var e = CanvasRenderer.edges[i];
                if (e.from === data.fromId && e.to === data.toId) {
                    CanvasRenderer.edges.splice(i, 1);
                }
            }
        }
        this.syncPrerequisitesToRawData();
        this.saveTree();
        CanvasRenderer._needsRender = true;
        if (toNode && state.selectedNode && (state.selectedNode.formId === toNode.formId || state.selectedNode.id === toNode.id)) {
            if (typeof showSpellDetails === 'function') showSpellDetails(toNode);
        }
    },

    _undoRemovePrereq: function(data) {
        var toNode = CanvasRenderer._nodeMap ? CanvasRenderer._nodeMap.get(data.toId) : null;
        var fromNode = CanvasRenderer._nodeMap ? CanvasRenderer._nodeMap.get(data.fromId) : null;
        if (toNode) {
            if (!toNode.prerequisites) toNode.prerequisites = [];
            if (toNode.prerequisites.indexOf(data.fromId) === -1) {
                toNode.prerequisites.push(data.fromId);
            }
            if (data.wasHard) {
                if (!toNode.hardPrereqs) toNode.hardPrereqs = [];
                if (toNode.hardPrereqs.indexOf(data.fromId) === -1) {
                    toNode.hardPrereqs.push(data.fromId);
                }
            } else {
                if (!toNode.softPrereqs) toNode.softPrereqs = [];
                if (toNode.softPrereqs.indexOf(data.fromId) === -1) {
                    toNode.softPrereqs.push(data.fromId);
                }
            }
        }
        if (fromNode) {
            if (!fromNode.children) fromNode.children = [];
            if (fromNode.children.indexOf(data.toId) === -1) {
                fromNode.children.push(data.toId);
            }
        }
        if (CanvasRenderer.edges) {
            CanvasRenderer.edges.push({ from: data.fromId, to: data.toId });
        }
        this.syncPrerequisitesToRawData();
        this.saveTree();
        CanvasRenderer._needsRender = true;
        if (toNode && state.selectedNode && (state.selectedNode.formId === toNode.formId || state.selectedNode.id === toNode.id)) {
            if (typeof showSpellDetails === 'function') showSpellDetails(toNode);
        }
    },

    // _undoTogglePrereqType and _undoUpdateSoftNeeded are in editModeOps.js

    // =========================================================================
    // MOUSE EVENT DISPATCH
    // =========================================================================

    /** Handle mouse down - dispatch to active tool */
    handleMouseDown: function(e) {
        var rect = CanvasRenderer.canvas.getBoundingClientRect();
        var world = CanvasRenderer.screenToWorld(e.clientX - rect.left, e.clientY - rect.top);
        if (this.currentTool === 'move') {
            this.handleMoveMouseDown(e, world);
        } else if (this.currentTool === 'pen') {
            this.handlePenMouseDown(e, world);
        } else if (this.currentTool === 'eraser') {
            this.handleEraserMouseDown(e, world);
        }
    },

    /** Handle mouse move - dispatch to active tool */
    handleMouseMove: function(e) {
        var rect = CanvasRenderer.canvas.getBoundingClientRect();
        var world = CanvasRenderer.screenToWorld(e.clientX - rect.left, e.clientY - rect.top);
        if (this.currentTool === 'move') {
            this.handleMoveMouseMove(e, world);
        } else if (this.currentTool === 'pen') {
            this.handlePenMouseMove(e, world);
        } else if (this.currentTool === 'eraser') {
            this.handleEraserMouseMove(e, world);
        }
    },

    /** Handle mouse up - dispatch to active tool */
    handleMouseUp: function(e) {
        var rect = CanvasRenderer.canvas.getBoundingClientRect();
        var world = CanvasRenderer.screenToWorld(e.clientX - rect.left, e.clientY - rect.top);
        if (this.currentTool === 'move') {
            this.handleMoveMouseUp(e, world);
        } else if (this.currentTool === 'pen') {
            this.handlePenMouseUp(e, world);
        } else if (this.currentTool === 'eraser') {
            this.handleEraserMouseUp(e, world);
        }
    },

    /** Handle click - pass through if no tool operation active */
    handleClick: function(e) {
        if (this.isDragging || this.isPenDrawing || this.isErasing) {
            return;
        }
        this._originalOnClick(e);
    }
};

// Initialize on DOM ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function() {
        EditMode.init();
    });
} else {
    setTimeout(function() {
        EditMode.init();
    }, 0);
}
