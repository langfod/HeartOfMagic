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

WheelRenderer.createNodeElement = function(node) {
    if (!this.isNodeVisible(node)) {
        return null;
    }

    // Ultra-light: just colored dots, no groups, no text
    if (this._lodLevel === 'ultralight') {
        return this.createUltraLightNode(node);
    }

    // Use minimal nodes for LOD 'minimal' - much faster rendering
    if (this._lodLevel === 'minimal') {
        return this.createMinimalNode(node);
    }

    if (this.isPreviewNode(node)) {
        return this.createMysteryNode(node);
    }

    return this.createFullNode(node);
};

WheelRenderer.createUltraLightNode = function(node) {
    var circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
    circle.setAttribute('cx', node.x);
    circle.setAttribute('cy', node.y);

    // Size based on state
    var r = node.state === 'unlocked' ? 5 : 3;
    circle.setAttribute('r', r);

    // Color based on state
    var color;
    if (node.state === 'unlocked') {
        color = TREE_CONFIG.getSchoolColor(node.school);
    } else if (node.state === 'available') {
        color = '#666';
    } else {
        color = '#333';
    }
    circle.setAttribute('fill', color);

    // Minimal data for click handling
    circle.setAttribute('data-id', node.id);
    circle.classList.add('spell-node', 'ultralight');

    this.nodeElements.set(node.id, circle);
    return circle;
};

WheelRenderer.createMysteryNode = function(node) {
    var cfg = TREE_CONFIG.wheel;
    var self = this;

    // Use school-specific shape for mystery nodes
    var shapeSize = cfg.nodeWidth * 0.35;  // Slightly smaller than locked nodes

    var g = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    g.setAttribute('class', 'node mystery-node');
    g.setAttribute('data-id', node.id);
    g.setAttribute('data-school', node.school);

    var rotationAngle = node.angle + 90;
    g.setAttribute('transform', 'translate(' + node.x + ',' + node.y + ') rotate(' + rotationAngle + ')');

    var schoolColor = TREE_CONFIG.getSchoolColor(node.school);
    var dimmedColor = this.dimColor(schoolColor, 0.4);

    // Create school-specific shape instead of rectangle
    var shape = this.createSchoolShape(node.school, shapeSize, shapeSize);
    shape.setAttribute('fill', 'rgba(20, 20, 30, 0.9)');
    shape.setAttribute('stroke', dimmedColor);
    shape.setAttribute('stroke-width', '1');
    shape.classList.add('mystery-bg');
    g.appendChild(shape);

    // Single "?" text inside
    var text = document.createElementNS('http://www.w3.org/2000/svg', 'text');
    text.setAttribute('text-anchor', 'middle');
    text.setAttribute('dominant-baseline', 'middle');
    text.setAttribute('fill', dimmedColor);
    text.setAttribute('font-size', '10px');
    text.setAttribute('font-weight', 'bold');
    text.textContent = '?';
    g.appendChild(text);

    // Event listeners delegated at nodesLayer level
    // Hover effects handled via CSS :hover pseudo-class instead
    this.nodeElements.set(node.id, g);
    return g;
};

WheelRenderer.dimColor = function(color, factor) {
    if (color.startsWith('#')) {
        var r = parseInt(color.slice(1, 3), 16);
        var g = parseInt(color.slice(3, 5), 16);
        var b = parseInt(color.slice(5, 7), 16);
        r = Math.round(r * factor);
        g = Math.round(g * factor);
        b = Math.round(b * factor);
        return 'rgb(' + r + ',' + g + ',' + b + ')';
    }
    var match = color.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
    if (match) {
        var r = Math.round(parseInt(match[1]) * factor);
        var g = Math.round(parseInt(match[2]) * factor);
        var b = Math.round(parseInt(match[3]) * factor);
        return 'rgb(' + r + ',' + g + ',' + b + ')';
    }
    return color;
};

WheelRenderer.brightenColor = function(color, factor) {
    // Brighten a color by factor (1.0 = same, 1.5 = 50% brighter)
    var r, g, b;
    if (color.startsWith('#')) {
        r = parseInt(color.slice(1, 3), 16);
        g = parseInt(color.slice(3, 5), 16);
        b = parseInt(color.slice(5, 7), 16);
    } else {
        var match = color.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
        if (match) {
            r = parseInt(match[1]);
            g = parseInt(match[2]);
            b = parseInt(match[3]);
        } else {
            return color;
        }
    }
    // Brighten toward white
    r = Math.min(255, Math.round(r + (255 - r) * (factor - 1)));
    g = Math.min(255, Math.round(g + (255 - g) * (factor - 1)));
    b = Math.min(255, Math.round(b + (255 - b) * (factor - 1)));
    return 'rgb(' + r + ',' + g + ',' + b + ')';
};

WheelRenderer.getInnerAccentColor = function(schoolColor) {
    // Create a contrasting inner color - darker and slightly different hue
    var r, g, b;
    if (schoolColor.startsWith('#')) {
        r = parseInt(schoolColor.slice(1, 3), 16);
        g = parseInt(schoolColor.slice(3, 5), 16);
        b = parseInt(schoolColor.slice(5, 7), 16);
    } else {
        var match = schoolColor.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
        if (match) {
            r = parseInt(match[1]);
            g = parseInt(match[2]);
            b = parseInt(match[3]);
        } else {
            return '#1a1a2e';  // Default dark
        }
    }
    // Make it darker (40% of original) with slight warmth
    r = Math.round(r * 0.35);
    g = Math.round(g * 0.3);
    b = Math.round(b * 0.4);
    return 'rgb(' + r + ',' + g + ',' + b + ')';
};

WheelRenderer.createMinimalNode = function(node) {
    var color = node.state === 'unlocked' ? TREE_CONFIG.getSchoolColor(node.school) : '#333';
    var shape;

    if (node.state === 'unlocked') {
        // Unlocked: circle
        shape = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
        shape.setAttribute('cx', node.x);
        shape.setAttribute('cy', node.y);
        shape.setAttribute('r', 6);
    } else {
        // Locked/available: diamond (using polygon with transform)
        shape = document.createElementNS('http://www.w3.org/2000/svg', 'polygon');
        var r = 6;
        var points = [
            (node.x) + ',' + (node.y - r),    // top
            (node.x + r) + ',' + (node.y),    // right
            (node.x) + ',' + (node.y + r),    // bottom
            (node.x - r) + ',' + (node.y)     // left
        ].join(' ');
        shape.setAttribute('points', points);
    }
    shape.setAttribute('fill', color);
    shape.classList.add('spell-node', 'minimal', node.state);
    shape.setAttribute('data-id', node.id);

    // Event listeners delegated at nodesLayer level
    this.nodeElements.set(node.id, shape);
    return shape;
};

WheelRenderer.createSimpleNode = function(node) {
    var g = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    g.classList.add('spell-node', 'simple', node.state);
    g.setAttribute('data-id', node.id);
    g.setAttribute('transform', 'translate(' + node.x + ', ' + node.y + ')');

    // Check for LLM group color override
    var groupColor = this.getNodeGroupColor(node);
    var color = groupColor || TREE_CONFIG.getSchoolColor(node.school);

    var lockedSize = 16;
    var unlockedSize = 24;  // Bigger when unlocked
    var innerSize = 10;     // Inner accent

    var shape;
    if (node.state === 'unlocked') {
        // Unlocked: larger filled school shape with inner accent
        shape = this.createSchoolShape(node.school, unlockedSize, unlockedSize);
        shape.setAttribute('fill', color);
        shape.setAttribute('stroke', this.brightenColor(color, 1.3));
        shape.setAttribute('stroke-width', '2');
        g.appendChild(shape);

        // Inner accent
        var innerShape = this.createSchoolShape(node.school, innerSize, innerSize);
        innerShape.setAttribute('fill', this.getInnerAccentColor(color));
        innerShape.setAttribute('stroke', 'none');
        g.appendChild(innerShape);
    } else {
        // Locked/available: small outline school shape
        shape = this.createSchoolShape(node.school, lockedSize, lockedSize);
        shape.setAttribute('fill', '#1a1a2e');
        shape.setAttribute('stroke', color);
        shape.setAttribute('stroke-width', '1');
        shape.setAttribute('stroke-opacity', node.state === 'locked' ? 0.3 : 0.8);
        g.appendChild(shape);
    }

    if (groupColor) {
        shape.classList.add('group-colored');
    }

    // No text for simple nodes - clean shapes only

    // Event listeners delegated at nodesLayer level
    this.nodeElements.set(node.id, g);
    return g;
};

WheelRenderer.createSchoolShape = function(school, width, height) {
    var shape;
    var hw = width / 2;
    var hh = height / 2;
    var points;

    switch (school) {
        case 'Destruction':
            // Diamond - aggressive, sharp
            shape = document.createElementNS('http://www.w3.org/2000/svg', 'polygon');
            points = [
                '0,' + (-hh),
                hw + ',0',
                '0,' + hh,
                (-hw) + ',0'
            ].join(' ');
            shape.setAttribute('points', points);
            break;

        case 'Restoration':
            // Rounded pill/oval - healing, soft
            shape = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
            shape.setAttribute('x', -hw);
            shape.setAttribute('y', -hh);
            shape.setAttribute('width', width);
            shape.setAttribute('height', height);
            shape.setAttribute('rx', Math.min(hw, hh));  // Fully rounded ends
            break;

        case 'Alteration':
            // Hexagon - transformation, change
            shape = document.createElementNS('http://www.w3.org/2000/svg', 'polygon');
            var hexW = hw * 0.9;
            var hexH = hh * 0.5;
            points = [
                '0,' + (-hh),
                hexW + ',' + (-hexH),
                hexW + ',' + hexH,
                '0,' + hh,
                (-hexW) + ',' + hexH,
                (-hexW) + ',' + (-hexH)
            ].join(' ');
            shape.setAttribute('points', points);
            break;

        case 'Conjuration':
            // Pentagon - summoning, mystical
            shape = document.createElementNS('http://www.w3.org/2000/svg', 'polygon');
            var r = Math.min(hw, hh);
            points = [];
            for (var i = 0; i < 5; i++) {
                var angle = (i * 72 - 90) * Math.PI / 180;
                points.push((Math.cos(angle) * r) + ',' + (Math.sin(angle) * r));
            }
            shape.setAttribute('points', points.join(' '));
            break;

        case 'Illusion':
            // Triangle pointing up - mysterious, mind
            shape = document.createElementNS('http://www.w3.org/2000/svg', 'polygon');
            points = [
                '0,' + (-hh),
                hw + ',' + hh,
                (-hw) + ',' + hh
            ].join(' ');
            shape.setAttribute('points', points);
            break;

        default:
            // Default: diamond
            shape = document.createElementNS('http://www.w3.org/2000/svg', 'polygon');
            points = [
                '0,' + (-hh),
                hw + ',0',
                '0,' + hh,
                (-hw) + ',0'
            ].join(' ');
            shape.setAttribute('points', points);
    }

    return shape;
};

WheelRenderer.createFullNode = function(node) {
    var cfg = TREE_CONFIG.wheel;
    var tierScale = TREE_CONFIG.tierScaling;
    var self = this;

    var tier = node.level ? this.getTierFromLevel(node.level) : (node.tier || 0);
    tier = Math.min(4, Math.max(0, tier));

    // FIXED NODE SIZE - no tier scaling, no shrink
    // All nodes should be the same size for visual consistency
    var nodeWidth = cfg.nodeWidth;
    var nodeHeight = cfg.nodeHeight;

    node._renderWidth = nodeWidth;
    node._renderHeight = nodeHeight;

    var g = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    g.classList.add('spell-node', node.state);
    g.setAttribute('data-id', node.id);
    g.setAttribute('data-school', node.school);
    g.setAttribute('data-tier', tier);

    var rotationAngle = node.angle + 90;
    g.setAttribute('transform', 'translate(' + node.x + ', ' + node.y + ') rotate(' + rotationAngle + ')');

    // Check for LLM group color override
    var groupColor = this.getNodeGroupColor(node);
    var color = groupColor || TREE_CONFIG.getSchoolColor(node.school);

    // ALL NODES: School-specific shapes
    // UNLOCKED: Bigger shape, filled with school color, inner shape with accent
    // LOCKED/AVAILABLE: Smaller shape, outline only
    var bgShape;
    var lockedSize = nodeWidth * 0.4;
    var unlockedSize = nodeWidth * 0.6;  // Bigger when unlocked
    var innerSize = unlockedSize * 0.5;  // Inner accent shape

    if (node.state === 'unlocked') {
        // UNLOCKED: Larger filled shape with inner accent
        bgShape = this.createSchoolShape(node.school, unlockedSize, unlockedSize);
        bgShape.setAttribute('fill', color);
        bgShape.setAttribute('stroke', this.brightenColor(color, 1.3));
        bgShape.setAttribute('stroke-width', '2');
        bgShape.setAttribute('stroke-opacity', '1');
        bgShape.classList.add('node-bg', 'unlocked-shape');
        g.appendChild(bgShape);

        // Inner accent shape (learning color or darker version)
        var innerShape = this.createSchoolShape(node.school, innerSize, innerSize);
        var innerColor = this.getInnerAccentColor(color);
        innerShape.setAttribute('fill', innerColor);
        innerShape.setAttribute('stroke', 'none');
        innerShape.classList.add('node-inner');
        g.appendChild(innerShape);
    } else {
        // LOCKED/AVAILABLE: Smaller outline shape
        bgShape = this.createSchoolShape(node.school, lockedSize, lockedSize);
        bgShape.classList.add('node-bg');
        g.appendChild(bgShape);
    }

    // Mark node if it has group color
    if (groupColor) {
        g.classList.add('group-colored');
        g.setAttribute('data-group-color', groupColor);
        bgShape.setAttribute('stroke', groupColor);
        bgShape.setAttribute('stroke-width', '2');
        bgShape.setAttribute('stroke-opacity', '0.6');
    }

    // NO text for any nodes - clean shapes only

    // Event listeners are now delegated at nodesLayer level for performance
    this.nodeElements.set(node.id, g);
    return g;
};

WheelRenderer.getNodeDisplayName = function(node, nodeWidth) {
    // Cheat mode shows all names
    if (settings.cheatMode) {
        var name = node.name || 'Unknown';
        return name.length > 10 ? name.slice(0, 9) + '\u2026' : name;
    }

    // Locked nodes show ??? (unless showNodeNames is on)
    if (node.state === 'locked' && !settings.showNodeNames) {
        return '???';
    }

    // Unlocked nodes always show name
    if (node.state === 'unlocked') {
        if (node.name) {
            var maxLen = Math.floor(nodeWidth / 7);
            return node.name.length > maxLen ? node.name.slice(0, maxLen - 1) + '\u2026' : node.name;
        }
        return node.formId.replace('0x', '').slice(-6);
    }

    // Learning nodes always show name (player explicitly chose them)
    if (node.state === 'learning') {
        if (node.name) {
            var maxLen = Math.floor(nodeWidth / 7);
            return node.name.length > maxLen ? node.name.slice(0, maxLen - 1) + '\u2026' : node.name;
        }
        return node.formId.replace('0x', '').slice(-6);
    }

    // Available and other states: check progressive reveal threshold
    var nodeProgress = this.getNodeXPProgress(node);
    if (nodeProgress < settings.revealName) {
        return '???';
    }

    // Show name if above reveal threshold
    if (node.name) {
        var maxLen = Math.floor(nodeWidth / 7);
        return node.name.length > maxLen ? node.name.slice(0, maxLen - 1) + '\u2026' : node.name;
    } else if (SpellCache.isPending(node.formId)) {
        return '...';
    } else {
        return node.formId.replace('0x', '').slice(-6);
    }
};
