/**
 * Visual-First Organic Growth Helpers
 *
 * Grid-aligned position finding and terminal cluster placement.
 * Split from vfOrganicGrowth.js to stay under 600 LOC.
 * Depends on: vfHelpers.js, layoutGenerator.js (GRID_CONFIG)
 */

// =============================================================================
// BEHAVIOR-DRIVEN POSITION FINDING
// =============================================================================

/**
 * Find position based on behavior-driven direction
 * GRID-ALIGNED: Snaps to proper tier radii and angular grid positions
 * PREVENTS OVERLAP: Uses strict distance check against ALL placed nodes
 */
function findBehaviorPosition(parent, direction, group, placedNodes, sliceInfo, shapeMask, nodeSize, minSpacing, rng, params) {
    var candidates = [];
    var baseAngle = direction.angle;

    // GRID CONFIGURATION - Use unified source from config.js
    var gridCfg = GRID_CONFIG.getComputedConfig();
    var baseRadius = gridCfg.baseRadius;
    var tierSpacing = gridCfg.tierSpacing;
    var arcSpacing = gridCfg.arcSpacing;

    // Use full minSpacing (not 0.9x) to ensure NO overlap
    var strictSpacing = minSpacing;

    // Determine target tier (snap to grid)
    var parentTier = Math.max(0, Math.round((parent.radius - baseRadius) / tierSpacing));
    var radiusStep = direction.radiusStep || tierSpacing;

    // Tier skip: how many tiers to jump (default 0 = adjacent tier, 1 = skip one tier)
    // Set to 0 for standard tree growth (nodes connect to adjacent tiers)
    var tierSkip = (params && params.tierSkip !== undefined) ? params.tierSkip : 0;
    var baseTierTarget = parentTier + 1 + tierSkip;

    // Build list of tiers to try - MORE AGGRESSIVE outward growth
    // Always try multiple tiers outward to ensure trees spread
    var tiersToTry = [baseTierTarget, baseTierTarget + 1, baseTierTarget + 2];
    // Sometimes try even further (40% chance for long branches)
    if (rng() < 0.4) {
        tiersToTry.push(baseTierTarget + 3);
    }
    // Rarely try same tier as parent (5% chance, for tight clusters)
    if (rng() < 0.05 && parentTier > 0) {
        tiersToTry.push(parentTier);
    }

    for (var t = 0; t < tiersToTry.length; t++) {
        var tier = tiersToTry[t];
        var radius = baseRadius + tier * tierSpacing;

        // Calculate angular grid positions for this tier
        var arcLength = (sliceInfo.sectorAngle / 360) * 2 * Math.PI * radius;
        var candidateCount = Math.max(3, Math.floor(arcLength / arcSpacing));
        var usableAngle = sliceInfo.sectorAngle * 0.85;
        var angleStep = candidateCount > 1 ? usableAngle / (candidateCount - 1) : 0;
        var startAngle = sliceInfo.spokeAngle - usableAngle / 2;

        // Try each angular grid position
        for (var i = 0; i < candidateCount; i++) {
            var angle = candidateCount === 1
                ? sliceInfo.spokeAngle
                : startAngle + i * angleStep;

            // NO JITTER - exact grid positions only

            // Clamp to sector
            if (angle < sliceInfo.startAngle + 3 || angle > sliceInfo.endAngle - 3) continue;

            // Check shape mask
            var tierProgress = Math.min(1, (radius - baseRadius) / (tierSpacing * 15));
            var angleNorm = (angle - sliceInfo.startAngle) / sliceInfo.sectorAngle;
            angleNorm = Math.max(0, Math.min(1, angleNorm));

            if (!shapeMask(tierProgress, angleNorm, rng)) continue;

            // Calculate position
            var rad = angle * Math.PI / 180;
            var x = Math.cos(rad) * radius;
            var y = Math.sin(rad) * radius;

            // STRICT CHECK: Position must NOT overlap with ANY placed node
            var isOccupied = false;
            for (var j = 0; j < placedNodes.length; j++) {
                var dx = x - placedNodes[j].x;
                var dy = y - placedNodes[j].y;
                var dist = Math.sqrt(dx * dx + dy * dy);
                // Use strict spacing - if distance is less than minSpacing, position is occupied
                if (dist < strictSpacing) {
                    isOccupied = true;
                    break;
                }
            }
            if (isOccupied) continue;

            // Score: prefer positions based on outwardGrowth parameter
            var angleDiff = Math.abs(angle - parent.angle);
            var tierDiff = tier - parentTier;  // Positive = outward (good), negative = inward (bad)

            // Get outwardGrowth from params (0 = compact, 1 = max outward)
            var outwardGrowth = (params && params.outwardGrowth !== undefined) ? params.outwardGrowth : 0.5;

            // Base score: lower is better
            // Small penalty for angular deviation to keep connected appearance
            var score = angleDiff * 1.5;

            // OUTWARD GROWTH BONUS: Scaled by outwardGrowth parameter
            // High outwardGrowth (0.8-1.0) = strong preference for distant tiers
            // Low outwardGrowth (0.2-0.4) = preference for adjacent tiers
            var outwardBonus = outwardGrowth * 50;  // 0-50 bonus range
            var compactBonus = (1 - outwardGrowth) * 30;  // 0-30 bonus for staying close

            if (tierDiff >= 1 && tierDiff <= 2) {
                // 1-2 tiers out: gets bonus based on outwardGrowth
                score -= outwardBonus * 0.8;  // 80% of outward bonus
            } else if (tierDiff >= 3) {
                // 3+ tiers out: full outward bonus for aggressive growth
                score -= outwardBonus;
            } else if (tierDiff === 0) {
                // Same tier: gets bonus if low outwardGrowth (compact)
                score -= compactBonus;
                // But still penalize somewhat to prevent stagnation
                score += 20;
            } else {
                // Going inward: always penalize
                score += 100;
            }

            // SYMMETRY: Higher symmetry = prefer angular positions closer to slice center
            var symmetryValue = (params && params.symmetry !== undefined) ? params.symmetry : 0.3;
            if (symmetryValue > 0) {
                var distFromCenter = Math.abs(angle - sliceInfo.spokeAngle);
                // Symmetry only affects angular spread, NOT radial growth
                score += distFromCenter * symmetryValue * 2;
            }

            candidates.push({ x: x, y: y, radius: radius, angle: angle, tier: tier, score: score, slot: tier + ':' + i });
        }
    }

    if (candidates.length === 0) return null;

    // Sort by score, pick the BEST position (exact grid alignment)
    candidates.sort(function(a, b) { return a.score - b.score; });
    return candidates[0];
}

// =============================================================================
// TERMINAL CLUSTER PLACEMENT
// =============================================================================

/**
 * Place terminal cluster (fruit/leaves) around parent
 */
function placeTerminalCluster(cluster, positions, placedNodes, edges, nodesByTier, sliceInfo, nodeSize, minSpacing, rng) {
    // Use unified config
    var gridCfg = GRID_CONFIG.getComputedConfig();

    var parent = cluster.parent;
    var spells = cluster.spells;
    var count = spells.length;
    var clusterRadius = gridCfg.minNodeSpacing * 0.6;

    for (var i = 0; i < count; i++) {
        var spell = spells[i];
        var angleOffset = (i / count) * 360;
        var clusterAngle = parent.angle + (i - count/2) * 8;
        // Snap to grid tier instead of using jitter
        var targetTier = Math.ceil((parent.radius - gridCfg.baseRadius) / gridCfg.tierSpacing) + 1;
        var clusterR = gridCfg.baseRadius + targetTier * gridCfg.tierSpacing;

        // Clamp to sector
        clusterAngle = Math.max(sliceInfo.startAngle + 2, Math.min(sliceInfo.endAngle - 2, clusterAngle));

        var rad = clusterAngle * Math.PI / 180;
        var x = Math.cos(rad) * clusterR;
        var y = Math.sin(rad) * clusterR;

        // Check spacing and nudge if needed
        for (var attempt = 0; attempt < 5; attempt++) {
            var ok = true;
            for (var j = 0; j < placedNodes.length; j++) {
                var dx = x - placedNodes[j].x;
                var dy = y - placedNodes[j].y;
                if (Math.sqrt(dx * dx + dy * dy) < minSpacing * 0.7) {
                    ok = false;
                    clusterR += gridCfg.tierSpacing * 0.2;
                    x = Math.cos(rad) * clusterR;
                    y = Math.sin(rad) * clusterR;
                    break;
                }
            }
            if (ok) break;
        }

        var nodeTier = Math.max(1, Math.floor((clusterR - gridCfg.baseRadius) / gridCfg.tierSpacing) + 1);

        var node = {
            tier: nodeTier,
            radius: clusterR,
            angle: clusterAngle,
            x: x,
            y: y,
            isRoot: false,
            isTerminal: true,
            spell: spell,
            formId: spell.formId,
            fuzzyGroup: parent.fuzzyGroup,
            parent: parent.formId,
            children: [],
            _fromVisualFirst: true
        };

        positions.push(node);
        placedNodes.push(node);

        if (!nodesByTier[nodeTier]) nodesByTier[nodeTier] = [];
        nodesByTier[nodeTier].push(node);

        edges.push({
            from: parent.formId,
            to: spell.formId,
            type: 'terminal'
        });
    }
}
