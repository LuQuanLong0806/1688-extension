// hover-workflow.test.js — hover/unhover/moveMouseTo + 工作流超时 单元测试
// 测试本次修复：hover 后未 unhover 导致子菜单残留 + 工作流卡死按钮禁用

// ========== Mock DOM ==========
function setupDom() {
  var eventLog = [];

  function mockEl(id, rect) {
    var listeners = {};
    var el = {
      id: id,
      classList: {
        _c: [],
        add: function (c) { if (!el.classList._c.includes(c)) el.classList._c.push(c); },
        remove: function (c) { el.classList._c = el.classList._c.filter(function (x) { return x !== c; }); },
        contains: function (c) { return el.classList._c.includes(c); }
      },
      textContent: '',
      parentElement: null,
      dispatchEvent: function (evt) {
        eventLog.push({ target: id, type: evt.type, clientX: evt.clientX, clientY: evt.clientY, bubbles: evt.bubbles });
        return true;
      },
      getBoundingClientRect: function () {
        return rect || { left: 10, top: 20, width: 100, height: 40 };
      }
    };
    return el;
  }

  return { eventLog: eventLog, mockEl: mockEl };
}

// ========== 用 mock 事件替代真实 MouseEvent/PointerEvent ==========
function mockEvent(type, opts) {
  return { type: type, bubbles: !!opts.bubbles, clientX: opts.clientX || 0, clientY: opts.clientY || 0 };
}

function createHoverHelpers(getRect) {
  function hoverElement(el) {
    el.dispatchEvent(mockEvent('mouseover', { bubbles: true }));
    el.dispatchEvent(mockEvent('mouseenter', { bubbles: false }));
    el.dispatchEvent(mockEvent('mousemove', { bubbles: true }));
  }

  function unhoverElement(el) {
    el.dispatchEvent(mockEvent('mouseout', { bubbles: true }));
    el.dispatchEvent(mockEvent('mouseleave', { bubbles: false }));
  }

  function hoverWithCoords(el) {
    var rect = getRect(el);
    var cx = rect.left + rect.width / 2;
    var cy = rect.top + rect.height / 2;
    el.dispatchEvent(mockEvent('pointerover', { bubbles: true, clientX: cx, clientY: cy }));
    el.dispatchEvent(mockEvent('pointerenter', { bubbles: false, clientX: cx, clientY: cy }));
    el.dispatchEvent(mockEvent('pointermove', { bubbles: true, clientX: cx, clientY: cy }));
    el.dispatchEvent(mockEvent('mouseover', { bubbles: true, clientX: cx, clientY: cy }));
    el.dispatchEvent(mockEvent('mouseenter', { bubbles: false, clientX: cx, clientY: cy }));
    el.dispatchEvent(mockEvent('mousemove', { bubbles: true, clientX: cx, clientY: cy }));
  }

  function unhoverWithCoords(el) {
    var rect = getRect(el);
    var cx = rect.left + rect.width / 2;
    var cy = rect.top + rect.height / 2;
    el.dispatchEvent(mockEvent('pointerout', { bubbles: true, clientX: cx, clientY: cy }));
    el.dispatchEvent(mockEvent('pointerleave', { bubbles: false, clientX: cx, clientY: cy }));
    el.dispatchEvent(mockEvent('mouseout', { bubbles: true, clientX: cx, clientY: cy }));
    el.dispatchEvent(mockEvent('mouseleave', { bubbles: false, clientX: cx, clientY: cy }));
  }

  function moveMouseTo(fromEl, toEl) {
    unhoverWithCoords(fromEl);
    hoverWithCoords(toEl);
  }

  return { hoverElement: hoverElement, unhoverElement: unhoverElement, hoverWithCoords: hoverWithCoords, unhoverWithCoords: unhoverWithCoords, moveMouseTo: moveMouseTo };
}

// ========== Tests ==========

test('hoverElement dispatches mouseover + mouseenter + mousemove', function () {
  var dom = setupDom();
  var btn = dom.mockEl('btn');
  createHoverHelpers(function () { return { left: 0, top: 0, width: 50, height: 20 }; }).hoverElement(btn);

  var types = dom.eventLog.map(function (e) { return e.type; });
  expect(types).toEqual(['mouseover', 'mouseenter', 'mousemove']);
});

test('unhoverElement dispatches mouseout + mouseleave', function () {
  var dom = setupDom();
  var btn = dom.mockEl('btn');
  createHoverHelpers(function () { return { left: 0, top: 0, width: 50, height: 20 }; }).unhoverElement(btn);

  var types = dom.eventLog.map(function (e) { return e.type; });
  expect(types).toEqual(['mouseout', 'mouseleave']);
});

test('hoverWithCoords dispatches 6 events with center coords', function () {
  var dom = setupDom();
  var btn = dom.mockEl('btn', { left: 100, top: 200, width: 60, height: 30 });
  createHoverHelpers(function () { return { left: 100, top: 200, width: 60, height: 30 }; }).hoverWithCoords(btn);

  expect(dom.eventLog.length).toBe(6);
  // cx=130, cy=215
  expect(dom.eventLog[0]).toEqual({ target: 'btn', type: 'pointerover', clientX: 130, clientY: 215, bubbles: true });
  expect(dom.eventLog[3]).toEqual({ target: 'btn', type: 'mouseover', clientX: 130, clientY: 215, bubbles: true });
});

test('unhoverWithCoords dispatches pointerout + pointerleave + mouseout + mouseleave with coords', function () {
  var dom = setupDom();
  var btn = dom.mockEl('btn', { left: 50, top: 50, width: 100, height: 40 });
  createHoverHelpers(function () { return { left: 50, top: 50, width: 100, height: 40 }; }).unhoverWithCoords(btn);

  var types = dom.eventLog.map(function (e) { return e.type; });
  expect(types).toEqual(['pointerout', 'pointerleave', 'mouseout', 'mouseleave']);
  // cx=100, cy=70
  expect(dom.eventLog[0].clientX).toBe(100);
  expect(dom.eventLog[0].clientY).toBe(70);
});

test('moveMouseTo unhovers source then hovers target', function () {
  var dom = setupDom();
  var src = dom.mockEl('src', { left: 0, top: 0, width: 50, height: 50 });
  var dst = dom.mockEl('dst', { left: 200, top: 300, width: 80, height: 40 });
  createHoverHelpers(function (el) {
    return el.id === 'src' ? { left: 0, top: 0, width: 50, height: 50 } : { left: 200, top: 300, width: 80, height: 40 };
  }).moveMouseTo(src, dst);

  // unhover src: 4 events, hover dst: 6 events
  var srcEvents = dom.eventLog.filter(function (e) { return e.target === 'src'; });
  var dstEvents = dom.eventLog.filter(function (e) { return e.target === 'dst'; });

  expect(srcEvents.length).toBe(4);
  expect(dstEvents.length).toBe(6);

  // src unhover 顺序
  expect(srcEvents.map(function (e) { return e.type; })).toEqual(['pointerout', 'pointerleave', 'mouseout', 'mouseleave']);
  // dst hover 顺序
  expect(dstEvents.map(function (e) { return e.type; })).toEqual(['pointerover', 'pointerenter', 'pointermove', 'mouseover', 'mouseenter', 'mousemove']);

  // dst 坐标: cx=240, cy=320
  expect(dstEvents[0].clientX).toBe(240);
  expect(dstEvents[0].clientY).toBe(320);
});

test('moveMouseTo uses different coords for source and target', function () {
  var dom = setupDom();
  var src = dom.mockEl('src', { left: 0, top: 0, width: 100, height: 100 });
  var dst = dom.mockEl('dst', { left: 500, top: 500, width: 100, height: 100 });
  createHoverHelpers(function (el) {
    return el.id === 'src' ? { left: 0, top: 0, width: 100, height: 100 } : { left: 500, top: 500, width: 100, height: 100 };
  }).moveMouseTo(src, dst);

  // src: cx=50, cy=50
  expect(dom.eventLog[0].clientX).toBe(50);
  expect(dom.eventLog[0].clientY).toBe(50);
  // dst: cx=550, cy=550
  expect(dom.eventLog[4].clientX).toBe(550);
  expect(dom.eventLog[4].clientY).toBe(550);
});

test('moveMouseTo guarantees unhover before hover', function () {
  var dom = setupDom();
  var src = dom.mockEl('src', { left: 0, top: 0, width: 50, height: 50 });
  var dst = dom.mockEl('dst', { left: 100, top: 100, width: 50, height: 50 });
  createHoverHelpers(function (el) {
    return el.id === 'src' ? { left: 0, top: 0, width: 50, height: 50 } : { left: 100, top: 100, width: 50, height: 50 };
  }).moveMouseTo(src, dst);

  // 第一个事件：src 的 pointerout
  expect(dom.eventLog[0].target).toBe('src');
  expect(dom.eventLog[0].type).toBe('pointerout');
  // 最后一个事件：dst 的 mousemove
  var last = dom.eventLog[dom.eventLog.length - 1];
  expect(last.target).toBe('dst');
  expect(last.type).toBe('mousemove');
});

test('hoverWithCoords and unhoverWithCoords are symmetric', function () {
  var dom = setupDom();
  var btn = dom.mockEl('btn', { left: 10, top: 20, width: 100, height: 40 });
  var h = createHoverHelpers(function () { return { left: 10, top: 20, width: 100, height: 40 }; });

  h.hoverWithCoords(btn);
  var afterHover = dom.eventLog.length;
  h.unhoverWithCoords(btn);
  var afterUnhover = dom.eventLog.length;

  expect(afterHover).toBe(6);
  expect(afterUnhover).toBe(10);

  var unhoverTypes = dom.eventLog.slice(6).map(function (e) { return e.type; });
  expect(unhoverTypes).toContain('pointerout');
  expect(unhoverTypes).toContain('pointerleave');
  expect(unhoverTypes).toContain('mouseout');
  expect(unhoverTypes).toContain('mouseleave');
});

// ========== 工作流超时测试 ==========

test('workflow auto-unlocks after 30s timeout', function () {
  jest.useFakeTimers();

  var isWorking = false;
  var timer = null;
  var btn = { disabled: false };

  function startWorkflow() {
    if (isWorking) return false;
    isWorking = true;
    btn.disabled = true;
    clearTimeout(timer);
    timer = setTimeout(function () { if (isWorking) finishWorkflow(false); }, 30000);
    return true;
  }

  function finishWorkflow() {
    clearTimeout(timer);
    isWorking = false;
    btn.disabled = false;
  }

  startWorkflow();
  expect(isWorking).toBe(true);
  expect(btn.disabled).toBe(true);

  jest.advanceTimersByTime(29000);
  expect(isWorking).toBe(true);

  jest.advanceTimersByTime(1500);
  expect(isWorking).toBe(false);
  expect(btn.disabled).toBe(false);

  jest.useRealTimers();
});

test('finishWorkflow clears timeout timer', function () {
  jest.useFakeTimers();

  var isWorking = false;
  var timer = null;
  var timeoutFired = false;

  function startWorkflow() {
    if (isWorking) return false;
    isWorking = true;
    clearTimeout(timer);
    timer = setTimeout(function () { timeoutFired = true; isWorking = false; }, 30000);
    return true;
  }

  function finishWorkflow() {
    clearTimeout(timer);
    isWorking = false;
  }

  startWorkflow();
  finishWorkflow();

  jest.advanceTimersByTime(60000);
  expect(timeoutFired).toBe(false);
  expect(isWorking).toBe(false);

  jest.useRealTimers();
});

test('startWorkflow rejects concurrent calls', function () {
  var isWorking = false;
  var timer = null;

  function startWorkflow() {
    if (isWorking) return false;
    isWorking = true;
    clearTimeout(timer);
    timer = setTimeout(function () { isWorking = false; }, 30000);
    return true;
  }

  function finishWorkflow() {
    clearTimeout(timer);
    isWorking = false;
  }

  expect(startWorkflow()).toBe(true);
  expect(startWorkflow()).toBe(false);
  finishWorkflow();
  expect(startWorkflow()).toBe(true);
});

test('workflow disables all buttons on start, re-enables on finish', function () {
  var btns = ['b1', 'b2', 'b3'].map(function (id) {
    return { id: id, disabled: false };
  });
  var isWorking = false;
  var timer = null;

  function startWorkflow() {
    if (isWorking) return false;
    isWorking = true;
    btns.forEach(function (b) { b.disabled = true; });
    clearTimeout(timer);
    timer = setTimeout(function () { if (isWorking) finishWorkflow(); }, 30000);
    return true;
  }

  function finishWorkflow() {
    clearTimeout(timer);
    isWorking = false;
    btns.forEach(function (b) { b.disabled = false; });
  }

  expect(btns.every(function (b) { return !b.disabled; })).toBe(true);

  startWorkflow();
  expect(btns.every(function (b) { return b.disabled; })).toBe(true);

  finishWorkflow();
  expect(btns.every(function (b) { return !b.disabled; })).toBe(true);
});
