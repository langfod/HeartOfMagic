/**
 * Edit Mode Tools Extra - Eraser tool, node deletion, and save/sync
 * operations.
 *
 * Method-extension of EditMode (defined in editModeCore.js).
 * Loaded after: editModeTools.js
 */

// =========================================================================
// ERASER TOOL - Remove edges
// =========================================================================

EditMode.handleEraserMouseDown = function(e, world) {
    if (e.button === 0) {
        // Check if clicking on a node - delete it (shift+click also blacklists)
        var node = CanvasRenderer.findNodeAt(world.x, world.y);
        if (node) {
            if (e.shiftKey && typeof addToBlacklist === 'function') {
                addToBlacklist({
                    formId: node.formId || node.id,
                    name: node.name || node.formId || node.id,
                    school: node.school || 'Unknown'
                });
                console.log('[EditMode] Shift+Eraser: blacklisted + deleted', node.name || node.formId);
            }
            this.deleteNode(node);
            return;
        }
        // Otherwise start erasing edges
        this.isErasing = true;
        this.eraserPath = [{ x: world.x, y: world.y }];
    }
};

EditMode.handleEraserMouseMove = function(e, world) {
    if (this.isErasing) {
        this.eraserPath.push({ x: world.x, y: world.y });
        CanvasRenderer._needsRender = true;
    }
};

EditMode.handleEraserMouseUp = function(e, world) {
    if (this.isErasing) {
        // Check which edges intersect with eraser path
        var edgesToRemove = this.findIntersectingEdges();
        if (edgesToRemove.length > 0) {
            console.log('[EditMode] Erasing', edgesToRemove.length, 'edges');
            for (var i = 0; i < edgesToRemove.length; i++) {
                this.removeEdge(edgesToRemove[i]);
            }
            this.syncPrerequisitesToRawData();
            this.saveTree();
        }
        this.isErasing = false;
        this.eraserPath = [];
        CanvasRenderer._needsRender = true;
    }
};

/**
 * Find edges that intersect with the eraser path
 */
EditMode.findIntersectingEdges = function() {
    var intersecting = [];
    if (!CanvasRenderer.edges || this.eraserPath.length < 2) return intersecting;

    for (var i = 0; i < CanvasRenderer.edges.length; i++) {
        var edge = CanvasRenderer.edges[i];
        var fromNode = CanvasRenderer._nodeMap ? CanvasRenderer._nodeMap.get(edge.from) : null;
        var toNode = CanvasRenderer._nodeMap ? CanvasRenderer._nodeMap.get(edge.to) : null;
        if (!fromNode || !toNode) continue;

        for (var j = 0; j < this.eraserPath.length - 1; j++) {
            var p1 = this.eraserPath[j];
            var p2 = this.eraserPath[j + 1];
            if (this.lineSegmentsIntersect(
                p1.x, p1.y, p2.x, p2.y,
                fromNode.x, fromNode.y, toNode.x, toNode.y
            )) {
                intersecting.push(edge);
                break; // Only add edge once
            }
        }
    }
    return intersecting;
};

/**
 * Check if two line segments intersect
 */
EditMode.lineSegmentsIntersect = function(x1, y1, x2, y2, x3, y3, x4, y4) {
    var denom = (x1 - x2) * (y3 - y4) - (y1 - y2) * (x3 - x4);
    if (Math.abs(denom) < 0.0001) return false; // Parallel
    var t = ((x1 - x3) * (y3 - y4) - (y1 - y3) * (x3 - x4)) / denom;
    var u = -((x1 - x2) * (y1 - y3) - (y1 - y2) * (x1 - x3)) / denom;
    return t >= 0 && t <= 1 && u >= 0 && u <= 1;
};

/**
 * Remove an edge/prerequisite
 */
EditMode.removeEdge = function(edge, skipUndo) {
    var fromId = edge.from;
    var toId = edge.to;
    var fromNode = CanvasRenderer._nodeMap ? CanvasRenderer._nodeMap.get(fromId) : null;
    var toNode = CanvasRenderer._nodeMap ? CanvasRenderer._nodeMap.get(toId) : null;

    // Check if it was a hard prereq before removing (for undo)
    var wasHard = toNode && toNode.hardPrereqs && toNode.hardPrereqs.indexOf(fromId) !== -1;

    // Push to undo stack before removing (unless skipUndo is true)
    if (!skipUndo) {
        this.pushUndo({
            type: 'removePrereq',
            data: {
                fromId: fromId,
                toId: toId,
                wasHard: wasHard
            }
        });
    }

    // Remove from toNode's prerequisites (legacy array)
    if (toNode && toNode.prerequisites) {
        var idx = toNode.prerequisites.indexOf(fromId);
        if (idx !== -1) toNode.prerequisites.splice(idx, 1);
    }
    // Remove from toNode's hardPrereqs
    if (toNode && toNode.hardPrereqs) {
        var idx = toNode.hardPrereqs.indexOf(fromId);
        if (idx !== -1) toNode.hardPrereqs.splice(idx, 1);
    }
    // Remove from toNode's softPrereqs
    if (toNode && toNode.softPrereqs) {
        var idx = toNode.softPrereqs.indexOf(fromId);
        if (idx !== -1) toNode.softPrereqs.splice(idx, 1);
    }
    // Remove from fromNode's children
    if (fromNode && fromNode.children) {
        var idx = fromNode.children.indexOf(toId);
        if (idx !== -1) fromNode.children.splice(idx, 1);
    }
    // Remove edge from renderer
    if (CanvasRenderer.edges) {
        for (var i = CanvasRenderer.edges.length - 1; i >= 0; i--) {
            var e = CanvasRenderer.edges[i];
            if (e.from === fromId && e.to === toId) {
                CanvasRenderer.edges.splice(i, 1);
            }
        }
    }
    console.log('[EditMode] Removed edge:', fromId, '->', toId);

    // Refresh details panel if toNode is selected
    if (toNode && state.selectedNode && (state.selectedNode.formId === toNode.formId || state.selectedNode.id === toNode.id)) {
        if (typeof showSpellDetails === 'function') {
            showSpellDetails(toNode);
        }
    }
};

// =========================================================================
// NODE DELETION (Eraser click on node)
// =========================================================================

/**
 * Delete a node and all its connections
 */
EditMode.deleteNode = function(node) {
    if (!node) return;
    var nodeId = node.formId || node.id;
    console.log('[EditMode] Deleting node:', node.name || nodeId);

    // Remove from all parent nodes' children arrays
    if (node.prerequisites && node.prerequisites.length > 0) {
        node.prerequisites.forEach(function(prereqId) {
            var prereqNode = CanvasRenderer._nodeMap ? CanvasRenderer._nodeMap.get(prereqId) : null;
            if (prereqNode && prereqNode.children) {
                var idx = prereqNode.children.indexOf(nodeId);
                if (idx !== -1) prereqNode.children.splice(idx, 1);
            }
        });
    }

    // Remove from all child nodes' prerequisites arrays
    if (node.children && node.children.length > 0) {
        node.children.forEach(function(childId) {
            var childNode = CanvasRenderer._nodeMap ? CanvasRenderer._nodeMap.get(childId) : null;
            if (childNode) {
                if (childNode.prerequisites) {
                    var idx = childNode.prerequisites.indexOf(nodeId);
                    if (idx !== -1) childNode.prerequisites.splice(idx, 1);
                }
                if (childNode.hardPrereqs) {
                    var idx = childNode.hardPrereqs.indexOf(nodeId);
                    if (idx !== -1) childNode.hardPrereqs.splice(idx, 1);
                }
                if (childNode.softPrereqs) {
                    var idx = childNode.softPrereqs.indexOf(nodeId);
                    if (idx !== -1) childNode.softPrereqs.splice(idx, 1);
                }
            }
        });
    }

    // Remove all edges involving this node
    if (CanvasRenderer.edges) {
        for (var i = CanvasRenderer.edges.length - 1; i >= 0; i--) {
            var e = CanvasRenderer.edges[i];
            if (e.from === nodeId || e.to === nodeId) {
                CanvasRenderer.edges.splice(i, 1);
            }
        }
    }

    // Remove from CanvasRenderer.nodes array
    if (CanvasRenderer.nodes) {
        var idx = CanvasRenderer.nodes.indexOf(node);
        if (idx !== -1) CanvasRenderer.nodes.splice(idx, 1);
    }

    // Remove from nodeMap
    if (CanvasRenderer._nodeMap) {
        CanvasRenderer._nodeMap.delete(nodeId);
    }

    // Remove from rawData
    this.removeNodeFromRawData(node);

    // Clear selection if deleted node was selected
    if (state.selectedNode && (state.selectedNode.formId === nodeId || state.selectedNode.id === nodeId)) {
        state.selectedNode = null;
    }

    // Save and refresh
    this.saveTree();
    CanvasRenderer.buildSpatialIndex();
    CanvasRenderer._needsRender = true;

    if (typeof setTreeStatus === 'function') {
        setTreeStatus('Deleted: ' + (node.name || nodeId));
    }
};

/**
 * Remove a node from rawData
 */
EditMode.removeNodeFromRawData = function(node) {
    if (!state.treeData || !state.treeData.rawData) return;
    var rawData = state.treeData.rawData;
    var nodeId = node.formId || node.id;
    var schoolName = node.school;

    if (rawData.schools && rawData.schools[schoolName] && rawData.schools[schoolName].nodes) {
        var nodes = rawData.schools[schoolName].nodes;
        for (var i = nodes.length - 1; i >= 0; i--) {
            var rawNode = nodes[i];
            var rawId = rawNode.formId || rawNode.id || rawNode.spellId;
            if (rawId === nodeId) {
                nodes.splice(i, 1);
                console.log('[EditMode] Removed node from rawData:', nodeId);
                break;
            }
        }
    }

    // Also remove from state.treeData.nodes if it exists
    if (state.treeData.nodes) {
        for (var i = state.treeData.nodes.length - 1; i >= 0; i--) {
            var n = state.treeData.nodes[i];
            if ((n.formId || n.id) === nodeId) {
                state.treeData.nodes.splice(i, 1);
                break;
            }
        }
    }
};

// =========================================================================
// SAVE/SYNC
// =========================================================================

/** Sync a node's position back to rawData */
EditMode.syncNodePositionToRawData = function(node) {
    if (!state.treeData || !state.treeData.rawData) return false;
    var rawData = state.treeData.rawData;
    var nodeId = node.formId || node.id;
    var schoolName = node.school;
    if (rawData.schools && rawData.schools[schoolName] && rawData.schools[schoolName].nodes) {
        var rawNodes = rawData.schools[schoolName].nodes;
        for (var i = 0; i < rawNodes.length; i++) {
            var rawNode = rawNodes[i];
            var rawId = rawNode.formId || rawNode.id || rawNode.spellId;
            if (rawId === nodeId) {
                rawNode.x = node.x;
                rawNode.y = node.y;
                console.log('[EditMode] Synced position for', node.name || nodeId);
                return true;
            }
        }
    }
    return false;
};

/** Sync globe position to rawData for serialization */
EditMode.syncGlobePositionToRawData = function() {
    if (!state.treeData || !state.treeData.rawData) return;
    var globe = state.treeData.globe;
    if (!globe) return;
    state.treeData.rawData.globe = {
        x: globe.x,
        y: globe.y,
        radius: globe.radius
    };
    console.log('[EditMode] Synced globe position to rawData:', globe.x, globe.y);
};

/** Sync all prerequisites back to rawData */
EditMode.syncPrerequisitesToRawData = function() {
    if (!state.treeData || !state.treeData.rawData || !CanvasRenderer.nodes) return;
    var rawData = state.treeData.rawData;
    var prereqMap = {};
    var hardPrereqMap = {};
    var softPrereqMap = {};
    var softNeededMap = {};
    var childrenMap = {};
    for (var i = 0; i < CanvasRenderer.nodes.length; i++) {
        var node = CanvasRenderer.nodes[i];
        var nodeId = node.formId || node.id;
        prereqMap[nodeId] = node.prerequisites || [];
        hardPrereqMap[nodeId] = node.hardPrereqs || [];
        softPrereqMap[nodeId] = node.softPrereqs || [];
        softNeededMap[nodeId] = node.softNeeded || 0;
        childrenMap[nodeId] = node.children || [];
    }
    for (var schoolName in rawData.schools) {
        var school = rawData.schools[schoolName];
        if (!school.nodes) continue;
        for (var i = 0; i < school.nodes.length; i++) {
            var rawNode = school.nodes[i];
            var rawId = rawNode.formId || rawNode.id || rawNode.spellId;
            if (prereqMap[rawId] !== undefined) rawNode.prerequisites = prereqMap[rawId];
            if (hardPrereqMap[rawId] !== undefined) rawNode.hardPrereqs = hardPrereqMap[rawId];
            if (softPrereqMap[rawId] !== undefined) rawNode.softPrereqs = softPrereqMap[rawId];
            if (softNeededMap[rawId] !== undefined) rawNode.softNeeded = softNeededMap[rawId];
            if (childrenMap[rawId] !== undefined) rawNode.children = childrenMap[rawId];
        }
    }
    console.log('[EditMode] Synced prerequisites to rawData');
};

/** Save tree to file */
EditMode.saveTree = function() {
    if (typeof saveTreeToFile === 'function') {
        var saved = saveTreeToFile();
        if (saved) {
            console.log('[EditMode] Tree saved');
            if (typeof setTreeStatus === 'function') setTreeStatus('Changes saved');
        }
        return saved;
    }
    return false;
};
