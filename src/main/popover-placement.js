"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.calculatePopoverLayout = calculatePopoverLayout;
function calculatePopoverLayout(options) {
    const gap = options.gap ?? 8;
    const margin = options.margin ?? 8;
    const width = Math.min(options.popoverWidth, Math.max(0, options.appWidth - margin * 2));
    const availableAbove = Math.max(0, options.petRect.top - gap - margin);
    const needsConstraint = Boolean(options.constrainAbove && options.popoverHeight > availableAbove);
    const height = needsConstraint ? availableAbove : options.popoverHeight;
    const left = clamp(options.petRect.left + options.petRect.width / 2 - width / 2, margin, options.appWidth - width - margin);
    const top = Math.max(margin, options.petRect.top - height - gap);
    return {
        left: Math.round(left),
        top: Math.round(top),
        width: Math.round(width),
        height: Math.round(height),
        maxHeight: needsConstraint ? Math.round(height) : null,
    };
}
function clamp(value, min, max) {
    if (max < min)
        return min;
    return Math.min(max, Math.max(min, value));
}
