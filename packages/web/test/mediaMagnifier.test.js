import test from 'node:test';
import {
  clampMagnifier, createMediaMagnifier, isVideoControlPress, MAGNIFIER_DELAY,
} from '../src/utils/mediaMagnifier.js';

const viewport = { left: 20, top: 30, width: 800, height: 600 };
const media = { left: 20, top: 130, width: 800, height: 400 };

function pointer(overrides = {}) {
  return {
    pointerId: 1, pointerType: 'touch', isPrimary: true, button: 0,
    clientX: 420, clientY: 330, detail: 1,
    prevented: false, stopped: false,
    preventDefault() { this.prevented = true; },
    stopPropagation() { this.stopped = true; },
    ...overrides,
  };
}

function setup(t, overrides = {}) {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const changes = [];
  const captures = [];
  const releases = [];
  let consumed = 0;
  const gesture = createMediaMagnifier({
    measure: () => ({ media, viewport }),
    capture: (id) => { captures.push(id); return true; },
    release: (id) => releases.push(id),
    onChange: (zoom) => changes.push(zoom),
    onConsume: () => consumed++,
    ...overrides,
  });
  t.after(() => gesture.cancel());
  return { gesture, changes, captures, releases, get consumed() { return consumed; } };
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

test('long press anchors zoom to the pressed point, captures and consumes the gesture', (t) => {
  const state = setup(t);
  state.gesture.start(pointer({ clientX: 220, clientY: 280 }));
  t.mock.timers.tick(MAGNIFIER_DELAY - 1);
  t.assert.equal(state.changes.length, 0);
  t.mock.timers.tick(1);
  t.assert.deepEqual(state.changes, [{ x: -400, y: -300, scale: 3 }]);
  t.assert.deepEqual(state.captures, [1]);
  t.assert.equal(state.consumed, 1);
});

test('short tap leaves navigation and the native playback click alone', (t) => {
  const state = setup(t);
  const event = pointer();
  state.gesture.start(event);
  t.mock.timers.tick(100);
  state.gesture.end(event);
  t.mock.timers.tick(MAGNIFIER_DELAY);
  state.gesture.click(event);
  t.assert.equal(event.prevented, false);
  t.assert.equal(state.consumed, 0);
  t.assert.equal(state.changes.length, 0);
});

test('movement before the hold threshold cancels zoom without consuming a swipe', (t) => {
  const state = setup(t);
  state.gesture.start(pointer());
  state.gesture.move(pointer({ clientX: 480 }));
  t.mock.timers.tick(MAGNIFIER_DELAY);
  t.assert.equal(state.consumed, 0);
  t.assert.equal(state.changes.length, 0);
});

test('panning clamps at edges and immediately responds when direction reverses', (t) => {
  const state = setup(t);
  state.gesture.start(pointer());
  t.mock.timers.tick(MAGNIFIER_DELAY);
  const move = pointer({ clientX: 10000, clientY: 10000 });
  state.gesture.move(move);
  t.assert.equal(move.prevented, true);
  t.assert.deepEqual(state.changes.at(-1), { x: 0, y: -100, scale: 3 });
  state.gesture.move(pointer({ clientX: 9990, clientY: 9990 }));
  t.assert.deepEqual(state.changes.at(-1), { x: -10, y: -110, scale: 3 });
});

test('release dismisses zoom and suppresses the compatibility click, not the next tap', (t) => {
  const state = setup(t);
  state.gesture.start(pointer());
  t.mock.timers.tick(MAGNIFIER_DELAY);
  const up = pointer();
  state.gesture.end(up);
  t.assert.equal(up.prevented, true);
  t.assert.equal(state.changes.at(-1), null);
  t.assert.deepEqual(state.releases, [1]);
  const click = pointer();
  state.gesture.click(click);
  t.assert.equal(click.prevented, true);
  t.assert.equal(click.stopped, true);
  const keyboardClick = pointer({ detail: 0 });
  state.gesture.click(keyboardClick);
  t.assert.equal(keyboardClick.prevented, false);
  const nextTap = pointer();
  state.gesture.start(nextTap);
  state.gesture.end(nextTap);
  state.gesture.click(nextTap);
  t.assert.equal(nextTap.prevented, false);
});

test('secondary pointers interrupt pending and active holds, without starting another', (t) => {
  const state = setup(t);
  state.gesture.start(pointer());
  state.gesture.start(pointer({ pointerId: 2, isPrimary: false }));
  t.mock.timers.tick(MAGNIFIER_DELAY);
  t.assert.equal(state.changes.length, 0);
  t.assert.equal(state.consumed, 1);
  state.gesture.start(pointer());
  t.mock.timers.tick(MAGNIFIER_DELAY);
  state.gesture.start(pointer({ pointerId: 2, isPrimary: false }));
  t.assert.equal(state.changes.at(-1), null);
  t.assert.deepEqual(state.releases, [1]);
});

test('pointer cancellation, source/layout changes, blur and cleanup share interruption', (t) => {
  const state = setup(t);
  state.gesture.start(pointer());
  state.gesture.interrupt();
  t.mock.timers.tick(MAGNIFIER_DELAY);
  t.assert.equal(state.changes.length, 0);
  state.gesture.start(pointer());
  t.mock.timers.tick(MAGNIFIER_DELAY);
  state.gesture.interrupt();
  state.gesture.interrupt();
  t.assert.equal(state.changes.at(-1), null);
  t.assert.deepEqual(state.releases, [1]);
});

test('desktop primary-button hold works; leaving before activation cancels it', (t) => {
  const state = setup(t);
  state.gesture.start(pointer({ pointerType: 'mouse' }));
  state.gesture.leave();
  t.mock.timers.tick(MAGNIFIER_DELAY);
  t.assert.equal(state.changes.length, 0);
  state.gesture.start(pointer({ pointerType: 'mouse' }));
  t.mock.timers.tick(MAGNIFIER_DELAY);
  state.gesture.leave();
  t.assert.equal(state.changes.at(-1).scale, 3);
});

test('unrelated pointers cannot move or end the active gesture', (t) => {
  const state = setup(t);
  state.gesture.start(pointer());
  t.mock.timers.tick(MAGNIFIER_DELAY);
  state.gesture.move(pointer({ pointerId: 2, clientX: 0 }));
  state.gesture.end(pointer({ pointerId: 2 }));
  t.assert.equal(state.changes.length, 1);
});

test('unavailable media, non-primary buttons and failed capture do not activate', (t) => {
  const state = setup(t, { capture: () => false });
  state.gesture.start(pointer({ button: 2 }));
  t.mock.timers.tick(MAGNIFIER_DELAY);
  t.assert.equal(state.changes.length, 0);
  state.gesture.start(pointer());
  t.mock.timers.tick(MAGNIFIER_DELAY);
  t.assert.equal(state.changes.length, 0);
  const unavailable = createMediaMagnifier({ measure: () => null });
  unavailable.start(pointer());
  t.mock.timers.tick(MAGNIFIER_DELAY);
});

test('native controls strip is excluded without swallowing short videos entirely', (t) => {
  t.assert.equal(isVideoControlPress({ bottom: 500, height: 400 }, 480), true);
  t.assert.equal(isVideoControlPress({ bottom: 500, height: 400 }, 300), false);
  t.assert.equal(isVideoControlPress({ bottom: 80, height: 30 }, 55), false);
  t.assert.equal(isVideoControlPress({ bottom: 80, height: 30 }, 75), true);
});

test('long-touch context menus are suppressed but desktop right-click stays available', (t) => {
  const state = setup(t);
  state.gesture.start(pointer());
  const touchMenu = pointer({ button: 2 });
  state.gesture.contextMenu(touchMenu);
  t.assert.equal(touchMenu.prevented, true);
  t.mock.timers.tick(MAGNIFIER_DELAY);
  state.gesture.end(pointer());
  const rightClick = pointer({ pointerType: 'mouse', button: 2 });
  state.gesture.start(rightClick);
  state.gesture.contextMenu(rightClick);
  t.assert.equal(rightClick.prevented, false);
  // React wraps contextmenu in a MouseEvent, with pointerType on nativeEvent.
  const reactRightClick = pointer({ pointerType: undefined, nativeEvent: { pointerType: 'mouse' }, button: 2 });
  state.gesture.contextMenu(reactRightClick);
  t.assert.equal(reactRightClick.prevented, false);
  const reactTouchMenu = pointer({ pointerType: undefined, nativeEvent: { pointerType: 'touch' }, button: 2 });
  state.gesture.contextMenu(reactTouchMenu);
  t.assert.equal(reactTouchMenu.prevented, true);
});
