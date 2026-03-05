/**
 * WheelRenderer Interaction - User interaction, viewport management, node state updates
 * Adds interaction methods to WheelRenderer: click, select, rotate, tooltip,
 * pan/zoom, viewport virtualization, and node state management.
 *
 * Loaded after: wheelCore.js, wheelLayout.js, wheelRender.js, wheelChrome.js
 */

// =============================================================================
// NODE CLICK & ROTATION
// =============================================================================

WheelRenderer.onNodeClick = function(node) {
    this.selectNode(node);

    // Count visible schools
    var self = this;
    var visibleSchoolCount = Object.keys(this.schools).filter(function(name) {
        return !settings.schoolVisibility || settings.schoolVisibility[name] !== false;
    }).length;

    // Get the school for this node
    var nodeSchool = node.school;
    var school = nodeSchool ? this.schools[nodeSchool] : null;

    // If 2 or fewer schools: always rotate to center the school's axis
    if (visibleSchoolCount <= 2 && school && school.spokeAngle !== undefined) {
        this.rotateSchoolToTop(nodeSchool);
        return;
    }

    // For 3+ schools: use 45-degree threshold logic
    // Calculate node's visual angle (accounting for current wheel rotation)
    var nodeAngle = node.angle || 0;
    var visualAngle = nodeAngle + this.rotation;

    // Normalize to -180 to 180 range
    while (visualAngle > 180) visualAngle -= 360;
    while (visualAngle < -180) visualAngle += 360;

    // "Top" of wheel is at -90 degrees visual
    // Calculate how far the node is from top center
    var distanceFromTop = Math.abs(visualAngle + 90);  // +90 because top is at -90
    if (distanceFromTop > 180) distanceFromTop = 360 - distanceFromTop;

    // If node is more than 45 degrees from view center, rotate school axis to top
    if (distanceFromTop > 45 && school && school.spokeAngle !== undefined) {
        this.rotateSchoolToTop(nodeSchool);
    }
};

WheelRenderer.rotateToNode = function(node) {
    // Rotate wheel so the clicked node is at the top (visual -90 degrees)
    var nodeAngle = node.angle || 0;
    var targetRotation = -90 - nodeAngle;

    var delta = targetRotation - this.rotation;
    while (delta > 180) delta -= 360;
    while (delta < -180) delta += 360;

    this.animateRotation(this.rotation + delta);
};

WheelRenderer.rotateSchoolToTop = function(schoolName) {
    var school = this.schools[schoolName];
    if (!school) return;

    var targetRotation = -90 - school.spokeAngle;
    var delta = targetRotation - this.rotation;
    while (delta > 180) delta -= 360;
    while (delta < -180) delta += 360;

    this.animateRotation(this.rotation + delta);
};

WheelRenderer.animateRotation = function(target) {
    var self = this;
    ViewTransform.animateRotation(this, target, TREE_CONFIG.animation.rotateDuration, function() {
        self.updateTransform();
    });
};

// =============================================================================
// NODE SELECTION & TOOLTIP
// =============================================================================

WheelRenderer.selectNode = function(node) {
    var self = this;

    if (this.selectedNode) {
        var prev = this.nodeElements.get(this.selectedNode.id);
        if (prev) prev.classList.remove('selected');
    }
    this.edgeElements.forEach(function(e) {
        e.classList.remove('highlighted', 'path-highlight');
    });

    this.selectedNode = node;
    var el = this.nodeElements.get(node.id);
    if (el) el.classList.add('selected');

    var visited = new Set();
    var queue = [node.id];
    while (queue.length) {
        var id = queue.shift();
        if (visited.has(id)) continue;
        visited.add(id);
        var n = this._nodeMap ? this._nodeMap.get(id) : null;
        if (!n) continue;
        n.prerequisites.forEach(function(prereq) {
            var ek = prereq + '-' + id;
            var edge = self.edgeElements.get(ek);
            if (edge) edge.classList.add('path-highlight');
            queue.push(prereq);
        });
    }

    if (node.state === 'unlocked') {
        node.children.forEach(function(cid) {
            var ek = node.id + '-' + cid;
            var edge = self.edgeElements.get(ek);
            if (edge) edge.classList.add('highlighted');
        });
    }

    window.dispatchEvent(new CustomEvent('nodeSelected', { detail: node }));
};

WheelRenderer.showTooltip = function(node, event) {
    TooltipManager.show(node, event);
};

WheelRenderer.hideTooltip = function() {
    TooltipManager.hide();
};

// =============================================================================
// VIEWPORT TRANSFORM & VIRTUALIZATION
// =============================================================================

WheelRenderer.updateTransform = function() {
    var rect = this.svg.getBoundingClientRect();
    var cx = rect.width / 2;
    var cy = rect.height / 2;

    var tx = cx + this.panX;
    var ty = cy + this.panY;

    var wheelTransform = 'translate(' + tx + ', ' + ty + ') rotate(' + this.rotation + ') scale(' + this.zoom + ')';
    this.wheelGroup.setAttribute('transform', wheelTransform);

    var hubTransform = 'translate(' + tx + ', ' + ty + ') scale(' + this.zoom + ')';
    this.centerHub.setAttribute('transform', hubTransform);

    // Update school label sizes for zoom level
    this.updateSchoolLabelScale();

    this.scheduleViewportUpdate();
};

WheelRenderer.scheduleViewportUpdate = function() {
    if (this._viewportUpdatePending) return;
    if (this.nodes.length < 50) return;

    // Skip during active panning for large trees - update happens on mouseup
    if (this.isPanning && this.nodes.length > this._virtualizeThreshold) {
        return;
    }

    var self = this;
    this._viewportUpdatePending = true;

    // Faster updates for large trees
    var delay = this.nodes.length > this._virtualizeThreshold ? 50 : 150;

    setTimeout(function() {
        self._viewportUpdatePending = false;

        var newLOD = self.getLOD();
        if (newLOD !== self._lodLevel) {
            console.log('[WheelRenderer] LOD changed to ' + newLOD + ', re-rendering');
            self.render();
            return;
        }

        // For virtualized trees, do incremental updates (skip if panning)
        if (self.nodes.length > self._virtualizeThreshold && !self.isPanning) {
            self.updateVirtualizedView();
        }
    }, delay);
};

WheelRenderer.updateVirtualizedView = function() {
    if (!this.nodes || this.nodes.length === 0) return;

    var startTime = performance.now();
    var viewport = this.getViewportBounds();
    if (!viewport) return;

    var self = this;
    var nodesAdded = 0;
    var nodesRemoved = 0;
    var edgesAdded = 0;

    // Use document fragments for batch DOM operations
    var nodeFragment = document.createDocumentFragment();
    var edgeFragment = document.createDocumentFragment();

    // Track newly added node IDs for edge rendering
    var newlyVisible = [];

    // Single pass: check each node, add if newly visible
    this.nodes.forEach(function(node) {
        if (settings.schoolVisibility && settings.schoolVisibility[node.school] === false) {
            return;
        }

        var inViewport = self.isNodeInViewport(node, viewport);
        var isRendered = self._renderedNodes.has(node.id);

        if (inViewport && !isRendered) {
            // Node entered viewport - create and queue for batch add
            var nodeEl = self.createNodeElement(node);
            if (nodeEl) {
                nodeFragment.appendChild(nodeEl);
                self._renderedNodes.add(node.id);
                self._visibleNodes.add(node.id);
                newlyVisible.push(node);
                nodesAdded++;
            }
        }
    });

    // Batch add all new nodes at once
    if (nodesAdded > 0) {
        this.nodesLayer.appendChild(nodeFragment);
    }

    // Only add edges connected to newly visible nodes (much faster than checking all edges)
    if (newlyVisible.length > 0 && newlyVisible.length < 100) {
        var newNodeIds = new Set(newlyVisible.map(function(n) { return n.id; }));
        newlyVisible.forEach(function(n) { newNodeIds.add(n.formId); });

        self.edges.forEach(function(edge) {
            var edgeKey = edge.from + '-' + edge.to;
            if (self._renderedEdges.has(edgeKey)) return;

            // Only render if connected to a newly visible node
            if (newNodeIds.has(edge.from) || newNodeIds.has(edge.to)) {
                var edgeEl = self.createEdgeElement(edge);
                if (edgeEl) {
                    edgeFragment.appendChild(edgeEl);
                    self._renderedEdges.add(edgeKey);
                    edgesAdded++;
                }
            }
        });

        if (edgesAdded > 0) {
            this.edgesLayer.appendChild(edgeFragment);
        }
    }

    // Aggressive cleanup: remove nodes far outside viewport to keep DOM small
    // Only check if we have many rendered nodes (performance optimization)
    if (this._renderedNodes.size > 600) {
        var toRemove = [];
        self._renderedNodes.forEach(function(nodeId) {
            var node = self._nodeMap ? self._nodeMap.get(nodeId) : null;
            if (node && !self.isNodeInViewport(node, viewport)) {
                toRemove.push(nodeId);
            }
        });

        // Remove in batches to avoid layout thrashing
        if (toRemove.length > 100) {
            toRemove.slice(0, 200).forEach(function(nodeId) {
                var el = self.nodeElements.get(nodeId);
                if (el && el.parentNode) {
                    el.parentNode.removeChild(el);
                    self.nodeElements.delete(nodeId);
                    self._renderedNodes.delete(nodeId);
                    self._visibleNodes.delete(nodeId);
                    nodesRemoved++;
                }
            });
        }
    }

    var elapsed = performance.now() - startTime;
    if (nodesAdded > 0 || nodesRemoved > 0 || elapsed > 15) {
        console.log('[WheelRenderer] Viewport update: +' + nodesAdded + '/-' + nodesRemoved +
                    ' nodes, +' + edgesAdded + ' edges, rendered: ' + this._renderedNodes.size +
                    ', ' + Math.round(elapsed) + 'ms');
    }
};

// =============================================================================
// VIEW CONTROLS & ZOOM
// =============================================================================

WheelRenderer.centerView = function() {
    this.rotation = 0;
    this.panX = 0;
    this.panY = 0;
    this.zoom = 0.75;
    this.updateTransform();
    document.getElementById('zoom-level').textContent = Math.round(this.zoom * 100) + '%';
};

WheelRenderer.setZoom = function(z) {
    var oldLOD = this.getLOD();
    this.zoom = Math.max(TREE_CONFIG.zoom.min, Math.min(TREE_CONFIG.zoom.max, z));

    var newLOD = this.getLOD();
    if (newLOD !== oldLOD && this.nodes.length > 0) {
        console.log('[WheelRenderer] LOD changed: ' + oldLOD + ' -> ' + newLOD);
        this.render();
    }
    this.updateTransform();
    document.getElementById('zoom-level').textContent = Math.round(this.zoom * 100) + '%';
};

// =============================================================================
// GROWTH DSL RECIPE INTERPRETER
// =============================================================================

WheelRenderer.applyGrowthRecipe = function(schoolName, recipe) {
    console.log('[WheelRenderer] Applying growth recipe to ' + schoolName);

    var parsed = GROWTH_DSL.parseRecipe(recipe);
    if (!parsed.valid) {
        console.warn('[WheelRenderer] Invalid recipe: ' + parsed.error);
        return false;
    }

    this.growthRecipes[schoolName] = parsed.recipe;
    return true;
};

WheelRenderer.getRecipeForSchool = function(schoolName) {
    return this.growthRecipes[schoolName] || GROWTH_DSL.getDefaultRecipe(schoolName);
};

WheelRenderer.clearRecipes = function() {
    this.growthRecipes = {};
};

// =============================================================================
// CLEAR & RESET
// =============================================================================

WheelRenderer.clear = function() {
    this.nodes = [];
    this.edges = [];
    this.schools = {};
    this.nodeElements.clear();
    this.edgeElements.clear();
    this.selectedNode = null;
    this.clearRecipes();

    // Clear all caches to prevent memory leaks
    this._edgePathCache = {};
    this._nodeMap = null;
    this._nodeByFormId = null;
    this._visibleNodes.clear();
    this._renderedNodes.clear();
    this._renderedEdges.clear();
    this._layoutCalculated = false;

    if (this.spokesLayer) this.spokesLayer.innerHTML = '';
    if (this.edgesLayer) this.edgesLayer.innerHTML = '';
    if (this.nodesLayer) this.nodesLayer.innerHTML = '';
    if (this.centerHub) this.centerHub.innerHTML = '';
    if (this.debugGridLayer) this.debugGridLayer.innerHTML = '';

    this.centerView();

    console.log('[SpellLearning] WheelRenderer cleared (all caches reset)');
};

// =============================================================================
// MOUSE / PAN / ZOOM INPUT HANDLERS
// =============================================================================

WheelRenderer.onMouseDown = function(e) {
    if (e.target.closest('.spell-node')) return;
    if (e.button === 0 || e.button === 2) {
        this.isPanning = true;
        this.panStartX = e.clientX - this.panX;
        this.panStartY = e.clientY - this.panY;
        this._pendingPanX = this.panX;
        this._pendingPanY = this.panY;
        this.svg.classList.add('dragging');
    }
};

WheelRenderer.onMouseMove = function(e) {
    if (this.isPanning) {
        this._pendingPanX = e.clientX - this.panStartX;
        this._pendingPanY = e.clientY - this.panStartY;

        // Use requestAnimationFrame for smooth 60fps updates
        if (!this._rafPending) {
            this._rafPending = true;
            var self = this;
            requestAnimationFrame(function() {
                self._rafPending = false;
                self.panX = self._pendingPanX;
                self.panY = self._pendingPanY;
                self.updateTransform();
            });
        }
    }
};

WheelRenderer.onMouseUp = function() {
    var wasPanning = this.isPanning;
    this.isPanning = false;
    this._rafPending = false;
    this.svg.classList.remove('dragging');

    // Trigger viewport update after pan ends for virtualized trees
    if (wasPanning && this.nodes.length > this._virtualizeThreshold) {
        this.updateVirtualizedView();
    }
};

WheelRenderer.onWheel = function(e) {
    e.preventDefault();
    var delta = -e.deltaY * TREE_CONFIG.zoom.wheelFactor * this.zoom;

    // Throttle zoom updates for large trees
    if (this.nodes.length > this._virtualizeThreshold && this._rafPending) {
        return;
    }

    this.setZoom(this.zoom + delta);
};

// =============================================================================
// NODE STATE UPDATES & LEARNING PATH TRACING
// =============================================================================

WheelRenderer.updateNodeStates = function() {
    var self = this;
    if (!this.nodes) return;

    this.nodes.forEach(function(node) {
        var el = self.nodeElements.get(node.id);
        if (el) {
            el.classList.remove('learning');
            el.classList.remove('on-learning-path');
        }
    });

    if (this.edgeElements) {
        this.edgeElements.forEach(function(edgeEl) {
            edgeEl.classList.remove('learning-path');
        });
    }

    var learningPathNodes = {};
    var learningPathEdges = {};

    for (var school in state.learningTargets) {
        var targetFormId = state.learningTargets[school];
        if (!targetFormId) continue;

        var targetNode = this._nodeByFormId ? this._nodeByFormId.get(targetFormId) : null;
        if (!targetNode || targetNode.state === 'unlocked') continue;

        self.tracePathToCenter(targetNode, learningPathNodes, learningPathEdges);
    }

    this.nodes.forEach(function(node) {
        var el = self.nodeElements.get(node.id);
        if (!el) return;

        el.classList.remove('locked', 'available', 'unlocked');
        el.classList.add(node.state || 'locked');

        var nodeBg = el.querySelector('.node-bg');
        if (nodeBg && node.state === 'unlocked') {
            nodeBg.classList.add('unlocked-bg');
        } else if (nodeBg) {
            nodeBg.classList.remove('unlocked-bg');
        }

        var _uCanonId = (typeof getCanonicalFormId === 'function') ? getCanonicalFormId(node) : node.formId;
        var isLearningTarget = state.learningTargets[node.school] === _uCanonId || state.learningTargets[node.school] === node.formId;
        var progress = state.spellProgress[_uCanonId];

        if (isLearningTarget && node.state !== 'unlocked') {
            el.classList.add('learning');
        } else if (learningPathNodes[node.id]) {
            el.classList.add('on-learning-path');
        }

        var progressEl = el.querySelector('.node-progress');
        if (progress && node.state === 'available' && !progress.unlocked) {
            var tier = self.getTierFromLevel(node.level);
            var tierScaleVal = 1;
            if (settings.nodeSizeScaling) {
                tierScaleVal = 1 + ((tier - 1) * (TREE_CONFIG.tierScaling.maxScale - 1) / 4);
            }
            var nodeWidth = TREE_CONFIG.wheel.nodeWidth * tierScaleVal;
            var nodeHeight = TREE_CONFIG.wheel.nodeHeight * tierScaleVal;

            if (!progressEl) {
                progressEl = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
                progressEl.classList.add('node-progress');
                progressEl.setAttribute('height', 3);
                progressEl.setAttribute('rx', 1.5);
                el.appendChild(progressEl);
            }
            progressEl.setAttribute('x', -nodeWidth / 2);
            progressEl.setAttribute('y', nodeHeight / 2 + 2);
            var percent = progress.required > 0 ? (progress.xp / progress.required) : 0;
            progressEl.setAttribute('width', (nodeWidth * Math.min(percent, 1)));
            progressEl.classList.toggle('ready', progress.ready || percent >= 1);
        } else if (progressEl) {
            progressEl.remove();
        }
    });

    if (this.edgeElements) {
        this.edgeElements.forEach(function(edgeEl, edgeKey) {
            edgeEl.classList.remove('unlocked-path');
            edgeEl.removeAttribute('data-school');

            if (learningPathEdges[edgeKey]) {
                edgeEl.classList.add('learning-path');
            }
        });
    }

    if (this.edgeElements && this.nodes) {
        var nodeMap = {};
        self.nodes.forEach(function(n) { nodeMap[n.id] = n; });

        this.edgeElements.forEach(function(edgeEl, edgeKey) {
            if (edgeEl.classList.contains('learning-path')) return;

            var parts = edgeKey.split('-');
            var fromId = parts[0];
            var toId = parts[1];
            var fromNode = nodeMap[fromId];
            var toNode = nodeMap[toId];

            if (fromNode && toNode && fromNode.state === 'unlocked' && toNode.state === 'unlocked') {
                edgeEl.classList.add('unlocked-path');
                edgeEl.setAttribute('data-school', toNode.school || fromNode.school);
            }
        });
    }
};

WheelRenderer.tracePathToCenter = function(node, pathNodes, pathEdges) {
    if (!node || !node.prerequisites) return;

    var self = this;
    var nodeMap = {};
    this.nodes.forEach(function(n) { nodeMap[n.id] = n; });

    var visited = {};
    var queue = [node];

    while (queue.length > 0) {
        var current = queue.shift();
        if (visited[current.id]) continue;
        visited[current.id] = true;

        if (current.id !== node.id) {
            pathNodes[current.id] = true;
        }

        if (current.prerequisites && current.prerequisites.length > 0) {
            current.prerequisites.forEach(function(prereqId) {
                var prereqNode = nodeMap[prereqId];
                if (prereqNode && !visited[prereqId]) {
                    queue.push(prereqNode);
                    pathEdges[prereqId + '-' + current.id] = true;
                }
            });
        }
    }
};
