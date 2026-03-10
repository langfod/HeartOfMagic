/**
 * LLM Tree Keywords - Keyword classification and tree builder integration for LLM features.
 *
 * Loaded after: llmTreeFeatures.js
 *
 * Depends on:
 * - modules/llmTreeFeatures.js (sendLLMFeatureRequest, llmClassificationCache, etc.)
 * - modules/state.js (state)
 */

// =============================================================================
// KEYWORD CLASSIFICATION
// =============================================================================

/**
 * Classify spells with weak/missing keywords using LLM.
 * Processes schools separately, batches of 100 spells.
 * Results stored in spell data as llm_keyword/llm_keyword_parent.
 * @param {Array} spells - Array of spell objects (modified in-place)
 * @param {Function} callback - Called with {classified: N, total: N} or null
 */
function classifySpellKeywordsWithLLM(spells, callback) {
    if (!settings.treeGeneration.llm.enabled || !settings.treeGeneration.llm.keywordClassification) {
        console.log('[LLMTreeFeatures] Keyword classification disabled');
        callback(null);
        return;
    }

    if (!state.llmConfig || !state.llmConfig.apiKey) {
        console.warn('[LLMTreeFeatures] No API key for keyword classification');
        callback(null);
        return;
    }

    // Group by school
    var schoolSpells = {};
    spells.forEach(function(s) {
        var school = s.school || 'Unknown';
        if (!schoolSpells[school]) schoolSpells[school] = [];
        schoolSpells[school].push(s);
    });

    // Build basic themes per school from spell keywords/effects (lightweight, no TF-IDF needed)
    var schoolThemes = {};
    Object.keys(schoolSpells).forEach(function(school) {
        var keywordCounts = {};
        schoolSpells[school].forEach(function(s) {
            (s.keywords || []).forEach(function(kw) {
                var k = kw.toLowerCase().replace(/^magic/, '');
                if (k.length > 2) {
                    keywordCounts[k] = (keywordCounts[k] || 0) + 1;
                }
            });
            (s.effectNames || []).forEach(function(eff) {
                eff.toLowerCase().split(/\s+/).forEach(function(w) {
                    if (w.length > 3) {
                        keywordCounts[w] = (keywordCounts[w] || 0) + 1;
                    }
                });
            });
        });
        // Top 12 keywords
        var sorted = Object.keys(keywordCounts).sort(function(a, b) {
            return keywordCounts[b] - keywordCounts[a];
        });
        schoolThemes[school] = sorted.slice(0, 12);
    });

    // Filter to spells needing classification (no existing keywords, or very weak match)
    var toClassify = {};
    var totalToClassify = 0;

    Object.keys(schoolSpells).forEach(function(school) {
        var themes = schoolThemes[school] || [];
        var needsWork = schoolSpells[school].filter(function(spell) {
            if (spell.llm_keyword) return false;
            var kws = spell.keywords || [];
            if (kws.length > 0) return false; // Has game keywords, skip
            return true;
        });
        if (needsWork.length > 0) {
            toClassify[school] = needsWork;
            totalToClassify += needsWork.length;
        }
    });

    if (totalToClassify === 0) {
        console.log('[LLMTreeFeatures] All spells already have keywords');
        callback({classified: 0, total: spells.length});
        return;
    }

    console.log('[LLMTreeFeatures] Classifying ' + totalToClassify +
                ' spells across ' + Object.keys(toClassify).length + ' schools');

    var schools = Object.keys(toClassify);
    var schoolIndex = 0;
    var classified = 0;

    function processNextSchool() {
        if (schoolIndex >= schools.length) {
            callback({classified: classified, total: spells.length});
            return;
        }
        var school = schools[schoolIndex];
        var schoolBatch = toClassify[school];
        var themes = schoolThemes[school] || [];
        processSchoolBatches(school, schoolBatch, themes, 0, function() {
            schoolIndex++;
            processNextSchool();
        });
    }

    function processSchoolBatches(school, schoolSpellList, themes, offset, done) {
        if (offset >= schoolSpellList.length) {
            done();
            return;
        }

        var batch = schoolSpellList.slice(offset, offset + 100);
        var prompt = buildKeywordClassificationPrompt(school, batch, themes);

        if (typeof updateStatus === 'function') {
            updateStatus('Classifying: ' + school + ' (' +
                         Math.min(offset + 100, schoolSpellList.length) + '/' +
                         schoolSpellList.length + ')');
        }

        sendLLMFeatureRequest('keywordClassification', prompt, function(result) {
            if (result && result.success) {
                try {
                    var classifications = typeof result.response === 'string'
                        ? JSON.parse(result.response)
                        : result.response;

                    Object.keys(classifications).forEach(function(formId) {
                        var cls = classifications[formId];
                        if (!cls || !cls.keyword) return;

                        // Find spell in the original array
                        for (var si = 0; si < spells.length; si++) {
                            if (spells[si].formId === formId) {
                                spells[si].llm_keyword = cls.keyword.toLowerCase();
                                spells[si].llm_keyword_parent = cls.parent ? cls.parent.toLowerCase() : null;
                                spells[si].llm_keyword_confidence = cls.confidence || 50;
                                classified++;
                                break;
                            }
                        }
                    });
                } catch (e) {
                    console.error('[LLMTreeFeatures] Parse error in keyword classification:', e);
                }
            } else {
                console.warn('[LLMTreeFeatures] Keyword batch failed for ' + school);
            }

            processSchoolBatches(school, schoolSpellList, themes, offset + 100, done);
        });
    }

    processNextSchool();
}

/**
 * Build LLM prompt for keyword classification
 */
function buildKeywordClassificationPrompt(school, spells, existingKeywords) {
    var spellEntries = spells.map(function(s) {
        return {
            id: s.formId,
            name: s.name || 'Unknown',
            effects: (s.effectNames || []).slice(0, 3),
            description: (s.description || '').substring(0, 80),
            keywords: s.keywords || []
        };
    });

    return 'Classify each ' + school + ' spell into a keyword group.\n\n' +
        'EXISTING KEYWORDS for ' + school + ':\n' +
        JSON.stringify(existingKeywords, null, 2) + '\n\n' +
        'SPELLS TO CLASSIFY:\n' +
        JSON.stringify(spellEntries, null, 2) + '\n\n' +
        'For each spell, assign to ONE existing keyword OR create a new one.\n\n' +
        'Rules:\n' +
        '- Prefer existing keywords when the spell clearly fits\n' +
        '- New keywords need a "parent" from the existing list\n' +
        '- Use lowercase single-word keywords\n' +
        '- Confidence: 0-100\n\n' +
        'Return ONLY JSON:\n' +
        '{"0xFORMID": {"keyword": "fire", "parent": null, "confidence": 95}}\n\n' +
        '- parent is null for existing keywords\n' +
        '- parent is the existing keyword name for new keywords\n' +
        'JSON only:';
}

/**
 * Button handler for Classify Keywords on spell scanner page
 */
function startKeywordClassification() {
    if (!state.lastSpellData || !state.lastSpellData.spells) {
        if (typeof updateStatus === 'function') updateStatus('Scan spells first');
        return;
    }

    var btn = document.getElementById('classifyKeywordsBtn');
    if (btn) {
        btn.disabled = true;
        btn.textContent = '... Classifying';
    }

    classifySpellKeywordsWithLLM(state.lastSpellData.spells, function(result) {
        if (btn) {
            btn.disabled = false;
            btn.innerHTML = '<span class="btn-icon">[K]</span> Classify Keywords';
        }
        if (result) {
            if (typeof updateStatus === 'function') {
                updateStatus('Classified ' + result.classified + '/' + result.total + ' spells');
            }
            // Update the output textarea with enriched data
            var outputArea = document.getElementById('outputArea');
            if (outputArea && state.lastSpellData) {
                outputArea.value = JSON.stringify(state.lastSpellData, null, 2);
            }
        } else {
            if (typeof updateStatus === 'function') {
                updateStatus('Classification failed - check LLM API key');
            }
        }
    });
}

// =============================================================================
// INTEGRATION WITH TREE BUILDER
// =============================================================================

/**
 * Pre-process spells before tree building
 * Runs enabled LLM features and caches results
 * @param {Array} spells - All spells to process
 * @param {Function} callback - Called when preprocessing is complete
 */
function preprocessSpellsWithLLM(spells, callback) {
    var llmSettings = settings.treeGeneration.llm;

    if (!llmSettings.enabled) {
        console.log('[LLMTreeFeatures] LLM disabled, skipping preprocessing');
        callback();
        return;
    }

    console.log('[LLMTreeFeatures] Preprocessing ' + spells.length + ' spells with LLM...');

    var tasks = [];

    // Queue element detection
    if (llmSettings.elementDetection) {
        tasks.push(function(next) {
            classifySpellElementsWithLLM(spells, function(result) {
                console.log('[LLMTreeFeatures] Element detection complete');
                next();
            });
        });
    }

    // Queue keyword expansion (run before element detection uses keywords)
    if (llmSettings.keywordExpansion) {
        tasks.unshift(function(next) {
            expandElementKeywordsWithLLM(spells, function(result) {
                console.log('[LLMTreeFeatures] Keyword expansion complete');
                next();
            });
        });
    }

    // Queue keyword classification (runs before theme discovery)
    if (llmSettings.keywordClassification) {
        tasks.push(function(next) {
            classifySpellKeywordsWithLLM(spells, function(result) {
                console.log('[LLMTreeFeatures] Keyword classification complete');
                next();
            });
        });
    }

    // Queue theme discovery
    if (llmSettings.themeDiscovery) {
        tasks.push(function(next) {
            discoverSpellThemesWithLLM(spells, function(result) {
                console.log('[LLMTreeFeatures] Theme discovery complete');
                next();
            });
        });
    }

    // Run tasks sequentially
    function runNext(index) {
        if (index >= tasks.length) {
            console.log('[LLMTreeFeatures] All preprocessing complete');
            callback();
            return;
        }
        tasks[index](function() {
            runNext(index + 1);
        });
    }

    if (tasks.length > 0) {
        runNext(0);
    } else {
        callback();
    }
}

// =============================================================================
// EXPORTS (keyword classification & tree builder integration)
// =============================================================================

window.classifySpellKeywordsWithLLM = classifySpellKeywordsWithLLM;
window.startKeywordClassification = startKeywordClassification;
window.preprocessSpellsWithLLM = preprocessSpellsWithLLM;
