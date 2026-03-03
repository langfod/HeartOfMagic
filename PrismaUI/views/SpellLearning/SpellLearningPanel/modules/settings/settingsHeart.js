/**
 * Heart Animation Settings
 * Heart animation popup initialization, globe settings, and renderer helpers.
 *
 * Depends on: state.js (settings), settingsPanel.js (autoSaveSettings),
 *             settings/settingsHeartUI.js (loaded before this file)
 */

// =============================================================================
// HEART ANIMATION SETTINGS
// =============================================================================

/** Initialize heart animation settings popup (guarded against double-init). */
function initializeHeartSettings() {
    // Guard against double init — multiple handlers would toggle-cancel each other
    if (window._heartSettingsInitialized) {
        console.log('[HeartSettings] Already initialized, skipping');
        return;
    }

    var settingsBtn = document.getElementById('heart-settings-btn');
    var popup = document.getElementById('heart-settings-popup');
    var closeBtn = document.getElementById('heart-settings-close');

    if (!settingsBtn || !popup) {
        console.log('[HeartSettings] Missing elements - btn:', !!settingsBtn, 'popup:', !!popup);
        return;
    }

    window._heartSettingsInitialized = true;
    console.log('[HeartSettings] Initializing...');

    // Toggle popup visibility
    settingsBtn.addEventListener('click', function(e) {
        e.stopPropagation();
        e.preventDefault();
        var isHidden = popup.style.display === 'none' || popup.style.display === '';
        popup.style.display = isHidden ? 'block' : 'none';
        console.log('[HeartSettings] Toggled popup:', isHidden ? 'open' : 'closed');
    });

    // Close button
    if (closeBtn) {
        closeBtn.addEventListener('click', function() {
            popup.style.display = 'none';
        });
    }

    // Close when clicking outside (but not on color picker)
    document.addEventListener('click', function(e) {
        if (popup.style.display !== 'none' && !popup.contains(e.target) && e.target !== settingsBtn) {
            // Don't close if clicking on color picker popup
            var colorPickerPopup = document.querySelector('.color-picker-popup');
            if (colorPickerPopup && colorPickerPopup.contains(e.target)) return;
            popup.style.display = 'none';
        }
    });

    // Animation enabled toggle
    var animToggle = document.getElementById('heart-animation-enabled');
    if (animToggle) {
        animToggle.checked = settings.heartAnimationEnabled !== false;
        animToggle.addEventListener('change', function() {
            settings.heartAnimationEnabled = this.checked;
            applyHeartSettingsToRenderer();
            autoSaveSettings();
        });
    }

    // Pulse speed slider
    var pulseSpeed = document.getElementById('heart-pulse-speed');
    var pulseSpeedVal = document.getElementById('heart-pulse-speed-val');
    if (pulseSpeed) {
        pulseSpeed.value = settings.heartPulseSpeed !== undefined ? settings.heartPulseSpeed : 1;
        if (pulseSpeedVal) pulseSpeedVal.textContent = parseFloat(pulseSpeed.value).toFixed(2);
        pulseSpeed.addEventListener('input', function() {
            settings.heartPulseSpeed = parseFloat(this.value);
            if (pulseSpeedVal) pulseSpeedVal.textContent = parseFloat(this.value).toFixed(2);
            applyHeartSettingsToRenderer();
            autoSaveSettings();
        });
    }

    // Pulse delay slider (time between pulse groups)
    var pulseDelay = document.getElementById('heart-pulse-delay');
    var pulseDelayVal = document.getElementById('heart-pulse-delay-val');
    if (pulseDelay) {
        var delayValue = settings.heartPulseDelay !== undefined ? settings.heartPulseDelay : 0.75;
        pulseDelay.value = delayValue;
        if (pulseDelayVal) pulseDelayVal.textContent = parseFloat(delayValue).toFixed(1) + 's';
        pulseDelay.addEventListener('input', function() {
            settings.heartPulseDelay = parseFloat(this.value);
            if (pulseDelayVal) pulseDelayVal.textContent = parseFloat(this.value).toFixed(1) + 's';
            applyHeartSettingsToRenderer();
            autoSaveSettings();
        });
    }

    // Helper to setup color swatch with ColorPicker
    function setupColorSwatch(swatchId, hiddenInputId, settingKey, defaultColor) {
        var swatch = document.getElementById(swatchId);
        var hiddenInput = document.getElementById(hiddenInputId);

        if (!swatch) {
            console.log('[HeartSettings] Missing swatch:', swatchId);
            return;
        }

        // Initialize from settings
        var color = settings[settingKey] || defaultColor;
        swatch.style.background = color;
        if (hiddenInput) hiddenInput.value = color;

        // Click handler - open color picker
        swatch.addEventListener('click', function(e) {
            e.stopPropagation();

            if (typeof ColorPicker !== 'undefined') {
                ColorPicker.show(swatch, color, function(newColor) {
                    color = newColor;
                    settings[settingKey] = newColor;
                    swatch.style.background = newColor;
                    if (hiddenInput) hiddenInput.value = newColor;
                    applyHeartSettingsToRenderer();
                    autoSaveSettings();
                    console.log('[HeartSettings]', settingKey, '=', newColor);
                });
            } else {
                console.warn('[HeartSettings] ColorPicker not available');
            }
        });
    }

    // Setup color swatches
    setupColorSwatch('heart-bg-color-swatch', 'heart-bg-color', 'heartBgColor', '#000000');
    setupColorSwatch('heart-ring-color-swatch', 'heart-ring-color', 'heartRingColor', '#b8a878');
    setupColorSwatch('learning-path-color-swatch', 'learning-path-color', 'learningPathColor', '#00ffff');
    setupColorSwatch('starfield-bg-color-swatch', 'starfield-bg-color', 'starfieldBgColor', '#000000');
    setupColorSwatch('starfield-color-swatch', 'starfield-color', 'starfieldColor', '#ffffff');

    // Starfield background color Apply button
    var starfieldBgApply = document.getElementById('starfield-bg-apply');
    if (starfieldBgApply) {
        starfieldBgApply.addEventListener('click', function() {
            var color = settings.starfieldBgColor || '#000000';
            var treeContainer = document.getElementById('tree-container');
            if (treeContainer) {
                treeContainer.style.background = color;
            }
            // Also update canvas renderer background
            if (typeof CanvasRenderer !== 'undefined') {
                CanvasRenderer._bgColor = color;
                CanvasRenderer._needsRender = true;
            }
            autoSaveSettings();
            console.log('[HeartSettings] Applied starfield background color:', color);
        });
    }
    setupColorSwatch('divider-custom-color-swatch', 'popup-divider-custom-color', 'dividerCustomColor', '#ffffff');
    setupColorSwatch('globe-color-swatch', 'popup-globe-color', 'globeColor', '#b8a878');
    setupColorSwatch('magic-text-color-swatch', 'popup-magic-text-color', 'magicTextColor', '#b8a878');

    // =========================================================================
    // STARFIELD SETTINGS
    // =========================================================================
    // Starfield enabled toggle
    var starfieldEnabled = document.getElementById('starfield-enabled');
    if (starfieldEnabled) {
        starfieldEnabled.checked = settings.starfieldEnabled !== false;
        starfieldEnabled.addEventListener('change', function() {
            settings.starfieldEnabled = this.checked;
            applyHeartSettingsToRenderer();
            autoSaveSettings();
        });
    }

    // Starfield fixed to screen toggle
    var starfieldFixed = document.getElementById('starfield-fixed');
    if (starfieldFixed) {
        starfieldFixed.checked = settings.starfieldFixed === true;
        starfieldFixed.addEventListener('change', function() {
            settings.starfieldFixed = this.checked;
            applyHeartSettingsToRenderer();
            autoSaveSettings();
        });
    }

    // Starfield density slider
    var starfieldDensity = document.getElementById('starfield-density');
    var starfieldDensityVal = document.getElementById('starfield-density-val');
    if (starfieldDensity) {
        var densityValue = settings.starfieldDensity || 200;
        starfieldDensity.value = densityValue;
        if (starfieldDensityVal) starfieldDensityVal.textContent = densityValue;
        starfieldDensity.addEventListener('input', function() {
            settings.starfieldDensity = parseInt(this.value);
            if (starfieldDensityVal) starfieldDensityVal.textContent = this.value;
            applyHeartSettingsToRenderer();
            autoSaveSettings();
        });
    }

    // Starfield size slider
    var starfieldSize = document.getElementById('starfield-size');
    var starfieldSizeVal = document.getElementById('starfield-size-val');
    if (starfieldSize) {
        var sizeValue = settings.starfieldMaxSize || 2.5;
        starfieldSize.value = sizeValue;
        if (starfieldSizeVal) starfieldSizeVal.textContent = sizeValue;
        starfieldSize.addEventListener('input', function() {
            settings.starfieldMaxSize = parseFloat(this.value);
            if (starfieldSizeVal) starfieldSizeVal.textContent = this.value;
            applyHeartSettingsToRenderer();
            autoSaveSettings();
        });
    }

    // Starfield seed
    var starfieldSeed = document.getElementById('starfield-seed');
    var starfieldSeedVal = document.getElementById('starfield-seed-val');
    if (starfieldSeed) {
        starfieldSeed.value = settings.starfieldSeed || 42;
        if (starfieldSeedVal) starfieldSeedVal.textContent = settings.starfieldSeed || 42;
        starfieldSeed.addEventListener('input', function() {
            settings.starfieldSeed = parseInt(this.value);
            if (starfieldSeedVal) starfieldSeedVal.textContent = this.value;
            if (typeof CanvasRenderer !== 'undefined') {
                CanvasRenderer._starfieldSeed = settings.starfieldSeed;
                CanvasRenderer._needsRender = true;
            }
            if (typeof Starfield !== 'undefined') {
                Starfield.seed = settings.starfieldSeed;
                Starfield.stars = null;  // Force reinit with new seed
            }
            autoSaveSettings();
        });
    }

    // === Connection Lines Settings ===
    // Selection path toggle
    var showSelectionPath = document.getElementById('show-selection-path');
    if (showSelectionPath) {
        showSelectionPath.checked = settings.showSelectionPath !== false;
        showSelectionPath.addEventListener('change', function() {
            settings.showSelectionPath = this.checked;
            if (state.treeData && typeof CanvasRenderer !== 'undefined') {
                CanvasRenderer._needsRender = true;
            }
            autoSaveSettings();
        });
    }

    // Base connections toggle
    var showBaseConnections = document.getElementById('show-base-connections');
    if (showBaseConnections) {
        showBaseConnections.checked = settings.showBaseConnections !== false;
        showBaseConnections.addEventListener('change', function() {
            settings.showBaseConnections = this.checked;
            if (state.treeData && typeof CanvasRenderer !== 'undefined') {
                CanvasRenderer._needsRender = true;
            }
            autoSaveSettings();
        });
    }

    // Edge style toggle (straight vs curved)
    var edgeStyleToggle = document.getElementById('edge-style-toggle');
    if (edgeStyleToggle) {
        edgeStyleToggle.checked = settings.edgeStyle === 'curved';
        edgeStyleToggle.addEventListener('change', function() {
            settings.edgeStyle = this.checked ? 'curved' : 'straight';
            if (state.treeData && typeof CanvasRenderer !== 'undefined') {
                CanvasRenderer._needsRender = true;
            }
            autoSaveSettings();
        });
    }

    // === Globe Settings ===
    // Core Size slider (controls heart ring visual size)
    var coreSize = document.getElementById('popup-core-size');
    var coreSizeVal = document.getElementById('popup-core-size-val');
    if (coreSize) {
        coreSize.value = settings.globeSize || 50;
        if (coreSizeVal) coreSizeVal.textContent = settings.globeSize || 50;
        coreSize.addEventListener('input', function() {
            settings.globeSize = parseInt(this.value);
            if (coreSizeVal) coreSizeVal.textContent = this.value;
            applyGlobeSettings();
            autoSaveSettings();
        });
    }

    // Globe Size slider (controls particle area radius independently)
    var globeParticleRadius = document.getElementById('popup-globe-particle-radius');
    var globeParticleRadiusVal = document.getElementById('popup-globe-particle-radius-val');
    if (globeParticleRadius) {
        globeParticleRadius.value = settings.globeParticleRadius || 50;
        if (globeParticleRadiusVal) globeParticleRadiusVal.textContent = settings.globeParticleRadius || 50;
        globeParticleRadius.addEventListener('input', function() {
            settings.globeParticleRadius = parseInt(this.value);
            if (globeParticleRadiusVal) globeParticleRadiusVal.textContent = this.value;
            applyGlobeSettings();
            autoSaveSettings();
        });
    }

    // Globe density (particle count) slider
    var globeDensity = document.getElementById('popup-globe-density');
    var globeDensityVal = document.getElementById('popup-globe-density-val');
    if (globeDensity) {
        globeDensity.value = settings.globeDensity || 50;
        if (globeDensityVal) globeDensityVal.textContent = settings.globeDensity || 50;
        globeDensity.addEventListener('input', function() {
            settings.globeDensity = parseInt(this.value);
            if (globeDensityVal) globeDensityVal.textContent = this.value;
            applyGlobeSettings();
            autoSaveSettings();
        });
    }

    // Globe dot size min slider
    var globeDotMin = document.getElementById('popup-globe-dot-min');
    var globeDotMinVal = document.getElementById('popup-globe-dot-min-val');
    if (globeDotMin) {
        globeDotMin.value = settings.globeDotMin || 0.5;
        if (globeDotMinVal) globeDotMinVal.textContent = settings.globeDotMin || 0.5;
        globeDotMin.addEventListener('input', function() {
            settings.globeDotMin = parseFloat(this.value);
            if (globeDotMinVal) globeDotMinVal.textContent = this.value;
            applyGlobeSettings();
            autoSaveSettings();
        });
    }

    // Globe dot size max slider
    var globeDotMax = document.getElementById('popup-globe-dot-max');
    var globeDotMaxVal = document.getElementById('popup-globe-dot-max-val');
    if (globeDotMax) {
        globeDotMax.value = settings.globeDotMax || 1;
        if (globeDotMaxVal) globeDotMaxVal.textContent = settings.globeDotMax || 1;
        globeDotMax.addEventListener('input', function() {
            settings.globeDotMax = parseFloat(this.value);
            if (globeDotMaxVal) globeDotMaxVal.textContent = this.value;
            applyGlobeSettings();
            autoSaveSettings();
        });
    }

    // Globe color change listener
    var globeColorInput = document.getElementById('popup-globe-color');
    if (globeColorInput) {
        globeColorInput.addEventListener('change', function() {
            settings.globeColor = this.value;
            applyHeartSettingsToRenderer();
            autoSaveSettings();
        });
    }

    // Magic text color change listener
    var magicTextColorInput = document.getElementById('popup-magic-text-color');
    if (magicTextColorInput) {
        magicTextColorInput.addEventListener('change', function() {
            settings.magicTextColor = this.value;
            applyHeartSettingsToRenderer();
            autoSaveSettings();
        });
    }

    // Globe text input
    var globeTextInput = document.getElementById('popup-globe-text');
    if (globeTextInput) {
        globeTextInput.value = settings.globeText || 'HEART';
        globeTextInput.addEventListener('input', function() {
            settings.globeText = this.value;
            applyHeartSettingsToRenderer();
            autoSaveSettings();
        });
    }

    // Globe text size slider
    var globeTextSize = document.getElementById('popup-globe-text-size');
    var globeTextSizeVal = document.getElementById('popup-globe-text-size-val');
    if (globeTextSize) {
        globeTextSize.value = settings.globeTextSize || 16;
        if (globeTextSizeVal) globeTextSizeVal.textContent = settings.globeTextSize || 16;
        globeTextSize.addEventListener('input', function() {
            settings.globeTextSize = parseInt(this.value);
            if (globeTextSizeVal) globeTextSizeVal.textContent = this.value;
            applyHeartSettingsToRenderer();
            autoSaveSettings();
        });
    }

    // Particle trail toggle
    var particleTrailToggle = document.getElementById('popup-particle-trail');
    if (particleTrailToggle) {
        particleTrailToggle.checked = settings.particleTrailEnabled !== false;
        particleTrailToggle.addEventListener('change', function() {
            settings.particleTrailEnabled = this.checked;
            applyGlobeSettings();
            autoSaveSettings();
        });
    }

    // Globe background fill toggle
    var globeBgFillToggle = document.getElementById('popup-globe-bg-fill');
    if (globeBgFillToggle) {
        globeBgFillToggle.checked = settings.globeBgFill !== false;
        globeBgFillToggle.addEventListener('change', function() {
            settings.globeBgFill = this.checked;
            if (typeof CanvasRenderer !== 'undefined') {
                CanvasRenderer._globeBgFill = this.checked;
                CanvasRenderer._needsRender = true;
            }
            autoSaveSettings();
        });
    }

    // Particle core toggle (replaces center text with vibrating particles)
    var particleCoreToggle = document.getElementById('popup-particle-core');
    if (particleCoreToggle) {
        particleCoreToggle.checked = settings.particleCoreEnabled === true;
        particleCoreToggle.addEventListener('change', function() {
            settings.particleCoreEnabled = this.checked;
            if (typeof CanvasRenderer !== 'undefined') {
                CanvasRenderer._particleCoreEnabled = this.checked;
                CanvasRenderer._needsRender = true;
            }
            autoSaveSettings();
        });
    }

    // Show node names toggle
    var showNodeNamesPopup = document.getElementById('popup-show-node-names');
    if (showNodeNamesPopup) {
        showNodeNamesPopup.checked = settings.showNodeNames !== false;
        showNodeNamesPopup.addEventListener('change', function() {
            settings.showNodeNames = this.checked;
            if (typeof CanvasRenderer !== 'undefined') {
                CanvasRenderer._needsRender = true;
            }
            autoSaveSettings();
        });
    }

    // Node font size slider
    var nodeFontSize = document.getElementById('popup-node-font-size');
    var nodeFontSizeVal = document.getElementById('popup-node-font-size-val');
    if (nodeFontSize) {
        nodeFontSize.value = settings.nodeFontSize || 10;
        if (nodeFontSizeVal) nodeFontSizeVal.textContent = settings.nodeFontSize || 10;
        nodeFontSize.addEventListener('input', function() {
            settings.nodeFontSize = parseInt(this.value);
            if (nodeFontSizeVal) nodeFontSizeVal.textContent = this.value;
            if (typeof CanvasRenderer !== 'undefined') {
                CanvasRenderer._needsRender = true;
            }
            autoSaveSettings();
        });
    }

    // === Tree Color Pickers (per-school colors in popup) ===
    var treeColorSchools = [
        { key: 'Destruction', swatchId: 'tree-color-destruction-swatch', inputId: 'tree-color-destruction' },
        { key: 'Restoration', swatchId: 'tree-color-restoration-swatch', inputId: 'tree-color-restoration' },
        { key: 'Alteration', swatchId: 'tree-color-alteration-swatch', inputId: 'tree-color-alteration' },
        { key: 'Conjuration', swatchId: 'tree-color-conjuration-swatch', inputId: 'tree-color-conjuration' },
        { key: 'Illusion', swatchId: 'tree-color-illusion-swatch', inputId: 'tree-color-illusion' }
    ];

    treeColorSchools.forEach(function(school) {
        var swatch = document.getElementById(school.swatchId);
        var hiddenInput = document.getElementById(school.inputId);
        if (!swatch) return;

        var color = (settings.schoolColors && settings.schoolColors[school.key]) || hiddenInput.value;
        swatch.style.background = color;
        if (hiddenInput) hiddenInput.value = color;

        swatch.addEventListener('click', function(e) {
            e.stopPropagation();
            if (typeof ColorPicker !== 'undefined') {
                ColorPicker.show(swatch, color, function(newColor) {
                    color = newColor;
                    if (!settings.schoolColors) settings.schoolColors = {};
                    settings.schoolColors[school.key] = newColor;
                    swatch.style.background = newColor;
                    if (hiddenInput) hiddenInput.value = newColor;
                    // Apply to CSS and re-render
                    if (typeof applySchoolColorsToCSS === 'function') applySchoolColorsToCSS();
                    if (typeof updateSchoolColorPickerUI === 'function') updateSchoolColorPickerUI();
                    if (typeof CanvasRenderer !== 'undefined') CanvasRenderer._needsRender = true;
                    autoSaveSettings();
                    console.log('[HeartSettings] Tree color ' + school.key + ' = ' + newColor);
                });
            }
        });
    });
    // === PRM Enable/Disable Toggle (inside Pre Req Master tab) ===
    // Disables the content area below the tab bar, not the tab bar itself
    var prmEnabled = document.getElementById('prmEnabled');
    var prmSplit = document.querySelector('#prmContent .prm-split');
    if (prmEnabled && prmSplit) {
        if (!prmEnabled.checked) {
            prmSplit.classList.add('disabled');
        }
        // Stop toggle clicks from triggering the parent tab's click
        prmEnabled.closest('.prm-enable-toggle').addEventListener('click', function(e) {
            e.stopPropagation();
        });
        prmEnabled.addEventListener('change', function() {
            if (this.checked) {
                prmSplit.classList.remove('disabled');
            } else {
                prmSplit.classList.add('disabled');
            }
        });
    }
    // Apply initial settings to renderer
    applyHeartSettingsToRenderer();
    applyGlobeSettings();
    // Apply globe bg fill
    if (typeof CanvasRenderer !== 'undefined') {
        CanvasRenderer._globeBgFill = settings.globeBgFill !== false;
    }
    console.log('[HeartSettings] Initialized successfully');

}

// =============================================================================
// RENDERER HELPERS
// =============================================================================

/** Apply globe settings to the Globe3D module */
function applyGlobeSettings() {
    if (typeof Globe3D !== 'undefined') {
        var globeRadius = settings.globeParticleRadius || settings.globeSize || 50;
        var sizeChanged = Globe3D.radius !== globeRadius;
        var countChanged = Globe3D.particleCount !== (settings.globeDensity || 50);
        var dotMinChanged = Globe3D.dotSizeMin !== (settings.globeDotMin || 0.5);
        var dotMaxChanged = Globe3D.dotSizeMax !== (settings.globeDotMax || 1);

        Globe3D.radius = globeRadius;
        Globe3D.globeCenterZ = -globeRadius;
        Globe3D.particleCount = settings.globeDensity || 50;

        // Store size range for particle initialization
        Globe3D.dotSizeMin = settings.globeDotMin || 0.5;
        Globe3D.dotSizeMax = settings.globeDotMax || 1;

        // Particle trail enabled
        Globe3D.trailEnabled = settings.particleTrailEnabled !== false;
        // Reinitialize if particle count, size, or dot sizes changed
        if (countChanged || sizeChanged || dotMinChanged || dotMaxChanged) {
            Globe3D.init();
        }

        if (typeof CanvasRenderer !== 'undefined') {
            CanvasRenderer._needsRender = true;
    }
}

/** Apply heart settings to the canvas renderer */
function applyHeartSettingsToRenderer() {
    if (typeof CanvasRenderer !== 'undefined') {
        // Heart settings
        CanvasRenderer._heartbeatSpeed = settings.heartPulseSpeed !== undefined ? settings.heartPulseSpeed : 1;
        CanvasRenderer._heartPulseDelay = settings.heartPulseDelay !== undefined ? settings.heartPulseDelay : 0.75;
        CanvasRenderer._heartAnimationEnabled = settings.heartAnimationEnabled !== false;
        CanvasRenderer._heartBgOpacity = 1.0;
        CanvasRenderer._heartBgColor = settings.heartBgColor || '#000000';
        CanvasRenderer._heartRingColor = settings.heartRingColor || '#b8a878';
        CanvasRenderer._learningPathColor = settings.learningPathColor || '#00ffff';

        // Globe colors and text
        CanvasRenderer._globeColor = settings.globeColor || settings.heartRingColor || '#b8a878';
        CanvasRenderer._magicTextColor = settings.magicTextColor || settings.heartRingColor || '#ffecb3';
        CanvasRenderer._globeText = settings.globeText || 'HEART';
        CanvasRenderer._globeTextSize = settings.globeTextSize || 16;
        CanvasRenderer._particleCoreEnabled = settings.particleCoreEnabled === true;

        // Starfield settings
        CanvasRenderer._starfieldEnabled = settings.starfieldEnabled !== false;
        CanvasRenderer._starfieldFixed = settings.starfieldFixed === true;
        CanvasRenderer._starfieldColor = settings.starfieldColor || '#ffffff';
        CanvasRenderer._starfieldDensity = settings.starfieldDensity || 200;
        CanvasRenderer._starfieldMaxSize = settings.starfieldMaxSize || 2.5;
        CanvasRenderer._bgColor = settings.starfieldBgColor || '#000000';

        CanvasRenderer._needsRender = true;
    }
    // Apply background color to tree container
    if (settings.starfieldBgColor) {
        var treeContainer = document.getElementById('tree-container');
        if (treeContainer) {
            treeContainer.style.background = settings.starfieldBgColor;
        }
    }
}
