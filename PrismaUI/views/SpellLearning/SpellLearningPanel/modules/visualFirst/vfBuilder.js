/**
 * Visual-First Builder - Main Entry Points
 *
 * Orchestrates the complete visual-first tree generation for single and all schools.
 * Depends on: all other vf modules, layoutGenerator.js, state.js
 */

// =============================================================================
// STORED STATE
// =============================================================================

// Store slice angles for reuse when regenerating individual schools
var storedSliceAngles = null;

// Legacy alias
var growFuzzyTree = growOrganicTree;

// =============================================================================
// MAIN BUILDER
// =============================================================================

/**
 * Generate a complete visual-first tree for one school.
 *
 * @param {string} schoolName - Name of the school
 * @param {Array} spells - Array of spell objects
 * @param {Object} config - LLM config {shape, density, convergence, slice_weight, useExistingSlice}
 * @returns {Object} - Tree data in standard format
 */
function generateVisualFirstTree(schoolName, spells, config) {
    console.log('[VisualFirstBuilder] Generating', schoolName, 'with', spells.length, 'spells');
    console.log('[VisualFirstBuilder] Config:', JSON.stringify(config, null, 2));

    var seed = typeof getCurrentSeed === 'function' ? getCurrentSeed() : Date.now();
    var branchingMode = config.branching_mode || 'fuzzy_groups';  // Default to organic growth

    var allPositions;
    var edges;
    var sliceInfo;

    // Check if we should use existing slice angles (when regenerating individual school)
    if (config.useExistingSlice && storedSliceAngles && storedSliceAngles[schoolName]) {
        sliceInfo = storedSliceAngles[schoolName];
        console.log('[VisualFirstBuilder] Using EXISTING slice for', schoolName,
            '[' + sliceInfo.startAngle.toFixed(1) + '° - ' + sliceInfo.endAngle.toFixed(1) + '°]');
    } else {
        // Calculate slice info fresh (single school takes full wheel)
        var schoolsData = {};
        schoolsData[schoolName] = { spell_count: spells.length, spells: spells, config: config };
        var sliceAngles = calculateSliceAngles(schoolsData);
        sliceInfo = sliceAngles[schoolName];
        console.log('[VisualFirstBuilder] Calculated NEW slice for', schoolName,
            '[' + sliceInfo.startAngle.toFixed(1) + '° - ' + sliceInfo.endAngle.toFixed(1) + '°]');
    }

    // FUZZY MODE: Grow tree organically - positions determined by branching
    if (branchingMode === 'fuzzy_groups') {
        console.log('[VisualFirstBuilder] Using FUZZY GROWTH mode - organic tree generation');

        // Add school name to config for root selection
        config.schoolName = schoolName;

        // Grow tree organically
        var result = growFuzzyTree(spells, sliceInfo, config, seed);
        allPositions = result.positions;
        edges = result.edges;

    } else {
        // PROXIMITY MODE: Grid-based layout, then connect
        console.log('[VisualFirstBuilder] Using PROXIMITY mode - grid-based layout');

        // Build school data structure
        var schoolsData = {};
        schoolsData[schoolName] = {
            spell_count: spells.length,
            spells: spells,
            config: config
        };

        // Step 1: Generate layout (grid + selection)
        var layout = generateLayout(schoolsData, seed);
        var schoolLayout = layout.schools[schoolName];

        // Step 2: Assign spells to positions
        allPositions = schoolLayout.positions;
        assignSpellsToPositions(allPositions, spells, seed + 200);

        // Step 3: Build edges by proximity
        edges = buildEdges(allPositions, config, seed + 300, null);
    }

    // Step 5: Format output
    var treeData = formatTreeOutput(schoolName, allPositions, edges, config);

    // Step 6: Merge into existing tree data (if any)
    if (state.treeData && state.treeData.rawData) {
        state.treeData.rawData.schools[schoolName] = treeData.schools[schoolName];

        // Reload the tree
        if (typeof loadTreeData === 'function') {
            loadTreeData(state.treeData.rawData);
        }
    } else {
        // Create new tree data
        if (typeof loadTreeData === 'function') {
            loadTreeData(treeData);
        }
    }

    console.log('[VisualFirstBuilder] Complete:', allPositions.length, 'nodes,', edges.length, 'edges');
    return treeData;
}

/**
 * Generate visual-first trees for ALL schools at once.
 *
 * @param {Array} allSpells - All spells from all schools
 * @param {Object} schoolConfigs - Map of school name to LLM config
 * @param {Object} fuzzyData - Fuzzy NLP relationship data from C++ native
 * @param {Object} treeGeneration - Tree generation settings
 * @returns {Object} - Complete tree data
 */
function generateAllVisualFirstTrees(allSpells, schoolConfigs, fuzzyData, treeGeneration) {
    if (typeof filterBlacklistedSpells === 'function') {
        allSpells = filterBlacklistedSpells(allSpells);
    }
    console.log('[VisualFirstBuilder] Generating all schools with', allSpells.length, 'total spells');

    // Store tree generation settings for use by sub-functions
    var treeGen = treeGeneration || {};
    console.log('[VisualFirstBuilder] Tree generation mode:', treeGen.linkStrategy || 'default');
    console.log('[VisualFirstBuilder] Element isolation:', treeGen.elementIsolation,
                '(strict:', treeGen.elementIsolationStrict + ')');
    console.log('[VisualFirstBuilder] Strict tier ordering:', treeGen.strictTierOrdering);

    console.log('[VisualFirstBuilder] School configs received:');
    for (var scName in schoolConfigs) {
        var cfg = schoolConfigs[scName];
        console.log('  ' + scName + ': shape=' + cfg.shape + ', density=' + cfg.density +
                    ', source=' + cfg.source);
    }

    // Log fuzzy data availability
    var fuzzy = fuzzyData || { relationships: {}, similarity_scores: {}, groups: {}, themes: {} };
    var relationshipCount = Object.keys(fuzzy.relationships || {}).length;
    var groupCount = Object.keys(fuzzy.groups || {}).length;
    console.log('[VisualFirstBuilder] Fuzzy data:', relationshipCount, 'spell relationships,', groupCount, 'groups');

    var seed = typeof getCurrentSeed === 'function' ? getCurrentSeed() : Date.now();

    // Group spells by school
    var spellsBySchool = {};
    allSpells.forEach(function(spell) {
        var school = spell.school || 'Unknown';
        if (!school || school === 'null' || school === 'None' || school === '') {
            school = 'Hedge Wizard';
        }
        if (!spellsBySchool[school]) spellsBySchool[school] = [];
        spellsBySchool[school].push(spell);
    });

    // Build schools data with configs
    var totalSpellCount = allSpells.length;
    var schoolsData = {};
    for (var schoolName in spellsBySchool) {
        var config = schoolConfigs[schoolName] || { shape: 'organic', density: 0.6 };
        // Pass totalSpellCount so layout generator can decide on inner rings
        config.totalSpellCount = totalSpellCount;
        schoolsData[schoolName] = {
            spell_count: spellsBySchool[schoolName].length,
            spells: spellsBySchool[schoolName],
            config: config
        };
        console.log('[VisualFirstBuilder] School', schoolName + ':',
                    spellsBySchool[schoolName].length, 'spells, shape:', config.shape);
    }
    console.log('[VisualFirstBuilder] Total spells:', totalSpellCount, '(inner rings only if > 500)');

    // Step 1: Calculate slice angles for ALL schools first
    console.log('[VisualFirstBuilder] === Step 1: Calculating slice angles for all schools ===');
    var sliceAngles = calculateSliceAngles(schoolsData);

    // STORE slice angles for reuse when regenerating individual schools
    storedSliceAngles = sliceAngles;
    console.log('[VisualFirstBuilder] Stored slice angles for', Object.keys(sliceAngles).length, 'schools');

    // Log slice angles
    for (var sn in sliceAngles) {
        var si = sliceAngles[sn];
        console.log('[VisualFirstBuilder] Slice', sn + ': start=' + si.startAngle.toFixed(1) +
                    ', end=' + si.endAngle.toFixed(1) + ', sector=' + si.sectorAngle.toFixed(1));
    }

    // Process each school - check branching mode per school
    var allNodes = [];
    var allEdges = [];
    var schoolOutputs = {};

    for (var schoolName in schoolsData) {
        var config = schoolsData[schoolName].config;
        var spells = schoolsData[schoolName].spells;
        var schoolSeed = seed + hashString(schoolName);
        var sliceInfo = sliceAngles[schoolName];

        // CRITICAL: Attach tree generation settings to config so sub-functions can use them
        config.treeGeneration = treeGen;

        // Check branching mode for this school
        var branchingMode = config.branching_mode || 'fuzzy_groups';  // Default to organic growth

        console.log('[VisualFirstBuilder] === Processing', schoolName, '===');
        console.log('[VisualFirstBuilder] Mode:', branchingMode, '| Spells:', spells.length, '| Shape:', config.shape);
        console.log('[VisualFirstBuilder] Slice bounds: [' + sliceInfo.startAngle.toFixed(1) + '°, ' + sliceInfo.endAngle.toFixed(1) + '°]');

        var allPositions;
        var edges;
        var schoolLayout = null;

        // FUZZY MODE: Use organic growth (positions determined by branching logic)
        if (branchingMode === 'fuzzy_groups') {
            console.log('[VisualFirstBuilder] Using ORGANIC GROWTH for ' + schoolName);

            // Add school name to config for root selection
            config.schoolName = schoolName;

            // Grow tree organically - positions determined by branching
            var organicResult = growOrganicTree(spells, sliceInfo, config, schoolSeed);
            allPositions = organicResult.positions;
            edges = organicResult.edges;

            console.log('[VisualFirstBuilder] Organic growth: ' + allPositions.length + ' nodes, ' + edges.length + ' edges');

            // Create school layout info for output
            schoolLayout = { sliceInfo: sliceInfo };

        } else {
            // PROXIMITY MODE: Grid-based layout
            console.log('[VisualFirstBuilder] Using GRID LAYOUT for ' + schoolName);

            // Generate grid layout for this school using pre-calculated slice
            var positions = generateFullGrid(sliceInfo, spells.length, config.shape || 'organic', config);

            // Select best positions to match spell count
            positions = selectPositions(positions, spells.length);

            schoolLayout = { positions: positions, sliceInfo: sliceInfo };

            console.log('[VisualFirstBuilder] Grid: ' + positions.length + ' positions');

            // Assign spells to positions (grid mode)
            allPositions = positions;
            assignSpellsToPositions(allPositions, spells, schoolSeed + 200);

            // Build edges by proximity
            edges = buildEdges(allPositions, config, schoolSeed + 300, fuzzy);

            var assignedCount = allPositions.filter(function(p) { return p.spell; }).length;
            console.log('[VisualFirstBuilder] Assigned: ' + assignedCount + '/' + spells.length + ', Edges: ' + edges.length);
        }

        // Find root (first novice spell or first spell)
        var root = allPositions.find(function(p) {
            return p.spell && p.tier === 0;
        }) || allPositions.find(function(p) { return p.spell; });

        // Categorize edges by type
        var primaryEdges = edges.filter(function(e) { return !e.type || e.type === 'primary' || e.type === 'cross'; });
        var prereqEdges = edges.filter(function(e) { return e.type === 'prerequisite'; });
        var alternateEdges = edges.filter(function(e) { return e.type === 'alternate'; });

        // Build nodes array
        // DIAGNOSTIC: Log fuzzy.themes availability
        var themeKeys = fuzzy.themes ? Object.keys(fuzzy.themes) : [];
        console.log('[VisualFirstBuilder] fuzzy.themes has', themeKeys.length, 'entries');
        if (themeKeys.length > 0) {
            console.log('[VisualFirstBuilder] Sample theme keys:', themeKeys.slice(0, 3));
        }

        var nodes = allPositions
            .filter(function(p) { return p.spell; })
            .map(function(p) {
                var formId = p.spell.formId;

                // Primary children
                var children = primaryEdges
                    .filter(function(e) { return e.from === formId; })
                    .map(function(e) { return e.to; });

                // Prerequisites - primary incoming + prerequisite type
                var prerequisites = primaryEdges
                    .filter(function(e) { return e.to === formId; })
                    .map(function(e) { return e.from; });

                prereqEdges.forEach(function(e) {
                    if (e.to === formId && prerequisites.indexOf(e.from) === -1) {
                        prerequisites.push(e.from);
                    }
                });

                // Alternate paths (shortcuts)
                var alternatePaths = alternateEdges
                    .filter(function(e) { return e.to === formId || e.from === formId; })
                    .map(function(e) { return e.to === formId ? e.from : e.to; });

                // Get hard/soft prerequisite requirements (if assigned)
                var prereqReqs = p.prereqRequirements || null;

                // Get theme from fuzzy data (C++ TF-IDF discovery)
                var spellThemes = fuzzy.themes ? fuzzy.themes[formId] : null;
                var theme = spellThemes && spellThemes.length > 0 ? spellThemes[0] : null;

                return {
                    formId: formId,
                    children: children,
                    prerequisites: prerequisites,
                    // New unified prereq system
                    hardPrereqs: prereqReqs ? prereqReqs.hardPrereqs : undefined,
                    softPrereqs: prereqReqs ? prereqReqs.softPrereqs : undefined,
                    softNeeded: prereqReqs ? prereqReqs.softNeeded : undefined,
                    tier: p.tier + 1,
                    theme: theme,  // Theme from C++ NLP fuzzy analysis
                    x: p.x,
                    y: p.y,
                    radius: p.radius,
                    angle: p.angle,
                    isRoot: p.isRoot || false,  // CRITICAL: Root flag for origin lines
                    _fromVisualFirst: true  // Flag for wheelRenderer
                };
            });

        schoolOutputs[schoolName] = {
            root: root ? root.spell.formId : null,
            layoutStyle: config.shape || 'organic',
            nodes: nodes,
            config_used: config,
            // Pass slice info for wheelRenderer to use exact same sector angles
            sliceInfo: schoolLayout.sliceInfo
        };

        // Log sample node positions
        var sampleNode = nodes[0];
        console.log('[VisualFirstBuilder]', schoolName + ':', nodes.length, 'nodes');
        console.log('[VisualFirstBuilder] Sample node:', sampleNode ?
                    'x=' + sampleNode.x.toFixed(1) + ', y=' + sampleNode.y.toFixed(1) +
                    ', _fromVisualFirst=' + sampleNode._fromVisualFirst : 'NONE');
    }

    var treeData = {
        version: '2.0',
        generator: 'VisualFirst',
        generatedAt: new Date().toISOString(),
        schools: schoolOutputs,
        school_configs: schoolConfigs
    };

    return treeData;
}

/**
 * Format single school output.
 */
function formatTreeOutput(schoolName, positions, edges, config) {
    // Find root (first novice spell)
    var root = positions.find(function(p) {
        return p.spell && p.tier === 0;
    }) || positions.find(function(p) { return p.spell; });

    // Categorize edges by type
    var primaryEdges = edges.filter(function(e) { return !e.type || e.type === 'primary' || e.type === 'cross'; });
    var prereqEdges = edges.filter(function(e) { return e.type === 'prerequisite'; });
    var alternateEdges = edges.filter(function(e) { return e.type === 'alternate'; });

    console.log('[FormatOutput] Edges by type: primary=' + primaryEdges.length +
                ', prereq=' + prereqEdges.length + ', alternate=' + alternateEdges.length);

    // Build nodes array
    var nodes = positions
        .filter(function(p) { return p.spell; })
        .map(function(p) {
            var formId = p.spell.formId;

            // Primary children (direct progression)
            var children = primaryEdges
                .filter(function(e) { return e.from === formId; })
                .map(function(e) { return e.to; });

            // Prerequisites - combine primary incoming edges + prerequisite type edges
            var prerequisites = primaryEdges
                .filter(function(e) { return e.to === formId; })
                .map(function(e) { return e.from; });

            // Add prerequisite-type edges (additional requirements)
            prereqEdges.forEach(function(e) {
                if (e.to === formId && prerequisites.indexOf(e.from) === -1) {
                    prerequisites.push(e.from);
                }
            });

            // Alternate paths (shortcuts - learning ANY of these also unlocks this spell)
            var alternatePaths = alternateEdges
                .filter(function(e) { return e.to === formId || e.from === formId; })
                .map(function(e) { return e.to === formId ? e.from : e.to; });

                // Get hard/soft prerequisite requirements (if assigned)
                var prereqReqs = p.prereqRequirements || null;

                return {
                formId: formId,
                children: children,
                prerequisites: prerequisites,
                // New unified prereq system
                hardPrereqs: prereqReqs ? prereqReqs.hardPrereqs : undefined,
                softPrereqs: prereqReqs ? prereqReqs.softPrereqs : undefined,
                softNeeded: prereqReqs ? prereqReqs.softNeeded : undefined,
                tier: p.tier + 1,
                x: p.x,
                y: p.y,
                radius: p.radius,
                angle: p.angle,
                isRoot: p.isRoot || false,  // CRITICAL: Root flag for origin lines
                _fromVisualFirst: true
            };
        });

    var schoolOutput = {
        root: root ? root.spell.formId : null,
        layoutStyle: config.shape || 'organic',
        nodes: nodes,
        config_used: config
    };

    var output = {
        version: '2.0',
        generator: 'VisualFirst',
        generatedAt: new Date().toISOString(),
        schools: {}
    };
    output.schools[schoolName] = schoolOutput;

    return output;
}

// =============================================================================
// EXPORTS
// =============================================================================

window.VisualFirstBuilder = {
    generateVisualFirstTree: generateVisualFirstTree,
    generateAllVisualFirstTrees: generateAllVisualFirstTrees,
    assignSpellsToPositions: assignSpellsToPositions,
    buildEdges: buildEdges
};

window.generateVisualFirstTree = generateVisualFirstTree;
window.generateAllVisualFirstTrees = generateAllVisualFirstTrees;
