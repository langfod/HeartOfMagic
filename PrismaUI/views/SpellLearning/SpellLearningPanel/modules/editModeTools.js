/**
 * Edit Mode -- Tools
 * Tool-specific mouse handlers for move, pen, and eraser tools,
 * plus node deletion logic.
 *
 * Method-extension of EditMode (defined in editModeCore.js)
 */

// =========================================================================
// MOVE TOOL
// =========================================================================

EditMode.handleMoveMouseDown = function(e, world) {
    // Check globe first (it's on top visually)
    var globe = CanvasRenderer.findGlobeAt(world.x, world.y);
    if (globe && e.button === 0) {
        this.isDragging = true;
        this.draggedGlobe = globe;
        this.draggedNode = null;
        this.dragStartX = world.x;
        this.dragStartY = world.y;
        this.originalGlobeX = globe.x;
        this.originalGlobeY = globe.y;
        CanvasRenderer.canvas.style.cursor = 'grabbing';
        console.log('[EditMode] Started dragging globe');
        return;
    }

    var node = CanvasRenderer.findNodeAt(world.x, world.y);
    if (node && e.button === 0) {
        this.isDragging = true;
        this.draggedNode = node;
        this.draggedGlobe = null;
        this.dragStartX = world.x;
        this.dragStartY = world.y;
        this.originalNodeX = node.x;
        this.originalNodeY = node.y;
        CanvasRenderer.canvas.style.cursor = 'grabbing';
        console.log('[EditMode] Started dragging:', node.name || node.id);
    } else {
        this._originalOnMouseDown(e);
    }
};

EditMode.handleMoveMouseMove = function(e, world) {
    if (this.isDragging && this.draggedGlobe) {
        this.draggedGlobe.x = this.originalGlobeX + (world.x - this.dragStartX);
        this.draggedGlobe.y = this.originalGlobeY + (world.y - this.dragStartY);
        CanvasRenderer._needsRender = true;
        return;
    }
    if (this.isDragging && this.draggedNode) {
        this.draggedNode.x = this.originalNodeX + (world.x - this.dragStartX);
        this.draggedNode.y = this.originalNodeY + (world.y - this.dragStartY);
        CanvasRenderer._needsRender = true;
    } else {
        this._originalOnMouseMove(e);
    }
};

EditMode.handleMoveMouseUp = function(e, world) {
    if (this.isDragging && this.draggedGlobe) {
        // Snap globe to grid if Shift is held
        if (e.shiftKey) {
            var snapPos = this.findNearestEmptyGridPosition(
                this.draggedGlobe.x,
                this.draggedGlobe.y,
                null
            );
            if (snapPos) {
                this.draggedGlobe.x = snapPos.x;
                this.draggedGlobe.y = snapPos.y;
                console.log('[EditMode] Snapped globe to:', Math.round(snapPos.x), Math.round(snapPos.y));
            }
        }

        // Round to 2 decimal places
        this.draggedGlobe.x = Math.round(this.draggedGlobe.x * 100) / 100;
        this.draggedGlobe.y = Math.round(this.draggedGlobe.y * 100) / 100;
        console.log('[EditMode] Placed globe at:', this.draggedGlobe.x, this.draggedGlobe.y);

        // Push to undo stack
        this.pushUndo({
            type: 'moveGlobe',
            data: {
                oldX: this.originalGlobeX,
                oldY: this.originalGlobeY
            }
        });

        // Sync to rawData and save
        this.syncGlobePositionToRawData();
        this.saveTree();

        this.isDragging = false;
        this.draggedGlobe = null;
        CanvasRenderer.canvas.style.cursor = 'grab';
        CanvasRenderer._needsRender = true;
        return;
    }

    if (this.isDragging && this.draggedNode) {
        // Only snap to grid if Shift is held
        if (e.shiftKey) {
            var snapPos = this.findNearestEmptyGridPosition(
                this.draggedNode.x,
                this.draggedNode.y,
                this.draggedNode
            );
            if (snapPos) {
                this.draggedNode.x = snapPos.x;
                this.draggedNode.y = snapPos.y;
                console.log('[EditMode] Snapped', this.draggedNode.name || this.draggedNode.id,
                    'to:', Math.round(snapPos.x), Math.round(snapPos.y));
            } else {
                console.log('[EditMode] No empty grid position found');
            }
        } else {
            console.log('[EditMode] Placed', this.draggedNode.name || this.draggedNode.id,
                'at:', Math.round(this.draggedNode.x), Math.round(this.draggedNode.y));
        }

        // Push to undo stack before saving
        this.pushUndo({
            type: 'move',
            data: {
                nodeId: this.draggedNode.formId || this.draggedNode.id,
                oldX: this.originalNodeX,
                oldY: this.originalNodeY
            }
        });

        // Always save the new position
        this.syncNodePositionToRawData(this.draggedNode);
        this.saveTree();

        this.isDragging = false;
        this.draggedNode = null;
        CanvasRenderer.canvas.style.cursor = 'grab';
        CanvasRenderer._needsRender = true;
        CanvasRenderer.buildSpatialIndex();
    } else {
        this._originalOnMouseUp(e);
    }
};

// =========================================================================
// PEN TOOL - Draw prerequisites
// =========================================================================

EditMode.handlePenMouseDown = function(e, world) {
    var node = CanvasRenderer.findNodeAt(world.x, world.y);

    if (node && e.button === 0) {
        // Start drawing prerequisite line from this node
        this.isPenDrawing = true;
        this.penStartNode = node;
        this.penCurrentX = world.x;
        this.penCurrentY = world.y;
        console.log('[EditMode] Pen started from:', node.name || node.id);
    } else if (e.button === 0) {
        // Clicked on empty space - find nearest grid position and show spawn menu
        console.log('[EditMode] Pen clicked empty space at:', world.x, world.y);
        console.log('[EditMode] Grid positions count:', this.gridPositions.length);

        // Try to find nearest grid position (empty preferred, but allow any)
        var gridPos = this.findNearestGridPosition(world.x, world.y);
        if (gridPos) {
            console.log('[EditMode] Found grid position:', gridPos);
            this.showSpawnMenu(gridPos);
        } else {
            // Fallback: use click position directly
            console.log('[EditMode] No grid position found, using click position');
            this.showSpawnMenu({
                x: world.x,
                y: world.y,
                school: 'Unknown',
                tier: 0
            });
        }
    }
};

EditMode.handlePenMouseMove = function(e, world) {
    if (this.isPenDrawing) {
        this.penCurrentX = world.x;
        this.penCurrentY = world.y;
        CanvasRenderer._needsRender = true;
    }
};

EditMode.handlePenMouseUp = function(e, world) {
    if (this.isPenDrawing && this.penStartNode) {
        var endNode = CanvasRenderer.findNodeAt(world.x, world.y);
        if (endNode && endNode !== this.penStartNode) {
            // Create prerequisite: penStartNode is prereq of endNode
            this.addPrerequisite(this.penStartNode, endNode);
        } else {
            console.log('[EditMode] Pen cancelled - no target node');
        }
        this.isPenDrawing = false;
        this.penStartNode = null;
        CanvasRenderer._needsRender = true;
    }
};

/**
 * Add a prerequisite relationship
 */
EditMode.addPrerequisite = function(fromNode, toNode) {
    var fromId = fromNode.formId || fromNode.id;
    var toId = toNode.formId || toNode.id;

    // Check if already exists in any prereq list
    var alreadyExists = (toNode.prerequisites && toNode.prerequisites.indexOf(fromId) !== -1) ||
                       (toNode.hardPrereqs && toNode.hardPrereqs.indexOf(fromId) !== -1) ||
                       (toNode.softPrereqs && toNode.softPrereqs.indexOf(fromId) !== -1);

    if (alreadyExists) {
        console.log('[EditMode] Prerequisite already exists');
        return false;
    }

    // Add to toNode's prerequisites (legacy array)
    if (!toNode.prerequisites) toNode.prerequisites = [];
    toNode.prerequisites.push(fromId);

    // Add to hardPrereqs by default (new prereqs are hard requirements)
    if (!toNode.hardPrereqs) toNode.hardPrereqs = [];
    toNode.hardPrereqs.push(fromId);

    // Add to fromNode's children
    if (!fromNode.children) fromNode.children = [];
    if (fromNode.children.indexOf(toId) === -1) {
        fromNode.children.push(toId);
    }

    // Add edge to renderer
    if (CanvasRenderer.edges) {
        CanvasRenderer.edges.push({ from: fromId, to: toId });
    }

    console.log('[EditMode] Added prerequisite:', fromNode.name || fromId, '->', toNode.name || toId);

    // Push to undo stack
    this.pushUndo({
        type: 'addPrereq',
        data: {
            fromId: fromId,
            toId: toId
        }
    });

    // Sync to rawData and save
    this.syncPrerequisitesToRawData();
    this.saveTree();

    // Refresh details panel if toNode is selected
    if (state.selectedNode && (state.selectedNode.formId === toNode.formId || state.selectedNode.id === toNode.id)) {
        if (typeof showSpellDetails === 'function') {
            showSpellDetails(toNode);
        }
    }

    CanvasRenderer._needsRender = true;
    return true;
};

