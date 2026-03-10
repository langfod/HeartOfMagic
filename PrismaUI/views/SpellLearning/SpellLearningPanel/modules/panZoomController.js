/**
 * Pan/Zoom Controller — Reusable mouse-driven pan/zoom handler (DUP-R8, DUP-U1)
 *
 * Factory that creates independent controller instances for any canvas/SVG element.
 * Consolidates the near-identical pan/zoom mouse handling from 7+ locations:
 *   - wheel/wheelInteraction.js
 *   - canvas/canvasInteraction.js
 *   - webglRenderer.js
 *   - treeGrowth.js
 *   - treePreview.js
 *   - trustedRenderer.js
 *   - prereqMasterUI.js
 *
 * Depends on: nothing (pure interaction logic)
 */

var PanZoomController = {

    /**
     * Create a new pan/zoom controller instance.
     *
     * @param {Object} options
     * @param {Function} options.getPan        - Returns { x, y } current pan
     * @param {Function} options.setPan        - (x, y) sets pan
     * @param {Function} options.getZoom       - Returns current zoom level
     * @param {Function} options.setZoom       - (z) sets zoom level
     * @param {Function} options.onRedraw      - Called after pan/zoom change
     * @param {Function} [options.onPanStart]  - Called when panning begins
     * @param {Function} [options.onPanEnd]    - Called when panning ends
     * @param {Function} [options.onClick]     - Called on click (mouse moved < clickThreshold)
     * @param {Function} [options.shouldStartPan] - (event) predicate, return false to skip pan
     * @param {number}   [options.zoomFactor]  - Multiplicative zoom step (default 1.1)
     * @param {number}   [options.minZoom]     - Minimum zoom (default 0.1)
     * @param {number}   [options.maxZoom]     - Maximum zoom (default 5)
     * @param {boolean}  [options.zoomTowardMouse] - Zoom toward cursor (default true)
     * @param {boolean}  [options.centerOrigin]  - Pan origin is canvas center (default false: top-left)
     * @param {boolean}  [options.rafThrottle] - RAF-throttle pan moves (default true)
     * @param {boolean}  [options.preventContextMenu] - Prevent context menu (default true)
     * @param {number}   [options.clickThreshold] - Max pixels for click detection (default 5)
     * @param {Array}    [options.dragButtons] - Mouse buttons for drag (default [0, 2])
     * @returns {Object} Controller instance with attach/detach methods
     */
    create: function (options) {
        var getPan = options.getPan;
        var setPan = options.setPan;
        var getZoom = options.getZoom;
        var setZoom = options.setZoom;
        var onRedraw = options.onRedraw;
        var onPanStart = options.onPanStart || null;
        var onPanEnd = options.onPanEnd || null;
        var onClick = options.onClick || null;
        var shouldStartPan = options.shouldStartPan || null;
        var zoomFactor = options.zoomFactor !== undefined ? options.zoomFactor : 1.1;
        var minZoom = options.minZoom !== undefined ? options.minZoom : 0.1;
        var maxZoom = options.maxZoom !== undefined ? options.maxZoom : 5;
        var zoomTowardMouse = options.zoomTowardMouse !== undefined ? options.zoomTowardMouse : true;
        var centerOrigin = options.centerOrigin !== undefined ? options.centerOrigin : false;
        var rafThrottle = options.rafThrottle !== undefined ? options.rafThrottle : true;
        var preventContextMenu = options.preventContextMenu !== undefined ? options.preventContextMenu : true;
        var clickThreshold = options.clickThreshold !== undefined ? options.clickThreshold : 5;
        var dragButtons = options.dragButtons || [0, 2];

        // Internal state
        var _isPanning = false;
        var _panStartX = 0;
        var _panStartY = 0;
        var _mouseDownX = 0;
        var _mouseDownY = 0;
        var _pendingPanX = 0;
        var _pendingPanY = 0;
        var _rafPending = false;
        var _element = null;
        var _bound = {};

        // Handler functions
        var _onMouseDown = function (e) {
            if (dragButtons.indexOf(e.button) === -1) return;
            if (shouldStartPan && !shouldStartPan(e)) return;

            _isPanning = true;
            var pan = getPan();
            _panStartX = e.clientX - pan.x;
            _panStartY = e.clientY - pan.y;
            _mouseDownX = e.clientX;
            _mouseDownY = e.clientY;

            if (_element) _element.style.cursor = 'grabbing';
            if (onPanStart) onPanStart(e);
        };

        var _applyPan = function () {
            _rafPending = false;
            setPan(_pendingPanX, _pendingPanY);
            onRedraw();
        };

        var _onMouseMove = function (e) {
            if (!_isPanning) return;

            var newX = e.clientX - _panStartX;
            var newY = e.clientY - _panStartY;

            if (rafThrottle) {
                _pendingPanX = newX;
                _pendingPanY = newY;
                if (!_rafPending) {
                    _rafPending = true;
                    requestAnimationFrame(_applyPan);
                }
            } else {
                setPan(newX, newY);
                onRedraw();
            }
        };

        var _onMouseUp = function (e) {
            if (!_isPanning) return;
            _isPanning = false;
            _rafPending = false;

            if (_element) _element.style.cursor = 'grab';

            // Click detection
            if (onClick) {
                var dx = e.clientX - _mouseDownX;
                var dy = e.clientY - _mouseDownY;
                if (Math.sqrt(dx * dx + dy * dy) < clickThreshold) {
                    onClick(e);
                }
            }

            if (onPanEnd) onPanEnd(e);
        };

        var _onWheel = function (e) {
            e.preventDefault();

            var oldZoom = getZoom();
            var factor = e.deltaY < 0 ? zoomFactor : (1 / zoomFactor);
            var newZoom = Math.max(minZoom, Math.min(maxZoom, oldZoom * factor));
            if (newZoom === oldZoom) return;

            if (zoomTowardMouse && _element) {
                var rect = _element.getBoundingClientRect();
                var mouseX = e.clientX - rect.left;
                var mouseY = e.clientY - rect.top;
                if (centerOrigin) {
                    mouseX -= rect.width / 2;
                    mouseY -= rect.height / 2;
                }
                var pan = getPan();
                var ratio = newZoom / oldZoom;
                setPan(
                    mouseX - (mouseX - pan.x) * ratio,
                    mouseY - (mouseY - pan.y) * ratio
                );
            }

            setZoom(newZoom);
            onRedraw();
        };

        var _onContextMenu = function (e) {
            e.preventDefault();
        };

        // Public API
        return {
            /**
             * Attach event listeners to a DOM element.
             * @param {HTMLElement} element
             */
            attach: function (element) {
                _element = element;

                _bound.mousedown = _onMouseDown;
                _bound.mousemove = _onMouseMove;
                _bound.mouseup = _onMouseUp;
                _bound.wheel = _onWheel;

                element.addEventListener('mousedown', _bound.mousedown);
                element.addEventListener('mousemove', _bound.mousemove);
                // mouseup on document to catch release outside element
                document.addEventListener('mouseup', _bound.mouseup);
                element.addEventListener('wheel', _bound.wheel, { passive: false });

                if (preventContextMenu) {
                    _bound.contextmenu = _onContextMenu;
                    element.addEventListener('contextmenu', _bound.contextmenu);
                }

                element.style.cursor = 'grab';
            },

            /**
             * Detach event listeners.
             */
            detach: function () {
                if (!_element) return;
                _element.removeEventListener('mousedown', _bound.mousedown);
                _element.removeEventListener('mousemove', _bound.mousemove);
                document.removeEventListener('mouseup', _bound.mouseup);
                _element.removeEventListener('wheel', _bound.wheel);
                if (_bound.contextmenu) {
                    _element.removeEventListener('contextmenu', _bound.contextmenu);
                }
                _element = null;
                _bound = {};
            },

            /**
             * Query whether the controller is currently panning.
             * @returns {boolean}
             */
            isDragging: function () {
                return _isPanning;
            }
        };
    }
};

window.PanZoomController = PanZoomController;
