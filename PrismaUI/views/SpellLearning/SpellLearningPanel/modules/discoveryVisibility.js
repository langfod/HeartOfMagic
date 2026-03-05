/**
 * Discovery Visibility — Shared discovery mode visibility set builder (DUP-R5)
 *
 * Fixes bug: WebGL renderer was missing 'learning' state in discovery visibility.
 *
 * Depends on: nothing (pure set logic)
 */

var DiscoveryVisibility = {

    /**
     * Build the set of visible node IDs for discovery mode.
     * Shows: unlocked, learning, and available nodes, plus locked nodes ONE STEP away.
     *
     * @param {Array} nodes - Node array with id, formId, and state properties
     * @param {Array} edges - Edge array with from/to properties
     * @returns {Set} Set of visible node IDs (includes both id and formId)
     */
    build: function (nodes, edges) {
        var visible = new Set();
        var coreIds = new Set();

        // Pass 1: collect unlocked, learning, and available nodes
        for (var i = 0; i < nodes.length; i++) {
            var node = nodes[i];
            if (node.state === 'unlocked' || node.state === 'learning' || node.state === 'available') {
                visible.add(node.id);
                if (node.formId) visible.add(node.formId);
                coreIds.add(node.id);
                if (node.formId) coreIds.add(node.formId);
            }
        }

        // Pass 2: add locked nodes ONE STEP from core visible nodes
        for (var j = 0; j < edges.length; j++) {
            var edge = edges[j];
            var fromVisible = coreIds.has(edge.from);
            var toVisible = coreIds.has(edge.to);

            if (fromVisible && !toVisible) {
                visible.add(edge.to);
            }
            if (toVisible && !fromVisible) {
                visible.add(edge.from);
            }
        }

        return visible;
    }
};

window.DiscoveryVisibility = DiscoveryVisibility;
