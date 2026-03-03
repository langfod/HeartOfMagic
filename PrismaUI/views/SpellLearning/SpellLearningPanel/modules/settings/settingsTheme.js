/**
 * UI Theme System
 * Auto-discovery and application of themes from themes/ folder.
 * Themes are JSON manifests pointing to CSS files (e.g., styles.css, styles-skyrim.css).
 *
 * Depends on: state.js (settings, UI_THEMES, themesLoaded)
 */

// =============================================================================
// UI THEME SYSTEM - Auto-discovery from themes/ folder
// =============================================================================

/**
 * Load all available themes from the themes/ folder
 * Reads manifest.json to get theme list, then loads each theme definition
 */
function loadThemesFromFolder() {
    return new Promise(function(resolve, reject) {
        console.log('[SpellLearning] Loading themes from themes/ folder...');

        // Fetch the manifest
        fetch('themes/manifest.json')
            .then(function(response) {
                if (!response.ok) {
                    throw new Error('Failed to load themes manifest: ' + response.status);
                }
                return response.json();
            })
            .then(function(manifest) {
                if (!manifest.themes || !Array.isArray(manifest.themes)) {
                    throw new Error('Invalid manifest: missing themes array');
                }

                console.log('[SpellLearning] Found', manifest.themes.length, 'themes in manifest');

                // Load each theme definition
                var themePromises = manifest.themes.map(function(themeId) {
                    return fetch('themes/' + themeId + '.json')
                        .then(function(response) {
                            if (!response.ok) {
                                console.warn('[SpellLearning] Failed to load theme:', themeId);
                                return null;
                            }
                            return response.json();
                        })
                        .then(function(themeData) {
                            if (themeData && themeData.id) {
                                return themeData;
                            }
                            return null;
                        })
                        .catch(function(err) {
                            console.warn('[SpellLearning] Error loading theme', themeId + ':', err);
                            return null;
                        });
                });

                return Promise.all(themePromises);
            })
            .then(function(themes) {
                // Filter out failed loads and populate UI_THEMES
                UI_THEMES = {};
                themes.forEach(function(theme) {
                    if (theme && theme.id) {
                        UI_THEMES[theme.id] = {
                            name: theme.name || theme.id,
                            file: theme.cssFile || ('themes/' + theme.id + '.css'),
                            description: theme.description || '',
                            author: theme.author || '',
                            version: theme.version || '1.0'
                        };
                    }
                });

                themesLoaded = true;
                console.log('[SpellLearning] Loaded', Object.keys(UI_THEMES).length, 'themes:', Object.keys(UI_THEMES).join(', '));
                resolve(UI_THEMES);
            })
            .catch(function(err) {
                console.error('[SpellLearning] Failed to load themes:', err);
                // Fall back to built-in themes
                UI_THEMES = {
                    'default': {
                        name: 'Default (Modern Dark)',
                        file: 'styles.css',
                        description: 'Modern dark UI with gradients and glow effects'
                    },
                    'skyrim': {
                        name: 'Skyrim Edge',
                        file: 'styles-skyrim.css',
                        description: 'Native Skyrim-style flat UI with muted tones'
                    }
                };
                themesLoaded = true;
                console.log('[SpellLearning] Using fallback themes');
                resolve(UI_THEMES);
            });
    });
}

/**
 * Initialize the theme selector dropdown
 * Call after loadThemesFromFolder() completes
 */
function initializeThemeSelector() {
    var themeSelect = document.getElementById('uiThemeSelect');
    var themeDesc = document.getElementById('themeDescription');

    if (!themeSelect) {
        console.warn('[SpellLearning] Theme selector not found');
        return;
    }

    // If themes not loaded yet, load them first
    if (!themesLoaded || Object.keys(UI_THEMES).length === 0) {
        loadThemesFromFolder().then(function() {
            populateThemeSelector(themeSelect, themeDesc);
        });
    } else {
        populateThemeSelector(themeSelect, themeDesc);
    }
}

/**
 * Populate the theme selector dropdown with loaded themes
 */
function populateThemeSelector(themeSelect, themeDesc) {
    // Populate dropdown from UI_THEMES
    themeSelect.innerHTML = '';

    var themeKeys = Object.keys(UI_THEMES);
    if (themeKeys.length === 0) {
        var option = document.createElement('option');
        option.value = '';
        option.textContent = 'No themes found';
        option.disabled = true;
        themeSelect.appendChild(option);
        return;
    }

    themeKeys.forEach(function(themeKey) {
        var theme = UI_THEMES[themeKey];
        var option = document.createElement('option');
        option.value = themeKey;
        option.textContent = theme.name + (theme.author ? ' by ' + theme.author : '');
        themeSelect.appendChild(option);
    });

    // Set current value
    var currentTheme = settings.uiTheme || 'skyrim';
    if (!UI_THEMES[currentTheme]) {
        currentTheme = themeKeys[0];
        settings.uiTheme = currentTheme;
    }
    themeSelect.value = currentTheme;

    // Update description
    if (themeDesc && UI_THEMES[currentTheme]) {
        themeDesc.textContent = UI_THEMES[currentTheme].description;
    }

    // Handle theme change
    themeSelect.addEventListener('change', function() {
        var newTheme = this.value;
        if (!UI_THEMES[newTheme]) {
            console.error('[SpellLearning] Unknown theme:', newTheme);
            return;
        }

        settings.uiTheme = newTheme;

        // Update description
        if (themeDesc) {
            themeDesc.textContent = UI_THEMES[newTheme].description;
        }

        // Hot-swap the stylesheet
        applyTheme(newTheme);

        console.log('[SpellLearning] Theme changed to:', newTheme);
        scheduleAutoSave();
    });

    console.log('[SpellLearning] Theme selector initialized with', themeKeys.length, 'themes');

    // Setup refresh button
    var refreshBtn = document.getElementById('refreshThemesBtn');
    if (refreshBtn) {
        refreshBtn.addEventListener('click', function() {
            refreshBtn.disabled = true;
            refreshBtn.textContent = '\u23F3';

            refreshThemes().then(function() {
                refreshBtn.disabled = false;
                refreshBtn.textContent = '[R]';
                console.log('[SpellLearning] Themes refreshed');
            }).catch(function() {
                refreshBtn.disabled = false;
                refreshBtn.textContent = '[R]';
            });
        });
    }
}

/**
 * Refresh the theme list by re-scanning the themes folder
 */
function refreshThemes() {
    themesLoaded = false;
    return loadThemesFromFolder().then(function() {
        var themeSelect = document.getElementById('uiThemeSelect');
        var themeDesc = document.getElementById('themeDescription');
        if (themeSelect) {
            populateThemeSelector(themeSelect, themeDesc);
        }
        return UI_THEMES;
    });
}

/**
 * Apply a UI theme by swapping the stylesheet
 * @param {string} themeKey - Key from UI_THEMES
 */
function applyTheme(themeKey) {
    var theme = UI_THEMES[themeKey];
    if (!theme) {
        console.error('[SpellLearning] Unknown theme:', themeKey);
        return;
    }

    // Find the current stylesheet link
    var styleLink = document.querySelector('link[rel="stylesheet"][href*="styles"]');
    if (!styleLink) {
        console.error('[SpellLearning] Could not find stylesheet link');
        return;
    }

    // Get current href to check if already applied
    var currentHref = styleLink.getAttribute('href');
    var newHref = theme.file;

    // Normalize paths for comparison
    if (currentHref === newHref || currentHref.endsWith(newHref.replace('../', ''))) {
        console.log('[SpellLearning] Theme already applied:', themeKey);
        return;
    }

    console.log('[SpellLearning] Switching theme from', currentHref, 'to', newHref);

    // Create a new link element for the new stylesheet
    var newLink = document.createElement('link');
    newLink.rel = 'stylesheet';
    newLink.href = newHref;

    // When the new stylesheet loads, remove the old one
    newLink.onload = function() {
        styleLink.remove();
        console.log('[SpellLearning] Theme applied:', themeKey);

        // Re-apply dynamic styles that might be overwritten
        if (settings.learningColor) {
            applyLearningColor(settings.learningColor);
        }
        if (settings.fontSizeMultiplier) {
            applyFontSizeMultiplier(settings.fontSizeMultiplier);
        }
    };

    newLink.onerror = function() {
        console.error('[SpellLearning] Failed to load theme stylesheet:', newHref);
    };

    // Insert the new link after the old one
    styleLink.parentNode.insertBefore(newLink, styleLink.nextSibling);
}

/**
 * Get the current theme key
 */
function getCurrentTheme() {
    return settings.uiTheme || 'skyrim';
}
