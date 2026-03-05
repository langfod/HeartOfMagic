/**
 * WheelRenderer Node Creation - Node element creation and color utilities.
 * Adds node creation variants and color helpers to WheelRenderer:
 * createNodeElement, createUltraLightNode, createMysteryNode, dimColor,
 * brightenColor, getInnerAccentColor, createMinimalNode, createSimpleNode,
 * createSchoolShape, createFullNode, getNodeDisplayName.
 *
 * Loaded after: wheelRender.js
 */

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
    return ColorUtils.dim(color, factor);
};

WheelRenderer.brightenColor = function(color, factor) {
    return ColorUtils.brighten(color, factor);
};

WheelRenderer.getInnerAccentColor = function(schoolColor) {
    return ColorUtils.innerAccent(schoolColor);
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
    var shapeName = ShapeDefinitions.getSchoolShape(school);

    if (shapeName === 'circle') {
        // Restoration: rounded rect (pill shape)
        shape = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
        shape.setAttribute('x', -hw);
        shape.setAttribute('y', -hh);
        shape.setAttribute('width', width);
        shape.setAttribute('height', height);
        shape.setAttribute('rx', Math.min(hw, hh));
        shape.setAttribute('ry', Math.min(hw, hh));
    } else {
        // All polygon shapes: get canonical vertices, scale to width/height
        var verts = ShapeDefinitions.getSchoolVertices(school, 1);
        var scaledVerts = [];
        for (var i = 0; i < verts.length; i++) {
            scaledVerts.push([verts[i][0] * hw, verts[i][1] * hh]);
        }
        shape = document.createElementNS('http://www.w3.org/2000/svg', 'polygon');
        shape.setAttribute('points', ShapeDefinitions.toSvgPoints(scaledVerts));
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
