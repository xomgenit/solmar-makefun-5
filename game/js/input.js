// SOLMAR — Streets of the Sun. Keyboard + mouse input with edge detection.
export function createInput(canvas) {
  const input = {
    keys: new Set(),       // currently held codes
    pressed: new Set(),    // codes pressed since last frame (edge)
    mouse: { x: 0, y: 0, down: false, clicked: false, rightDown: false },
    onKeyDown: null,
    attach() {
      window.addEventListener('keydown', (e) => {
        if (e.code === 'Space') e.preventDefault();
        if (!input.keys.has(e.code)) input.pressed.add(e.code);
        input.keys.add(e.code);
        if (input.onKeyDown) input.onKeyDown(e.code);
      });
      window.addEventListener('keyup', (e) => input.keys.delete(e.code));
      window.addEventListener('blur', () => input.keys.clear());
      canvas.addEventListener('mousemove', (e) => {
        const r = canvas.getBoundingClientRect();
        input.mouse.x = e.clientX - r.left;
        input.mouse.y = e.clientY - r.top;
      });
      canvas.addEventListener('mousedown', (e) => {
        if (e.button === 0) { input.mouse.down = true; input.mouse.clicked = true; }
        if (e.button === 2) input.mouse.rightDown = true;
      });
      window.addEventListener('mouseup', (e) => {
        if (e.button === 0) input.mouse.down = false;
        if (e.button === 2) input.mouse.rightDown = false;
      });
      canvas.addEventListener('contextmenu', (e) => e.preventDefault());
    },
    down(code) { return input.keys.has(code); },
    wasPressed(code) { return input.pressed.has(code); },
    postUpdate() {
      input.pressed.clear();
      input.mouse.clicked = false;
    },
  };
  return input;
}
