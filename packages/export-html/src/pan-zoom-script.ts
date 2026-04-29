// Hand-rolled pan/zoom script bundled inline by `exportHtml()`.
//
// Spec: specs/handoffs/m2c.md § 5 + Resolution 7. ~100 LOC ceiling, no
// frameworks, no third-party deps. Wires:
//   - pointerdown / pointermove / pointerup with pointer capture (mouse + touch
//     drag)
//   - wheel zoom anchored at the cursor
//   - keyboard shortcuts: arrow keys (pan), `+`/`-` (zoom), `0` (reset)
//
// The script is a string literal — baked into the output once per export, no
// runtime randomness, no timestamps. Determinism is preserved.

export const PAN_ZOOM_SCRIPT = `(() => {
    const root = document.getElementById('nowline-viewport');
    if (!root) return;
    const target = root.querySelector('svg');
    if (!target) return;
    let scale = 1;
    let tx = 0;
    let ty = 0;
    let dragging = false;
    let lastX = 0;
    let lastY = 0;
    const apply = () => {
        target.style.transformOrigin = '0 0';
        target.style.transform = 'translate(' + tx + 'px,' + ty + 'px) scale(' + scale + ')';
    };
    apply();
    root.tabIndex = 0;
    root.addEventListener('pointerdown', (event) => {
        if (event.button !== 0) return;
        dragging = true;
        lastX = event.clientX;
        lastY = event.clientY;
        root.setPointerCapture(event.pointerId);
        root.style.cursor = 'grabbing';
    });
    root.addEventListener('pointermove', (event) => {
        if (!dragging) return;
        tx += event.clientX - lastX;
        ty += event.clientY - lastY;
        lastX = event.clientX;
        lastY = event.clientY;
        apply();
    });
    const stop = (event) => {
        if (!dragging) return;
        dragging = false;
        root.releasePointerCapture(event.pointerId);
        root.style.cursor = 'grab';
    };
    root.addEventListener('pointerup', stop);
    root.addEventListener('pointercancel', stop);
    root.addEventListener('wheel', (event) => {
        event.preventDefault();
        const factor = Math.exp(-event.deltaY * 0.0015);
        const next = Math.min(Math.max(scale * factor, 0.1), 10);
        const rect = root.getBoundingClientRect();
        const ax = event.clientX - rect.left;
        const ay = event.clientY - rect.top;
        tx = ax - (ax - tx) * (next / scale);
        ty = ay - (ay - ty) * (next / scale);
        scale = next;
        apply();
    }, { passive: false });
    const reset = () => { scale = 1; tx = 0; ty = 0; apply(); };
    root.addEventListener('keydown', (event) => {
        const step = event.shiftKey ? 80 : 20;
        switch (event.key) {
            case 'ArrowLeft':  tx += step; break;
            case 'ArrowRight': tx -= step; break;
            case 'ArrowUp':    ty += step; break;
            case 'ArrowDown':  ty -= step; break;
            case '+':
            case '=':          scale = Math.min(scale * 1.2, 10); break;
            case '-':
            case '_':          scale = Math.max(scale / 1.2, 0.1); break;
            case '0':          reset(); break;
            default: return;
        }
        event.preventDefault();
        apply();
    });
    root.style.cursor = 'grab';
})();`;
