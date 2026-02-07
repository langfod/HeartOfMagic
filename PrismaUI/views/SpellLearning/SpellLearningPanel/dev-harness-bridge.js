/**
 * Dev Harness - Mock C++ Bridge
 * Replaces window.callCpp with a mock that logs calls and returns test data.
 * Must be loaded BEFORE all module scripts.
 */

window._BROWSER_TEST = true;
window._DEV_HARNESS = true;
window._cppLog = [];
window._mockSpellData = null;

// ============================================================================
// LOGGING
// ============================================================================

function logCppCall(direction, method, data) {
    var entry = {
        time: new Date().toLocaleTimeString(),
        direction: direction, // 'out' = JS->C++, 'in' = C++->JS
        method: method,
        data: typeof data === 'string' ? data.substring(0, 200) : ''
    };
    window._cppLog.push(entry);

    // Update status bar
    var statusEl = document.getElementById('harness-status');
    if (statusEl) {
        var last = statusEl.querySelector('.log-entry');
        if (!last) {
            last = document.createElement('span');
            last.className = 'log-entry';
            statusEl.appendChild(last);
        }
        var arrow = direction === 'out' ? '>' : '<';
        last.innerHTML = '<span class="method">' + arrow + ' ' + method + '</span> <span class="data">' + entry.data + '</span>';
    }

    // Update log panel
    var logBody = document.getElementById('cpp-log-body');
    if (logBody) {
        var item = document.createElement('div');
        item.className = 'log-item';
        item.innerHTML = '<span class="dir ' + direction + '">' + (direction === 'out' ? '>' : '<') + '</span>'
            + '<span class="method">' + method + '</span>'
            + '<span class="payload">' + entry.data + '</span>';
        logBody.appendChild(item);
        logBody.scrollTop = logBody.scrollHeight;
    }

    console.log('[Bridge ' + (direction === 'out' ? 'JS>C++' : 'C++>JS') + '] ' + method,
        data ? (typeof data === 'string' ? data.substring(0, 100) : data) : '');
}

// ============================================================================
// MOCK callCpp
// ============================================================================

window.callCpp = function(method, data) {
    logCppCall('out', method, data);

    switch (method) {
        case 'LogMessage':
            try { var d = JSON.parse(data); console.log('[SKSE]', d.message || data); } catch(e) {}
            break;

        case 'ScanSpells':
            // Simulate async scan - load from test-data files
            setTimeout(function() { mockScanSpells(data); }, 300);
            break;

        case 'LoadSpellTree':
            // No saved tree in dev mode
            console.log('[Bridge] LoadSpellTree - no saved tree');
            break;

        case 'SaveSpellTree':
            console.log('[Bridge] SaveSpellTree - stored in memory');
            window._lastSavedTree = data;
            if (typeof updateTreeStatus === 'function') {
                setTimeout(function() {
                    logCppCall('in', 'updateTreeStatus', 'Tree saved (dev mode)');
                }, 50);
            }
            break;

        case 'SaveOutput':
            console.log('[Bridge] SaveOutput - logged');
            if (typeof updateStatus === 'function') {
                setTimeout(function() { updateStatus('Output saved (dev mode)'); }, 50);
            }
            break;

        case 'HidePanel':
            console.log('[Bridge] HidePanel - panel stays visible in dev harness');
            break;

        case 'LoadUnifiedConfig':
            setTimeout(function() { mockLoadConfig(); }, 100);
            break;

        case 'SaveUnifiedConfig':
            console.log('[Bridge] Config saved (dev mode)');
            break;

        case 'GetProgress':
            setTimeout(function() { mockGetProgress(); }, 50);
            break;

        case 'GetPlayerKnownSpells':
            setTimeout(function() { mockGetKnownSpells(); }, 50);
            break;

        case 'SetLearningTarget':
            console.log('[Bridge] SetLearningTarget:', data);
            try {
                var target = JSON.parse(data);
                if (typeof window.onLearningTargetSet === 'function') {
                    setTimeout(function() {
                        logCppCall('in', 'onLearningTargetSet', JSON.stringify({ school: target.school, formId: target.formId, success: true }));
                        window.onLearningTargetSet(JSON.stringify({ school: target.school, formId: target.formId, spellName: 'Mock Spell', success: true }));
                    }, 100);
                }
            } catch(e) {}
            break;

        case 'CopyToClipboard':
            navigator.clipboard.writeText(data).then(function() {
                console.log('[Bridge] Copied to clipboard');
            }).catch(function() {
                console.log('[Bridge] Clipboard copy failed');
            });
            break;

        case 'GetClipboard':
            navigator.clipboard.readText().then(function(text) {
                if (typeof window.onClipboardContent === 'function') {
                    window.onClipboardContent(text);
                }
            }).catch(function() {
                console.log('[Bridge] Clipboard read failed');
            });
            break;

        case 'LoadPrompt':
            if (typeof window.updatePrompt === 'function') {
                setTimeout(function() {
                    window.updatePrompt(typeof DEFAULT_TREE_RULES !== 'undefined' ? DEFAULT_TREE_RULES : '');
                }, 50);
            }
            break;

        case 'CheckLLM':
            if (typeof window.onLLMStatus === 'function') {
                setTimeout(function() {
                    window.onLLMStatus(JSON.stringify({ available: false, version: 'dev-harness' }));
                }, 50);
            }
            break;

        case 'SetHotkey':
        case 'SetPauseGameOnFocus':
            console.log('[Bridge] Setting stored (dev mode)');
            break;

        case 'SetupPython':
            if (typeof window.onPythonAddonStatus === 'function') {
                setTimeout(function() {
                    window.onPythonAddonStatus(JSON.stringify({ installed: true, hasScript: true, hasPython: true, pythonSource: 'mock' }));
                }, 200);
            }
            break;

        default:
            console.log('[Bridge] Unhandled method:', method);
    }
};

// ============================================================================
// MOCK DATA RESPONSES
// ============================================================================

function mockScanSpells(configStr) {
    if (window._mockSpellData) {
        logCppCall('in', 'updateSpellData', window._mockSpellData.length + ' spells');
        if (typeof window.updateSpellData === 'function') {
            window.updateSpellData(JSON.stringify(window._mockSpellData));
        }
        updateHarnessStatus();
        return;
    }

    // Load from test-data files
    var schools = ['Alteration', 'Conjuration', 'Destruction', 'Illusion', 'Restoration'];
    var allSpells = [];
    var loaded = 0;

    schools.forEach(function(school) {
        fetch('test-data/' + school + '_spells.json')
            .then(function(r) { return r.json(); })
            .then(function(data) {
                var spells = data.spells || (Array.isArray(data) ? data : []);
                spells.forEach(function(s) {
                    s.school = s.school || school;
                    allSpells.push(s);
                });
                loaded++;
                if (loaded === schools.length) {
                    window._mockSpellData = allSpells;
                    logCppCall('in', 'updateSpellData', allSpells.length + ' spells');
                    if (typeof window.updateSpellData === 'function') {
                        window.updateSpellData(JSON.stringify(allSpells));
                    }
                    updateHarnessStatus();
                }
            })
            .catch(function(err) {
                console.error('[Bridge] Failed to load ' + school + ':', err);
                loaded++;
                if (loaded === schools.length && allSpells.length > 0) {
                    window._mockSpellData = allSpells;
                    if (typeof window.updateSpellData === 'function') {
                        window.updateSpellData(JSON.stringify(allSpells));
                    }
                    updateHarnessStatus();
                }
            });
    });
}

function mockLoadConfig() {
    var config = {
        hotkey: 'F8',
        hotkeyCode: 66,
        pauseGameOnFocus: true,
        cheatMode: false,
        verboseLogging: false,
        heartAnimationEnabled: true,
        heartPulseSpeed: 0.06,
        heartBgOpacity: 1.0,
        heartBgColor: '#0a0a14',
        heartRingColor: '#b8a878',
        learningPathColor: '#00ffff',
        activeProfile: 'normal',
        learningMode: 'perSchool',
        xpGlobalMultiplier: 1,
        xpMultiplierDirect: 100,
        xpMultiplierSchool: 50,
        xpMultiplierAny: 10,
        xpCapAny: 5,
        xpCapSchool: 15,
        xpCapDirect: 50,
        xpNovice: 100,
        xpApprentice: 200,
        xpAdept: 400,
        xpExpert: 800,
        xpMaster: 1500,
        revealName: 10,
        revealEffects: 25,
        revealDescription: 50,
        discoveryMode: false,
        nodeSizeScaling: true,
        earlySpellLearning: {
            enabled: true,
            unlockThreshold: 25.0,
            selfCastRequiredAt: 75.0,
            selfCastXPMultiplier: 150.0,
            binaryEffectThreshold: 80.0,
            modifyGameDisplay: true,
            powerSteps: [
                { xp: 25, power: 20, label: 'Budding' },
                { xp: 40, power: 35, label: 'Developing' },
                { xp: 55, power: 50, label: 'Practicing' },
                { xp: 70, power: 65, label: 'Advancing' },
                { xp: 85, power: 80, label: 'Refining' }
            ]
        },
        spellTomeLearning: {
            enabled: true,
            useProgressionSystem: true,
            grantXPOnRead: true,
            autoSetLearningTarget: true,
            showNotifications: true,
            xpPercentToGrant: 25.0,
            tomeInventoryBoost: true,
            tomeInventoryBoostPercent: 25.0,
            requirePrereqs: true,
            requireAllPrereqs: true,
            requireSkillLevel: false
        },
        notifications: { weakenedSpellNotifications: true, weakenedSpellInterval: 10.0 },
        llm: { apiKey: '', model: 'anthropic/claude-sonnet-4', maxTokens: 64000 },
        schoolColors: {},
        customProfiles: {}
    };

    logCppCall('in', 'onUnifiedConfigLoaded', 'config loaded');
    if (typeof window.onUnifiedConfigLoaded === 'function') {
        window.onUnifiedConfigLoaded(JSON.stringify(config));
    }
}

function mockGetProgress() {
    logCppCall('in', 'onProgressData', '{}');
    if (typeof window.onProgressData === 'function') {
        window.onProgressData(JSON.stringify({}));
    }
}

function mockGetKnownSpells() {
    logCppCall('in', 'onPlayerKnownSpells', '{"knownSpells":[],"weakenedSpells":[],"count":0}');
    if (typeof window.onPlayerKnownSpells === 'function') {
        window.onPlayerKnownSpells(JSON.stringify({ knownSpells: [], weakenedSpells: [], count: 0 }));
    }
}

// ============================================================================
// HARNESS HELPERS
// ============================================================================

function updateHarnessStatus() {
    var spellCount = document.getElementById('status-spell-count');
    var schoolCount = document.getElementById('status-school-count');
    if (window._mockSpellData && spellCount) {
        spellCount.textContent = window._mockSpellData.length;
        var schools = {};
        window._mockSpellData.forEach(function(s) { if (s.school) schools[s.school] = true; });
        if (schoolCount) schoolCount.textContent = Object.keys(schools).length;
    }
}

// Fire onPanelShowing after init
window.addEventListener('load', function() {
    setTimeout(function() {
        if (typeof window.onPanelShowing === 'function') {
            logCppCall('in', 'onPanelShowing', '');
            window.onPanelShowing();
        }
        // Also trigger python addon status
        if (typeof window.onPythonAddonStatus === 'function') {
            window.onPythonAddonStatus(JSON.stringify({ installed: true, hasScript: true, hasPython: true, pythonSource: 'mock' }));
        }
    }, 500);
});

console.log('[DevHarness] Mock C++ bridge loaded');
