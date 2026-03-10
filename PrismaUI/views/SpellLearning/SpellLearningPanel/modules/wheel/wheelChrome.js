/**
 * WheelRenderer Chrome - UI decorations (spokes, hub, origin lines, labels)
 * Adds chrome/decoration methods to WheelRenderer.
 *
 * Loaded after: wheelCore.js, wheelLayout.js, wheelRender.js
 */

WheelRenderer.renderOriginLines = function() {
    var self = this;
    var hubRadius = 45;

    // Create a group for origin lines that will be inserted FIRST (renders below)
    var originGroup = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    originGroup.setAttribute('class', 'origin-lines-group');

    this.nodes.forEach(function(node) {
        // Skip hidden schools
        if (settings.schoolVisibility && settings.schoolVisibility[node.school] === false) {
            return;
        }

        // Render origin line for ALL root nodes (not just unlocked)
        if (node.isRoot) {
            var color = TREE_CONFIG.getSchoolColor(node.school);
            var isUnlocked = node.state === 'unlocked';

            var rad = node.angle * Math.PI / 180;
            var startX = Math.cos(rad) * hubRadius;
            var startY = Math.sin(rad) * hubRadius;

            var path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
            // Line from hub edge TO root node
            var d = 'M ' + startX + ' ' + startY + ' L ' + node.x + ' ' + node.y;
            path.setAttribute('d', d);
            path.setAttribute('fill', 'none');
            path.setAttribute('data-school', node.school);
            path.classList.add('origin-line');

            if (isUnlocked) {
                path.setAttribute('stroke', color);
                path.setAttribute('stroke-width', 3);
                path.setAttribute('stroke-opacity', 1.0);
                path.classList.add('mastered-path');
            } else {
                // Dim line for locked root
                path.setAttribute('stroke', '#333');
                path.setAttribute('stroke-width', 1.5);
                path.setAttribute('stroke-opacity', 0.3);
            }

            originGroup.appendChild(path);
        }
    });

    // Insert at the BEGINNING of edges layer so it renders below other edges
    if (this.edgesLayer.firstChild) {
        this.edgesLayer.insertBefore(originGroup, this.edgesLayer.firstChild);
    } else {
        this.edgesLayer.appendChild(originGroup);
    }
};

WheelRenderer.renderCenterHub = function() {
    var hub = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
    hub.classList.add('center-hub-bg');
    hub.setAttribute('cx', 0);
    hub.setAttribute('cy', 0);
    hub.setAttribute('r', 45);
    this.centerHub.appendChild(hub);

    var text = document.createElementNS('http://www.w3.org/2000/svg', 'text');
    text.classList.add('center-hub-text');
    text.setAttribute('x', 0);
    text.setAttribute('y', 0);
    text.textContent = 'MAGIC';
    this.centerHub.appendChild(text);
};

WheelRenderer.renderSpokes = function() {
    var cfg = TREE_CONFIG.wheel;
    var self = this;

    // Only consider visible schools for spokes
    var schoolNames = Object.keys(this.schools).filter(function(name) {
        return !settings.schoolVisibility || settings.schoolVisibility[name] !== false;
    });
    var numSchools = schoolNames.length;

    if (numSchools === 0) return;

    var globalMaxRadius = 0;
    schoolNames.forEach(function(schoolName) {
        var school = self.schools[schoolName];
        var schoolMaxRadius = (school.maxRadius || cfg.baseRadius + (school.maxDepth + 0.5) * cfg.tierSpacing) + 30;
        if (schoolMaxRadius > globalMaxRadius) {
            globalMaxRadius = schoolMaxRadius;
        }
    });

    if (settings.showSchoolDividers) {
        var defs = self.svg.querySelector('defs') || document.createElementNS('http://www.w3.org/2000/svg', 'defs');
        if (!self.svg.querySelector('defs')) {
            self.svg.insertBefore(defs, self.svg.firstChild);
        }

        var oldGradients = defs.querySelectorAll('[id^="divider-grad-"]');
        oldGradients.forEach(function(grad) { grad.remove(); });

        schoolNames.forEach(function(schoolName, i) {
            var school = self.schools[schoolName];
            var nextSchoolName = schoolNames[(i + 1) % numSchools];

            var color, nextColor;
            if (settings.dividerColorMode === 'custom' && settings.dividerCustomColor) {
                color = settings.dividerCustomColor;
                nextColor = settings.dividerCustomColor;
            } else {
                color = TREE_CONFIG.getSchoolColor(schoolName) || '#888888';
                nextColor = TREE_CONFIG.getSchoolColor(nextSchoolName) || '#888888';
            }

            var boundaryAngle = school.endAngle + (cfg.schoolPadding / 2);
            var rad = boundaryAngle * Math.PI / 180;

            var dirX = Math.cos(rad);
            var dirY = Math.sin(rad);

            var perpX = -dirY;
            var perpY = dirX;
            var lineSpacing = settings.dividerSpacing || 3;

            var fadePercent = settings.dividerFade !== undefined ? settings.dividerFade : 50;
            var fadeStart = 100 - fadePercent;

            var startRadius = 50;
            var endRadius = globalMaxRadius;

            var x1Start = dirX * startRadius + perpX * lineSpacing;
            var y1Start = dirY * startRadius + perpY * lineSpacing;
            var x1End = dirX * endRadius + perpX * lineSpacing;
            var y1End = dirY * endRadius + perpY * lineSpacing;

            var x2Start = dirX * startRadius - perpX * lineSpacing;
            var y2Start = dirY * startRadius - perpY * lineSpacing;
            var x2End = dirX * endRadius - perpX * lineSpacing;
            var y2End = dirY * endRadius - perpY * lineSpacing;

            var gradId1 = 'divider-grad-' + i + '-1';
            var grad1 = document.createElementNS('http://www.w3.org/2000/svg', 'linearGradient');
            grad1.setAttribute('id', gradId1);
            grad1.setAttribute('gradientUnits', 'userSpaceOnUse');
            grad1.setAttribute('x1', x1Start);
            grad1.setAttribute('y1', y1Start);
            grad1.setAttribute('x2', x1End);
            grad1.setAttribute('y2', y1End);
            grad1.innerHTML = '<stop offset="0%" stop-color="' + color + '" stop-opacity="0.4"/>' +
                              '<stop offset="' + fadeStart + '%" stop-color="' + color + '" stop-opacity="0.3"/>' +
                              '<stop offset="100%" stop-color="' + color + '" stop-opacity="0"/>';
            defs.appendChild(grad1);

            var gradId2 = 'divider-grad-' + i + '-2';
            var grad2 = document.createElementNS('http://www.w3.org/2000/svg', 'linearGradient');
            grad2.setAttribute('id', gradId2);
            grad2.setAttribute('gradientUnits', 'userSpaceOnUse');
            grad2.setAttribute('x1', x2Start);
            grad2.setAttribute('y1', y2Start);
            grad2.setAttribute('x2', x2End);
            grad2.setAttribute('y2', y2End);
            grad2.innerHTML = '<stop offset="0%" stop-color="' + nextColor + '" stop-opacity="0.4"/>' +
                              '<stop offset="' + fadeStart + '%" stop-color="' + nextColor + '" stop-opacity="0.3"/>' +
                              '<stop offset="100%" stop-color="' + nextColor + '" stop-opacity="0"/>';
            defs.appendChild(grad2);

            var line1 = document.createElementNS('http://www.w3.org/2000/svg', 'line');
            line1.setAttribute('x1', x1Start);
            line1.setAttribute('y1', y1Start);
            line1.setAttribute('x2', x1End);
            line1.setAttribute('y2', y1End);
            line1.setAttribute('stroke', 'url(#' + gradId1 + ')');
            line1.setAttribute('stroke-width', 1.5);
            line1.classList.add('school-divider');
            self.spokesLayer.appendChild(line1);

            var line2 = document.createElementNS('http://www.w3.org/2000/svg', 'line');
            line2.setAttribute('x1', x2Start);
            line2.setAttribute('y1', y2Start);
            line2.setAttribute('x2', x2End);
            line2.setAttribute('y2', y2End);
            line2.setAttribute('stroke', 'url(#' + gradId2 + ')');
            line2.setAttribute('stroke-width', 1.5);
            line2.classList.add('school-divider');
            self.spokesLayer.appendChild(line2);
        });
    }

    // Render school labels - ONLY for visible schools
    for (var schoolName in this.schools) {
        // Skip hidden schools
        if (settings.schoolVisibility && settings.schoolVisibility[schoolName] === false) {
            continue;
        }

        var school = this.schools[schoolName];
        // Skip schools without layout (also hidden)
        if (school.spokeAngle === undefined) {
            continue;
        }

        var color = TREE_CONFIG.getSchoolColor(schoolName);
        var angle = school.spokeAngle * Math.PI / 180;
        var maxRadius = (school.maxRadius || cfg.baseRadius + (school.maxDepth + 0.5) * cfg.tierSpacing) + 30;

        var labelRadius = maxRadius + 35;
        var label = document.createElementNS('http://www.w3.org/2000/svg', 'text');
        label.classList.add('school-label');
        label.dataset.school = schoolName;

        var labelX = Math.cos(angle) * labelRadius;
        var labelY = Math.sin(angle) * labelRadius;

        label.setAttribute('x', labelX);
        label.setAttribute('y', labelY);
        label.setAttribute('fill', color);
        label.setAttribute('text-anchor', 'middle');
        label.setAttribute('dominant-baseline', 'middle');

        // Rotate label to be PARALLEL to the spoke (along the radial direction)
        // Adjust so text reads from center outward, flip if on left side
        var labelAngleDeg = school.spokeAngle;
        if (labelAngleDeg > 90 && labelAngleDeg < 270) {
            labelAngleDeg += 180;  // Flip so text is right-side up
        }
        label.setAttribute('transform', 'rotate(' + labelAngleDeg + ', ' + labelX + ', ' + labelY + ')');
        label.textContent = schoolName.toUpperCase();
        this.spokesLayer.appendChild(label);
    }
};

// Update school label sizes based on zoom (called from updateTransform)
WheelRenderer.updateSchoolLabelScale = function() {
    var labels = this.spokesLayer.querySelectorAll('.school-label');
    // Scale labels inversely with zoom so they stay readable when zoomed out
    // At zoom 1.0 = font-size 1em, at zoom 0.5 = font-size 1.5em, at zoom 0.2 = font-size 2.5em
    var inverseZoom = 1 / Math.max(this.zoom, 0.2);
    var scaleFactor = Math.min(2.5, Math.max(1, inverseZoom * 0.8));

    labels.forEach(function(label) {
        label.style.fontSize = scaleFactor + 'em';
    });
};

WheelRenderer.getTierFromLevel = function(level) {
    if (!level) return 0;
    var levelLower = level.toLowerCase();
    if (levelLower === 'novice') return 0;
    if (levelLower === 'apprentice') return 1;
    if (levelLower === 'adept') return 2;
    if (levelLower === 'expert') return 3;
    if (levelLower === 'master') return 4;
    return 0;
};
