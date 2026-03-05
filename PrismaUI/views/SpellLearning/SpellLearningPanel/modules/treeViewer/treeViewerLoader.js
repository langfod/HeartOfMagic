/**
 * Tree Viewer -- Loader
 * Tree loading functions: trusted fast-path, standard TreeParser path,
 * bidirectional soft prereq mirroring.
 *
 * Depends on:
 * - modules/state.js (state, settings)
 * - modules/treeParser.js (TreeParser)
 * - modules/spellCache.js (SpellCache)
 * - modules/uiHelpers.js (setTreeStatus, switchTab)
 * - modules/treeViewer/treeViewerCore.js (SmartRenderer, showImportError)
 */

// =============================================================================
// TREE LOADING
// =============================================================================

/** Log to both console and spelllearning.log via C++. */
function _logToSKSE(msg) {
    console.log(msg);
    if (window.callCpp) {
        try {
            window.callCpp('LogMessage', JSON.stringify({ message: msg, level: 'info' }));
        } catch (e) { /* ignore */ }
    }
}

/**
 * Fast path for trustPrereqs data -- builds nodes/edges/schools directly
 * from JSON and sends to TrustedRenderer. No TreeParser, no WheelRenderer,
 * no CanvasRenderer, no layout logic, no prereq mutations.
 */
function _loadTrustedTree(data, switchToTreeTab) {
    _logToSKSE('[_loadTrustedTree] === ENTRY ===');
    _logToSKSE('[_loadTrustedTree] trustPrereqs=' + data.trustPrereqs +
               ', schools=' + Object.keys(data.schools || {}).join(','));

    var nodes = [];
    var edges = [];
    var schools = {};
    var allFormIds = [];
    var rootIds = {};
    var nodesWithXY = 0;
    var nodesWithoutXY = 0;

    for (var schoolName in data.schools) {
        if (!data.schools.hasOwnProperty(schoolName)) continue;
        var sd = data.schools[schoolName];
        var schoolNodes = sd.nodes || [];

        _logToSKSE('[_loadTrustedTree] School "' + schoolName + '": ' +
                   schoolNodes.length + ' nodes, root=' + sd.root +
                   ', color=' + sd.color + ', spokeAngle=' + sd.spokeAngle);

        // Filter out NaN angles -- let CanvasRendererV2 compute from node positions instead
        var validSpoke = (sd.spokeAngle !== undefined && !isNaN(sd.spokeAngle));
        var validStart = (sd.startAngle !== undefined && !isNaN(sd.startAngle));
        var validEnd = (sd.endAngle !== undefined && !isNaN(sd.endAngle));

        schools[schoolName] = {
            root: sd.root,
            nodeIds: [],
            spokeAngle: validSpoke ? sd.spokeAngle : undefined,
            startAngle: validStart ? sd.startAngle : undefined,
            endAngle: validEnd ? sd.endAngle : undefined,
            angleSpan: (validEnd && validStart) ? sd.endAngle - sd.startAngle : undefined,
            color: sd.color,
            layoutStyle: sd.layoutStyle || 'tree'
        };

        rootIds[sd.root] = true;

        for (var i = 0; i < schoolNodes.length; i++) {
            var nd = schoolNodes[i];
            var id = nd.formId;
            allFormIds.push(id);
            schools[schoolName].nodeIds.push(id);

            // Use explicit undefined check -- nd.x || 0 would lose x=0 values
            var nx = (nd.x !== undefined && nd.x !== null) ? nd.x : 0;
            var ny = (nd.y !== undefined && nd.y !== null) ? nd.y : 0;

            // Track position stats
            if (nd.x !== undefined && nd.x !== null) {
                nodesWithXY++;
            } else {
                nodesWithoutXY++;
            }

            // Log first 3 nodes per school
            if (i < 3) {
                _logToSKSE('[_loadTrustedTree]   node[' + i + ']: formId=' + id +
                           ', raw x=' + nd.x + ', raw y=' + nd.y +
                           ', used x=' + nx + ', used y=' + ny +
                           ', name=' + (nd.name || '?') + ', tier=' + nd.tier);
            }

            // Compute hard/soft prereqs using same fallback as loadTreeData
            var _hardPrereqs = nd.hardPrereqs || [];
            var _softPrereqs = nd.softPrereqs || [];
            var _softNeeded = nd.softNeeded || 0;
            if (_hardPrereqs.length === 0 && _softPrereqs.length === 0) {
                var _prereqs = nd.prerequisites || [];
                if (_prereqs.length === 1) {
                    _hardPrereqs = _prereqs.slice();
                } else if (_prereqs.length > 1) {
                    _hardPrereqs = [_prereqs[0]];
                    _softPrereqs = _prereqs.slice(1);
                    _softNeeded = 1;
                }
            }

            // Root nodes must never have prerequisites -- they are school entry points.
            // Old trees (pre-parentMap fix) had NLP prereqs on roots, causing
            // entire schools to be unreachable orphan chains.
            if (nd.isRoot || id === sd.root) {
                _hardPrereqs = [];
                _softPrereqs = [];
                _softNeeded = 0;
            }

            var isRootNode = nd.isRoot || id === sd.root;
            var node = {
                id: id,
                formId: id,
                name: nd.name || null,
                school: schoolName,
                children: nd.children || [],
                prerequisites: isRootNode ? [] : (nd.prerequisites || []),
                hardPrereqs: _hardPrereqs,
                softPrereqs: _softPrereqs,
                softNeeded: _softNeeded,
                tier: nd.tier || 0,
                depth: nd.tier || 0,
                x: nx,
                y: ny,
                isRoot: isRootNode,
                _fromLayoutEngine: true,
                state: 'locked',
                // Theme data baked from tree generator
                theme: nd.theme || null,
                themeColor: nd.themeColor || null,
                skillLevel: nd.skillLevel || null
            };

            // Roots and prereq-less nodes are available
            if (isRootNode || !node.prerequisites || node.prerequisites.length === 0) {
                node.state = 'available';
            }

            nodes.push(node);

            // Build edges from children
            var ch = nd.children || [];
            for (var c = 0; c < ch.length; c++) {
                edges.push({ from: id, to: ch[c] });
            }
        }
    }

    _logToSKSE('[_loadTrustedTree] TOTALS: ' + nodes.length + ' nodes, ' +
               edges.length + ' edges, ' + Object.keys(schools).length + ' schools');
    _logToSKSE('[_loadTrustedTree] POSITIONS: withXY=' + nodesWithXY +
               ', withoutXY=' + nodesWithoutXY);

    // Store for state tracking
    state.treeData = {
        nodes: nodes,
        edges: edges,
        schools: schools,
        allFormIds: allFormIds,
        rawData: data,
        globe: data.globe
            ? { x: data.globe.x || 0, y: data.globe.y || 0, radius: data.globe.radius || 45 }
            : { x: 0, y: 0, radius: 45 }
    };

    // Use CanvasRendererV2 -- nodes already have _fromLayoutEngine flag so spiral fallback won't trigger
    if (typeof CanvasRenderer !== 'undefined') {
        _logToSKSE('[_loadTrustedTree] Using CanvasRendererV2 with baked positions, noRotate=' + !!data.noRotate);
        var container = document.getElementById('tree-container');
        if (container) {
            // Hide TrustedRenderer if it was previously shown
            if (typeof TrustedRenderer !== 'undefined' && TrustedRenderer.canvas) {
                TrustedRenderer.hide();
            }
            if (!CanvasRenderer.container || CanvasRenderer.container !== container) {
                CanvasRenderer.init(container);
            }
            CanvasRenderer.clear();
            var isFlat = !!data.noRotate || (data.config && data.config.layoutMode === 'flat') || data.layoutMode === 'flat';
            CanvasRenderer.noRotate = isFlat;
            CanvasRenderer.setData(nodes, edges, schools);
            CanvasRenderer.show();
            CanvasRenderer.centerView();
            CanvasRenderer.forceRender();
        }
    } else {
        _logToSKSE('[_loadTrustedTree] FALLBACK: No CanvasRenderer, using TrustedRenderer');
        var container2 = document.getElementById('tree-container');
        if (container2 && typeof TrustedRenderer !== 'undefined') {
            TrustedRenderer.init(container2);
            TrustedRenderer.setData(nodes, edges, schools);
            TrustedRenderer.show();
        }
    }

    // Update UI
    var emptyState = document.getElementById('empty-state');
    if (emptyState) emptyState.classList.add('hidden');
    document.getElementById('total-count').textContent = nodes.length;
    document.getElementById('unlocked-count').textContent = '0';

    if (switchToTreeTab !== false) {
        switchTab('spellTree');
    }

    // Mirror bidirectional soft prereqs -- DISABLED for now
    // mirrorBidirectionalSoftPrereqs(nodes);

    // Send prereqs to C++ (already baked, no splitting needed)
    if (window.callCpp) {
        var prereqData = [];
        for (var pi = 0; pi < nodes.length; pi++) {
            prereqData.push({
                formId: nodes[pi].formId,
                hardPrereqs: nodes[pi].hardPrereqs,
                softPrereqs: nodes[pi].softPrereqs,
                softNeeded: nodes[pi].softNeeded
            });
        }
        window.callCpp('SetTreePrerequisites', JSON.stringify({ clear: true }));
        window.callCpp('SetTreePrerequisites', JSON.stringify(prereqData));
    }

    // Request spell names for display
    SpellCache.requestBatch(allFormIds, function() {
        for (var si = 0; si < nodes.length; si++) {
            TreeParser.updateNodeFromCache(nodes[si]);
        }
        if (typeof CanvasRenderer !== 'undefined') {
            CanvasRenderer._needsRender = true;
        }
    });

    // Sync progress
    if (window.callCpp) {
        window.callCpp('GetProgress', '');
        window.callCpp('GetPlayerKnownSpells', '');
    }

    // Analyze orphans and show repair button if needed
    if (typeof analyzeOrphans === 'function') {
        setTimeout(function() {
            analyzeOrphans();
            if (typeof updateOrphanRepairButton === 'function') {
                updateOrphanRepairButton();
            }
        }, 300);
    }

    _logToSKSE('[_loadTrustedTree] === DONE ===');
    setTreeStatus(t('status.loadedTrustedTree', {count: nodes.length}));
}

/**
 * Mirror bidirectional soft prerequisites.
 * When A is a soft prereq of B, makes B a soft prereq of A too.
 * Skips nodes where softNeeded === softPrereqs.length (all required = effectively hard).
 * Modifies nodes in-place. Returns count of mirrors added.
 */
function mirrorBidirectionalSoftPrereqs(nodes) {
    if (!settings.treeGeneration.bidirectionalSoftPrereqs) return 0;

    // Build nodeMap for O(1) lookup
    var nodeMap = {};
    for (var i = 0; i < nodes.length; i++) {
        var fid = nodes[i].formId || nodes[i].id;
        if (fid) nodeMap[fid] = nodes[i];
    }

    // Collect mirrors to apply (avoid cascading during iteration)
    var mirrors = [];

    for (var n = 0; n < nodes.length; n++) {
        var node = nodes[n];
        var softPrereqs = node.softPrereqs;
        if (!softPrereqs || softPrereqs.length === 0) continue;

        var nodeFormId = node.formId || node.id;

        for (var s = 0; s < softPrereqs.length; s++) {
            var targetNode = nodeMap[softPrereqs[s]];
            if (!targetNode) continue;

            // Don't mirror onto root/prereq-free nodes (would deadlock entry points)
            if (targetNode.isRoot) continue;
            var targetHasPrereqs = (targetNode.hardPrereqs && targetNode.hardPrereqs.length > 0) ||
                                   (targetNode.softPrereqs && targetNode.softPrereqs.length > 0) ||
                                   (targetNode.prerequisites && targetNode.prerequisites.length > 0);
            if (!targetHasPrereqs) continue;

            // Check if target already has this node in hard or soft prereqs
            var alreadyExists = false;

            var targetHard = targetNode.hardPrereqs || [];
            for (var h = 0; h < targetHard.length; h++) {
                if (targetHard[h] === nodeFormId) { alreadyExists = true; break; }
            }

            if (!alreadyExists) {
                var targetSoft = targetNode.softPrereqs || [];
                for (var ts = 0; ts < targetSoft.length; ts++) {
                    if (targetSoft[ts] === nodeFormId) { alreadyExists = true; break; }
                }
            }

            if (!alreadyExists) {
                mirrors.push({ target: targetNode, addFormId: nodeFormId });
            }
        }
    }

    // Build a set of legacy prerequisite ids per target for O(1) duplicate check
    var targetLegacySets = {};
    for (var m = 0; m < mirrors.length; m++) {
        var target = mirrors[m].target;
        var addId = mirrors[m].addFormId;
        var targetId = target.formId || target.id;

        if (!target.hardPrereqs) target.hardPrereqs = [];
        if (!target.softPrereqs) target.softPrereqs = [];
        if (!target.prerequisites) target.prerequisites = [];

        target.softPrereqs.push(addId);

        // Ensure softNeeded is at least 1
        if (!target.softNeeded || target.softNeeded < 1) {
            target.softNeeded = 1;
        }

        // Build legacy set on first encounter of this target
        if (!targetLegacySets[targetId]) {
            targetLegacySets[targetId] = {};
            for (var lp = 0; lp < target.prerequisites.length; lp++) {
                targetLegacySets[targetId][target.prerequisites[lp]] = true;
            }
        }

        // Add to legacy prerequisites array for compatibility (O(1) check)
        if (!targetLegacySets[targetId][addId]) {
            targetLegacySets[targetId][addId] = true;
            target.prerequisites.push(addId);
        }
    }

    if (mirrors.length > 0) {
        console.log('[SpellLearning] Bidirectional soft prereqs: mirrored ' + mirrors.length + ' connections');
        // Log first few for debugging
        for (var d = 0; d < Math.min(5, mirrors.length); d++) {
            var dbgTarget = mirrors[d].target;
            console.log('[SpellLearning]   mirror: ' + mirrors[d].addFormId + ' -> ' +
                        (dbgTarget.formId || dbgTarget.id) +
                        ' (softPrereqs now: ' + (dbgTarget.softPrereqs ? dbgTarget.softPrereqs.length : 0) +
                        ', softNeeded: ' + dbgTarget.softNeeded + ')');
        }
    } else {
        console.log('[SpellLearning] Bidirectional soft prereqs: 0 mirrors (no eligible soft prereqs found)');
    }

    return mirrors.length;
}

