/**
 * WheelRenderer Layout - Radial layout computation
 * Adds layout methods to WheelRenderer: layout, layoutRadial, layoutSectorsOnly,
 * layoutSchoolNodes, fillGaps, resolveCollisions, calculateOverlapShrink.
 *
 * Loaded after: wheelCore.js
 */

WheelRenderer.layout = function() {
    // Clear layout data for hidden schools
    var self = this;
    Object.keys(this.schools).forEach(function(schoolName) {
        if (settings.schoolVisibility && settings.schoolVisibility[schoolName] === false) {
            // Mark as hidden - clear layout data
            self.schools[schoolName].spokeAngle = undefined;
            self.schools[schoolName].startAngle = undefined;
            self.schools[schoolName].endAngle = undefined;
        }
    });

    this._edgePathCache = {};
    this._layoutCalculated = false;

    this.layoutRadial();

    // DISABLED: Dynamic shrink causes visual inconsistency
    // this.calculateOverlapShrink();

    this._layoutCalculated = true;

    // Update render positions
    this.nodes.forEach(function(node) {
        node._renderX = node.x;
        node._renderY = node.y;
    });
};

WheelRenderer.layoutRadial = function() {
    var cfg = TREE_CONFIG.wheel;
    var schoolNames = Object.keys(this.schools);
    var self = this;

    // Check if nodes have pre-computed positions from any builder
    var nodesWithPos = this.nodes.filter(function(n) {
        return n._visualFirstX !== undefined ||
               n._fromVisualFirst ||
               n._fromLayoutEngine ||
               (n.x !== undefined && n.y !== undefined && (n.x !== 0 || n.y !== 0));
    });
    var hasPrecomputedPositions = nodesWithPos.length > 0;

    console.log('[WheelRenderer] layoutAllSchools: ' + this.nodes.length + ' total nodes');
    console.log('[WheelRenderer] Nodes with pre-computed positions: ' + nodesWithPos.length);
    if (this.nodes.length > 0) {
        var sample = this.nodes[0];
        console.log('[WheelRenderer] Sample node: x=' + sample.x + ', y=' + sample.y +
                    ', _fromVisualFirst=' + sample._fromVisualFirst +
                    ', _fromLayoutEngine=' + sample._fromLayoutEngine);
    }

    if (hasPrecomputedPositions) {
        console.log('[WheelRenderer] Using pre-computed positions');
        // Just calculate school sectors for spokes/dividers, don't move nodes
        this.layoutSectorsOnly();
        return;
    }

    console.log('[WheelRenderer] No pre-computed positions, using standard layout');

    // Filter to only visible schools (visibility off = school not in tree at all)
    var visibleSchools = schoolNames.filter(function(name) {
        return !settings.schoolVisibility || settings.schoolVisibility[name] !== false;
    });
    var numSchools = visibleSchools.length;

    if (numSchools === 0) return;

    var totalPadding = numSchools * cfg.schoolPadding;
    var availableAngle = 360 - totalPadding;
    var anglePerSchool = availableAngle / numSchools;

    var currentAngle = -90;

    // Layout only visible schools - hidden schools are completely excluded
    visibleSchools.forEach(function(schoolName, i) {
        var school = self.schools[schoolName];
        var spokeAngle = currentAngle + anglePerSchool / 2;

        school.startAngle = currentAngle;
        school.endAngle = currentAngle + anglePerSchool;
        school.spokeAngle = spokeAngle;

        self.layoutSchoolNodes(schoolName, school, spokeAngle, anglePerSchool);

        currentAngle += anglePerSchool + cfg.schoolPadding;
    });
};

// Layout sectors only (for visual-first mode where node positions are pre-computed)
WheelRenderer.layoutSectorsOnly = function() {
    var cfg = TREE_CONFIG.wheel;
    var self = this;
    var schoolNames = Object.keys(this.schools);

    var visibleSchools = schoolNames.filter(function(name) {
        return !settings.schoolVisibility || settings.schoolVisibility[name] !== false;
    });
    var numSchools = visibleSchools.length;

    if (numSchools === 0) return;

    // Try to use pre-computed sliceInfo from layoutGenerator
    var hasSliceInfo = visibleSchools.some(function(name) {
        return self.schools[name].sliceInfo;
    });

    if (hasSliceInfo) {
        // USE PRE-COMPUTED SLICE INFO (exact match with layoutGenerator)
        console.log('[WheelRenderer] Using pre-computed sliceInfo from layoutGenerator');

        visibleSchools.forEach(function(schoolName) {
            var school = self.schools[schoolName];
            var sliceInfo = school.sliceInfo;

            if (sliceInfo) {
                school.startAngle = sliceInfo.startAngle;
                school.endAngle = sliceInfo.endAngle;
                school.spokeAngle = sliceInfo.spokeAngle;
            } else {
                console.warn('[WheelRenderer] Missing sliceInfo for', schoolName);
            }

            // Calculate max radius from pre-computed positions
            var schoolNodes = self.nodes.filter(function(n) { return n.school === schoolName; });
            school.maxRadius = 0;
            school.maxDepth = 0;
            schoolNodes.forEach(function(n) {
                var r = n.radius || Math.sqrt(n.x * n.x + n.y * n.y);
                if (r > school.maxRadius) school.maxRadius = r;
                if (n.depth > school.maxDepth) school.maxDepth = n.depth;
            });
        });
    } else {
        // FALLBACK: Use equal sectors matching layoutEngine's grid system
        console.log('[WheelRenderer] No sliceInfo, using equal sectors (matching layoutEngine grid)');

        var totalPadding = numSchools * cfg.schoolPadding;
        var availableAngle = 360 - totalPadding;
        var anglePerSchool = availableAngle / numSchools;
        var currentAngle = -90;  // Start at top

        visibleSchools.forEach(function(schoolName) {
            var school = self.schools[schoolName];

            school.startAngle = currentAngle;
            school.endAngle = currentAngle + anglePerSchool;
            school.spokeAngle = currentAngle + anglePerSchool / 2;

            // Calculate max radius from pre-computed positions
            var schoolNodes = self.nodes.filter(function(n) { return n.school === schoolName; });
            school.maxRadius = 0;
            school.maxDepth = 0;
            schoolNodes.forEach(function(n) {
                var r = n.radius || Math.sqrt(n.x * n.x + n.y * n.y);
                if (r > school.maxRadius) school.maxRadius = r;
                if (n.depth > school.maxDepth) school.maxDepth = n.depth;
            });

            currentAngle += anglePerSchool + cfg.schoolPadding;
        });
    }
};

WheelRenderer.layoutSchoolNodes = function(schoolName, school, spokeAngle, sectorAngle) {
    var cfg = TREE_CONFIG.wheel;
    var self = this;
    var schoolNodes = this.nodes.filter(function(n) { return n.school === schoolName; });

    // Get visual modifier for this school's shape
    var visMod = this.getSchoolVisualModifier(schoolName);

    var depthGroups = {};
    schoolNodes.forEach(function(n) {
        if (!depthGroups[n.depth]) depthGroups[n.depth] = [];
        depthGroups[n.depth].push(n);
    });

    var nodeArcLength = cfg.nodeWidth + cfg.minArcSpacing;
    var maxSectorUsage = 0.95;
    // Apply spread multiplier from shape
    var effectiveSectorAngle = sectorAngle * visMod.spreadMult;
    var maxSectorRad = (effectiveSectorAngle * maxSectorUsage) * Math.PI / 180;

    var tierRadii = [];
    // Apply tier spacing multiplier from shape
    var effectiveTierSpacing = cfg.tierSpacing * visMod.tierSpacingMult;
    var cumulativeRadius = cfg.baseRadius;

    for (var d = 0; d <= school.maxDepth; d++) {
        var tier = depthGroups[d] || [];
        var nodeCount = tier.length;

        if (nodeCount <= 1) {
            tierRadii[d] = cumulativeRadius;
            cumulativeRadius += effectiveTierSpacing;
        } else {
            var paddingMultiplier = 1 + (nodeCount > 5 ? 0.15 : 0);
            var totalArcNeeded = nodeCount * nodeArcLength * paddingMultiplier;
            var minRadiusForSpread = totalArcNeeded / maxSectorRad;
            var actualRadius = Math.max(cumulativeRadius, minRadiusForSpread);
            tierRadii[d] = actualRadius;
            cumulativeRadius = actualRadius + effectiveTierSpacing;
        }
    }

    for (var d = 1; d <= school.maxDepth; d++) {
        var minRequired = tierRadii[d - 1] + cfg.tierSpacing;
        if (tierRadii[d] < minRequired) {
            tierRadii[d] = minRequired;
        }
    }

    school.maxRadius = tierRadii[school.maxDepth] || cumulativeRadius;

    // Seeded random for consistent jitter (based on school name hash)
    var rng = seededRandom(GrowthModeUtils.hashString(schoolName));

    // Multi-root detection: find all root nodes at depth 0
    var multiRoot = false;
    var nodeOwner = {};
    var rootAngles = {};
    var depth0Roots = (depthGroups[0] || []).filter(function(n) { return n.isRoot; });
    if (depth0Roots.length <= 1) {
        // Check if there are multiple depth-0 nodes that should be roots
        depth0Roots = depthGroups[0] || [];
    }
    if (depth0Roots.length > 1) {
        multiRoot = true;
        // BFS from each root to determine subtree ownership
        depth0Roots.forEach(function(root) {
            var rootId = root.id || root.formId;
            nodeOwner[rootId] = rootId;
            var bfsQueue = [root];
            while (bfsQueue.length) {
                var cur = bfsQueue.shift();
                (cur.children || []).forEach(function(cid) {
                    if (!nodeOwner[cid]) {
                        nodeOwner[cid] = rootId;
                        var child = schoolNodes.find(function(c) { return (c.id || c.formId) === cid; });
                        if (child) bfsQueue.push(child);
                    }
                });
            }
        });
        // Assign orphan nodes to the first root
        var firstRootId = depth0Roots[0].id || depth0Roots[0].formId;
        schoolNodes.forEach(function(n) {
            var nid = n.id || n.formId;
            if (!nodeOwner[nid]) nodeOwner[nid] = firstRootId;
        });
    }

    for (var d = 0; d <= school.maxDepth; d++) {
        var tier = depthGroups[d] || [];
        var radius = tierRadii[d];

        // Apply taper for mountain shape (spread narrows at higher tiers)
        var taperFactor = 1.0;
        if (visMod.taperSpread && school.maxDepth > 0) {
            taperFactor = 1.0 - (d / school.maxDepth) * 0.5;
        }

        if (d === 0) {
            tier.forEach(function(node, j) {
                var angleOffset = 0;
                if (tier.length > 1) {
                    // Multi-root: spread roots across 70% of sector for clear visual separation
                    var rootSpread = multiRoot ? effectiveSectorAngle * 0.7 : Math.min(effectiveSectorAngle * 0.3, 30);
                    angleOffset = (j - (tier.length - 1) / 2) * (rootSpread / Math.max(tier.length - 1, 1));
                }

                var nodeAngle = spokeAngle + angleOffset;
                node.angle = nodeAngle;
                node.radius = cfg.baseRadius;
                node.spokeAngle = spokeAngle;
                node.isRoot = true;
                // Record root angle for sub-sector positioning of children
                if (multiRoot) rootAngles[node.id || node.formId] = nodeAngle;

                var rad = nodeAngle * Math.PI / 180;
                node.x = Math.cos(rad) * cfg.baseRadius;
                node.y = Math.sin(rad) * cfg.baseRadius;
            });
        } else {
            var halfSector = sectorAngle / 2;

            // Calculate spread based on shape and tier depth
            var spreadAngle;
            var fillTriangle = visMod.fillTriangle || false;

            if (fillTriangle) {
                var taperAmount = visMod.taperAmount || 0.4;
                var depthRatio = d / Math.max(school.maxDepth, 1);
                var fillSpread = 1.0 - (depthRatio * (1.0 - taperAmount));
                spreadAngle = sectorAngle * maxSectorUsage * fillSpread;
            } else {
                var availableArcLength = radius * maxSectorRad * taperFactor;
                var neededArcLength = tier.length * nodeArcLength;

                if (tier.length === 1) {
                    spreadAngle = 0;
                } else if (neededArcLength >= availableArcLength) {
                    spreadAngle = effectiveSectorAngle * maxSectorUsage * taperFactor;
                } else {
                    var minSpreadPercent = Math.min(0.6 + (tier.length * 0.05), maxSectorUsage);
                    var calculatedSpread = (neededArcLength / availableArcLength) * effectiveSectorAngle;
                    spreadAngle = Math.max(calculatedSpread, effectiveSectorAngle * minSpreadPercent);
                    spreadAngle = Math.min(spreadAngle, effectiveSectorAngle * maxSectorUsage * taperFactor);
                }
            }

            // Multi-root: position nodes in sub-sectors around their owning root
            if (multiRoot && Object.keys(rootAngles).length > 1) {
                // Group tier nodes by their owning root
                var groups = {};
                tier.forEach(function(n) {
                    var nid = n.id || n.formId;
                    var ownerId = nodeOwner[nid] || firstRootId;
                    if (!groups[ownerId]) groups[ownerId] = [];
                    groups[ownerId].push(n);
                });

                var rootIds = Object.keys(groups);
                rootIds.sort(function(a, b) { return (rootAngles[a] || 0) - (rootAngles[b] || 0); });

                var totalInTier = tier.length;

                rootIds.forEach(function(rId) {
                    var group = groups[rId];
                    var centerAngle = rootAngles[rId] || spokeAngle;
                    // Each group gets a proportional share of the spread
                    var groupShare = group.length / Math.max(totalInTier, 1);
                    var groupSpread = spreadAngle * groupShare * 0.85;

                    group.forEach(function(node, j) {
                        var angleOffset = 0;
                        if (group.length > 1) {
                            angleOffset = (j - (group.length - 1) / 2) * (groupSpread / Math.max(group.length - 1, 1));
                        }

                        var symmetryDamper = visMod.symmetry;
                        var angleJitter = visMod.angleJitter * (1 - symmetryDamper * 0.8) * (rng() - 0.5) * 2;
                        var radiusJitter = visMod.radiusJitter * (1 - symmetryDamper * 0.7) * radius * (rng() - 0.5) * 2;

                        var nodeAngle = centerAngle + angleOffset + angleJitter;
                        var nodeRadius = radius + radiusJitter;

                        var groupMod = self.applyGroupModifiers(node, nodeRadius, nodeAngle, centerAngle);
                        nodeAngle = groupMod.angle;
                        nodeRadius = groupMod.radius;

                        // Clamp to overall sector boundaries
                        var minAngle = spokeAngle - halfSector * 0.95;
                        var maxAngle = spokeAngle + halfSector * 0.95;
                        nodeAngle = Math.max(minAngle, Math.min(maxAngle, nodeAngle));

                        node.angle = nodeAngle;
                        node.radius = nodeRadius;
                        node.spokeAngle = centerAngle;

                        var rad = nodeAngle * Math.PI / 180;
                        node.x = Math.cos(rad) * nodeRadius;
                        node.y = Math.sin(rad) * nodeRadius;
                    });
                });
            } else {
                // Single-root: standard tier-wide positioning
                tier.forEach(function(node, j) {
                    var angleOffset = 0;
                    if (tier.length > 1) {
                        angleOffset = (j - (tier.length - 1) / 2) * (spreadAngle / (tier.length - 1));
                    } else if (fillTriangle) {
                        angleOffset = (rng() - 0.5) * spreadAngle * 0.5;
                    }

                    var symmetryDamper = visMod.symmetry;
                    var angleJitter = visMod.angleJitter * (1 - symmetryDamper * 0.8) * (rng() - 0.5) * 2;
                    var radiusJitter = visMod.radiusJitter * (1 - symmetryDamper * 0.7) * radius * (rng() - 0.5) * 2;

                    var nodeAngle = spokeAngle + angleOffset + angleJitter;
                    var nodeRadius = radius + radiusJitter;

                    var groupMod = self.applyGroupModifiers(node, nodeRadius, nodeAngle, spokeAngle);
                    nodeAngle = groupMod.angle;
                    nodeRadius = groupMod.radius;

                    if (settings.strictPieSlices) {
                        var minAngle = spokeAngle - halfSector * 0.95;
                        var maxAngle = spokeAngle + halfSector * 0.95;
                        nodeAngle = Math.max(minAngle, Math.min(maxAngle, nodeAngle));
                    }

                    node.angle = nodeAngle;
                    node.radius = nodeRadius;
                    node.spokeAngle = spokeAngle;

                    var rad = nodeAngle * Math.PI / 180;
                    node.x = Math.cos(rad) * nodeRadius;
                    node.y = Math.sin(rad) * nodeRadius;
                });
            }
        }
    }

    this.resolveCollisions(schoolNodes, spokeAngle, settings.strictPieSlices ? sectorAngle * 0.95 : effectiveSectorAngle * maxSectorUsage);

    // Apply Growth DSL branching rules for layout optimization
    this.applyBranchingRulesToSchool(schoolName, schoolNodes, spokeAngle, effectiveSectorAngle);

    // Apply Growth DSL modifiers if a recipe exists for this school
    this.applyModifiersToSchool(schoolName, schoolNodes, spokeAngle);
    this.applyConstraintsToSchool(schoolName, schoolNodes, spokeAngle, effectiveSectorAngle);

    // FILL GAPS: Pull nodes inward to fill empty middle areas
    this.fillGaps(schoolNodes, spokeAngle, sectorAngle, cfg, school.maxDepth);

    // Re-resolve collisions after modifiers
    this.resolveCollisions(schoolNodes, spokeAngle, sectorAngle * maxSectorUsage);
};

// fillGaps, resolveCollisions, calculateOverlapShrink moved to wheelLayoutHelpers.js
