/**
 * Tree Viewer -- Post-Load
 * Tree data loading via TreeParser (slow path) and post-processing:
 * path validation, self-reference cleanup, state initialization,
 * renderer setup, and C++ prerequisite sync.
 *
 * Depends on:
 * - modules/state.js (state, settings)
 * - modules/treeParser.js (TreeParser)
 * - modules/spellCache.js (SpellCache)
 * - modules/uiHelpers.js (setTreeStatus, switchTab)
 * - modules/treeViewer/treeViewerCore.js (SmartRenderer, showImportError)
 * - modules/treeViewer/treeViewerLoader.js (_logToSKSE)
 *
 * Loaded after: treeViewerLoader.js
 */

function loadTreeData(jsonData, switchToTreeTab, isManualImport) {
    var data = typeof jsonData === 'string' ? JSON.parse(jsonData) : jsonData;

    _logToSKSE('[loadTreeData] === ENTRY === typeof=' + (typeof jsonData) +
               ', trustPrereqs=' + data.trustPrereqs +
               ', isManualImport=' + isManualImport +
               ', keys=' + Object.keys(data).join(','));

    // =====================================================================
    // FAST PATH: trustPrereqs data bypasses TreeParser entirely.
    // Positions, prereqs, and edges are authoritative -- no mutations.
    // Also detect if nodes have x/y even without the flag (old saves).
    // =====================================================================
    var hasTrustFlag = !!data.trustPrereqs;
    var hasNodePositions = false;
    if (!hasTrustFlag && data.schools) {
        // Check first school's first node for x/y
        for (var _sk in data.schools) {
            if (data.schools.hasOwnProperty(_sk)) {
                var _sn = data.schools[_sk].nodes;
                if (_sn && _sn.length > 0 && _sn[0].x !== undefined) {
                    hasNodePositions = true;
                    _logToSKSE('[loadTreeData] No trustPrereqs flag but nodes have x/y -- using fast path');
                }
                break;
            }
        }
    }

    if (hasTrustFlag || hasNodePositions) {
        _logToSKSE('[loadTreeData] FAST PATH -- bypassing TreeParser (trust=' + hasTrustFlag + ', hasPos=' + hasNodePositions + ')');
        _loadTrustedTree(data, switchToTreeTab);
        return;
    }

    _logToSKSE('[loadTreeData] SLOW PATH -- going through TreeParser (no positions in data)');

    var result = TreeParser.parse(jsonData);
    if (!result.success) {
        showImportError(result.error);
        return;
    }

    // DIAGNOSTIC: Check nodes after TreeParser
    console.log('[loadTreeData] === DIAGNOSTIC: After TreeParser.parse ===');
    var nodesArray = Array.from(result.nodes.values());
    var nodesWithVisualFirst = nodesArray.filter(function(n) { return n._fromVisualFirst; });
    var nodesWithXY = nodesArray.filter(function(n) { return n.x !== 0 || n.y !== 0; });
    var nodesWithChildren = nodesArray.filter(function(n) { return n.children && n.children.length > 0; });

    // Check depth distribution
    var depthCounts = {};
    nodesArray.forEach(function(n) {
        var d = n.depth || 0;
        depthCounts[d] = (depthCounts[d] || 0) + 1;
    });

    console.log('[loadTreeData] Total nodes:', nodesArray.length);
    console.log('[loadTreeData] Nodes with _fromVisualFirst:', nodesWithVisualFirst.length);
    console.log('[loadTreeData] Nodes with non-zero x/y:', nodesWithXY.length);
    console.log('[loadTreeData] Nodes with children:', nodesWithChildren.length);
    console.log('[loadTreeData] Depth distribution:', JSON.stringify(depthCounts));

    if (nodesArray.length > 0) {
        var sample = nodesArray[0];
        console.log('[loadTreeData] Sample node: x=' + sample.x + ', y=' + sample.y +
                    ', depth=' + sample.depth + ', tier=' + sample.tier +
                    ', children=' + (sample.children ? sample.children.length : 0) +
                    ', _fromVisualFirst=' + sample._fromVisualFirst);

        // Find root node and log its children
        var rootNode = nodesArray.find(function(n) { return n.isRoot; });
        if (rootNode) {
            console.log('[loadTreeData] ROOT: id=' + rootNode.id +
                        ', depth=' + rootNode.depth +
                        ', children=' + (rootNode.children ? rootNode.children.length : 0));
        }
    }

    // Store raw data for future merges
    result.rawData = typeof jsonData === 'string' ? JSON.parse(jsonData) : jsonData;
    var rawGlobe = result.rawData ? result.rawData.globe : null;
    result.globe = rawGlobe
        ? { x: rawGlobe.x || 0, y: rawGlobe.y || 0, radius: rawGlobe.radius || 45 }
        : { x: 0, y: 0, radius: 45 };
    state.treeData = result;

    // AGGRESSIVE PATH VALIDATION for manual imports
    // Runs path check (no AI self-correction, no procedural injection)
    if (isManualImport && settings.aggressivePathValidation) {
        console.log('[SpellLearning] Running path validation on imported tree...');
        var totalProblems = 0;

        for (var schoolName in TreeParser.schools) {
            var schoolData = TreeParser.schools[schoolName];
            if (schoolData && schoolData.root) {
                var problems = TreeParser.detectAndFixCycles(schoolName, schoolData.root);
                if (problems > 0) {
                    totalProblems += problems;
                    console.log('[SpellLearning] ' + schoolName + ': ' + problems + ' unreachable spells');
                }
            }
        }

        if (totalProblems > 0) {
            console.log('[SpellLearning] Validation found ' + totalProblems + ' unreachable spells - regenerate tree');
            setTreeStatus(t('status.warningUnreachable', {count: totalProblems}));
        }
    }

    // Clean up self-references in prerequisites (LLM sometimes generates these incorrectly)
    var selfRefCount = 0;
    result.nodes.forEach(function(node) {
        if (node.prerequisites && node.prerequisites.length > 0) {
            var originalLen = node.prerequisites.length;
            node.prerequisites = node.prerequisites.filter(function(prereqId) {
                // Remove if prereq is this node itself
                return prereqId !== node.id && prereqId !== node.formId;
            });
            if (node.prerequisites.length < originalLen) {
                selfRefCount++;
                console.warn('[SpellLearning] Removed self-reference prerequisite from ' + (node.name || node.id));
            }
        }
    });
    if (selfRefCount > 0) {
        console.log('[SpellLearning] Fixed ' + selfRefCount + ' nodes with self-referencing prerequisites');
    }

    // IMPORTANT: Reset all node states to locked/available on load
    // Don't use saved states from file - those are stale
    // States will be updated after player loads into a save game

    // Get root nodes for each school
    var rootIds = new Set();
    for (var schoolName in result.schools) {
        var schoolData = result.schools[schoolName];
        if (schoolData.root) {
            rootIds.add(schoolData.root);
        }
    }

    result.nodes.forEach(function(node) {
        // Root nodes are always AVAILABLE (learnable starting points, not auto-unlocked)
        // They need to be learned like any other spell, but are always accessible
        if (rootIds.has(node.id) || rootIds.has(node.formId)) {
            node.state = 'available';
            console.log('[SpellLearning] Root node marked available: ' + (node.name || node.id));
        }
        // Nodes with no prerequisites are available (shouldn't happen except for roots)
        else if (!node.prerequisites || node.prerequisites.length === 0) {
            node.state = 'available';
        }
        // Everything else starts locked (children of roots remain locked until root is learned)
        else {
            node.state = 'locked';
        }
    });

    // NOTE: Children of root nodes stay LOCKED until root is actually learned (unlocked)
    // The onPlayerKnownSpells callback will mark nodes as 'unlocked' when player has them,
    // and recalculateNodeAvailability will then unlock their children

    var stateCount = { unlocked: 0, available: 0, locked: 0 };
    result.nodes.forEach(function(n) { stateCount[n.state] = (stateCount[n.state] || 0) + 1; });
    console.log('[SpellLearning] Tree loaded - states: unlocked=' + stateCount.unlocked +
                ', available=' + stateCount.available + ', locked=' + stateCount.locked);

    // Pass school configs and LLM groups to renderer for visual styling
    var rawData = result.rawData || jsonData;
    if (typeof rawData === 'string') rawData = JSON.parse(rawData);

    if (rawData.school_configs) {
        WheelRenderer.setSchoolConfigs(rawData.school_configs);
    }
    if (rawData.llm_groups) {
        WheelRenderer.setLLMGroups(rawData.llm_groups);
    }

    // Request spell data for all formIds
    SpellCache.requestBatch(result.allFormIds, function() {
        result.nodes.forEach(function(node) {
            TreeParser.updateNodeFromCache(node);
        });
        SmartRenderer.setData(result.nodes, result.edges, result.schools);
        setTreeStatus('Loaded ' + result.nodes.length + ' spells' +
            (SmartRenderer.activeRenderer === 'canvas' ? ' (Canvas mode)' : ''));
    });

    // Initial render - use SmartRenderer to auto-switch based on node count
    SmartRenderer.setData(result.nodes, result.edges, result.schools);

    var emptyState = document.getElementById('empty-state');
    if (emptyState) emptyState.classList.add('hidden');

    document.getElementById('total-count').textContent = result.nodes.length;
    document.getElementById('unlocked-count').textContent = '0';  // Always 0 on load - will be updated after save loads

    // Switch to Spell Tree tab if requested (e.g., on startup with saved tree)
    if (switchToTreeTab !== false) {
        switchTab('spellTree');
        console.log('[SpellLearning] Tree loaded - switched to Spell Tree tab');
    }

    // Compute hard/soft prereqs on each node (source of truth for all systems)
    result.nodes.forEach(function(node) {
        // Use new unified hard/soft prereq system if available
        var hardPrereqs = node.hardPrereqs || [];
        var softPrereqs = node.softPrereqs || [];
        var softNeeded = node.softNeeded || 0;

        // Fallback to old system: treat all prereqs as hard if no hard/soft data
        if (hardPrereqs.length === 0 && softPrereqs.length === 0) {
            if (node.prerequisites && node.prerequisites.length > 0) {
                // Single prereq = hard, multiple = first is hard, rest are soft with softNeeded=1
                if (node.prerequisites.length === 1) {
                    hardPrereqs = node.prerequisites.slice();
                } else {
                    hardPrereqs = [node.prerequisites[0]];
                    softPrereqs = node.prerequisites.slice(1);
                    softNeeded = 1;
                }
            }
        }

        // Store computed hard/soft data back on the node so ALL systems
        // (detail panel, recalculateNodeAvailability, C++ bridge) use the
        // same source of truth. This prevents the "hidden prerequisites" bug
        // where the detail panel says "complete" but availability disagrees.
        node.hardPrereqs = hardPrereqs;
        node.softPrereqs = softPrereqs;
        node.softNeeded = softNeeded;
    });

    // Mirror bidirectional soft prereqs -- DISABLED for now
    // mirrorBidirectionalSoftPrereqs(result.nodes);

    // Send tree prerequisites (hard/soft system) to C++ for tome learning validation
    if (window.callCpp) {
        var prereqData = [];
        var hardCount = 0;
        var softCount = 0;

        for (var pi = 0; pi < result.nodes.length; pi++) {
            var pNode = result.nodes[pi];
            hardCount += (pNode.hardPrereqs ? pNode.hardPrereqs.length : 0);
            softCount += (pNode.softPrereqs ? pNode.softPrereqs.length : 0);
            prereqData.push({
                formId: pNode.formId || pNode.id,
                hardPrereqs: pNode.hardPrereqs || [],
                softPrereqs: pNode.softPrereqs || [],
                softNeeded: pNode.softNeeded || 0
            });
        }

        // First clear existing prerequisites, then set new ones
        console.log('[SpellLearning] Sending ' + prereqData.length + ' spell prereqs (' +
                    hardCount + ' hard, ' + softCount + ' soft) to C++');
        window.callCpp('SetTreePrerequisites', JSON.stringify({ clear: true }));
        window.callCpp('SetTreePrerequisites', JSON.stringify(prereqData));
    }

    // After tree is loaded, sync with player's known spells and progression data
    if (window.callCpp) {
        console.log('[SpellLearning] Tree loaded - syncing progress and player known spells...');
        window.callCpp('GetProgress', '');  // Reload progress data
        window.callCpp('GetPlayerKnownSpells', '');  // Sync known spells
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
}
