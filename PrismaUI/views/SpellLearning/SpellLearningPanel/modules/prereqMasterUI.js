/**
 * PreReq Master - UI and Initialization
 * Preview canvas rendering and DOM binding for PreReq Master.
 *
 * Depends on:
 * - modules/prereqMasterScoring.js (scoring functions)
 * - modules/prereqMaster.js (getSettings, buildLockRequest, applyLocksWithJSScorer,
 *     applyLocksWithScorer, clearLocks, revealLocksForNode, etc.)
 */

// Active tab tracking for preview canvas
var _activeTab = 'locks';

// Cached offscreen sprite for chain-link rendering (lazy-created)
var _prmChainSprite = null;

// =========================================================================
// PREVIEW CANVAS
// =========================================================================

var _previewCanvas = null;
var _previewCtx = null;
var _previewZoom = 1;
var _previewPanX = 0;
var _previewPanY = 0;
var _previewIsPanning = false;
var _previewPanStartX = 0;
var _previewPanStartY = 0;
var _previewNeedsRender = false;
var _previewRafId = null;
var _previewWidth = 0;
var _previewHeight = 0;

/** School color palette */
var SCHOOL_COLORS = {
    'Destruction': '#C85050',
    'Restoration': '#E8C850',
    'Alteration': '#50A878',
    'Conjuration': '#7070C8',
    'Illusion': '#A06098',
    'Unknown': '#888888'
};

function setupPreviewCanvas() {
    var wrap = document.getElementById('prmPreviewWrap');
    if (!wrap || _previewCanvas) return;

    _previewCanvas = document.createElement('canvas');
    _previewCanvas.className = 'tree-preview-canvas';
    _previewCtx = _previewCanvas.getContext('2d');
    wrap.appendChild(_previewCanvas);

    _setupPreviewEvents();
    _updatePreviewSize();

    // ResizeObserver
    if (typeof ResizeObserver !== 'undefined') {
        var resizeTimeout;
        new ResizeObserver(function() {
            if (resizeTimeout) clearTimeout(resizeTimeout);
            resizeTimeout = setTimeout(function() {
                _updatePreviewSize();
                _previewNeedsRender = true;
            }, 50);
        }).observe(wrap);
    }

    // Start render loop
    _startPreviewLoop();
}

function _updatePreviewSize() {
    var wrap = document.getElementById('prmPreviewWrap');
    if (!wrap || !_previewCanvas) return;

    var rect = wrap.getBoundingClientRect();
    var w = rect.width || 300;
    var h = rect.height || 400;
    var dpr = window.devicePixelRatio || 1;

    _previewCanvas.width = w * dpr;
    _previewCanvas.height = h * dpr;
    _previewCanvas.style.width = w + 'px';
    _previewCanvas.style.height = h + 'px';

    _previewWidth = w;
    _previewHeight = h;
    _previewNeedsRender = true;
}

function _setupPreviewEvents() {
    var canvas = _previewCanvas;

    canvas.addEventListener('mousedown', function(e) {
        if (e.button === 0 || e.button === 2) {
            _previewIsPanning = true;
            _previewPanStartX = e.clientX - _previewPanX;
            _previewPanStartY = e.clientY - _previewPanY;
            canvas.style.cursor = 'grabbing';
        }
    });

    canvas.addEventListener('mousemove', function(e) {
        if (!_previewIsPanning) return;
        _previewPanX = e.clientX - _previewPanStartX;
        _previewPanY = e.clientY - _previewPanStartY;
        _previewNeedsRender = true;
    });

    document.addEventListener('mouseup', function() {
        if (_previewIsPanning) {
            _previewIsPanning = false;
            if (_previewCanvas) _previewCanvas.style.cursor = 'grab';
        }
    });

    canvas.addEventListener('wheel', function(e) {
        e.preventDefault();
        var factor = e.deltaY < 0 ? 1.1 : 0.9;
        var newZoom = Math.max(0.1, Math.min(5, _previewZoom * factor));

        var rect = canvas.getBoundingClientRect();
        var mx = e.clientX - rect.left - rect.width / 2;
        var my = e.clientY - rect.top - rect.height / 2;
        _previewPanX = mx - (mx - _previewPanX) * (newZoom / _previewZoom);
        _previewPanY = my - (my - _previewPanY) * (newZoom / _previewZoom);
        _previewZoom = newZoom;
        _previewNeedsRender = true;
    }, { passive: false });

    canvas.addEventListener('contextmenu', function(e) { e.preventDefault(); });
    canvas.style.cursor = 'grab';
}

function _startPreviewLoop() {
    if (_previewRafId) return;
    function loop() {
        if (_previewNeedsRender) {
            _previewNeedsRender = false;
            _renderPreview();
        }
        _previewRafId = requestAnimationFrame(loop);
    }
    loop();
}

function renderPreview() {
    _previewNeedsRender = true;
}

/** Compute fit scale from node positions to auto-zoom content into view. */
function _computePreviewFitScale(nodeList, w, h) {
    if (nodeList.length === 0) return 1;

    var contentRadius = 0;
    for (var i = 0; i < nodeList.length; i++) {
        var n = nodeList[i];
        var d = Math.sqrt(n.x * n.x + n.y * n.y);
        if (d > contentRadius) contentRadius = d;
    }
    if (contentRadius <= 0) return 1;
    contentRadius += 30;
    var availableRadius = Math.min(w, h) / 2 - 10;
    return Math.min(1, availableRadius / contentRadius);
}

function _renderPreview() {
    if (!_previewCanvas || !_previewCtx) return;

    var ctx = _previewCtx;
    var w = _previewWidth || 300;
    var h = _previewHeight || 400;
    var dpr = window.devicePixelRatio || 1;

    // Full reset
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalAlpha = 1.0;

    // Clear
    ctx.fillStyle = '#0a0a0f';
    ctx.fillRect(0, 0, _previewCanvas.width, _previewCanvas.height);

    // Scale for DPR
    ctx.scale(dpr, dpr);

    // Tab-aware rendering
    if (_activeTab === 'core') {
        _renderCorePreview(ctx, w, h);
    } else {
        _renderTreePreview(ctx, w, h);
    }

    // HUD overlay (outside transform)
    ctx.fillStyle = 'rgba(184, 168, 120, 0.4)';
    ctx.font = '10px sans-serif';
    ctx.textAlign = 'right';
    ctx.fillText(Math.round(_previewZoom * 100) + '%', w - 8, h - 8);
}

/** Render Core tab: Root Base grid + globe overlay */
function _renderCorePreview(ctx, w, h) {
    // Get Root Base output for grid
    var baseData = null;
    if (typeof TreePreview !== 'undefined' && TreePreview.getOutput) {
        baseData = TreePreview.getOutput();
    }

    // Compute auto-fit from root nodes
    var fitScale = 1;
    if (baseData && baseData.rootNodes && baseData.rootNodes.length > 0) {
        var contentRadius = 0;
        for (var i = 0; i < baseData.rootNodes.length; i++) {
            var n = baseData.rootNodes[i];
            var d = Math.sqrt(n.x * n.x + n.y * n.y);
            if (d > contentRadius) contentRadius = d;
        }
        if (contentRadius > 0) {
            contentRadius += 45;
            var availableRadius = Math.min(w, h) / 2 - 10;
            fitScale = Math.min(1, availableRadius / contentRadius);
        }
    }

    // Apply pan + zoom
    ctx.save();
    ctx.translate(w / 2 + _previewPanX, h / 2 + _previewPanY);
    ctx.scale(_previewZoom * fitScale, _previewZoom * fitScale);
    ctx.translate(-w / 2, -h / 2);

    // Draw Root Base grid
    if (baseData && baseData.renderGrid) {
        ctx.globalAlpha = 0.5;
        baseData.renderGrid(ctx, w, h);
        ctx.globalAlpha = 1.0;
    }

    // Draw globe overlay
    if (typeof TreeCore !== 'undefined' && TreeCore.renderGlobeOverlay) {
        TreeCore.renderGlobeOverlay(ctx, w, h);
    }

    ctx.restore();
}

/** Render animated tree build replay frame */
function _renderAnimationFrame(ctx, w, h) {
    if (typeof TreeAnimation === 'undefined') return;

    var frame = TreeAnimation.getFrameData();
    if (!frame || !frame.nodes || frame.nodes.length === 0) return;

    var cx = w / 2;
    var cy = h / 2;
    var mode = frame.mode;
    var newestIdx = frame.newestIdx;

    // Render edges
    if (frame.edges && frame.edges.length > 0) {
        if (mode === 'tree' && typeof TreeRenderer !== 'undefined') {
            TreeRenderer.renderEdges(ctx, cx, cy, frame.edges, 0.35);
        } else {
            // Classic mode: simple parent-child lines
            ctx.save();
            ctx.lineWidth = 1.5;
            for (var ei = 0; ei < frame.edges.length; ei++) {
                var edge = frame.edges[ei];
                ctx.strokeStyle = _animHexToRgba(edge.color || '#888888', 0.3);
                ctx.beginPath();
                ctx.moveTo(cx + edge.x1, cy + edge.y1);
                ctx.lineTo(cx + edge.x2, cy + edge.y2);
                ctx.stroke();
            }
            ctx.restore();
        }
    }

    // Render nodes
    if (mode === 'tree' && typeof TreeRenderer !== 'undefined') {
        // Tree mode: use TreeRenderer for tier-differentiated rendering
        TreeRenderer.renderNodes(ctx, cx, cy, frame.nodes, 0.35, 5);
    } else {
        // Classic mode: simple ghost nodes
        var opacity = 0.35;
        var nodeR = 5;
        for (var i = 0; i < frame.nodes.length; i++) {
            var p = frame.nodes[i];
            var gx = cx + p.x;
            var gy = cy + p.y;
            var color = p.color || '#888888';

            // Glow
            ctx.beginPath();
            ctx.arc(gx, gy, nodeR + 2, 0, Math.PI * 2);
            ctx.fillStyle = _animHexToRgba(color, opacity * 0.3);
            ctx.fill();

            // Body
            ctx.beginPath();
            ctx.arc(gx, gy, nodeR, 0, Math.PI * 2);
            ctx.fillStyle = _animHexToRgba(color, opacity);
            ctx.fill();

            // Border
            ctx.strokeStyle = 'rgba(255, 255, 255, ' + (opacity * 0.3) + ')';
            ctx.lineWidth = 0.5;
            ctx.stroke();
        }
    }

    // Highlight newest node with a pop effect (only during Phase 1)
    if (frame.phase === 'nodes' && newestIdx >= 0 && newestIdx < frame.nodes.length) {
        var newest = frame.nodes[newestIdx];
        var nx = cx + newest.x;
        var ny = cy + newest.y;
        var nColor = newest.color || '#ffffff';

        // Bright pulse ring
        ctx.beginPath();
        ctx.arc(nx, ny, 10, 0, Math.PI * 2);
        ctx.strokeStyle = _animHexToRgba(nColor, 0.6);
        ctx.lineWidth = 1.5;
        ctx.stroke();
    }

    // Phase 2: Render animated lock chains growing from prereq to locked node
    if (frame.phase === 'chains' && frame.chains && frame.chains.length > 0) {
        for (var chi = 0; chi < frame.chains.length; chi++) {
            var chain = frame.chains[chi];
            if (chain.progress <= 0) continue;

            var cfx = cx + chain.fromX;
            var cfy = cy + chain.fromY;
            var ctoX = cx + chain.toX;
            var cty = cy + chain.toY;

            var cedx = ctoX - cfx;
            var cedy = cty - cfy;
            var cedist = Math.sqrt(cedx * cedx + cedy * cedy);
            if (cedist < 1) continue;

            // Only draw links up to current progress
            var visibleDist = cedist * chain.progress;

            var lW = 4, lH = 2.6, lThick = 1.2;
            var lSpacing = lW * 1.15;
            var nLinks = Math.max(3, Math.round(cedist / lSpacing));
            var eAngle = Math.atan2(cedy, cedx);

            ctx.globalAlpha = 0.75;

            for (var cli = 0; cli < nLinks; cli++) {
                var ct = (cli + 0.5) / nLinks;
                var linkDist = cedist * ct;
                if (linkDist > visibleDist) break;

                var clx = cfx + cedx * ct;
                var cly = cfy + cedy * ct;

                ctx.save();
                ctx.translate(clx, cly);
                ctx.rotate(eAngle);
                if (cli % 2 !== 0) ctx.rotate(Math.PI / 2);

                var chw = lW * 0.5, chh = lH * 0.5;
                var lcr = Math.min(chw, chh) * 0.8;

                // Outer rounded rect
                ctx.beginPath();
                ctx.moveTo(-chw + lcr, -chh);
                ctx.lineTo(chw - lcr, -chh);
                ctx.arcTo(chw, -chh, chw, -chh + lcr, lcr);
                ctx.lineTo(chw, chh - lcr);
                ctx.arcTo(chw, chh, chw - lcr, chh, lcr);
                ctx.lineTo(-chw + lcr, chh);
                ctx.arcTo(-chw, chh, -chw, chh - lcr, lcr);
                ctx.lineTo(-chw, -chh + lcr);
                ctx.arcTo(-chw, -chh, -chw + lcr, -chh, lcr);
                ctx.closePath();

                ctx.fillStyle = 'rgba(130, 130, 140, 0.6)';
                ctx.strokeStyle = 'rgba(80, 80, 90, 0.9)';
                ctx.lineWidth = lThick;
                ctx.fill();
                ctx.stroke();

                // Inner cutout
                var ihw = chw * 0.4, ihh = chh * 0.3;
                var ir = Math.min(ihw, ihh) * 0.6;
                ctx.beginPath();
                ctx.moveTo(-ihw + ir, -ihh);
                ctx.lineTo(ihw - ir, -ihh);
                ctx.arcTo(ihw, -ihh, ihw, -ihh + ir, ir);
                ctx.lineTo(ihw, ihh - ir);
                ctx.arcTo(ihw, ihh, ihw - ir, ihh, ir);
                ctx.lineTo(-ihw + ir, ihh);
                ctx.arcTo(-ihw, ihh, -ihw, ihh - ir, ir);
                ctx.lineTo(-ihw, -ihh + ir);
                ctx.arcTo(-ihw, -ihh, -ihw + ir, -ihh, ir);
                ctx.closePath();
                ctx.fillStyle = 'rgba(20, 20, 30, 0.7)';
                ctx.fill();

                ctx.restore();
            }
            ctx.globalAlpha = 1.0;
        }

        // Lock badges on nodes where chains have arrived
        if (frame.lockedNodes) {
            for (var li = 0; li < frame.lockedNodes.length; li++) {
                var ln = frame.lockedNodes[li];
                if (!frame.chains[ln.chainIdx] || !frame.chains[ln.chainIdx].done) continue;

                var lnx = cx + ln.x;
                var lny = cy + ln.y;

                // Gray lock overlay on the node
                ctx.beginPath();
                ctx.arc(lnx, lny, 6, 0, Math.PI * 2);
                ctx.fillStyle = 'rgba(82, 82, 92, 0.7)';
                ctx.fill();
                ctx.strokeStyle = 'rgba(60, 60, 70, 0.9)';
                ctx.lineWidth = 1;
                ctx.stroke();

                // Lock icon: shackle arc
                ctx.beginPath();
                ctx.arc(lnx, lny - 2, 2.5, Math.PI, 0);
                ctx.strokeStyle = 'rgba(180, 180, 190, 0.8)';
                ctx.lineWidth = 1.2;
                ctx.stroke();
                // Lock icon: body rect
                ctx.fillStyle = 'rgba(180, 180, 190, 0.8)';
                ctx.fillRect(lnx - 2, lny - 0.5, 4, 3);
            }
        }
    }
}

function _animHexToRgba(hex, alpha) {
    if (!hex || hex.charAt(0) !== '#') return 'rgba(136,136,136,' + alpha + ')';
    var r = parseInt(hex.slice(1, 3), 16);
    var g = parseInt(hex.slice(3, 5), 16);
    var b = parseInt(hex.slice(5, 7), 16);
    return 'rgba(' + r + ',' + g + ',' + b + ',' + alpha + ')';
}

/** Render Locks/AltPaths tab: relay tree growth canvas + overlay lock chains */
function _renderTreePreview(ctx, w, h) {
    // Delegate to tree growth renderer (same content as tree growth canvas)
    if (typeof TreeGrowth !== 'undefined' && TreeGrowth.modes && TreeGrowth.activeMode) {
        var baseData = null;
        if (typeof TreePreview !== 'undefined' && TreePreview.getOutput) {
            baseData = TreePreview.getOutput();
        }

        var fitScale = 1;
        if (typeof TreeGrowth._computeFitScale === 'function') {
            fitScale = TreeGrowth._computeFitScale(baseData, w, h);
        }

        ctx.save();
        ctx.translate(w / 2 + _previewPanX, h / 2 + _previewPanY);
        ctx.scale(_previewZoom * fitScale, _previewZoom * fitScale);
        ctx.translate(-w / 2, -h / 2);

        // Check if tree animation is playing
        var animPlaying = typeof TreeAnimation !== 'undefined' && TreeAnimation.isPlaying();
        var modeModule = TreeGrowth.modes[TreeGrowth.activeMode];

        if (animPlaying) {
            // Animation mode: render base grid + animated subset
            if (baseData && baseData.renderGrid) {
                baseData.renderGrid(ctx, w, h);
            }
            _renderAnimationFrame(ctx, w, h);
        } else if (modeModule && typeof modeModule.render === 'function') {
            modeModule.render(ctx, w, h, baseData);
        }

        // Check for pending animation capture after render
        // (render may have computed _builtPlacements as a side effect)
        if (typeof TreeAnimation !== 'undefined' && !animPlaying) {
            TreeAnimation.checkPendingCapture();
        }

        // Overlay: Lock chain edges (only on locks tab, skip during animation)
        var allLockEdges = (!animPlaying && _activeTab === 'locks') ? getAllLockEdges() : [];
        if (allLockEdges.length > 0) {
            // Build position lookup from growth mode
            var posMap = null;
            if (modeModule && typeof modeModule.getPositionMap === 'function') {
                posMap = modeModule.getPositionMap();
            }
            if (posMap) {
                allLockEdges.forEach(function(edge) {
                    var fromPos = posMap[edge.from];
                    var toPos = posMap[edge.to];
                    if (!fromPos || !toPos) return;

                    // Offset positions by canvas center to match tree renderer
                    // (ClassicRenderer draws nodes at cx+node.x, cy+node.y where cx=w/2, cy=h/2)
                    var fx = w / 2 + fromPos.x;
                    var fy = h / 2 + fromPos.y;
                    var tx = w / 2 + toPos.x;
                    var ty = h / 2 + toPos.y;

                    var edx = tx - fx;
                    var edy = ty - fy;
                    var edist = Math.sqrt(edx * edx + edy * edy);
                    if (edist < 1) return;

                    // Gray chain links along the edge
                    var lW = 4, lH = 2.6, lThick = 1.2;
                    var lSpacing = lW * 1.15;
                    var nLinks = Math.max(3, Math.round(edist / lSpacing));
                    var eAngle = Math.atan2(edy, edx);

                    // Lazy-create chain link sprite for preview
                    if (!_prmChainSprite) {
                        var pad = Math.ceil(lThick) + 1;
                        var sprW = Math.ceil(lW + pad * 2); if (sprW % 2 !== 0) sprW++;
                        var sprH = Math.ceil(lH + pad * 2); if (sprH % 2 !== 0) sprH++;
                        var sc = document.createElement('canvas'); sc.width = sprW; sc.height = sprH;
                        var sctx = sc.getContext('2d');
                        var scx = sprW / 2, scy = sprH / 2;
                        var chw = lW * 0.5, chh = lH * 0.5, cr = Math.min(chw, chh) * 0.8;
                        sctx.beginPath();
                        sctx.moveTo(scx-chw+cr, scy-chh); sctx.lineTo(scx+chw-cr, scy-chh);
                        sctx.arcTo(scx+chw, scy-chh, scx+chw, scy-chh+cr, cr); sctx.lineTo(scx+chw, scy+chh-cr);
                        sctx.arcTo(scx+chw, scy+chh, scx+chw-cr, scy+chh, cr); sctx.lineTo(scx-chw+cr, scy+chh);
                        sctx.arcTo(scx-chw, scy+chh, scx-chw, scy+chh-cr, cr); sctx.lineTo(scx-chw, scy-chh+cr);
                        sctx.arcTo(scx-chw, scy-chh, scx-chw+cr, scy-chh, cr); sctx.closePath();
                        sctx.fillStyle = 'rgba(130, 130, 140, 0.6)';
                        sctx.strokeStyle = 'rgba(80, 80, 90, 0.9)';
                        sctx.lineWidth = lThick; sctx.fill(); sctx.stroke();
                        var ihw = chw * 0.4, ihh = chh * 0.3, ir = Math.min(ihw, ihh) * 0.6;
                        sctx.beginPath();
                        sctx.moveTo(scx-ihw+ir, scy-ihh); sctx.lineTo(scx+ihw-ir, scy-ihh);
                        sctx.arcTo(scx+ihw, scy-ihh, scx+ihw, scy-ihh+ir, ir); sctx.lineTo(scx+ihw, scy+ihh-ir);
                        sctx.arcTo(scx+ihw, scy+ihh, scx+ihw-ir, scy+ihh, ir); sctx.lineTo(scx-ihw+ir, scy+ihh);
                        sctx.arcTo(scx-ihw, scy+ihh, scx-ihw, scy+ihh-ir, ir); sctx.lineTo(scx-ihw, scy-ihh+ir);
                        sctx.arcTo(scx-ihw, scy-ihh, scx-ihw+ir, scy-ihh, ir); sctx.closePath();
                        sctx.fillStyle = 'rgba(20, 20, 30, 0.7)'; sctx.fill();
                        _prmChainSprite = sc;
                    }
                    var pspr = _prmChainSprite;
                    var psprHW = pspr.width / 2, psprHH = pspr.height / 2;

                    ctx.globalAlpha = 0.75;

                    for (var ci = 0; ci < nLinks; ci++) {
                        var ct = (ci + 0.5) / nLinks;
                        var ccx = fx + edx * ct;
                        var ccy = fy + edy * ct;

                        ctx.save();
                        ctx.translate(ccx, ccy);
                        ctx.rotate(eAngle);
                        if (ci % 2 !== 0) ctx.rotate(Math.PI / 2);
                        ctx.drawImage(pspr, -psprHW, -psprHH);
                        ctx.restore();
                    }
                    ctx.globalAlpha = 1.0;
                });
            }
        }

        ctx.restore();

        // Stats overlay
        var lockCount = (_activeTab === 'locks') ? getAllLockEdges().length : 0;
        ctx.fillStyle = 'rgba(184, 168, 120, 0.4)';
        ctx.font = '10px sans-serif';
        ctx.textAlign = 'left';
        ctx.fillText(lockCount + ' locks', 8, h - 8);

        // Animation progress overlay
        if (animPlaying) {
            var progress = TreeAnimation.getProgress();
            var animFrame = TreeAnimation.getFrameData();
            var statusText = '';
            if (animFrame && animFrame.phase === 'chains') {
                var doneCount = 0;
                if (animFrame.chains) {
                    for (var dci = 0; dci < animFrame.chains.length; dci++) {
                        if (animFrame.chains[dci].done) doneCount++;
                    }
                }
                statusText = 'Locking... ' + doneCount + '/' + (animFrame.chains ? animFrame.chains.length : 0);
            } else if (animFrame) {
                statusText = 'Building... ' + animFrame.nodes.length + '/' + animFrame.total;
            }
            ctx.fillStyle = 'rgba(184, 168, 120, 0.5)';
            ctx.font = '10px sans-serif';
            ctx.textAlign = 'center';
            ctx.fillText(statusText, w / 2, h - 8);

            // Progress bar
            ctx.fillStyle = 'rgba(184, 168, 120, 0.15)';
            ctx.fillRect(0, h - 3, w, 3);
            ctx.fillStyle = 'rgba(184, 168, 120, 0.5)';
            ctx.fillRect(0, h - 3, w * progress, 3);

            // Keep render loop alive
            _previewNeedsRender = true;
        }
    } else {
        ctx.fillStyle = 'rgba(184, 168, 120, 0.3)';
        ctx.font = '11px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('Build a tree to see preview', w / 2, h / 2);
    }
}

/**
 * Get ALL lock edges (not just revealed) for the preview canvas.
 * @returns {Array} [{from, to, score}]
 */
function getAllLockEdges() {
    var edges = [];
    var allEdgeNodes = _getAllNodes();
    if (!allEdgeNodes) return edges;

    allEdgeNodes.forEach(function(node) {
        if (node.locks) {
            node.locks.forEach(function(lock) {
                edges.push({
                    from: lock.nodeId,
                    to: node.id || node.formId,
                    score: lock.score
                });
            });
        }
    });

    return edges;
}

// =========================================================================
// AUTO-RUN (called from treeGrowth.js after build)
// =========================================================================

/**
 * Auto-apply locks after tree build. Clears existing locks first.
 * Called externally when PRM is enabled and tree finishes building.
 */
function autoApplyLocks() {
    if (!isEnabled()) return;

    _prmLog('Auto-applying locks after tree build...');
    updateStatus('Auto-applying locks...');

    // Invalidate position cache (tree layout may have changed)
    _cachedPosMap = null;

    // Clear any previous locks
    var autoClrNodes = _getAllNodes();
    if (autoClrNodes) {
        autoClrNodes.forEach(function(node) {
            if (node.locks) node.locks = [];
        });
    }

    var request = buildLockRequest();
    if (!request || request.eligible.length === 0) {
        updateStatus('No eligible spells for locks');
        renderPreview();
        // No eligible -> skip prereqs, finalize + complete
        if (typeof BuildProgress !== 'undefined' && BuildProgress.isActive()) {
            BuildProgress.setStage('finalize');
            setTimeout(function() { BuildProgress.complete('No eligible spells for locks'); }, 300);
        }
        return;
    }

    var result = applyLocksWithScorer(request);
    if (result === -1) {
        // Async (NLP) - callback will handle status + onLocksChanged + BuildProgress
        updateStatus('Scoring with NLP...');
    } else {
        updateStatus(result + ' locks auto-applied');
        onLocksChanged();
        // Synchronous (JS fallback) -> finalize + complete
        if (typeof BuildProgress !== 'undefined' && BuildProgress.isActive()) {
            BuildProgress.setDetail(result + ' locks applied');
            BuildProgress.setStage('finalize');
            setTimeout(function() { BuildProgress.complete(result + ' locks applied'); }, 400);
        }
    }
}

// =========================================================================
// TAB SWITCHING
// =========================================================================

function initTabs() {
    var tabs = document.querySelectorAll('.prm-tab:not(.disabled)');
    for (var i = 0; i < tabs.length; i++) {
        tabs[i].addEventListener('click', function() {
            var tabId = this.getAttribute('data-prm-tab');
            switchTab(tabId);
        });
    }
}

function switchTab(tabId) {
    _activeTab = tabId;

    // Update tab active states
    var allTabs = document.querySelectorAll('.prm-tab');
    for (var i = 0; i < allTabs.length; i++) {
        var t = allTabs[i].getAttribute('data-prm-tab');
        allTabs[i].classList.toggle('active', t === tabId);
    }

    // Toggle content visibility
    var locksTab = document.getElementById('prmTabLocks');
    var coreTab = document.getElementById('prmTabCore');
    var altTab = document.getElementById('prmTabAltPaths');

    if (locksTab) locksTab.style.display = (tabId === 'locks') ? '' : 'none';
    if (coreTab) coreTab.style.display = (tabId === 'core') ? '' : 'none';
    if (altTab) altTab.style.display = (tabId === 'altpaths') ? '' : 'none';

    // Trigger preview re-render for new tab
    _previewNeedsRender = true;
}

// =========================================================================
// INITIALIZATION
// =========================================================================

function initPreReqMaster() {
    // Collapsible header
    var header = document.getElementById('prmToggleHeader');
    var content = document.getElementById('prmContent');
    var collapseIcon = header ? header.querySelector('.prm-collapse-icon') : null;

    if (header && content) {
        header.addEventListener('click', function() {
            content.classList.toggle('collapsed');
            if (collapseIcon) {
                collapseIcon.textContent = content.classList.contains('collapsed') ? '[+]' : '[-]';
            }
        });
    }

    // Tab switching
    initTabs();

    // Setup preview canvas
    setupPreviewCanvas();

    // Pool source toggle - show/hide nearby controls
    var poolSelect = document.getElementById('prmPoolSource');
    var nearbyControls = document.getElementById('prmNearbyControls');
    if (poolSelect && nearbyControls) {
        poolSelect.addEventListener('change', function() {
            nearbyControls.style.display = poolSelect.value === 'nearby' ? '' : 'none';
        });
    }

    // Slider value displays + fill updates
    var sliderMappings = [
        { slider: 'prmGlobalLockSlider', display: 'prmGlobalLockValue', suffix: '%' },
        { slider: 'prmDistanceSlider', display: 'prmDistanceValue', suffix: '' },
        { slider: 'prmProximityBiasSlider', display: 'prmProximityBiasValue', suffix: '%' }
    ];

    sliderMappings.forEach(function(m) {
        var slider = document.getElementById(m.slider);
        var display = document.getElementById(m.display);
        if (slider) {
            // Initial fill
            if (typeof updateSliderFillGlobal === 'function') updateSliderFillGlobal(slider);
            slider.addEventListener('input', function() {
                if (display) display.textContent = slider.value + m.suffix;
                if (typeof updateSliderFillGlobal === 'function') updateSliderFillGlobal(slider);
            });
        }
    });

    // Apply Locks button
    var applyBtn = document.getElementById('prmApplyBtn');
    if (applyBtn) {
        applyBtn.addEventListener('click', function() {
            _prmLog('Apply Locks button clicked');

            // Clear existing locks before reapplying (same as autoApplyLocks)
            var clrNodes = _getAllNodes();
            if (clrNodes) {
                clrNodes.forEach(function(node) {
                    if (node.locks) node.locks = [];
                });
            }
            _cachedPosMap = null;

            var request = buildLockRequest();
            if (!request || request.eligible.length === 0) {
                _prmLog('No eligible spells found - aborting apply');
                updateStatus('No eligible spells found');
                return;
            }

            updateStatus('Applying locks...');
            _prmLog('Applying ' + request.eligible.length + ' eligible spell locks...');

            var result = applyLocksWithScorer(request);
            if (result === -1) {
                // Async (NLP) - callback will handle status + onLocksChanged
                updateStatus('Scoring with NLP...');
            } else {
                _prmLog('Locks applied: ' + result);
                updateStatus(result + ' locks applied');
                onLocksChanged();
            }
        });
    }

    // Clear Locks button
    var clearBtn = document.getElementById('prmClearBtn');
    if (clearBtn) {
        clearBtn.addEventListener('click', function() {
            _prmLog('Clear Locks button clicked');
            clearLocks();
        });
    }

    // Bidirectional soft prereqs toggle (Alternate Pathways tab)
    var biDirToggle = document.getElementById('altPathsBidirectional');
    if (biDirToggle) {
        biDirToggle.checked = settings.treeGeneration.bidirectionalSoftPrereqs !== false;
        biDirToggle.addEventListener('change', function() {
            settings.treeGeneration.bidirectionalSoftPrereqs = this.checked;
            if (typeof autoSaveSettings === 'function') autoSaveSettings();
        });
    }

    _prmLog('Initialized');
}

// =========================================================================
// EXPOSE GLOBALLY
// =========================================================================

window.PreReqMaster = {
    init: initPreReqMaster,
    getSettings: getSettings,
    isEnabled: isEnabled,
    buildLockRequest: buildLockRequest,
    applyLocksWithJSScorer: applyLocksWithJSScorer,
    applyLocksWithScorer: applyLocksWithScorer,
    autoApplyLocks: autoApplyLocks,
    clearLocks: clearLocks,
    revealLocksForNode: revealLocksForNode,
    getRevealedLockEdges: getRevealedLockEdges,
    getAllLockEdges: getAllLockEdges,
    getLocksForNode: getLocksForNode,
    setButtonsEnabled: setButtonsEnabled,
    updateStatus: updateStatus,
    renderPreview: renderPreview,
    updatePreviewSize: _updatePreviewSize
};
