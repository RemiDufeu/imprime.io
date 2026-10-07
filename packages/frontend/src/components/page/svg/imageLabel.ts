// The font size of what an image box says about itself in the editor — the
// variable it is bound to — in page units: a share of the box's shorter side,
// within bounds, so it stays legible on a small box and modest on a large one.
export function imageLabelFontSize(width: number, height: number): number {
    return Math.max(12, Math.min(24, Math.min(width, height) * 0.08))
}
