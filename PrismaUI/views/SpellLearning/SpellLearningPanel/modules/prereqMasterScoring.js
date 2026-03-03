/**
 * PreReq Master - NLP Scoring
 * JS-side TF-IDF and fuzzy scoring for prerequisite lock assignment.
 * Provides scoring functions used by prereqMaster.js lock builder.
 *
 * Depends on: (none - pure computation)
 */

// =========================================================================
// UTILITY — Proper Fisher-Yates shuffle (unbiased)
// =========================================================================

/**
 * Fisher-Yates (Knuth) in-place shuffle. Returns the same array, shuffled.
 * Unlike Array.sort(()=>Math.random()-0.5), this produces a truly uniform
 * random permutation.
 */
function _fisherYatesShuffle(arr) {
    for (var i = arr.length - 1; i > 0; i--) {
        var j = Math.floor(Math.random() * (i + 1));
        var tmp = arr[i];
        arr[i] = arr[j];
        arr[j] = tmp;
    }
    return arr;
}

// =========================================================================
// TIER HELPERS
// =========================================================================

var TIER_MAP = {
    'novice': 0, 'apprentice': 1, 'adept': 2, 'expert': 3, 'master': 4,
    '0': 0, '1': 1, '2': 2, '3': 3, '4': 4
};

var TIER_NAMES = ['novice', 'apprentice', 'adept', 'expert', 'master'];

/**
 * Get the SPELL SKILL TIER index (0-4) for a node.
 * IMPORTANT: node.tier is TREE DEPTH (can be 1-22+), NOT the spell tier!
 * We must use node.skillLevel (string like "Expert") or node.spell.skillLevel.
 */
function getTierIndex(node) {
    // 1. Check skillLevel string first (the actual spell tier: "Novice", "Expert", etc.)
    var skillLevel = node.skillLevel ||
                     (node.spell && node.spell.skillLevel) ||
                     node.level || '';
    if (typeof skillLevel === 'string' && skillLevel.length > 0) {
        var lower = skillLevel.toLowerCase();
        if (TIER_MAP[lower] !== undefined) return TIER_MAP[lower];
    }

    // 2. If node.tier is a small number (0-4), it might be a real spell tier
    //    But if it's > 4, it's tree depth — map to spell tier range
    if (typeof node.tier === 'number') {
        if (node.tier >= 0 && node.tier <= 4) return node.tier;
        // Tree depth > 4: clamp/map to 0-4 range based on relative depth
        // Depths 1-4 → already handled. Depths 5+ → distribute across tiers.
        // Rough mapping: shallower = easier, deeper = harder
        if (node.tier <= 6) return 1;       // apprentice
        if (node.tier <= 9) return 2;       // adept
        if (node.tier <= 14) return 3;      // expert
        return 4;                            // master (depth 15+)
    }

    return 0; // fallback: novice
}

function getTierName(node) {
    var idx = getTierIndex(node);
    return TIER_NAMES[idx] || 'novice';
}

// =========================================================================
// DISTANCE CALCULATION
// =========================================================================

/**
 * Euclidean distance using LAYOUT positions (pixel space).
 * Falls back to node.x/y if no layout pos available.
 * Returns Infinity if either node has no valid position.
 */
var _cachedPosMap = null;

function _getLayoutPosMap() {
    if (_cachedPosMap) return _cachedPosMap;
    if (typeof TreeGrowth !== 'undefined' && TreeGrowth.modes && TreeGrowth.activeMode) {
        var modeModule = TreeGrowth.modes[TreeGrowth.activeMode];
        if (modeModule && typeof modeModule.getPositionMap === 'function') {
            _cachedPosMap = modeModule.getPositionMap();
        }
    }
    return _cachedPosMap;
}

function gridDistance(a, b) {
    var posMap = _getLayoutPosMap();
    var aId = a.id || a.formId;
    var bId = b.id || b.formId;
    var ax, ay, bx, by;

    if (posMap && posMap[aId] && posMap[bId]) {
        ax = posMap[aId].x; ay = posMap[aId].y;
        bx = posMap[bId].x; by = posMap[bId].y;
    } else {
        // Fallback to node properties, but only if both have real coords
        ax = a.x; ay = a.y;
        bx = b.x; by = b.y;
        if (ax == null || ay == null || bx == null || by == null) return Infinity;
    }
    return Math.sqrt((ax - bx) * (ax - bx) + (ay - by) * (ay - by));
}

// =========================================================================
// TREE TRAVERSAL - Descendant/Ancestor checks for cycle prevention
// =========================================================================

/**
 * Build a set of all descendant formIds for a given node (everything
 * reachable by following 'children' edges). Used to prevent locks
 * from pointing to descendants (which creates deadlocks).
 */
function _getDescendants(nodeId, allNodes) {
    var descendants = {};
    var queue = [];
    var startNode = allNodes.get(nodeId);
    if (!startNode || !startNode.children) return descendants;

    for (var i = 0; i < startNode.children.length; i++) {
        queue.push(startNode.children[i]);
    }

    while (queue.length > 0) {
        var curId = queue.shift();
        if (descendants[curId]) continue;
        descendants[curId] = true;
        var curNode = allNodes.get(curId);
        if (curNode && curNode.children) {
            for (var j = 0; j < curNode.children.length; j++) {
                queue.push(curNode.children[j]);
            }
        }
    }
    return descendants;
}

/**
 * Check if candidateId is a descendant of spellId (i.e. spellId can reach
 * candidateId through children). If so, locking spellId with candidateId
 * would create a deadlock.
 */
function _isDescendant(spellId, candidateId, allNodes) {
    var queue = [];
    var startNode = allNodes.get(spellId);
    if (!startNode || !startNode.children) return false;

    for (var i = 0; i < startNode.children.length; i++) {
        queue.push(startNode.children[i]);
    }

    var visited = {};
    while (queue.length > 0) {
        var curId = queue.shift();
        if (curId === candidateId) return true;
        if (visited[curId]) continue;
        visited[curId] = true;
        var curNode = allNodes.get(curId);
        if (curNode && curNode.children) {
            for (var j = 0; j < curNode.children.length; j++) {
                queue.push(curNode.children[j]);
            }
        }
    }
    return false;
}

/**
 * Check if candidateId is an ancestor of spellId (i.e. candidateId must
 * be learned before spellId through the normal prereq chain). Locking
 * with an ancestor is safe but redundant - we allow it but prefer
 * non-ancestor candidates.
 */
function _isAncestor(spellId, candidateId, allNodes) {
    var queue = [];
    var startNode = allNodes.get(spellId);
    if (!startNode || !startNode.prerequisites) return false;

    for (var i = 0; i < startNode.prerequisites.length; i++) {
        queue.push(startNode.prerequisites[i]);
    }

    var visited = {};
    while (queue.length > 0) {
        var curId = queue.shift();
        if (curId === candidateId) return true;
        if (visited[curId]) continue;
        visited[curId] = true;
        var curNode = allNodes.get(curId);
        if (curNode && curNode.prerequisites) {
            for (var j = 0; j < curNode.prerequisites.length; j++) {
                queue.push(curNode.prerequisites[j]);
            }
        }
    }
    return false;
}

/**
 * After locks are applied, verify all nodes in each school are reachable
 * from the school root. Returns array of unreachable node names.
 */
function _validateReachability(allNodes) {
    var unreachable = [];
    // Group by school, find roots
    var schools = {};
    allNodes.forEach(function(node, id) {
        var school = node.school || 'Unknown';
        if (!schools[school]) schools[school] = { root: null, nodes: [] };
        schools[school].nodes.push(id);
        if (node.isRoot) schools[school].root = id;
    });

    for (var schoolName in schools) {
        var schoolData = schools[schoolName];
        var rootId = schoolData.root;
        if (!rootId) continue;

        // BFS from root following children
        var reachable = {};
        var queue = [rootId];
        while (queue.length > 0) {
            var curId = queue.shift();
            if (reachable[curId]) continue;
            reachable[curId] = true;
            var curNode = allNodes.get(curId);
            if (curNode && curNode.children) {
                for (var i = 0; i < curNode.children.length; i++) {
                    queue.push(curNode.children[i]);
                }
            }
        }

        // Check all school nodes are reachable
        for (var j = 0; j < schoolData.nodes.length; j++) {
            var nid = schoolData.nodes[j];
            if (!reachable[nid]) {
                var node = allNodes.get(nid);
                unreachable.push((node ? node.name : nid) + ' (' + schoolName + ')');
            }
        }
    }

    return unreachable;
}

/**
 * Check if candidate is reachable from any root WITHOUT going through spellId.
 * If removing spellId from the tree makes candidate unreachable, then locking
 * spellId with candidate would create a deadlock (candidate can't be learned
 * without first progressing through spellId's branch).
 * @param {string} spellId - The spell being locked
 * @param {string} candidateId - The candidate lock target
 * @param {Map} allNodes - All tree nodes
 * @returns {boolean} True if candidate is ONLY reachable through spellId
 */
function _isOnlyReachableThrough(spellId, candidateId, allNodes) {
    // Find all roots
    var roots = [];
    allNodes.forEach(function(node, id) {
        if (node.isRoot) roots.push(id);
    });
    if (roots.length === 0) return false;

    // BFS from all roots, skipping spellId entirely
    var reachable = {};
    var queue = roots.slice();
    while (queue.length > 0) {
        var curId = queue.shift();
        if (curId === spellId) continue; // Skip the spell being locked
        if (reachable[curId]) continue;
        reachable[curId] = true;
        var curNode = allNodes.get(curId);
        if (curNode && curNode.children) {
            for (var i = 0; i < curNode.children.length; i++) {
                queue.push(curNode.children[i]);
            }
        }
    }

    // If candidate is NOT reachable without spellId, this lock would deadlock
    return !reachable[candidateId];
}

/**
 * Detect cycles in the combined tree prerequisite + lock dependency graph.
 * A "dependency" means: to learn node X you must first learn all its
 * prerequisites (tree edges) AND all its lock targets (hardPrereqs).
 *
 * Returns an array of { nodeId, lockNodeId } pairs representing locks that
 * participate in cycles and should be removed to break deadlocks.
 *
 * Uses Kahn's algorithm (topological sort via in-degree counting).
 * Nodes remaining after the sort has exhausted all zero-in-degree nodes
 * are in cycles.
 *
 * @param {Map} allNodes - All tree nodes
 * @returns {Array} Locks to remove: [{ nodeId, lockNodeId }]
 */
function _detectAndRemoveLockCycles(allNodes) {
    // Build adjacency list: edge from A->B means "B depends on A" (A must be learned first)
    // Equivalently, B has in-edge from A.
    // We track in-degree for each node and adjacency for forward traversal.
    var inDegree = {};
    var adjList = {};   // adjList[A] = [B, C, ...] means A is a dependency of B, C, ...
    var lockEdges = []; // Track which edges are lock-based (for targeted removal)

    allNodes.forEach(function(node, id) {
        if (!inDegree[id]) inDegree[id] = 0;
        if (!adjList[id]) adjList[id] = [];
    });

    // Add tree prerequisite edges (parent -> child means child depends on parent)
    allNodes.forEach(function(node, id) {
        if (node.prerequisites) {
            for (var i = 0; i < node.prerequisites.length; i++) {
                var prereqId = node.prerequisites[i];
                if (!adjList[prereqId]) adjList[prereqId] = [];
                adjList[prereqId].push(id);
                inDegree[id] = (inDegree[id] || 0) + 1;
            }
        }
    });

    // Add lock edges (lock target -> locked node means locked node depends on lock target)
    allNodes.forEach(function(node, id) {
        if (node.locks && node.locks.length > 0) {
            for (var i = 0; i < node.locks.length; i++) {
                var lockTargetId = node.locks[i].nodeId;
                if (!adjList[lockTargetId]) adjList[lockTargetId] = [];
                adjList[lockTargetId].push(id);
                inDegree[id] = (inDegree[id] || 0) + 1;
                lockEdges.push({ nodeId: id, lockNodeId: lockTargetId });
            }
        }
    });

    // Kahn's algorithm: topological sort
    var queue = [];
    for (var nid in inDegree) {
        if (inDegree[nid] === 0) queue.push(nid);
    }

    var sorted = 0;
    while (queue.length > 0) {
        var cur = queue.shift();
        sorted++;
        if (adjList[cur]) {
            for (var j = 0; j < adjList[cur].length; j++) {
                var neighbor = adjList[cur][j];
                inDegree[neighbor]--;
                if (inDegree[neighbor] === 0) {
                    queue.push(neighbor);
                }
            }
        }
    }

    // If all nodes were sorted, no cycles
    var totalNodes = 0;
    for (var k in inDegree) totalNodes++;

    if (sorted === totalNodes) {
        return []; // No cycles
    }

    // Nodes still with inDegree > 0 are in cycles
    var inCycle = {};
    for (var cid in inDegree) {
        if (inDegree[cid] > 0) inCycle[cid] = true;
    }

    // Find lock edges where both endpoints are in cycles - these are the offenders
    var toRemove = [];
    for (var li = 0; li < lockEdges.length; li++) {
        var le = lockEdges[li];
        if (inCycle[le.nodeId] || inCycle[le.lockNodeId]) {
            toRemove.push(le);
        }
    }

    return toRemove;
}

/**
 * Remove specific lock edges from nodes. Returns count of removed locks.
 * @param {Array} locksToRemove - Array of { nodeId, lockNodeId }
 * @param {Map} allNodes - All tree nodes
 * @returns {number} Number of locks removed
 */
function _removeLockEdges(locksToRemove, allNodes) {
    var removed = 0;
    for (var i = 0; i < locksToRemove.length; i++) {
        var edge = locksToRemove[i];
        var node = allNodes.get(edge.nodeId);
        if (!node || !node.locks) continue;

        var before = node.locks.length;
        node.locks = node.locks.filter(function(lock) {
            return lock.nodeId !== edge.lockNodeId;
        });
        var delta = before - node.locks.length;
        if (delta > 0) {
            removed += delta;
            _prmLog('REMOVED deadlock lock: ' + (node.name || edge.nodeId) + ' -> ' + edge.lockNodeId);
        }
    }
    return removed;
}

// =========================================================================
// JS FALLBACK SCORER - TF-IDF + Cosine Similarity
// Ported from prereq_master_scorer.py for consistent results
// =========================================================================

function tokenize(text) {
    if (!text) return [];
    return text.toLowerCase()
        .replace(/[^a-z0-9\s]/g, ' ')
        .split(/\s+/)
        .filter(function(w) { return w.length > 2; });
}

function buildTextBlob(node) {
    var parts = [];
    // Weight name 2x (repeat it) to match NLP scorer behavior
    if (node.name) { parts.push(node.name); parts.push(node.name); }
    if (node.desc) parts.push(node.desc);
    if (node.effects && Array.isArray(node.effects)) {
        node.effects.forEach(function(e) {
            if (typeof e === 'string') parts.push(e);
            else if (e && e.name) parts.push(e.name);
        });
    }
    return parts.join(' ');
}

/**
 * Compute TF-IDF vectors for a list of token arrays (documents).
 * @param {Array<Array<string>>} documents - Array of tokenized documents
 * @returns {Array<Object>} Array of sparse TF-IDF vectors (token -> weight)
 */
function computeTfIdf(documents) {
    // Document frequency: how many docs contain each token
    var df = {};
    var nDocs = documents.length;

    documents.forEach(function(doc) {
        var seen = {};
        doc.forEach(function(token) {
            if (!seen[token]) {
                seen[token] = true;
                df[token] = (df[token] || 0) + 1;
            }
        });
    });

    // IDF: smoothed inverse document frequency
    var idf = {};
    for (var token in df) {
        idf[token] = Math.log((nDocs + 1) / (df[token] + 1)) + 1;
    }

    // TF-IDF vectors
    var vectors = [];
    documents.forEach(function(doc) {
        var tf = {};
        doc.forEach(function(token) { tf[token] = (tf[token] || 0) + 1; });
        var total = doc.length || 1;
        var vec = {};
        for (var t in tf) {
            vec[t] = (tf[t] / total) * (idf[t] || 1.0);
        }
        vectors.push(vec);
    });

    return vectors;
}

/**
 * Compute cosine similarity between two sparse vectors (objects).
 */
function cosineSimilarity(vecA, vecB) {
    var dot = 0;
    for (var token in vecA) {
        if (vecB[token]) dot += vecA[token] * vecB[token];
    }

    var magA = 0, magB = 0;
    for (var a in vecA) magA += vecA[a] * vecA[a];
    for (var b in vecB) magB += vecB[b] * vecB[b];

    magA = Math.sqrt(magA);
    magB = Math.sqrt(magB);

    if (magA === 0 || magB === 0) return 0;
    return dot / (magA * magB);
}

/**
 * JS TF-IDF similarity scorer (fallback when C++ unavailable).
 * Builds a per-pair TF-IDF corpus and scores via cosine similarity.
 * Matches the algorithm in prereq_master_scorer.py.
 */
function jsSimilarityScore(spellNode, candidateNode) {
    var tokensA = tokenize(buildTextBlob(spellNode));
    var tokensB = tokenize(buildTextBlob(candidateNode));
    if (tokensA.length === 0 || tokensB.length === 0) return 0;

    var vectors = computeTfIdf([tokensA, tokensB]);
    return cosineSimilarity(vectors[0], vectors[1]);
}

/**
 * Batch-score all candidates for a spell using TF-IDF.
 * Builds a single corpus (spell + all candidates) for better IDF weighting.
 * @param {Object} spellNode - The spell to score against
 * @param {Array} candidates - Array of candidate nodes
 * @returns {Array} [{node, score}] sorted by score descending
 */
function batchTfIdfScore(spellNode, candidates) {
    if (!candidates || candidates.length === 0) return [];

    var spellTokens = tokenize(buildTextBlob(spellNode));
    if (spellTokens.length === 0) return candidates.map(function(c) { return { node: c, score: 0 }; });

    var allDocs = [spellTokens];
    candidates.forEach(function(cand) {
        allDocs.push(tokenize(buildTextBlob(cand)));
    });

    var vectors = computeTfIdf(allDocs);
    var spellVec = vectors[0];

    var scored = [];
    for (var i = 0; i < candidates.length; i++) {
        scored.push({
            node: candidates[i],
            score: cosineSimilarity(spellVec, vectors[i + 1])
        });
    }

    scored.sort(function(a, b) { return b.score - a.score; });
    return scored;
}
