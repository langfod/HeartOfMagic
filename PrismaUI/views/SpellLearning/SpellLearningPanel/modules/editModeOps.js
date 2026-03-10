/**
 * Edit Mode -- Ops
 * Operations and advanced editing: rendering overlay, save/sync,
 * prerequisite editing, spell spawn menu, and C++ callbacks.
 *
 * Method-extension of EditMode (defined in editModeCore.js)
 */

// =========================================================================
// RENDERING (called from CanvasRenderer)
// =========================================================================

/** Render edit mode overlays (pen line, eraser path) */
EditMode.renderOverlay = function(ctx) {
    if (!this.isActive) return;

    // Render pen line being drawn (with arrow showing direction)
    if (this.isPenDrawing && this.penStartNode) {
        var startX = this.penStartNode.x;
        var startY = this.penStartNode.y;
        var endX = this.penCurrentX;
        var endY = this.penCurrentY;

        // Draw the dashed line
        ctx.beginPath();
        ctx.moveTo(startX, startY);
        ctx.lineTo(endX, endY);
        ctx.strokeStyle = '#00ff00';
        ctx.lineWidth = 3;
        ctx.setLineDash([5, 5]);
        ctx.stroke();
        ctx.setLineDash([]);

        // Draw arrowhead at the end
        var angle = Math.atan2(endY - startY, endX - startX);
        var arrowLength = 15;
        var arrowAngle = Math.PI / 6; // 30 degrees
        ctx.beginPath();
        ctx.moveTo(endX, endY);
        ctx.lineTo(
            endX - arrowLength * Math.cos(angle - arrowAngle),
            endY - arrowLength * Math.sin(angle - arrowAngle)
        );
        ctx.moveTo(endX, endY);
        ctx.lineTo(
            endX - arrowLength * Math.cos(angle + arrowAngle),
            endY - arrowLength * Math.sin(angle + arrowAngle)
        );
        ctx.strokeStyle = '#00ff00';
        ctx.lineWidth = 3;
        ctx.stroke();
    }

    // Render eraser path
    if (this.isErasing && this.eraserPath.length > 1) {
        ctx.beginPath();
        ctx.moveTo(this.eraserPath[0].x, this.eraserPath[0].y);
        for (var i = 1; i < this.eraserPath.length; i++) {
            ctx.lineTo(this.eraserPath[i].x, this.eraserPath[i].y);
        }
        ctx.strokeStyle = '#ff0000';
        ctx.lineWidth = 4;
        ctx.globalAlpha = 0.7;
        ctx.stroke();
        ctx.globalAlpha = 1.0;
    }
};

// =========================================================================
// UNDO HELPERS (prereq-specific, dispatched from editModeCore.js undo())
// =========================================================================

EditMode._undoTogglePrereqType = function(data) {
    var node = CanvasRenderer._nodeMap ? CanvasRenderer._nodeMap.get(data.nodeId) : null;
    if (!node) return;
    if (data.wasHard) {
        if (node.softPrereqs) {
            var idx = node.softPrereqs.indexOf(data.prereqId);
            if (idx !== -1) node.softPrereqs.splice(idx, 1);
        }
        if (!node.hardPrereqs) node.hardPrereqs = [];
        if (node.hardPrereqs.indexOf(data.prereqId) === -1) {
            node.hardPrereqs.push(data.prereqId);
        }
    } else {
        if (node.hardPrereqs) {
            var idx = node.hardPrereqs.indexOf(data.prereqId);
            if (idx !== -1) node.hardPrereqs.splice(idx, 1);
        }
        if (!node.softPrereqs) node.softPrereqs = [];
        if (node.softPrereqs.indexOf(data.prereqId) === -1) {
            node.softPrereqs.push(data.prereqId);
        }
    }
    this.syncPrerequisitesToRawData();
    this.saveTree();
    if (state.selectedNode && (state.selectedNode.formId === node.formId || state.selectedNode.id === node.id)) {
        if (typeof showSpellDetails === 'function') showSpellDetails(node);
    }
};

EditMode._undoUpdateSoftNeeded = function(data) {
    var node = CanvasRenderer._nodeMap ? CanvasRenderer._nodeMap.get(data.nodeId) : null;
    if (!node) return;
    node.softNeeded = data.oldValue;
    this.syncPrerequisitesToRawData();
    this.saveTree();
    if (state.selectedNode && (state.selectedNode.formId === node.formId || state.selectedNode.id === node.id)) {
        if (typeof showSpellDetails === 'function') showSpellDetails(node);
    }
};

// =========================================================================
// PREREQUISITE EDITING (hard/soft toggle, softNeeded count)
// =========================================================================

/** Toggle a prerequisite between hard and soft */
EditMode.togglePrereqType = function(node, prereqId) {
    if (!node) return null;

    // Ensure arrays exist
    if (!node.hardPrereqs) node.hardPrereqs = [];
    if (!node.softPrereqs) node.softPrereqs = [];

    var hardIdx = node.hardPrereqs.indexOf(prereqId);
    var softIdx = node.softPrereqs.indexOf(prereqId);
    var wasHard = hardIdx !== -1;
    var newType;

    if (hardIdx !== -1) {
        // Currently hard -> move to soft
        node.hardPrereqs.splice(hardIdx, 1);
        node.softPrereqs.push(prereqId);
        newType = 'soft';
        console.log('[EditMode] Changed prereq', prereqId, 'to SOFT');
    } else if (softIdx !== -1) {
        // Currently soft -> move to hard
        node.softPrereqs.splice(softIdx, 1);
        node.hardPrereqs.push(prereqId);
        newType = 'hard';
        console.log('[EditMode] Changed prereq', prereqId, 'to HARD');
    } else {
        // Not in either - add to hard by default
        node.hardPrereqs.push(prereqId);
        newType = 'hard';
        console.log('[EditMode] Added prereq', prereqId, 'as HARD');
    }

    this.pushUndo({
        type: 'togglePrereqType',
        data: { nodeId: node.formId || node.id, prereqId: prereqId, wasHard: wasHard }
    });
    this.syncPrerequisitesToRawData();
    this.saveTree();

    if (state.selectedNode && (state.selectedNode.formId === node.formId || state.selectedNode.id === node.id)) {
        if (typeof showSpellDetails === 'function') showSpellDetails(node);
    }
    return newType;
};

/** Update the softNeeded count for a node */
EditMode.updateSoftNeeded = function(node, count) {
    if (!node) return;
    var oldValue = node.softNeeded || 0;
    var maxSoft = (node.softPrereqs || []).length;
    node.softNeeded = Math.max(0, Math.min(count, maxSoft));

    if (node.softNeeded !== oldValue) {
        this.pushUndo({
            type: 'updateSoftNeeded',
            data: { nodeId: node.formId || node.id, oldValue: oldValue }
        });
    }
    console.log('[EditMode] Updated softNeeded to', node.softNeeded, 'for', node.name || node.formId);
    this.syncPrerequisitesToRawData();
    this.saveTree();

    if (state.selectedNode && (state.selectedNode.formId === node.formId || state.selectedNode.id === node.id)) {
        if (typeof showSpellDetails === 'function') showSpellDetails(node);
    }
};

/** Delete a specific prerequisite from a node */
EditMode.deletePrerequisite = function(node, prereqId) {
    if (!node) return;
    var nodeId = node.formId || node.id;
    var wasHard = node.hardPrereqs && node.hardPrereqs.indexOf(prereqId) !== -1;

    this.pushUndo({
        type: 'removePrereq',
        data: { fromId: prereqId, toId: nodeId, wasHard: wasHard }
    });

    if (node.prerequisites) {
        var idx = node.prerequisites.indexOf(prereqId);
        if (idx !== -1) node.prerequisites.splice(idx, 1);
    }
    if (node.hardPrereqs) {
        var idx = node.hardPrereqs.indexOf(prereqId);
        if (idx !== -1) node.hardPrereqs.splice(idx, 1);
    }
    if (node.softPrereqs) {
        var idx = node.softPrereqs.indexOf(prereqId);
        if (idx !== -1) node.softPrereqs.splice(idx, 1);
    }

    // Remove from parent's children
    var prereqNode = CanvasRenderer._nodeMap ? CanvasRenderer._nodeMap.get(prereqId) : null;
    if (prereqNode && prereqNode.children) {
        var idx = prereqNode.children.indexOf(nodeId);
        if (idx !== -1) prereqNode.children.splice(idx, 1);
    }

    // Remove edge from renderer
    if (CanvasRenderer.edges) {
        for (var i = CanvasRenderer.edges.length - 1; i >= 0; i--) {
            var e = CanvasRenderer.edges[i];
            if (e.from === prereqId && e.to === nodeId) {
                CanvasRenderer.edges.splice(i, 1);
            }
        }
    }
    console.log('[EditMode] Deleted prereq', prereqId, 'from', node.name || nodeId);
    this.syncPrerequisitesToRawData();
    this.saveTree();

    if (state.selectedNode && (state.selectedNode.formId === node.formId || state.selectedNode.id === node.id)) {
        if (typeof showSpellDetails === 'function') showSpellDetails(node);
    }
    CanvasRenderer._needsRender = true;
};

