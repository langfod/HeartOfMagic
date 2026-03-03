/**
 * CanvasRenderer Interaction - Mouse/touch handlers, hit detection, tooltips
 * Adds event handling, hit testing, selection, and tooltip methods.
 *
 * Loaded after: canvasCore.js
 */

// =========================================================================
// TOOLTIPS
// =========================================================================

CanvasRenderer._showTooltip = function(node, event) {
    var tooltip = document.getElementById('tooltip');
    if (!tooltip) return;

    // Progressive reveal logic (same as WheelRenderer/details panel)
    var _tCanonId = (typeof getCanonicalFormId === 'function') ? getCanonicalFormId(node) : node.formId;
    var progress = (typeof state !== 'undefined' && state.spellProgress) ? (state.spellProgress[_tCanonId] || {}) : {};
    var progressPercent = progress.required > 0 ? (progress.xp / progress.required) * 100 : 0;
    var playerHasSpell = progress.unlocked || node.state === 'unlocked';

    var showFullInfo = playerHasSpell || (typeof settings !== 'undefined' && settings.cheatMode);
    var isRootWithReveal = node.isRoot && (typeof settings !== 'undefined' && settings.showRootSpellNames);
    var isLearning = node.state === 'learning';
    var isLocked = node.state === 'locked';
    var revealThreshold = (typeof settings !== 'undefined' && settings.revealName !== undefined) ? settings.revealName : 10;
    var showName = showFullInfo || isLearning || (!isLocked && progressPercent >= revealThreshold) || isRootWithReveal;
    var showDetails = node.state !== 'locked' || (typeof settings !== 'undefined' && settings.cheatMode);

    var nameText = showName ? (node.name || node.formId) : '???';
    var infoText;
    if (node.state === 'locked') {
        infoText = 'Unlock prerequisites first';
    } else if (showDetails) {
        infoText = node.school + ' \u2022 ' + (node.level || '?') + ' \u2022 ' + (node.cost || '?') + ' magicka';
    } else {
        infoText = node.school + ' \u2022 Progress: ' + Math.round(progressPercent) + '%';
    }

    var nameEl = tooltip.querySelector('.tooltip-name');
    var infoEl = tooltip.querySelector('.tooltip-info');
    var stateEl = tooltip.querySelector('.tooltip-state');
    if (nameEl) nameEl.textContent = nameText;
    if (infoEl) infoEl.textContent = infoText;
    if (stateEl) {
        stateEl.textContent = node.state;
        stateEl.className = 'tooltip-state ' + node.state;
    }

    tooltip.classList.remove('hidden');
    tooltip.style.left = (event.clientX + 15) + 'px';
    tooltip.style.top = (event.clientY + 15) + 'px';
};

CanvasRenderer._hideTooltip = function() {
    var tooltip = document.getElementById('tooltip');
    if (tooltip) tooltip.classList.add('hidden');
};

// =========================================================================
// HIT DETECTION
// =========================================================================

CanvasRenderer.findNodeAt = function(worldX, worldY) {
    var cellX = Math.floor(worldX / this._gridCellSize);
    var cellY = Math.floor(worldY / this._gridCellSize);

    for (var dx = -1; dx <= 1; dx++) {
        for (var dy = -1; dy <= 1; dy++) {
            var key = (cellX + dx) + ',' + (cellY + dy);
            var cell = this._nodeGrid[key];
            if (!cell) continue;

            for (var i = 0; i < cell.length; i++) {
                var node = cell[i];
                var dist = Math.sqrt(Math.pow(node.x - worldX, 2) + Math.pow(node.y - worldY, 2));
                var hitRadius = node.state === 'unlocked' ? 14 : 10;

                if (dist <= hitRadius) {
                    return node;
                }
            }
        }
    }

    return null;
};

CanvasRenderer.findGlobeAt = function(worldX, worldY) {
    var globe = (state.treeData && state.treeData.globe) || { x: 0, y: 0, radius: 45 };
    var dx = worldX - globe.x;
    var dy = worldY - globe.y;
    var dist = Math.sqrt(dx * dx + dy * dy);
    return dist <= globe.radius ? globe : null;
};

// =========================================================================
// EVENT HANDLERS
// =========================================================================

CanvasRenderer.onMouseDown = function(e) {
    if (e.button === 0 || e.button === 2) {
        this.isPanning = true;
        this.panStartX = e.clientX - this.panX;
        this.panStartY = e.clientY - this.panY;
        this.canvas.style.cursor = 'grabbing';
        this._needsRender = true;
    }
};

CanvasRenderer.onMouseMove = function(e) {
    var self = this;
    if (this.isPanning) {
        // Batch pan updates using RAF to prevent multiple renders per frame
        this._pendingPanX = e.clientX - this.panStartX;
        this._pendingPanY = e.clientY - this.panStartY;

        if (!this._panRafPending) {
            this._panRafPending = true;
            requestAnimationFrame(function() {
                self._panRafPending = false;
                self.panX = self._pendingPanX;
                self.panY = self._pendingPanY;
                self._needsRender = true;
            });
        }
    } else {
        var rect = this.canvas.getBoundingClientRect();
        var world = this.screenToWorld(e.clientX - rect.left, e.clientY - rect.top);
        var node = this.findNodeAt(world.x, world.y);

        if (node !== this.hoveredNode) {
            this.hoveredNode = node;
            this.canvas.style.cursor = node ? 'pointer' : 'grab';
            this._needsRender = true;

            if (node) {
                self._showTooltip(node, e);
            } else {
                self._hideTooltip();
            }
        }
    }
};

CanvasRenderer.onMouseUp = function(e) {
    this.isPanning = false;
    this.canvas.style.cursor = this.hoveredNode ? 'pointer' : 'grab';
    this._needsRender = true;
};

CanvasRenderer.onWheel = function(e) {
    var zoomFactor = e.deltaY < 0 ? 1.1 : 0.9;
    var newZoom = this.zoom * zoomFactor;
    newZoom = Math.max(0.1, Math.min(5, newZoom));

    var rect = this.canvas.getBoundingClientRect();
    var mouseX = e.clientX - rect.left - rect.width / 2;
    var mouseY = e.clientY - rect.top - rect.height / 2;

    this.panX = mouseX - (mouseX - this.panX) * (newZoom / this.zoom);
    this.panY = mouseY - (mouseY - this.panY) * (newZoom / this.zoom);
    this.zoom = newZoom;

    this._needsRender = true;

    var zoomEl = this._zoomLevelEl || document.getElementById('zoom-level');
    if (zoomEl) zoomEl.textContent = Math.round(this.zoom * 100) + '%';
};

CanvasRenderer.onClick = function(e) {
    var rect = this.canvas.getBoundingClientRect();
    var world = this.screenToWorld(e.clientX - rect.left, e.clientY - rect.top);
    var clickedNode = this.findNodeAt(world.x, world.y);

    if (clickedNode) {
        this.selectedNode = clickedNode;
        this._buildSelectedPathToRoot(clickedNode);
        this._needsRender = true;

        console.log('[CanvasRenderer] Node clicked:', clickedNode.name || clickedNode.id);

        // ALWAYS rotate school to top on click
        this.rotateSchoolToTop(clickedNode.school);

        // Dispatch nodeSelected event (same as WheelRenderer) for detail panel
        window.dispatchEvent(new CustomEvent('nodeSelected', { detail: clickedNode }));
    } else {
        if (this.selectedNode) {
            this.selectedNode = null;
            this._selectedPathEdges = null;
            this._selectedPathNodes = null;
            this._needsRender = true;
        }
    }
};

// =========================================================================
// SELECTION PATH
// =========================================================================

/**
 * Build the complete path from selected node in BOTH directions:
 * - Back to root (ancestors via prerequisites)
 * - Forward to leaves (descendants via children)
 * Stores edges in _selectedPathEdges for highlighting.
 */
CanvasRenderer._buildSelectedPathToRoot = function(node) {
    this._selectedPathEdges = new Set();
    this._selectedPathNodes = new Set();

    if (!node || !this._nodeMap) return;

    this._selectedPathNodes.add(node.id);

    // === TRACE BACK TO ROOT (via prerequisites) ===
    var visitedBack = new Set();
    var queueBack = [node.id];

    while (queueBack.length > 0) {
        var currentId = queueBack.shift();
        if (visitedBack.has(currentId)) continue;
        visitedBack.add(currentId);

        var currentNode = this._nodeMap.get(currentId);
        if (!currentNode) continue;

        this._selectedPathNodes.add(currentId);

        var prereqs = currentNode.prerequisites || [];
        for (var i = 0; i < prereqs.length; i++) {
            var prereqId = prereqs[i];
            var edgeKey = prereqId + '->' + currentId;
            this._selectedPathEdges.add(edgeKey);

            if (!visitedBack.has(prereqId)) {
                queueBack.push(prereqId);
            }
        }
    }

    // === TRACE FORWARD TO LEAVES (via children) ===
    var visitedForward = new Set();
    var queueForward = [node.id];

    while (queueForward.length > 0) {
        var currentId = queueForward.shift();
        if (visitedForward.has(currentId)) continue;
        visitedForward.add(currentId);

        var currentNode = this._nodeMap.get(currentId);
        if (!currentNode) continue;

        this._selectedPathNodes.add(currentId);

        var children = currentNode.children || [];
        for (var i = 0; i < children.length; i++) {
            var childId = children[i];
            var edgeKey = currentId + '->' + childId;
            this._selectedPathEdges.add(edgeKey);

            if (!visitedForward.has(childId)) {
                queueForward.push(childId);
            }
        }
    }

    console.log('[CanvasRenderer] Selected path (bidirectional): ' + this._selectedPathNodes.size + ' nodes, ' + this._selectedPathEdges.size + ' edges');
};
