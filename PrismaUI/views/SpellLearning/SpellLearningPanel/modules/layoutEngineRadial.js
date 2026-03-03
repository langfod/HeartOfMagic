/**
 * Layout Engine Radial - Tree-level position application (applyPositionsToTree)
 *
 * Adds the main applyPositionsToTree method to LayoutEngine.
 * This is the integration point for settingsAwareTreeBuilder: BFS growth,
 * root positioning, orphan handling, and post-processing dispatch.
 *
 * Loaded after: layoutEngineCore.js, layoutEngineGrid.js, layoutEngineUtils.js
 *
 * Depends on:
 * - layoutEngineCore.js (LayoutEngine base object)
 * - layoutEngineGrid.js (_getShapeBehaviorOverrides, _getShapeTargetAngle,
 *     _getShapeScoringWeights, _shapeConformity, _densityStretch)
 * - layoutEngineUtils.js (_barycenterReorder, _sitterNudge, _handleOrphans)
 * - config.js (GRID_CONFIG)
 * - shapeProfiles.js (getShapeProfile, getShapeMask)
 * - growthBehaviors.js (GROWTH_BEHAVIORS) - optional
 */

// =============================================================================
// TREE-LEVEL POSITION APPLICATION
// =============================================================================

/**
 * Apply positions to all nodes in a tree structure.
 * This is the main integration point for settingsAwareTreeBuilder.
 *
 * GROWTH-BEHAVIOR-AWARE: Uses shape masks, growth behaviors, and vertical bias.
 * - Shape masks filter which grid positions are valid (spiky = rays, mountain = triangle)
 * - Growth behaviors control vertical vs horizontal expansion
 * - Angular wander allows children to spread from parent
 * - layerFillThreshold controls when to move to next tier
 *
 * @param {Object} treeData - Tree data with schools property
 * @param {Object} options - Layout options {shape, seed, schoolConfigs}
 * @returns {Object} - Same treeData with positions applied to nodes
 */
LayoutEngine.applyPositionsToTree = function(treeData, options) {
    options = options || {};
    var self = this;

    if (!treeData || !treeData.schools) {
        console.warn('[LayoutEngine] applyPositionsToTree: No schools in treeData');
        return treeData;
    }

    var schoolNames = Object.keys(treeData.schools);
    var totalSchools = schoolNames.length;
    var cfg = self.getConfig();

    console.log('[LayoutEngine] Applying GROWTH-BEHAVIOR-AWARE positions to', totalSchools, 'schools');

    schoolNames.forEach(function(schoolName, schoolIndex) {
        var school = treeData.schools[schoolName];
        if (!school || !school.nodes || school.nodes.length === 0) {
            console.log('[LayoutEngine] Skipping empty school:', schoolName);
            return;
        }

        var schoolConfig = options.schoolConfigs ? options.schoolConfigs[schoolName] : null;

        // Get shape: per-school config > SCHOOL_DEFAULT_SHAPES > options.shape > 'organic'
        var shapeName = (schoolConfig && schoolConfig.shape);
        if (!shapeName && typeof SCHOOL_DEFAULT_SHAPES !== 'undefined') {
            shapeName = SCHOOL_DEFAULT_SHAPES[schoolName];
        }
        if (!shapeName) {
            shapeName = options.shape || 'organic';
        }

        // Get growth behavior for this school
        var behavior = null;
        if (typeof GROWTH_BEHAVIORS !== 'undefined') {
            // Map schools to behaviors
            var behaviorMap = {
                'Destruction': 'fire_explosion',
                'Restoration': 'gentle_bloom',
                'Alteration': 'mountain_builder',
                'Conjuration': 'portal_network',
                'Illusion': 'spider_web'
            };
            var behaviorName = behaviorMap[schoolName];
            behavior = behaviorName ? GROWTH_BEHAVIORS[behaviorName] : null;
            if (behavior) {
                _skseLog(schoolName + ': Growth behavior=' + behaviorName +
                    ' (vertBias=' + (behavior.verticalBias || 0) +
                    ', spread=' + (behavior.spreadFactor || 0.6) +
                    ', wander=' + (behavior.angularWander || 15) + ')');
            }
        }

        // Get shape profile and mask
        var shapeProfile = typeof getShapeProfile === 'function' ? getShapeProfile(shapeName) : null;
        var shapeMask = typeof getShapeMask === 'function' ? getShapeMask(shapeName) : function() { return true; };
        shapeProfile = shapeProfile || { radiusJitter: 0.1, angleJitter: 5 };

        // Extract shape-aware growth parameters
        var shapSpreadMult = typeof shapeProfile.spreadMult === 'number' ? shapeProfile.spreadMult : 1.0;
        var shapTierMult = typeof shapeProfile.tierSpacingMult === 'number' ? shapeProfile.tierSpacingMult : 1.0;
        var shapHasTaper = shapeProfile.taperSpread || false;
        var shapTaperAmount = typeof shapeProfile.taperAmount === 'number' ? shapeProfile.taperAmount : 0.5;

        // Create seeded RNG
        var seed = (options.seed || Date.now()) + self._hashString(schoolName);
        var rng = self._createSeededRandom(seed);

        // Get ALL fixed grid positions for this school
        var allGridPositions = self.getFixedGridPositions(schoolIndex, totalSchools);
        var totalSpells = school.nodes.length;

        console.log('[LayoutEngine]', schoolName + ':', totalSpells, 'spells, shape=' + shapeName +
                    (behavior ? ', behavior=' + (behavior.name || 'custom') : ''));

        // Build node lookup by formId
        var nodeByFormId = {};
        school.nodes.forEach(function(n) { nodeByFormId[n.formId] = n; });

        // Find root node(s) - support multi-root trees
        var allRootNodes = school.nodes.filter(function(n) { return n.isRoot; });
        if (allRootNodes.length === 0) {
            allRootNodes = [school.nodes.find(function(n) { return n.tier === 0; }) || school.nodes[0]];
        }
        var rootNode = allRootNodes[0];

        if (!rootNode) {
            console.warn('[LayoutEngine]', schoolName + ': No root node found!');
            return;
        }

        // === FILTER POSITIONS BY SHAPE MASK ===
        // Use padding-aware sector angles to match wheelRenderer
        var totalPaddingForSlice = totalSchools * (cfg.schoolPadding || 5);
        var availableAngleForSlice = 360 - totalPaddingForSlice;
        var sliceAngle = availableAngleForSlice / totalSchools;
        var centerAngle = schoolIndex * (sliceAngle + (cfg.schoolPadding || 5)) - 90 + sliceAngle / 2;
        var maxTierUsed = Math.max.apply(null, allGridPositions.map(function(p) { return p.tier; }));

        // Build shape mask set: positions passing mask get scoring bonus (soft filter)
        var shapeMaskedSet = {};
        var maskedCount = 0;
        allGridPositions.forEach(function(pos) {
            var key = pos.tier + '_' + pos.slotIndex;
            if (pos.tier === 0) { shapeMaskedSet[key] = true; maskedCount++; return; }
            var depthNorm = maxTierUsed > 0 ? pos.tier / maxTierUsed : 0;
            var slotsInTier = pos.slotsInTier || 3;
            var angleNorm = slotsInTier > 1 ? pos.slotIndex / (slotsInTier - 1) : 0.5;
            if (shapeMask(depthNorm, angleNorm, rng, shapeProfile)) {
                shapeMaskedSet[key] = true;
                maskedCount++;
            }
        });

        // Use ALL grid positions — shape preference applied via scoring, not hard filter
        var validPositions = allGridPositions;
        _skseLog(schoolName + ': Shape ' + shapeName + ' mask=' + maskedCount + '/' + allGridPositions.length +
            ' (spreadMult=' + shapSpreadMult.toFixed(2) + ', tierMult=' + shapTierMult.toFixed(2) +
            (shapHasTaper ? ', taper=' + shapTaperAmount : '') + ')');

        // Mark positions as used
        var usedPositions = new Set();

        // (Edge-line collision detection removed — handled at render time via curved edges)

        // === SPACING SKIP ===
        // Calculate how many positions to skip between placed nodes
        // More nodes = less skip (denser), fewer nodes = more skip (spacier)
        var gridCapacity = validPositions.length;
        var skipFactor = Math.max(0, Math.floor((gridCapacity / totalSpells) - 1));
        skipFactor = Math.min(skipFactor, 2);  // Cap at 2 (skip at most 2 adjacent slots)

        // Shape-specific skip overrides — shapes need different node densities
        if (shapeName === 'spiky') skipFactor = 0;       // Tight on rays — no spacing
        else if (shapeName === 'swords') skipFactor = 0;   // Dense blade fill
        else if (shapeName === 'explosion') skipFactor = 0; // Dense core packing
        else if (shapeName === 'mountain') skipFactor = 0;  // Dense base packing
        else if (shapeName === 'portals') skipFactor = 0;   // Dense (holes remove nodes via mask)
        else if (shapeName === 'cloud') skipFactor = Math.min(3, skipFactor + 1); // Extra gaps
        console.log('[LayoutEngine]', schoolName + ': Skip factor=' + skipFactor + ' (capacity=' + gridCapacity + ', spells=' + totalSpells + ', shape=' + shapeName + ')');

        // Helper: mark a position and its adjacent slots as used
        function markPositionUsed(pos) {
            usedPositions.add(pos.tier + '_' + pos.slotIndex);

            // Mark adjacent slots on same tier as spacing-reserved
            for (var skip = 1; skip <= skipFactor; skip++) {
                usedPositions.add(pos.tier + '_' + (pos.slotIndex + skip));
                usedPositions.add(pos.tier + '_' + (pos.slotIndex - skip));
            }
        }

        // === GET GROWTH BEHAVIOR SETTINGS ===
        var verticalBias = behavior ? (behavior.verticalBias || 0) : 0;
        var layerFillThreshold = behavior ? (behavior.layerFillThreshold || 0.3) : 0.3;
        var angularWander = behavior ? (behavior.angularWander || 15) : 15;
        var spreadFactor = behavior ? (behavior.spreadFactor || 0.6) : 0.6;

        // Apply shape profile to growth parameters
        // Narrow shapes (spiky=0.6, linear=0.5) → less wander/spread
        // Wide shapes (mountain=1.0, radial=1.0) → full wander/spread
        angularWander = angularWander * shapSpreadMult;
        spreadFactor = spreadFactor * shapSpreadMult;

        // Shape-specific behavior overrides — force growth pattern to match silhouette
        var shapeOverrides = LayoutEngine._getShapeBehaviorOverrides(shapeName);
        if (shapeOverrides) {
            if (shapeOverrides.verticalBias !== undefined) verticalBias = shapeOverrides.verticalBias;
            if (shapeOverrides.angularWander !== undefined) angularWander = shapeOverrides.angularWander;
            if (shapeOverrides.layerFillThreshold !== undefined) layerFillThreshold = shapeOverrides.layerFillThreshold;
        }

        // Track tier fill levels
        var tierFillCounts = {};
        var tierCapacities = {};
        validPositions.forEach(function(p) {
            tierCapacities[p.tier] = (tierCapacities[p.tier] || 0) + 1;
            tierFillCounts[p.tier] = 0;
        });

        // === POSITION ALL ROOTS ===
        // In multi-root mode, all roots go at tier 0 (center ring)
        var tier0Positions = validPositions.filter(function(p) {
            return p.tier === 0;
        });

        // Spread roots across 50% of usable angle — keeps them well inside sector borders
        var usableAngle = sliceAngle * 0.85;
        var rootSpreadTotal = allRootNodes.length > 1 ? usableAngle * 0.5 : 0;
        var rootStep = allRootNodes.length > 1 ? rootSpreadTotal / (allRootNodes.length - 1) : 0;
        var processedFormIds = new Set();
        var assignedCount = 0;
        var rootRadius = cfg.baseRadius;  // tier 0 radius

        allRootNodes.forEach(function(rn, rIdx) {
            var targetAngle = allRootNodes.length > 1
                ? centerAngle - rootSpreadTotal / 2 + rIdx * rootStep
                : centerAngle;

            // Place roots at EXACT target angle — don't snap to grid
            // Roots define the tree center, they should be precisely positioned
            var rad = targetAngle * Math.PI / 180;
            rn.x = Math.cos(rad) * rootRadius;
            rn.y = Math.sin(rad) * rootRadius;
            rn.radius = rootRadius;
            rn.angle = targetAngle;
            rn._gridTier = 0;
            rn._fromLayoutEngine = true;
            rn._gridSlot = '0_root_' + rIdx;

            // Mark closest tier-0 grid slot as used so children don't land on top of root
            var closestSlot = tier0Positions.filter(function(p) {
                return !usedPositions.has(p.tier + '_' + p.slotIndex);
            }).sort(function(a, b) {
                return Math.abs(a.angle - targetAngle) - Math.abs(b.angle - targetAngle);
            })[0];
            if (closestSlot) {
                usedPositions.add(closestSlot.tier + '_' + closestSlot.slotIndex);
            }
            tierFillCounts[0] = (tierFillCounts[0] || 0) + 1;
            processedFormIds.add(rn.formId);
            assignedCount++;

            _skseLog(schoolName + ': Root ' + rIdx + ' (' + (rn.name || rn.formId) + ') at angle ' + targetAngle.toFixed(1) + ' (center=' + centerAngle.toFixed(1) + ')');
        });

        console.log('[LayoutEngine]', schoolName + ': Positioned', allRootNodes.length, 'root nodes at tier 0',
                    '(spread=' + rootSpreadTotal.toFixed(1) + '° across ' + usableAngle.toFixed(1) + '° usable)');

        // === LEVEL-BASED ROUND-ROBIN BFS GROWTH ===
        // Level 0: All roots place their children first (evenly spread)
        // Level 1+: Each parent takes turns placing ONE child, cycling through parents
        // New children added to NEXT level queue (not current)

        // Current level heads: start with ALL root nodes
        // Track rootAngle for sub-sector containment in multi-root mode
        var isMultiRoot = allRootNodes.length > 1;
        var currentLevel = allRootNodes.map(function(rn) {
            return {
                node: rn,
                childIndex: 0,
                numChildren: (rn.children || []).length,
                baseSpread: sliceAngle * spreadFactor / Math.max((rn.children || []).length, 1),
                rootAngle: rn.angle || centerAngle
            };
        });
        var nextLevel = [];

        var totalRootChildren = allRootNodes.reduce(function(sum, rn) { return sum + (rn.children || []).length; }, 0);
        console.log('[LayoutEngine] Level-based round-robin starting with', totalRootChildren, 'root children from', allRootNodes.length, 'roots');

        while (currentLevel.length > 0 || nextLevel.length > 0) {
            // If current level exhausted, move to next level
            if (currentLevel.length === 0) {
                currentLevel = nextLevel;
                nextLevel = [];
                continue;
            }

            var head = currentLevel.shift();
            var parent = head.node;
            var childrenIds = parent.children || [];

            // Skip if no more children to place
            if (head.childIndex >= childrenIds.length) continue;

            var childId = childrenIds[head.childIndex];

            // Skip already processed
            if (processedFormIds.has(childId)) {
                head.childIndex++;
                if (head.childIndex < childrenIds.length) {
                    currentLevel.push(head);  // Re-queue in CURRENT level
                }
                continue;
            }

            var childNode = nodeByFormId[childId];
            if (!childNode) {
                head.childIndex++;
                if (head.childIndex < childrenIds.length) {
                    currentLevel.push(head);  // Re-queue in CURRENT level
                }
                continue;
            }

            var parentTier = parent._gridTier || 0;
            var parentAngle = parent.angle || centerAngle;

            // === DETERMINE TARGET TIER BASED ON BEHAVIOR ===
            var childTier = parentTier + 1;

            if (verticalBias > 0 && rng() < verticalBias) {
                childTier = parentTier + 1 + Math.floor(rng() * 2);
            } else if (verticalBias < 0) {
                var currentFill = tierFillCounts[parentTier] / (tierCapacities[parentTier] || 1);
                if (currentFill < layerFillThreshold && tierCapacities[parentTier] > tierFillCounts[parentTier]) {
                    childTier = parentTier;
                }
            }

            // Tier 0 is RESERVED for root nodes only - non-root children must be tier 1+
            if (childTier < 1) childTier = 1;

            // Shape-aware tier bias
            if (shapTierMult > 1.1) {
                // Elongated shapes (spiky 1.4): skip extra tiers → tall narrow growth
                if (rng() < (shapTierMult - 1.0) * 0.5) childTier += 1;
            } else if (shapTierMult < 0.9) {
                // Compact shapes (mountain 0.6, radial 0.85): pack tiers tightly
                if (rng() < (1.0 - shapTierMult) * 0.4 && childTier > 1 &&
                    tierCapacities[childTier - 1] > (tierFillCounts[childTier - 1] || 0)) {
                    childTier = childTier - 1;
                }
            }

            // === GET AVAILABLE POSITIONS WITH SHAPE FILTERING ===
            // Shapes that need strong silhouettes get wider tier search
            var tierSearchRange = 2;
            if (shapeName === 'spiky') tierSearchRange = 6;      // Spikes extend far outward
            else if (shapeName === 'cloud') tierSearchRange = 5;  // Clouds scatter at various depths
            else if (shapeName === 'tree' && depthRatio >= 0.35) tierSearchRange = 4; // Canopy spreads

            var allCandidatePositions = validPositions.filter(function(p) {
                return p.tier >= childTier &&
                       p.tier <= childTier + tierSearchRange &&
                       !usedPositions.has(p.tier + '_' + p.slotIndex);
            });

            // CRITICAL: Pre-filter to on-mask positions only.
            // This FORCES nodes into the shape's silhouette instead of soft-penalizing.
            var onMaskCandidates = allCandidatePositions.filter(function(p) {
                return shapeMaskedSet[p.tier + '_' + p.slotIndex];
            });

            // Use on-mask positions when available; fall back to all only when exhausted
            var availablePositions = onMaskCandidates.length > 0 ? onMaskCandidates : allCandidatePositions;

            // === CALCULATE TARGET ANGLE WITH SPREAD AND WANDER ===
            var spreadOffset = head.numChildren > 1 ?
                (head.childIndex - (head.numChildren - 1) / 2) * head.baseSpread : 0;
            var wanderOffset = (rng() - 0.5) * 2 * angularWander;
            var targetAngle = parentAngle + spreadOffset + wanderOffset;

            // === SHAPE-SPECIFIC ANGULAR CONTROL ===
            var depthRatio = Math.min(1.0, childTier / Math.max(cfg.maxTiers * 0.5, 8));
            var shapeAngle = LayoutEngine._getShapeTargetAngle(shapeName, {
                depthRatio: depthRatio, centerAngle: centerAngle, usableAngle: usableAngle,
                parentAngle: parentAngle, targetAngle: targetAngle, childTier: childTier, rng: rng
            });
            targetAngle = shapeAngle.targetAngle;
            childTier = shapeAngle.childTier;

            // Multi-root: bias target angle toward owning root to keep subtrees in sub-sectors
            if (isMultiRoot && head.rootAngle !== undefined) {
                var rootBias = 0.3;
                targetAngle = targetAngle * (1 - rootBias) + head.rootAngle * rootBias;
            }

            // === SHAPE-SPECIFIC SCORING WEIGHTS ===
            var weights = LayoutEngine._getShapeScoringWeights(shapeName, depthRatio);
            var angleDiffWeight = weights.angleDiffWeight;
            var tierDiffWeight = weights.tierDiffWeight;
            var pickTopN = weights.pickTopN;

            // === SCORE POSITIONS ===
            var scoredPositions = availablePositions.map(function(pos) {
                if (usedPositions.has(pos.tier + '_' + pos.slotIndex)) return null;

                var angleDiff = Math.abs(pos.angle - targetAngle);
                var tierDiff = Math.abs(pos.tier - childTier);
                var randomBonus = rng() * 20;

                var score = angleDiff * angleDiffWeight + tierDiff * tierDiffWeight - randomBonus;

                if (pos.tier < parentTier && verticalBias > -0.5) {
                    score += 100;
                }

                // Multi-root: penalize positions far from owning root's angle
                if (isMultiRoot && head.rootAngle !== undefined) {
                    var rootAngleDist = Math.abs(pos.angle - head.rootAngle);
                    score += rootAngleDist * 1.5;
                }

                // Shape mask preference: very heavily penalize off-shape positions
                if (!shapeMaskedSet[pos.tier + '_' + pos.slotIndex]) {
                    score += 800;
                }

                return { pos: pos, score: score };
            }).filter(function(s) { return s !== null; });

            scoredPositions.sort(function(a, b) { return a.score - b.score; });

            var pickIndex = Math.floor(rng() * Math.min(pickTopN, scoredPositions.length));
            var selected = scoredPositions[pickIndex];

            // === FALLBACK: Search wider with mask priority ===
            if (!selected && scoredPositions.length === 0) {
                // First try on-mask positions across ALL tiers
                var allAvailable = validPositions.filter(function(p) {
                    return p.tier >= 1 && !usedPositions.has(p.tier + '_' + p.slotIndex);
                });

                // CRITICAL: Try on-mask positions first in fallback too
                var fallbackOnMask = allAvailable.filter(function(p) {
                    return shapeMaskedSet[p.tier + '_' + p.slotIndex];
                });
                if (fallbackOnMask.length > 0) {
                    allAvailable = fallbackOnMask;
                }

                if (allAvailable.length > 0) {
                    var fallbackScored = allAvailable.map(function(pos) {
                        var angleDiff = Math.abs(pos.angle - targetAngle);
                        var tierDiff = Math.abs(pos.tier - childTier);
                        var distFromParent = Math.abs(pos.tier - parentTier);

                        // Base score: use shape-specific weights (same as primary, slightly relaxed)
                        var score = angleDiff * angleDiffWeight + tierDiff * Math.max(tierDiffWeight * 0.75, 25);

                        // Growth direction penalties
                        if (verticalBias > 0) {
                            // "Up" mode: penalize going backward or staying same tier
                            if (pos.tier <= parentTier) {
                                score += 80;
                            }
                        } else if (verticalBias < 0) {
                            // "Dense" mode: reward staying on same/adjacent tier
                            if (distFromParent > 1) {
                                score += distFromParent * 25;
                            }
                            // Check layer fill - prefer unfilled tiers
                            var tierFill = tierFillCounts[pos.tier] / (tierCapacities[pos.tier] || 1);
                            if (tierFill < layerFillThreshold) {
                                score -= 20;  // Bonus for filling sparse tiers
                            }
                        }

                        // Penalize going too far from parent
                        score += distFromParent * 15;

                        // Multi-root: penalize positions far from owning root's angle
                        if (isMultiRoot && head.rootAngle !== undefined) {
                            var rootAngleDist = Math.abs(pos.angle - head.rootAngle);
                            score += rootAngleDist * 1.5;
                        }

                        // Shape mask preference — strong even in fallback
                        if (!shapeMaskedSet[pos.tier + '_' + pos.slotIndex]) {
                            score += 500;
                        }

                        return { pos: pos, score: score };
                    });

                    fallbackScored.sort(function(a, b) { return a.score - b.score; });
                    selected = fallbackScored[0];
                    console.log('[LayoutEngine] Fallback position for', childNode.name || childId,
                        'at tier', selected.pos.tier, 'angle', selected.pos.angle.toFixed(1));
                } else {
                    // INTERPOLATE: Create position between grid points (last resort)
                    var interpRadius = cfg.baseRadius + childTier * cfg.tierSpacing;
                    var interpAngleRad = targetAngle * Math.PI / 180;
                    selected = {
                        pos: {
                            x: Math.cos(interpAngleRad) * interpRadius,
                            y: Math.sin(interpAngleRad) * interpRadius,
                            tier: childTier,
                            angle: targetAngle,
                            radius: interpRadius,
                            slotIndex: 'interp_' + assignedCount,
                            isInterpolated: true
                        },
                        score: 9999
                    };
                    console.log('[LayoutEngine] Interpolated position for', childNode.name || childId);
                }
            }

            if (selected) {
                var bestPos = selected.pos;
                childNode.x = bestPos.x;
                childNode.y = bestPos.y;
                childNode.radius = bestPos.radius;
                childNode.angle = bestPos.angle;
                childNode._gridTier = bestPos.tier;
                childNode._fromLayoutEngine = true;
                childNode._gridSlot = bestPos.tier + '_' + bestPos.slotIndex;
                childNode._isInterpolated = bestPos.isInterpolated || false;

                if (!bestPos.isInterpolated) {
                    markPositionUsed(bestPos);
                } else {
                    usedPositions.add(childNode._gridSlot);  // Mark interpolated without skip
                }

                tierFillCounts[bestPos.tier] = (tierFillCounts[bestPos.tier] || 0) + 1;
                assignedCount++;
                processedFormIds.add(childId);

                // Add child as new head if it has children - goes to NEXT level
                var grandchildren = childNode.children || [];
                if (grandchildren.length > 0) {
                    nextLevel.push({
                        node: childNode,
                        childIndex: 0,
                        numChildren: grandchildren.length,
                        baseSpread: sliceAngle * spreadFactor / Math.max(grandchildren.length, 1),
                        rootAngle: head.rootAngle
                    });
                }
            }

            // Re-queue current head if more children remain - stays in CURRENT level
            head.childIndex++;
            if (head.childIndex < childrenIds.length) {
                currentLevel.push(head);
            }
        }

        // === HANDLE ORPHANS ===
        assignedCount = LayoutEngine._handleOrphans({
            school: school, processedFormIds: processedFormIds,
            validPositions: validPositions, allGridPositions: allGridPositions,
            usedPositions: usedPositions, schoolName: schoolName, assignedCount: assignedCount
        });

        // === POST-PROCESSING PASSES ===
        // Build context object for extracted post-processing methods
        var ctx = {
            school: school,
            nodeByFormId: nodeByFormId,
            allRootNodes: allRootNodes,
            cfg: cfg,
            centerAngle: centerAngle,
            sliceAngle: sliceAngle,
            usableAngle: usableAngle,
            shapeName: shapeName,
            shapeProfile: shapeProfile,
            shapSpreadMult: shapSpreadMult,
            shapTierMult: shapTierMult,
            shapHasTaper: shapHasTaper,
            shapTaperAmount: shapTaperAmount,
            rng: rng,
            schoolName: schoolName
        };
        LayoutEngine._barycenterReorder(ctx);
        LayoutEngine._sitterNudge(ctx);
        LayoutEngine._shapeConformity(ctx);
        LayoutEngine._densityStretch(ctx);

        console.log('[LayoutEngine]', schoolName + ':', assignedCount + '/' + school.nodes.length,
            'nodes positioned (growth-behavior-aware)');
    });

    return treeData;
};
