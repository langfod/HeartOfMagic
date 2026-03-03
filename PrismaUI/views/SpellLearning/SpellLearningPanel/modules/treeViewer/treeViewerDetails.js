/**
 * Tree Viewer -- Details
 * Spell details panel: shows spell info, prerequisites, progression,
 * and learn/unlock controls when a node is selected.
 *
 * Depends on:
 * - modules/state.js (state, settings)
 * - modules/treeViewer/treeViewerCore.js (_findNodeById)
 * - modules/wheelRenderer/ (WheelRenderer)
 * - modules/xpSettings.js (getXPForTier, xpOverrides)
 * - modules/uiHelpers.js (updateLearningStatusBadge, autoSaveSettings)
 * - modules/colorUtils.js (getOrAssignSchoolColor)
 */

// =============================================================================
// SPELL DETAILS PANEL
// =============================================================================

function showSpellDetails(node) {
    var panel = document.getElementById('details-panel');
    if (!panel) return;
    panel.classList.remove('hidden');

    // Reveal locks for this node (Pre Req Master)
    if (typeof PreReqMaster !== 'undefined' && PreReqMaster.revealLocksForNode) {
        PreReqMaster.revealLocksForNode(node.id);
    }

    // Get progress data for progressive reveal
    // Debug: show what keys are in spellProgress
    var progressKeys = Object.keys(state.spellProgress);
    console.log('[SpellLearning] showSpellDetails - Looking for:', node.formId);
    console.log('[SpellLearning] Available progress keys:', progressKeys.join(', '));

    // Use canonical formId for duplicates, then try multiple formats
    var lookupId = (typeof getCanonicalFormId === 'function') ? getCanonicalFormId(node) : node.formId;
    var formIdVariants = [
        lookupId,
        lookupId.toLowerCase(),
        lookupId.toUpperCase(),
        lookupId.replace(/^0x/i, ''),
        '0x' + lookupId.replace(/^0x/i, ''),
        '0x' + lookupId.replace(/^0x/i, '').toUpperCase(),
        '0x' + lookupId.replace(/^0x/i, '').toLowerCase()
    ];
    // Also check the node's own formId if different from canonical
    if (lookupId !== node.formId) {
        formIdVariants.push(node.formId);
    }

    var progress = null;
    var matchedKey = null;
    for (var i = 0; i < formIdVariants.length; i++) {
        if (state.spellProgress[formIdVariants[i]]) {
            progress = state.spellProgress[formIdVariants[i]];
            matchedKey = formIdVariants[i];
            console.log('[SpellLearning] Found progress with key:', matchedKey);
            break;
        }
    }

    if (!progress) {
        console.log('[SpellLearning] No progress found for any variant of', node.formId);
    }
    progress = progress || { xp: 0, required: 100, progress: 0 };

    // Calculate XP required based on tier (always use current settings, not stale C++ value)
    var tierXP = getXPForTier(node.level);
    var requiredXP = xpOverrides[node.formId] !== undefined ? xpOverrides[node.formId] : (tierXP || 100);

    // Calculate progress percent - use xp/required directly since progress.progress may not be set
    var progressPercent = requiredXP > 0 ? ((progress.xp || 0) / requiredXP) * 100 : 0;
    console.log('[SpellLearning] Progress:', progress.xp, '/', requiredXP, '=', progressPercent.toFixed(1) + '%',
        '| revealName:', settings.revealName, '| showName should be:', progressPercent >= settings.revealName);

    // Check if player has the spell (via early learning or other means)
    // Use canonical formId for duplicates
    var playerHasSpell = progress.unlocked ||
                         state.playerKnownSpells.has(lookupId) ||
                         state.playerKnownSpells.has(node.formId) ||
                         node.state === 'unlocked';

    // Determine what to show based on state and progress
    // Cheat mode shows ALL info (includes former debug mode features)
    // Edit mode reveals everything so the user can see what they're editing
    // Player having the spell (early learning) also reveals full info
    // Available (learnable) spells always show their name
    var isEditActive = typeof EditMode !== 'undefined' && EditMode.isActive;
    var showFullInfo = playerHasSpell || settings.cheatMode || isEditActive;
    var isLearning = node.state === 'learning';
    var isLocked = node.state === 'locked';
    // Locked/mystery nodes never reveal info via progress threshold - only via cheat/edit/hasSpell
    var showName = showFullInfo || isLearning || (!isLocked && progressPercent >= settings.revealName);
    var showEffects = showFullInfo || (!isLocked && progressPercent >= settings.revealEffects);
    var showDescription = showFullInfo || (!isLocked && progressPercent >= settings.revealDescription);
    var showLevelAndCost = !isLocked || settings.cheatMode || isEditActive;

    // School badge always visible
    document.getElementById('spell-school').textContent = node.school;
    document.getElementById('spell-school').className = 'school-badge ' + node.school.toLowerCase();

    // Name - progressive reveal (cheat mode shows all)
    if (showName) {
        var nameDisplay = node.name || node.formId;
        if (settings.cheatMode && node.state === 'locked') {
            nameDisplay = (node.name || 'Unknown') + ' [LOCKED]';
        }
        document.getElementById('spell-name').textContent = nameDisplay;
    } else {
        document.getElementById('spell-name').textContent = '???';
    }

    // Level and cost - show for available (learning) and unlocked
    if (showLevelAndCost) {
        document.getElementById('spell-level').textContent = node.level || '?';
        document.getElementById('spell-cost').textContent = node.cost || '?';
        document.getElementById('spell-type').textContent = node.type || '?';
    } else {
        document.getElementById('spell-level').textContent = '???';
        document.getElementById('spell-cost').textContent = '???';
        document.getElementById('spell-type').textContent = '???';
    }

    // Effects - progressive reveal with weakened info
    var effectsList = document.getElementById('spell-effects');
    effectsList.innerHTML = '';

    // Check if spell is weakened (effectiveness < 100%)
    var isWeakened = node.isWeakened === true || (node.effectiveness && node.effectiveness < 100);
    var effectiveness = node.effectiveness || 100;

    if (showEffects) {
        // Show effectiveness warning if weakened
        if (isWeakened) {
            var weakenedLi = document.createElement('li');
            weakenedLi.className = 'weakened-warning';
            weakenedLi.textContent = '! ' + effectiveness + '% Power (practicing...)';
            weakenedLi.style.color = '#f59e0b';
            weakenedLi.style.fontWeight = 'bold';
            effectsList.appendChild(weakenedLi);
        }

        // Use scaledEffects if available (from C++ for weakened spells)
        var effectsToShow = (isWeakened && node.scaledEffects) ? node.scaledEffects : (Array.isArray(node.effects) ? node.effects : []);

        if (effectsToShow.length === 0) {
            var noEffLi = document.createElement('li');
            noEffLi.textContent = 'No effects';
            effectsList.appendChild(noEffLi);
        } else {
            effectsToShow.forEach(function(e) {
                var li = document.createElement('li');
                if (typeof e === 'string') {
                    li.textContent = e;
                } else if (e.scaledMagnitude !== undefined) {
                    // Scaled effect from C++
                    var text = e.name || 'Effect';
                    if (e.scaledMagnitude > 0) {
                        text += ' (' + e.scaledMagnitude + ')';
                        if (e.originalMagnitude && e.originalMagnitude !== e.scaledMagnitude) {
                            li.title = 'Full power: ' + e.originalMagnitude;
                        }
                    }
                    if (e.duration > 0) {
                        text += ' for ' + e.duration + 's';
                    }
                    li.textContent = text;
                    if (isWeakened) li.style.color = '#fbbf24';
                } else {
                    li.textContent = e.name || JSON.stringify(e);
                }
                effectsList.appendChild(li);
            });
        }
    } else {
        effectsList.innerHTML = '<li class="hidden-info">??? (' + settings.revealEffects + '% to reveal)</li>';
    }

    // Description - progressive reveal
    if (showDescription) {
        document.getElementById('spell-description').textContent = node.desc || 'No description.';
    } else if (node.state === 'locked') {
        document.getElementById('spell-description').textContent = 'Unlock prerequisites to reveal.';
    } else {
        document.getElementById('spell-description').textContent = 'Progress to ' + settings.revealDescription + '% to reveal description...';
    }

    // Populate prerequisites with hard/soft distinction
    var prereqSummary = document.getElementById('prereq-summary');
    var hardPrereqsSection = document.getElementById('hard-prereqs-section');
    var softPrereqsSection = document.getElementById('soft-prereqs-section');
    var hardPrereqsList = document.getElementById('hard-prereqs-list');
    var softPrereqsList = document.getElementById('soft-prereqs-list');
    var softNeededCount = document.getElementById('soft-needed-count');
    var legacyPrereqList = document.getElementById('spell-prereqs');

    // Clear all lists
    if (hardPrereqsList) hardPrereqsList.innerHTML = '';
    if (softPrereqsList) softPrereqsList.innerHTML = '';
    if (legacyPrereqList) legacyPrereqList.innerHTML = '';

    // Get hard/soft prereqs from node
    var hardPrereqs = node.hardPrereqs || [];
    var softPrereqs = node.softPrereqs || [];
    var softNeeded = node.softNeeded || 0;
    var hasHardSoftData = hardPrereqs.length > 0 || softPrereqs.length > 0;

    // Helper to create prereq list item
    function createPrereqItem(id, isHard, isMet) {
        var n = state.treeData ? _findNodeById(id) : null;
        var li = document.createElement('li');
        var showPrereqName = settings.cheatMode || (n && n.state !== 'locked');

        // Check if edit mode is active
        var isEditMode = typeof EditMode !== 'undefined' && EditMode.isActive;

        if (isEditMode) {
            li.classList.add('prereq-edit-item');

            // Name span
            var nameSpan = document.createElement('span');
            nameSpan.className = 'prereq-name';
            nameSpan.textContent = showPrereqName ? (n ? (n.name || n.formId) : id) : '???';
            nameSpan.dataset.id = id;
            li.appendChild(nameSpan);

            // Edit controls container
            var controls = document.createElement('span');
            controls.className = 'prereq-edit-controls';

            // Toggle hard/soft button
            var toggleBtn = document.createElement('button');
            toggleBtn.className = 'prereq-toggle-btn ' + (isHard ? 'hard' : 'soft');
            toggleBtn.textContent = isHard ? 'H' : 'S';
            toggleBtn.title = isHard ? 'Hard (required) - click to make Soft' : 'Soft (optional) - click to make Hard';
            toggleBtn.addEventListener('click', function(e) {
                e.stopPropagation();
                if (typeof EditMode !== 'undefined') {
                    EditMode.togglePrereqType(node, id);
                }
            });
            controls.appendChild(toggleBtn);

            // Delete button
            var deleteBtn = document.createElement('button');
            deleteBtn.className = 'prereq-delete-btn';
            deleteBtn.textContent = '\u00d7';
            deleteBtn.title = 'Remove prerequisite';
            deleteBtn.addEventListener('click', function(e) {
                e.stopPropagation();
                if (typeof EditMode !== 'undefined') {
                    EditMode.deletePrerequisite(node, id);
                }
            });
            controls.appendChild(deleteBtn);

            li.appendChild(controls);
        } else {
            li.textContent = showPrereqName ? (n ? (n.name || n.formId) : id) : '???';
        }

        li.dataset.id = id;
        if (isMet) li.classList.add('prereq-met');
        if (!showPrereqName) li.classList.add('prereq-hidden');  // Not clickable
        return li;
    }

    // Check if a prereq is met (node is unlocked/mastered)
    function isPrereqMet(id) {
        var n = state.treeData ? _findNodeById(id) : null;
        return n && n.state === 'unlocked';
    }

    if (hasHardSoftData && hardPrereqsSection && softPrereqsSection) {
        // Show hard/soft distinction
        hardPrereqsSection.classList.toggle('hidden', hardPrereqs.length === 0);
        softPrereqsSection.classList.toggle('hidden', softPrereqs.length === 0);
        legacyPrereqList.classList.add('hidden');

        // Count met prereqs
        var hardMet = hardPrereqs.filter(isPrereqMet).length;
        var softMet = softPrereqs.filter(isPrereqMet).length;

        // Summary text
        if (prereqSummary) {
            var totalHard = hardPrereqs.length;
            var totalSoft = softPrereqs.length;
            if (totalHard === 0 && totalSoft === 0) {
                prereqSummary.textContent = 'No prerequisites';
                prereqSummary.className = 'prereq-summary none';
            } else {
                var parts = [];
                if (totalHard > 0) parts.push(hardMet + '/' + totalHard + ' required');
                if (totalSoft > 0) parts.push(softMet + '/' + softNeeded + ' optional');
                prereqSummary.textContent = parts.join(' \u2022 ');
                prereqSummary.className = 'prereq-summary ' +
                    (hardMet === totalHard && softMet >= softNeeded ? 'complete' : 'incomplete');
            }
        }

        // Populate hard prereqs
        hardPrereqs.forEach(function(id) {
            hardPrereqsList.appendChild(createPrereqItem(id, true, isPrereqMet(id)));
        });

        // Update soft needed label (editable in edit mode)
        if (softNeededCount) {
            var isEditMode = typeof EditMode !== 'undefined' && EditMode.isActive;

            if (isEditMode && softPrereqs.length > 0) {
                // Create editable input
                softNeededCount.innerHTML = '';
                var needLabel = document.createTextNode('(need ');
                softNeededCount.appendChild(needLabel);

                var input = document.createElement('input');
                input.type = 'number';
                input.className = 'soft-needed-input';
                input.min = '0';
                input.max = String(softPrereqs.length);
                input.value = String(softNeeded);
                input.addEventListener('change', function() {
                    var newVal = parseInt(this.value) || 0;
                    if (typeof EditMode !== 'undefined') {
                        EditMode.updateSoftNeeded(node, newVal);
                    }
                });
                input.addEventListener('click', function(e) {
                    e.stopPropagation();  // Prevent panel close
                });
                softNeededCount.appendChild(input);

                var ofLabel = document.createTextNode(' of ' + softPrereqs.length + ')');
                softNeededCount.appendChild(ofLabel);
            } else {
                softNeededCount.textContent = '(need ' + softNeeded + ' of ' + softPrereqs.length + ')';
            }
        }

        // Populate soft prereqs
        softPrereqs.forEach(function(id) {
            softPrereqsList.appendChild(createPrereqItem(id, false, isPrereqMet(id)));
        });
    } else {
        // Fallback to legacy display
        hardPrereqsSection.classList.add('hidden');
        softPrereqsSection.classList.add('hidden');
        legacyPrereqList.classList.remove('hidden');

        if (prereqSummary) {
            prereqSummary.textContent = node.prerequisites.length > 0
                ? node.prerequisites.length + ' prerequisite(s)'
                : 'No prerequisites';
            prereqSummary.className = 'prereq-summary';
        }

        node.prerequisites.forEach(function(id) {
            legacyPrereqList.appendChild(createPrereqItem(id, true, isPrereqMet(id)));
        });
    }

    var unlocksList = document.getElementById('spell-unlocks');
    unlocksList.innerHTML = '';
    node.children.forEach(function(id) {
        var n = state.treeData ? _findNodeById(id) : null;
        var li = document.createElement('li');
        // Cheat mode shows all names
        var showChildName = settings.cheatMode || (n && n.state !== 'locked');
        li.textContent = showChildName ? (n ? (n.name || n.formId) : id) : '???';
        li.dataset.id = id;
        unlocksList.appendChild(li);
    });

    // === LOCKS (Pre Req Master) ===
    var locksSection = document.getElementById('locks-section');
    var locksList = document.getElementById('locks-list');
    if (locksSection && locksList) {
        locksList.innerHTML = '';
        var locks = (typeof PreReqMaster !== 'undefined' && PreReqMaster.getLocksForNode)
            ? PreReqMaster.getLocksForNode(node.id)
            : [];

        if (locks.length > 0) {
            locksSection.style.display = '';
            locks.forEach(function(lock) {
                var li = document.createElement('li');
                li.className = 'lock-prereq-item';
                var showName = lock.revealed && lock.name;
                li.innerHTML = '<span class="lock-icon">\u{1F517}</span> ' +
                    (showName ? lock.name : '???') +
                    ' <span class="lock-label">LOCK</span>';
                li.dataset.id = lock.nodeId;
                if (lock.revealed && lock.name) {
                    li.addEventListener('click', function() { selectNodeById(lock.nodeId); });
                }
                locksList.appendChild(li);
            });
        } else {
            locksSection.style.display = 'none';
        }
    }

    var stateBadge = document.getElementById('spell-state');
    var stateText = node.state.charAt(0).toUpperCase() + node.state.slice(1);
    var stateClass = node.state;

    // Show "Weakened" for early-learned spells
    if (isWeakened && node.state === 'unlocked') {
        stateText = 'Weakened (' + effectiveness + '%)';
        stateClass = 'weakened';
    }

    stateBadge.textContent = stateText;
    stateBadge.className = 'state-badge ' + stateClass;

    // Store selected node for button handlers
    state.selectedNode = node;

    // Update progression UI
    updateDetailsProgression(node);
}

// =============================================================================
// PROGRESSION DISPLAY
// =============================================================================

function updateDetailsProgression(node) {
    var progressSection = document.getElementById('progress-section');
    var learnBtn = document.getElementById('learn-btn');
    var unlockBtn = document.getElementById('unlock-btn');
    var progressBar = document.getElementById('progress-bar');
    var progressText = document.getElementById('progress-text');
    var progressEdit = document.getElementById('progress-edit');
    var xpCurrentInput = document.getElementById('xp-current-input');
    var xpRequiredInput = document.getElementById('xp-required-input');

    // Get progress data for this spell (use canonical ID for duplicates)
    var canonId = (typeof getCanonicalFormId === 'function') ? getCanonicalFormId(node) : node.formId;
    var progress = state.spellProgress[canonId] || { xp: 0, required: 100, unlocked: false, ready: false };
    var isLearningTarget = state.learningTargets[node.school] === canonId || state.learningTargets[node.school] === node.formId;

    // Debug: log learning target check to file via C++
    var debugMsg = '[SELECT] ' + (node.name || node.formId) +
                   ' | school:' + node.school +
                   ' | formId:' + node.formId +
                   ' | targets:' + JSON.stringify(state.learningTargets) +
                   ' | isTarget:' + isLearningTarget +
                   ' | state:' + node.state +
                   ' | isRoot:' + (node.isRoot || false);
    console.log(debugMsg);
    if (window.callCpp) {
        window.callCpp('LogMessage', JSON.stringify({ level: 'info', message: debugMsg }));
    }

    // Update learning status badge
    updateLearningStatusBadge(node, progress);

    // Calculate required XP - use override if exists, otherwise tier-based
    var tierXP = getXPForTier(node.level);
    var requiredXP = xpOverrides[node.formId] !== undefined ? xpOverrides[node.formId] : tierXP;
    progress.required = requiredXP;

    // Hide all buttons by default
    learnBtn.classList.add('hidden');
    unlockBtn.classList.add('hidden');
    progressSection.classList.add('hidden');
    progressText.classList.remove('hidden');
    if (progressEdit) progressEdit.classList.add('hidden');

    // CHEAT MODE: Allow unlocking/relocking any node + editable XP
    if (settings.cheatMode) {
        progressSection.classList.remove('hidden');
        unlockBtn.classList.remove('hidden');
        unlockBtn.disabled = false;

        // Show editable XP inputs instead of text
        progressText.classList.add('hidden');
        if (progressEdit) {
            progressEdit.classList.remove('hidden');
            if (xpCurrentInput) {
                xpCurrentInput.value = Math.floor(progress.xp || 0);
                // Remove old listeners to avoid duplicates
                xpCurrentInput.onchange = function() {
                    var newXP = Math.max(0, parseInt(this.value) || 0);
                    this.value = newXP;
                    progress.xp = newXP;
                    state.spellProgress[canonId] = progress;
                    // Update progress bar
                    var percent = requiredXP > 0 ? (newXP / requiredXP) * 100 : 0;
                    progressBar.style.width = Math.min(percent, 100) + '%';
                    progressBar.classList.toggle('ready', newXP >= requiredXP);
                    // Tell C++ about the XP change (send canonical ID)
                    if (window.callCpp) {
                        window.callCpp('SetSpellXP', JSON.stringify({ formId: canonId, xp: newXP }));
                    }
                };
            }
            if (xpRequiredInput) {
                xpRequiredInput.value = Math.floor(requiredXP);
                // Show if this is an override
                var hasOverride = xpOverrides[node.formId] !== undefined;
                xpRequiredInput.classList.toggle('has-override', hasOverride);
                xpRequiredInput.title = hasOverride ? 'Custom override (tier default: ' + tierXP + ')' : 'Tier default';

                xpRequiredInput.onchange = function() {
                    var newRequired = Math.max(1, parseInt(this.value) || tierXP);
                    this.value = newRequired;
                    // Store as override
                    xpOverrides[node.formId] = newRequired;
                    this.classList.add('has-override');
                    this.title = 'Custom override (tier default: ' + tierXP + ')';
                    progress.required = newRequired;
                    // Update progress bar
                    var percent = newRequired > 0 ? (progress.xp / newRequired) * 100 : 0;
                    progressBar.style.width = Math.min(percent, 100) + '%';
                    progressBar.classList.toggle('ready', progress.xp >= newRequired);
                    // Save overrides
                    autoSaveSettings();
                };
            }
        }

        // Update progress bar
        var cheatPercent = requiredXP > 0 ? (progress.xp / requiredXP) * 100 : 0;
        progressBar.style.width = Math.min(cheatPercent, 100) + '%';

        if (node.state === 'unlocked') {
            // Actually unlocked (node state is the source of truth) - show relock option
            unlockBtn.textContent = 'Relock Spell';
            unlockBtn.style.background = '#ef4444';  // Red for relock
            progressBar.classList.add('ready');
            learnBtn.classList.add('hidden');
        } else {
            // Not unlocked - show cheat unlock button (even if progress.unlocked is stale)
            unlockBtn.textContent = 'Unlock (Cheat)';
            unlockBtn.style.background = '';  // Default color
            progressBar.classList.toggle('ready', progress.xp >= requiredXP);

            // Also show learn button in cheat mode (for normal learning path)
            if (node.state === 'available' || node.state === 'learning') {
                learnBtn.classList.remove('hidden');
                var isLearningTarget = state.learningTargets && state.learningTargets[node.school] === node.formId;
                if (isLearningTarget) {
                    learnBtn.textContent = 'Learning...';
                    learnBtn.classList.add('active');
                } else {
                    learnBtn.textContent = 'Learn This';
                    learnBtn.classList.remove('active');
                }
            }
        }
        return;
    }

    // NORMAL MODE
    if (node.state === 'locked') {
        // Locked - can't do anything
        return;
    }

    if (node.state === 'unlocked') {
        // Actually unlocked - nothing to show
        return;
    }

    // Node is available - show progression options
    progressSection.classList.remove('hidden');

    // Update progress bar
    var percent = progress.required > 0 ? (progress.xp / progress.required) * 100 : 0;
    progressBar.style.width = Math.min(percent, 100) + '%';
    progressText.textContent = Math.floor(progress.xp) + ' / ' + Math.floor(progress.required) + ' XP';

    if (progress.ready || progress.xp >= progress.required) {
        // Ready to unlock - show unlock button
        progressBar.classList.add('ready');
        unlockBtn.classList.remove('hidden');
        unlockBtn.disabled = false;
        unlockBtn.textContent = 'Unlock Spell';
        unlockBtn.style.background = '';  // Default color
        learnBtn.classList.add('hidden');
    } else {
        // Not ready - show learn button
        progressBar.classList.remove('ready');
        learnBtn.classList.remove('hidden');

        if (isLearningTarget) {
            learnBtn.textContent = 'Learning...';
            learnBtn.classList.add('active');
        } else {
            learnBtn.textContent = 'Learn This';
            learnBtn.classList.remove('active');
        }
    }
}

// =============================================================================
// NODE SELECTION
// =============================================================================

function selectNodeById(id) {
    if (!state.treeData) return;
    var node = _findNodeById(id);
    if (node) {
        WheelRenderer.selectNode(node);
        WheelRenderer.rotateSchoolToTop(node.school);
    }
}
