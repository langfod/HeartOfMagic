/**
 * Tooltip Manager — Shared tooltip show/hide with progressive reveal (DUP-R6)
 *
 * Consolidates the identical tooltip implementations from
 * wheelInteraction.js and canvasInteraction.js.
 *
 * Depends on: DOM (tooltip element), state (spell progress), settings (reveal thresholds)
 */

var TooltipManager = {

    /**
     * Show tooltip for a node at the given mouse event position.
     * Uses progressive reveal based on discovery mode settings.
     *
     * @param {Object} node    - Node data (name, formId, school, level, cost, state, isRoot)
     * @param {Event} event    - Mouse event for positioning
     */
    show: function (node, event) {
        var tooltip = document.getElementById('tooltip');
        if (!tooltip) return;

        // Progressive reveal logic
        var _tCanonId = (typeof getCanonicalFormId === 'function') ? getCanonicalFormId(node) : node.formId;
        var progress = (typeof state !== 'undefined' && state.spellProgress) ? (state.spellProgress[_tCanonId] || {}) : {};
        var progressPercent = progress.required > 0 ? (progress.xp / progress.required) * 100 : 0;
        var playerHasSpell = progress.unlocked || node.state === 'unlocked';

        var showFullInfo = playerHasSpell || (typeof settings !== 'undefined' && settings.cheatMode);
        var isRootWithReveal = node.isRoot && (typeof settings !== 'undefined' && settings.showRootSpellNames);
        var isLearning = node.state === 'learning';
        var isLocked = node.state === 'locked';
        var revealThreshold = (typeof settings !== 'undefined' && settings.revealName !== undefined) ? settings.revealName : 10;
        var showName = showFullInfo || isLearning || (!isLocked && progressPercent >= revealThreshold) || isRootWithReveal;
        var showDetails = node.state !== 'locked' || (typeof settings !== 'undefined' && settings.cheatMode);

        var nameText = showName ? (node.name || node.formId) : '???';
        var infoText;
        if (node.state === 'locked') {
            infoText = 'Unlock prerequisites first';
        } else if (showDetails) {
            infoText = node.school + ' \u2022 ' + (node.level || '?') + ' \u2022 ' + (node.cost || '?') + ' magicka';
        } else {
            infoText = node.school + ' \u2022 Progress: ' + Math.round(progressPercent) + '%';
        }

        var nameEl = tooltip.querySelector('.tooltip-name');
        var infoEl = tooltip.querySelector('.tooltip-info');
        var stateEl = tooltip.querySelector('.tooltip-state');
        if (nameEl) nameEl.textContent = nameText;
        if (infoEl) infoEl.textContent = infoText;
        if (stateEl) {
            stateEl.textContent = node.state;
            stateEl.className = 'tooltip-state ' + node.state;
        }

        tooltip.classList.remove('hidden');
        tooltip.style.left = (event.clientX + 15) + 'px';
        tooltip.style.top = (event.clientY + 15) + 'px';
    },

    /**
     * Hide the tooltip.
     */
    hide: function () {
        var tooltip = document.getElementById('tooltip');
        if (tooltip) tooltip.classList.add('hidden');
    }
};

window.TooltipManager = TooltipManager;
