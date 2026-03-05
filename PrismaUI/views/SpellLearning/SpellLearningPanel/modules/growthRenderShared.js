/**
 * Growth Render Shared — Constants and primitives shared by all growth-mode renderers (DUP-G5, DUP-G6)
 *
 * Depends on: nothing (pure Canvas2D drawing utilities)
 */

var GrowthRenderShared = {

    SIZE_TABLE: {
        'Novice':     0.8,
        'Apprentice': 1.0,
        'Adept':      1.2,
        'Expert':     1.4,
        'Master':     1.8
    },

    BRIGHTNESS_TABLE: {
        'Novice':     0.3,
        'Apprentice': 0.5,
        'Adept':      0.8,
        'Expert':     1.2,
        'Master':     1.8
    },

    getSizeMultiplier: function(level) {
        return this.SIZE_TABLE[level] || 0.8;
    },

    getBrightnessMultiplier: function(level) {
        return this.BRIGHTNESS_TABLE[level] || 0.3;
    },

    /**
     * Draw a diamond shape path (does NOT call beginPath/fill/stroke).
     */
    drawDiamond: function(ctx, x, y, size) {
        ctx.moveTo(x, y - size);
        ctx.lineTo(x + size, y);
        ctx.lineTo(x, y + size);
        ctx.lineTo(x - size, y);
        ctx.closePath();
    },

    /**
     * Draw a star shape path.
     */
    drawStar: function(ctx, x, y, outerR, innerR, points) {
        points = points || 5;
        var step = Math.PI / points;
        var angle = -Math.PI / 2;
        var i;

        ctx.moveTo(
            x + Math.cos(angle) * outerR,
            y + Math.sin(angle) * outerR
        );

        for (i = 0; i < points * 2; i++) {
            angle += step;
            var r = (i % 2 === 0) ? innerR : outerR;
            ctx.lineTo(
                x + Math.cos(angle) * r,
                y + Math.sin(angle) * r
            );
        }

        ctx.closePath();
    },

    /**
     * Add the appropriate shape path for a node based on skill level.
     * Dispatches between circle (default), diamond (Expert), and star (Master).
     */
    addShapePath: function(ctx, x, y, radius, level) {
        if (level === 'Master') {
            this.drawStar(ctx, x, y, radius, radius * 0.5, 5);
        } else if (level === 'Expert') {
            this.drawDiamond(ctx, x, y, radius);
        } else {
            ctx.arc(x, y, radius, 0, Math.PI * 2);
        }
    }
};

window.GrowthRenderShared = GrowthRenderShared;
