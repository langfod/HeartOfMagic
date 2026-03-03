/**
 * WheelRenderer Growth DSL - Layout modifiers, branching rules, and constraints
 * Adds Growth DSL methods to WheelRenderer for dynamic tree shaping.
 *
 * Loaded after: wheelCore.js, wheelLayout.js
 */

/**
 * Apply branching rules to optimize layout
 */
WheelRenderer.applyBranchingRulesToSchool = function(schoolName, nodes, spokeAngle, sectorAngle) {
    var recipe = this.growthRecipes[schoolName];
    if (!recipe || !recipe.branching) {
        return; // No branching rules to apply
    }

    var branching = recipe.branching;
    var self = this;

    // Apply fillEmptySpaces - redistribute nodes to minimize gaps
    if (branching.fillEmptySpaces) {
        this.fillEmptySpacesInSchool(nodes, spokeAngle, sectorAngle);
    }

    // Apply preferWideOverDeep - spread out shallow tiers
    if (branching.preferWideOverDeep) {
        this.spreadWideTiers(nodes, spokeAngle, sectorAngle);
    }

    console.log('[WheelRenderer] Applied branching rules to ' + schoolName);
};

/**
 * Redistribute nodes to fill empty spaces in the layout
 */
WheelRenderer.fillEmptySpacesInSchool = function(nodes, spokeAngle, sectorAngle) {
    if (nodes.length < 3) return;

    // Group nodes by depth/tier
    var byDepth = {};
    var maxDepth = 0;
    nodes.forEach(function(node) {
        var d = node.depth || 0;
        if (!byDepth[d]) byDepth[d] = [];
        byDepth[d].push(node);
        if (d > maxDepth) maxDepth = d;
    });

    var spokeRad = spokeAngle * Math.PI / 180;
    var halfSector = (sectorAngle / 2) * Math.PI / 180;

    // For each tier, check if there are gaps and redistribute
    for (var d = 1; d <= maxDepth; d++) {
        var tier = byDepth[d];
        if (!tier || tier.length < 2) continue;

        var prevTier = byDepth[d - 1] || [];

        // If this tier has fewer nodes than prev and there are gaps, spread them
        if (tier.length < prevTier.length * 2) {
            // Sort by current angle
            tier.sort(function(a, b) {
                return (a.angle || 0) - (b.angle || 0);
            });

            // Calculate ideal even distribution across sector
            var usableSector = sectorAngle * 0.8; // Use 80% of sector
            var startAngle = spokeAngle - usableSector / 2;
            var angleStep = tier.length > 1 ? usableSector / (tier.length - 1) : 0;

            tier.forEach(function(node, idx) {
                var targetAngle = tier.length === 1 ? spokeAngle : startAngle + angleStep * idx;

                // Blend toward target (don't snap completely)
                var currentAngle = node.angle || spokeAngle;
                var newAngle = currentAngle * 0.4 + targetAngle * 0.6;

                var rad = newAngle * Math.PI / 180;
                var radius = node.radius || Math.sqrt(node.x * node.x + node.y * node.y);

                node.x = Math.cos(rad) * radius;
                node.y = Math.sin(rad) * radius;
                node.angle = newAngle;
            });
        }
    }
};

/**
 * Spread out nodes in shallow tiers (prefer wide over deep)
 */
WheelRenderer.spreadWideTiers = function(nodes, spokeAngle, sectorAngle) {
    // Group by depth
    var byDepth = {};
    nodes.forEach(function(node) {
        var d = node.depth || 0;
        if (!byDepth[d]) byDepth[d] = [];
        byDepth[d].push(node);
    });

    // For tiers 1-2 (shallow), spread more aggressively
    for (var d = 1; d <= 2; d++) {
        var tier = byDepth[d];
        if (!tier || tier.length < 2) continue;

        // Sort by angle
        tier.sort(function(a, b) {
            return (a.angle || 0) - (b.angle || 0);
        });

        // Use more of the sector for shallow tiers
        var usableSector = sectorAngle * 0.9;
        var startAngle = spokeAngle - usableSector / 2;
        var angleStep = usableSector / (tier.length - 1);

        tier.forEach(function(node, idx) {
            var targetAngle = startAngle + angleStep * idx;
            var rad = targetAngle * Math.PI / 180;
            var radius = node.radius || Math.sqrt(node.x * node.x + node.y * node.y);

            node.x = Math.cos(rad) * radius;
            node.y = Math.sin(rad) * radius;
            node.angle = targetAngle;
        });
    }
};

/**
 * Apply all modifiers from a growth recipe to a school's nodes
 */
WheelRenderer.applyModifiersToSchool = function(schoolName, nodes, spokeAngle) {
    var recipe = this.growthRecipes[schoolName];
    if (!recipe || !recipe.modifiers || recipe.modifiers.length === 0) {
        console.log('[WheelRenderer] No modifiers for ' + schoolName + (recipe ? ' (recipe exists but no modifiers)' : ' (no recipe)'));
        return; // No modifiers to apply
    }
    console.log('[WheelRenderer] Applying ' + recipe.modifiers.length + ' modifiers to ' + schoolName + ':', recipe.modifiers.map(function(m) { return m.type; }).join(', '));

    var self = this;
    var centerX = 0, centerY = 0;

    recipe.modifiers.forEach(function(modifier) {
        switch (modifier.type) {
            case 'spiral':
                self.applySpiralModifier(nodes, spokeAngle, modifier);
                break;
            case 'gravity':
                self.applyGravityModifier(nodes, modifier);
                break;
            case 'wind':
                self.applyWindModifier(nodes, modifier);
                break;
            case 'taper':
                self.applyTaperModifier(nodes, spokeAngle, modifier);
                break;
            case 'attractTo':
                self.applyAttractModifier(nodes, modifier);
                break;
            case 'repelFrom':
                self.applyRepelModifier(nodes, modifier);
                break;
        }
    });

    console.log('[WheelRenderer] Applied ' + recipe.modifiers.length + ' modifiers to ' + schoolName);
};

/**
 * Spiral modifier - rotates nodes based on their depth
 */
WheelRenderer.applySpiralModifier = function(nodes, spokeAngle, modifier) {
    var tightness = modifier.tightness || 0.5;
    var direction = modifier.direction || 1;
    var maxTwist = 30 * tightness; // Max degrees of twist

    nodes.forEach(function(node) {
        if (!node.depth) return;

        var twist = (node.depth / 5) * maxTwist * direction;
        var newAngle = (node.angle || spokeAngle) + twist;
        var rad = newAngle * Math.PI / 180;
        var radius = node.radius || Math.sqrt(node.x * node.x + node.y * node.y);

        node.x = Math.cos(rad) * radius;
        node.y = Math.sin(rad) * radius;
        node.angle = newAngle;
    });
};

/**
 * Gravity modifier - pulls nodes toward a direction
 */
WheelRenderer.applyGravityModifier = function(nodes, modifier) {
    var strength = modifier.strength || 0.3;
    var direction = modifier.direction || 'down';

    var pullX = 0, pullY = 0;
    switch (direction) {
        case 'down': pullY = 1; break;
        case 'up': pullY = -1; break;
        case 'left': pullX = -1; break;
        case 'right': pullX = 1; break;
        case 'center': pullX = 0; pullY = 0; break;
    }

    nodes.forEach(function(node) {
        var depth = node.depth || 1;
        var effect = strength * depth * 10;

        if (direction === 'center') {
            // Pull toward center
            var dist = Math.sqrt(node.x * node.x + node.y * node.y);
            if (dist > 0) {
                node.x -= (node.x / dist) * effect * 0.5;
                node.y -= (node.y / dist) * effect * 0.5;
            }
        } else {
            node.x += pullX * effect;
            node.y += pullY * effect;
        }
    });
};

/**
 * Wind modifier - directional displacement
 */
WheelRenderer.applyWindModifier = function(nodes, modifier) {
    var angle = (modifier.angle || 45) * Math.PI / 180;
    var intensity = modifier.intensity || 0.3;

    var windX = Math.cos(angle) * intensity * 30;
    var windY = Math.sin(angle) * intensity * 30;

    nodes.forEach(function(node) {
        var depth = node.depth || 1;
        var effect = depth / 3;

        node.x += windX * effect;
        node.y += windY * effect;
    });
};

/**
 * Taper modifier - reduces spacing as depth increases
 */
WheelRenderer.applyTaperModifier = function(nodes, spokeAngle, modifier) {
    var startScale = modifier.startScale || 1.0;
    var endScale = modifier.endScale || 0.3;

    var maxDepth = 0;
    nodes.forEach(function(node) {
        if ((node.depth || 0) > maxDepth) maxDepth = node.depth;
    });

    if (maxDepth === 0) return;

    nodes.forEach(function(node) {
        var depth = node.depth || 0;
        var t = depth / maxDepth;
        var scale = startScale + (endScale - startScale) * t;

        // Scale distance from spoke center line
        var spokeRad = spokeAngle * Math.PI / 180;
        var spokeX = Math.cos(spokeRad);
        var spokeY = Math.sin(spokeRad);

        // Project node onto spoke line
        var dist = Math.sqrt(node.x * node.x + node.y * node.y);
        var projLength = node.x * spokeX + node.y * spokeY;

        // Calculate perpendicular offset
        var projX = spokeX * projLength;
        var projY = spokeY * projLength;
        var offsetX = node.x - projX;
        var offsetY = node.y - projY;

        // Apply taper to offset
        node.x = projX + offsetX * scale;
        node.y = projY + offsetY * scale;
    });
};

/**
 * Attract modifier - pulls nodes toward a point
 */
WheelRenderer.applyAttractModifier = function(nodes, modifier) {
    var targetX = modifier.x || 0;
    var targetY = modifier.y || 0;
    var strength = modifier.strength || 0.2;

    nodes.forEach(function(node) {
        var dx = targetX - node.x;
        var dy = targetY - node.y;
        var dist = Math.sqrt(dx * dx + dy * dy);

        if (dist > 0) {
            node.x += (dx / dist) * strength * 20;
            node.y += (dy / dist) * strength * 20;
        }
    });
};

/**
 * Repel modifier - pushes nodes away from a point
 */
WheelRenderer.applyRepelModifier = function(nodes, modifier) {
    var sourceX = modifier.x || 0;
    var sourceY = modifier.y || 0;
    var strength = modifier.strength || 0.2;

    nodes.forEach(function(node) {
        var dx = node.x - sourceX;
        var dy = node.y - sourceY;
        var dist = Math.sqrt(dx * dx + dy * dy);

        if (dist > 0 && dist < 300) {
            var force = (1 - dist / 300) * strength * 30;
            node.x += (dx / dist) * force;
            node.y += (dy / dist) * force;
        }
    });
};

/**
 * Apply constraints from recipe
 */
WheelRenderer.applyConstraintsToSchool = function(schoolName, nodes, spokeAngle, sectorAngle) {
    var recipe = this.growthRecipes[schoolName];
    if (!recipe || !recipe.constraints || recipe.constraints.length === 0) {
        return;
    }

    var self = this;

    recipe.constraints.forEach(function(constraint) {
        switch (constraint.type) {
            case 'minSpacing':
                // Already handled by resolveCollisions, but can adjust
                break;
            case 'clampHeight':
                self.applyClampHeight(nodes, constraint);
                break;
            case 'forceSymmetry':
                self.applyForceSymmetry(nodes, spokeAngle, constraint);
                break;
            case 'constrainToVolume':
                self.applyVolumeConstraint(nodes, spokeAngle, sectorAngle, constraint, recipe.volume);
                break;
        }
    });
};

WheelRenderer.applyClampHeight = function(nodes, constraint) {
    var maxHeight = constraint.maxHeight || 400;

    nodes.forEach(function(node) {
        var dist = Math.sqrt(node.x * node.x + node.y * node.y);
        if (dist > maxHeight) {
            var scale = maxHeight / dist;
            node.x *= scale;
            node.y *= scale;
            node.radius = maxHeight;
        }
    });
};

WheelRenderer.applyForceSymmetry = function(nodes, spokeAngle, constraint) {
    var axis = constraint.axis || 'vertical';
    var spokeRad = spokeAngle * Math.PI / 180;

    // Sort nodes by depth
    var byDepth = {};
    nodes.forEach(function(node) {
        var d = node.depth || 0;
        if (!byDepth[d]) byDepth[d] = [];
        byDepth[d].push(node);
    });

    // For each depth, mirror positions around spoke
    for (var d in byDepth) {
        var tier = byDepth[d];
        if (tier.length <= 1) continue;

        // Sort by angle offset from spoke
        tier.sort(function(a, b) {
            var aOffset = (a.angle || 0) - spokeAngle;
            var bOffset = (b.angle || 0) - spokeAngle;
            return aOffset - bOffset;
        });

        // Mirror positions
        var mid = Math.floor(tier.length / 2);
        for (var i = 0; i < mid; i++) {
            var left = tier[i];
            var right = tier[tier.length - 1 - i];

            var avgRadius = (left.radius + right.radius) / 2;
            var avgOffset = Math.abs(left.angle - spokeAngle);

            left.angle = spokeAngle - avgOffset;
            right.angle = spokeAngle + avgOffset;
            left.radius = avgRadius;
            right.radius = avgRadius;

            var leftRad = left.angle * Math.PI / 180;
            var rightRad = right.angle * Math.PI / 180;

            left.x = Math.cos(leftRad) * avgRadius;
            left.y = Math.sin(leftRad) * avgRadius;
            right.x = Math.cos(rightRad) * avgRadius;
            right.y = Math.sin(rightRad) * avgRadius;
        }
    }
};

WheelRenderer.applyVolumeConstraint = function(nodes, spokeAngle, sectorAngle, constraint, volume) {
    if (!volume) return;

    var spokeRad = spokeAngle * Math.PI / 180;
    var halfSector = (sectorAngle / 2) * Math.PI / 180;

    nodes.forEach(function(node) {
        var nodeAngleRad = Math.atan2(node.y, node.x);
        var dist = Math.sqrt(node.x * node.x + node.y * node.y);

        // Check if within sector
        var angleDiff = Math.abs(nodeAngleRad - spokeRad);
        if (angleDiff > Math.PI) angleDiff = 2 * Math.PI - angleDiff;

        if (angleDiff > halfSector) {
            // Clamp to sector edge
            var clampAngle = spokeRad + (nodeAngleRad > spokeRad ? halfSector : -halfSector);
            node.x = Math.cos(clampAngle) * dist;
            node.y = Math.sin(clampAngle) * dist;
            node.angle = clampAngle * 180 / Math.PI;
        }

        // Apply volume-specific constraints
        if (volume.type === 'cone') {
            var maxDist = volume.baseRadius || 350;
            var topRadius = volume.topRadius || 50;
            var height = volume.height || 400;

            // Cone narrows with distance
            var t = Math.min(dist / height, 1);
            var maxAtDist = maxDist - (maxDist - topRadius) * t;

            // Clamp perpendicular distance
            var projLength = Math.cos(nodeAngleRad - spokeRad) * dist;
            var perpDist = Math.abs(Math.sin(nodeAngleRad - spokeRad) * dist);

            if (perpDist > maxAtDist) {
                var scale = maxAtDist / perpDist;
                var perpX = node.x - Math.cos(spokeRad) * projLength;
                var perpY = node.y - Math.sin(spokeRad) * projLength;
                node.x = Math.cos(spokeRad) * projLength + perpX * scale;
                node.y = Math.sin(spokeRad) * projLength + perpY * scale;
            }
        }
    });
};
