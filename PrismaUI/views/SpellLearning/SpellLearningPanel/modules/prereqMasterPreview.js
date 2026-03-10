/**
 * PreReqMaster Preview - Preview interaction, auto-run, tab switching, and initialization.
 * Loaded after: prereqMasterUI.js
 *
 * Depends on:
 * - modules/prereqMasterScoring.js (scoring functions)
 * - modules/prereqMaster.js (getSettings, buildLockRequest, applyLocksWithJSScorer,
 *     applyLocksWithScorer, _getAllNodes, _prmLog)
 * - modules/prereqMasterLocking.js (clearLocks, revealLocksForNode, getRevealedLockEdges,
 *     getLocksForNode, updateStatus, setButtonsEnabled, isEnabled, onLocksChanged)
 * - modules/prereqMasterUI.js (setupPreviewCanvas, renderPreview, _updatePreviewSize,
 *     _previewPanX, _previewPanY, _previewZoom, _previewNeedsRender, _activeTab,
 *     _prmChainSprite, SCHOOL_COLORS)
 */

// =========================================================================
// PREVIEW CANVAS - Tree preview rendering and lock overlay
// =========================================================================

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
