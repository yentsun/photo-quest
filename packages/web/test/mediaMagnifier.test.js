import test from 'node:test';
import {
  clampMagnifier, createMediaMagnifier, isVideoControlPress,
} from '../src/utils/mediaMagnifier.js';

const viewport = { left: 20, top: 30, width: 800, height: 600 };
const media = { left: 20, top: 130, width: 800, height: 400 };

function event(overrides = {}) {
  const currentTarget = {
    captured: [],
    released: [],
    setPointerCapture(id) { this.captured.push(id); },
    releasePointerCapture(id) { this.released.push(id); },
  };
  return {
    pointerId: 1, button: 0, clientX: 420, clientY: 330,
    prevented: false,
    preventDefault() { this.prevented = true; },
    currentTarget,
    ...overrides,
  };
}

function setup(t, overrides = {}) {
  const changes = [];
  const gesture = createMediaMagnifier({
    measure: () => ({ media, viewport }),
    onChange: (zoom) => changes.push(zoom),
    ...overrides,
  });
  t.after(() => gesture.interrupt());
  return { gesture, changes };
}

test('bounds clamp both edges of the enlarged fitted picture, not its letterbox', (t) => {
  t.assert.deepEqual(clampMagnifier(media, viewport, 10000, 10000), { x: 0, y: -100, scale: 3 });
  t.assert.deepEqual(clampMagnifier(media, viewport, -10000, -10000), { x: -1600, y: -700, scale: 3 });
});

test('narrow or tiny media stay centered on axes that cannot fill the viewport', (t) => {
  const portrait = { left: 370, top: 30, width: 100, height: 600 };
  t.assert.deepEqual(clampMagnifier(portrait, viewport, 9000, -9000), { x: -100, y: -1200, scale: 3 });
  const tiny = { left: 370, top: 280, width: 100, height: 100 };
  t.assert.deepEqual(clampMagnifier(tiny, viewport, 9000, -9000), { x: -100, y: -100, scale: 3 });
});

test('toggle magnifies around the media centre; a second toggle clears it', (t) => {
  const state = setup(t);
  t.assert.equal(state.gesture.toggle(), true);
  t.assert.deepEqual(state.changes, [{ x: -800, y: -400, scale: 3 }]);
  t.assert.equal(state.gesture.toggle(), false);
  t.assert.deepEqual(state.changes, [{ x: -800, y: -400, scale: 3 }, null]);
});

test('toggle is a no-op when the media has no measurable box', (t) => {
  const missing = setup(t, { measure: () => null });
  t.assert.equal(missing.gesture.toggle(), false);
  t.assert.deepEqual(missing.changes, []);
  const empty = setup(t, {
    measure: () => ({ media: { left: 0, top: 0, width: 0, height: 0 }, viewport }),
  });
  t.assert.equal(empty.gesture.toggle(), false);
  t.assert.deepEqual(empty.changes, []);
});

test('dragging does nothing until the magnifier is on', (t) => {
  const state = setup(t);
  const start = event();
  state.gesture.panStart(start);
  t.assert.deepEqual(start.currentTarget.captured, []);
  state.gesture.panMove(event({ clientX: 10000, clientY: 10000 }));
  t.assert.deepEqual(state.changes, []);
});

test('a magnified drag pans, clamps at the edges and reverses immediately', (t) => {
  const state = setup(t);
  state.gesture.toggle();
  const start = event();
  state.gesture.panStart(start);
  t.assert.deepEqual(start.currentTarget.captured, [1]);

  const move = event({ clientX: 10000, clientY: 10000 });
  state.gesture.panMove(move);
  t.assert.equal(move.prevented, true);
  t.assert.deepEqual(state.changes.at(-1), { x: 0, y: -100, scale: 3 });

  state.gesture.panMove(event({ clientX: 9990, clientY: 9990 }));
  t.assert.deepEqual(state.changes.at(-1), { x: -10, y: -110, scale: 3 });

  const end = event();
  state.gesture.panEnd(end);
  t.assert.deepEqual(end.currentTarget.released, [1]);
});

test('deactivating ends the pan; a later drag cannot move it', (t) => {
  const state = setup(t);
  state.gesture.toggle();
  state.gesture.panStart(event());
  state.gesture.deactivate();
  t.assert.deepEqual(state.changes.at(-1), null);
  state.gesture.panMove(event({ clientX: 10000, clientY: 10000 }));
  t.assert.equal(state.changes.at(-1), null);
});

test('unrelated pointers cannot pan the active magnifier', (t) => {
  const state = setup(t);
  state.gesture.toggle();
  state.gesture.panStart(event());
  state.gesture.panMove(event({ pointerId: 2, clientX: 0, clientY: 0 }));
  state.gesture.panEnd(event({ pointerId: 2 }));
  t.assert.equal(state.changes.length, 1);
});

test('interrupt shares the deactivate path', (t) => {
  const state = setup(t);
  state.gesture.toggle();
  state.gesture.interrupt();
  state.gesture.interrupt();
  t.assert.deepEqual(state.changes, [{ x: -800, y: -400, scale: 3 }, null]);
});

test('native controls strip is excluded without swallowing short videos entirely', (t) => {
  t.assert.equal(isVideoControlPress({ bottom: 500, height: 400 }, 480), true);
  t.assert.equal(isVideoControlPress({ bottom: 500, height: 400 }, 300), false);
  t.assert.equal(isVideoControlPress({ bottom: 80, height: 30 }, 55), false);
  t.assert.equal(isVideoControlPress({ bottom: 80, height: 30 }, 75), true);
});
