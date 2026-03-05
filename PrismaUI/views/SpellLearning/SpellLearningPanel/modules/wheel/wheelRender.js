/**
 * WheelRenderer Render - Node and edge rendering
 * Adds render methods: render, createEdgeElement, calculateEdgePath, isNodeVisible,
 * node creation variants, color helpers, and display utilities.
 *
 * Loaded after: wheelCore.js, wheelLayout.js
 */

WheelRenderer.render = function() {
    var startTime = performance.now();
    var nodeCount = this.nodes ? this.nodes.length : 0;

    // Warn about very large trees
    if (nodeCount > 1000) {
        console.warn('[WheelRenderer] LARGE TREE: ' + nodeCount + ' nodes - using aggressive performance mode');
    }

    this.debugDiscoveryMode();

    if (!this.spokesLayer || !this.edgesLayer || !this.nodesLayer) {
        console.warn('[WheelRenderer] SVG layers not initialized - call init() first');
        return;
    }
    this.spokesLayer.innerHTML = '';
    this.edgesLayer.innerHTML = '';
    this.nodesLayer.innerHTML = '';
    if (this.centerHub) this.centerHub.innerHTML = '';
    this.nodeElements.clear();
    this.edgeElements.clear();
    this._visibleNodes.clear();
    this._renderedNodes.clear();
    this._renderedEdges.clear();

    this._lodLevel = this.getLOD();

    this.renderCenterHub();
    this.renderSpokes();
    this.renderOriginLines();

    var self = this;
    // nodeCount already defined at start of render()

    // Use TRUE virtualization for large trees - don't render off-screen nodes at all
    var useVirtualization = nodeCount > this._virtualizeThreshold;
    var viewport = this.getViewportBounds();

    // Force simpler LOD for large trees - more aggressive thresholds
    if (nodeCount > 300) {
        this._lodLevel = 'simple';
    }
    if (nodeCount > 600) {
        this._lodLevel = 'minimal';
    }
    if (nodeCount > this._ultraLightThreshold) {
        this._lodLevel = 'ultralight';
        console.warn('[WheelRenderer] ULTRA-LIGHT MODE: ' + nodeCount + ' nodes - minimal DOM elements');
    }

    // Build set of visible node IDs for edge culling
    var visibleNodeIds = new Set();

    this.nodes.forEach(function(node) {
        // Skip hidden schools
        if (settings.schoolVisibility && settings.schoolVisibility[node.school] === false) {
            return;
        }

        // TRUE viewport culling for virtualized mode - skip nodes outside viewport
        if (useVirtualization && viewport && !self.isNodeInViewport(node, viewport)) {
            return;
        }

        visibleNodeIds.add(node.id);
        visibleNodeIds.add(node.formId);
    });

    // Render edges - only where at least one endpoint is visible
    var edgeFragment = document.createDocumentFragment();
    var edgeCount = 0;
    var edgeSkipped = 0;

    // For very large trees, skip most edges entirely (only show mastered paths)
    var skipNonMasteredEdges = (this._lodLevel === 'minimal' && nodeCount > 800) || this._lodLevel === 'ultralight';

    this.edges.forEach(function(edge) {
        // Edge culling: skip if BOTH endpoints are off-screen
        if (useVirtualization && !visibleNodeIds.has(edge.from) && !visibleNodeIds.has(edge.to)) {
            edgeSkipped++;
            return;
        }

        // For very large trees, only render mastered edges (both unlocked)
        if (skipNonMasteredEdges) {
            var fromNode = self._nodeMap ? self._nodeMap.get(edge.from) : null;
            var toNode = self._nodeMap ? self._nodeMap.get(edge.to) : null;
            if (!fromNode || !toNode || fromNode.state !== 'unlocked' || toNode.state !== 'unlocked') {
                edgeSkipped++;
                return;
            }
        }

        var edgeEl = self.createEdgeElement(edge);
        if (edgeEl) {
            edgeFragment.appendChild(edgeEl);
            self._renderedEdges.add(edge.from + '-' + edge.to);
            edgeCount++;
        }
    });

    // Render visible nodes
    var nodeFragment = document.createDocumentFragment();
    var nodesRendered = 0;

    // Hard limit on DOM elements for ultra-light mode to prevent memory issues
    var maxNodes = this._lodLevel === 'ultralight' ? 300 : Infinity;

    this.nodes.forEach(function(node) {
        if (nodesRendered >= maxNodes) {
            return;
        }

        if (!visibleNodeIds.has(node.id) && !visibleNodeIds.has(node.formId)) {
            return;
        }

        var nodeEl = self.createNodeElement(node);
        if (nodeEl) {
            nodeFragment.appendChild(nodeEl);
            self._visibleNodes.add(node.id);
            self._renderedNodes.add(node.id);
            nodesRendered++;
        }
    });

    this.edgesLayer.appendChild(edgeFragment);
    this.nodesLayer.appendChild(nodeFragment);

    this.updateTransform();

    var elapsed = performance.now() - startTime;
    if (elapsed > 50 || nodeCount > 400) {
        console.log('[WheelRenderer] Render: ' + Math.round(elapsed) + 'ms, ' +
                    nodesRendered + '/' + nodeCount + ' nodes visible, ' +
                    edgeCount + '/' + this.edges.length + ' edges, LOD: ' + this._lodLevel +
                    (useVirtualization ? ' (VIRTUALIZED)' : ''));
    }
};

WheelRenderer.createEdgeElement = function(edge) {
    // Use O(1) map lookup instead of O(n) find
    var fromNode = this._nodeMap ? this._nodeMap.get(edge.from) : null;
    var toNode = this._nodeMap ? this._nodeMap.get(edge.to) : null;

    if (!fromNode || !toNode) return null;

    if (!this.isNodeVisible(fromNode) || !this.isNodeVisible(toNode)) {
        return null;
    }

    var cacheKey = edge.from + '-' + edge.to;
    var pathData = this._edgePathCache[cacheKey];

    if (!pathData) {
        pathData = this.calculateEdgePath(fromNode, toNode);
        this._edgePathCache[cacheKey] = pathData;
    }

    var path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    path.setAttribute('d', pathData.d);
    path.classList.add('edge');
    path.setAttribute('data-from', edge.from);
    path.setAttribute('data-to', edge.to);
    path.setAttribute('data-school', fromNode.school);  // Add school for CSS styling

    var toMystery = this.isPreviewNode(toNode);

    if (this._lodLevel === 'minimal') {
        path.setAttribute('stroke', '#444');
        path.setAttribute('stroke-width', 1);
    } else {
        var color = TREE_CONFIG.getSchoolColor(fromNode.school);
        var bothUnlocked = (fromNode.state === 'unlocked' && toNode.state === 'unlocked');

        if (toMystery) {
            path.setAttribute('stroke', this.dimColor(color, 0.4));
            path.setAttribute('stroke-width', 1);
            path.setAttribute('stroke-opacity', 0.5);
        } else if (bothUnlocked) {
            // BRIGHT PATH: Both nodes are mastered - show prominent connection
            path.setAttribute('stroke', color);
            path.setAttribute('stroke-width', this._lodLevel === 'simple' ? 2.5 : 3);
            path.setAttribute('stroke-opacity', 1.0);
            path.classList.add('mastered-path');
        } else {
            // All other edges: dim neutral color (no bright school colors for unlocked->available)
            path.setAttribute('stroke', '#333');
            path.setAttribute('stroke-width', this._lodLevel === 'simple' ? 1 : 1.5);
            path.setAttribute('stroke-opacity', 0.4);
        }
    }

    this.edgeElements.set(cacheKey, path);
    return path;
};

WheelRenderer.calculateEdgePath = function(fromNode, toNode) {
    return {
        d: 'M ' + fromNode.x + ' ' + fromNode.y + ' L ' + toNode.x + ' ' + toNode.y
    };
};

WheelRenderer.isNodeVisible = function(node) {
    // Check school visibility first - if school is hidden, node doesn't exist in tree
    if (settings.schoolVisibility && settings.schoolVisibility[node.school] === false) {
        return false;
    }

    if (settings.cheatMode) return true;
    if (!settings.discoveryMode) return true;

    if (node.state === 'unlocked' || node.state === 'available' || node.state === 'learning') {
        return true;
    }

    if (this.isPreviewNode(node)) {
        return true;
    }

    return false;
};

WheelRenderer.debugDiscoveryMode = function() {
    if (!this.nodes) {
        if (typeof logTreeParser === 'function') {
            logTreeParser('Discovery Debug - NO NODES!', true);
        }
        return;
    }

    var stateCount = { unlocked: 0, available: 0, learning: 0, locked: 0, other: 0 };
    var visibleCount = 0;
    var previewCount = 0;
    var self = this;

    this.nodes.forEach(function(node) {
        if (stateCount.hasOwnProperty(node.state)) {
            stateCount[node.state]++;
        } else {
            stateCount.other++;
        }
        if (self.isNodeVisible(node)) visibleCount++;
        if (self.isPreviewNode(node)) previewCount++;
    });

    if (typeof logTreeParser === 'function') {
        logTreeParser('Discovery Debug - discoveryMode=' + settings.discoveryMode +
            ', cheatMode=' + settings.cheatMode +
            ', totalNodes=' + this.nodes.length +
            ', visible=' + visibleCount +
            ', preview=' + previewCount +
            ', states: unlocked=' + stateCount.unlocked +
            ', available=' + stateCount.available +
            ', learning=' + stateCount.learning +
            ', locked=' + stateCount.locked);
    }
};

WheelRenderer.getTreeUnlockPercent = function() {
    if (!this.nodes || this.nodes.length === 0) return 0;
    var unlockedCount = 0;
    for (var i = 0; i < this.nodes.length; i++) {
        if (this.nodes[i].state === 'unlocked') unlockedCount++;
    }
    return Math.floor((unlockedCount / this.nodes.length) * 100);
};

WheelRenderer.isPreviewNode = function(node) {
    if (!settings.discoveryMode || settings.cheatMode) return false;

    if (node.state === 'unlocked' || node.state === 'available' || node.state === 'learning') {
        return false;
    }

    if (!this.nodes) return false;

    for (var i = 0; i < this.nodes.length; i++) {
        var parent = this.nodes[i];
        if (parent.state !== 'unlocked' && parent.state !== 'available' && parent.state !== 'learning') {
            continue;
        }
        if (parent.children && parent.children.indexOf(node.id) !== -1) {
            var parentProgress = this.getNodeXPProgress(parent);
            if (parentProgress >= 20) {
                return true;
            }
        }
    }
    return false;
};

WheelRenderer.getNodeXPProgress = function(node) {
    if (node.state === 'unlocked') return 100;
    var _canonId = (typeof getCanonicalFormId === 'function') ? getCanonicalFormId(node) : node.formId;
    if (!state.spellProgress || !state.spellProgress[_canonId]) return 0;
    var progress = state.spellProgress[_canonId];
    var currentXP = progress.xp || 0;
    var requiredXP = (typeof getXPForTier === 'function' ? getXPForTier(node.level) : 100) || 100;
    return Math.min(100, Math.floor((currentXP / requiredXP) * 100));
};

// Node creation variants and color helpers moved to wheelRenderNodes.js
