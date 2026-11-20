/* damagedCronJob Studios: packs that flip, and hang on real pendulums.
   No libraries. Nothing loops: a pack swings only when something pushes it,
   and the loop stops once every pack has settled. */
(function () {
  'use strict';
  var root = document.documentElement;
  root.classList.remove('no-js');
  root.classList.add('js');

  var reduce = window.matchMedia('(prefers-reduced-motion: reduce)');

  /* ------------------------------------------------------------ flip */

  function setSide(pack, flipped) {
    var front = pack.querySelector('.front');
    var back = pack.querySelector('.back');
    var show = flipped ? back : front;
    var hide = flipped ? front : back;
    var hadFocus = pack.contains(document.activeElement);
    show.inert = false;
    // Move focus first, then make the hidden side inert, so focus is never dropped.
    // The face is a labelled group ("Magnet Mob, back of the pack"), so focusing it
    // is what tells a screen reader which side is now showing.
    if (hadFocus) show.focus({ preventScroll: true });
    hide.inert = true;
    pack.classList.toggle('is-flipped', flipped);
    pack.setAttribute('data-side', flipped ? 'back' : 'front');

    if (!reduce.matches) {
      var hanger = pack.querySelector('.hanger');
      hanger.classList.add('is-turning');
      clearTimeout(hanger._turning);
      hanger._turning = setTimeout(function () { hanger.classList.remove('is-turning'); }, 450);
      nudge(hanger, flipped ? 0.35 : -0.35);
    }
  }

  Array.prototype.forEach.call(document.querySelectorAll('.pack'), function (pack) {
    pack.setAttribute('data-side', 'front');
    Array.prototype.forEach.call(pack.querySelectorAll('.turn'), function (btn) {
      btn.addEventListener('click', function () {
        setSide(pack, !pack.classList.contains('is-flipped'));
      });
    });
    // The whole card turns over: a click anywhere on a face that is not a link or a button.
    Array.prototype.forEach.call(pack.querySelectorAll('.face'), function (face) {
      face.addEventListener('click', function (e) {
        if (e.target.closest('a, button')) return;
        var sel = window.getSelection && window.getSelection();
        if (sel && String(sel).length > 0 && face.contains(sel.anchorNode)) return;
        setSide(pack, !pack.classList.contains('is-flipped'));
      });
    });
  });

  /* ------------------------------------------------------------ pendulums */

  // A card on a hook is a physical pendulum: a flat plate swinging about a pivot
  // near its top edge. w0^2 = g d / (k^2 + d^2), where d is the pivot-to-centre
  // distance and k^2 = (w^2 + h^2) / 12. G is tuned so Magnet Mob's pack swings
  // with a period near 1.3 s; smaller packs swing faster, tags faster still.
  var G = 11600;          // px / s^2
  var ZETA = 0.14;        // viscous damping ratio
  var FRICTION = 0.5;     // pivot friction, rad / s^2: brings a pack to a clean stop
  var COUPLE = 0.32;      // how much of a brushing pointer's push reaches the card
  var BRUSH = 220;        // px / s: slower than this, a pointer steadies a card instead
  var STEADY = 9;         // extra damping while a slow pointer rests on a card

  var items = [];
  Array.prototype.forEach.call(document.querySelectorAll('[data-swing]'), function (el) {
    var tag = el.classList.contains('tag');
    var mm = el.closest('.pack--mm');
    var small = el.closest('.pack--dz, .pack--aa, .pack--lx');
    items.push({
      el: el,
      phi: 0,
      om: 0,
      w0: 6,
      I: 1,
      pivot: 16,
      gain: tag ? 3 : 1,
      max: tag ? 0.24 : mm ? 0.055 : small ? 0.085 : 0.09,
      rect: null
    });
  });

  function measure() {
    items.forEach(function (it) {
      var cs = getComputedStyle(it.el);
      var origin = cs.transformOrigin.split(' ');
      var px = parseFloat(origin[0]) || it.el.offsetWidth / 2;
      var py = parseFloat(origin[1]) || 16;
      var w = it.el.offsetWidth;
      var h = it.el.offsetHeight;
      var span = Math.max(24, h - Math.max(0, py));
      var d = span / 2 + Math.max(0, -py);
      var k2 = (w * w + span * span) / 12;
      it.I = k2 + d * d;
      it.w0 = Math.sqrt(G * d / it.I);
      it.pivot = py;
      it.pivotX = px;
    });
  }

  var pointer = { x: -1e4, y: -1e4, vx: 0, t: 0, speed: 0 };
  var running = false;
  var last = 0;

  function writeSwing(it) {
    it.el.style.setProperty('--swing', (it.phi * 57.29578).toFixed(3) + 'deg');
  }

  function inside(it, x, y) {
    var r = it.el.getBoundingClientRect();
    return x >= r.left && x <= r.right && y >= r.top && y <= r.bottom ? r : null;
  }

  function nudge(el, dOmega) {
    if (reduce.matches) return;
    for (var i = 0; i < items.length; i++) {
      if (items[i].el === el) { items[i].om += dOmega; start(); return; }
    }
  }

  function onMove(e) {
    var now = e.timeStamp || performance.now();
    var dt = pointer.t ? Math.min(0.05, Math.max(0.004, (now - pointer.t) / 1000)) : 0.016;
    var vx = pointer.t ? (e.clientX - pointer.x) / dt : 0;
    var vy = pointer.t ? (e.clientY - pointer.y) / dt : 0;
    pointer.vx = pointer.vx * 0.4 + vx * 0.6;
    pointer.speed = Math.sqrt(vx * vx + vy * vy);
    pointer.x = e.clientX;
    pointer.y = e.clientY;
    pointer.t = now;

    if (pointer.speed < BRUSH) return;
    var pushed = false;
    for (var i = 0; i < items.length; i++) {
      var it = items[i];
      var r = inside(it, e.clientX, e.clientY);
      if (!r) continue;
      // lever arm: how far below the pivot the pointer touched
      var lever = e.clientY - (r.top + Math.max(0, it.pivot));
      if (lever <= 0) continue;
      var rel = pointer.vx - it.om * lever;           // pointer speed relative to the card at that point
      var dOm = COUPLE * it.gain * rel * lever / it.I * dt;
      // push less as the card nears its stop, so it never slams
      var outward = (dOm > 0) === (it.phi > 0);
      if (outward) dOm *= Math.max(0, 1 - Math.abs(it.phi) / it.max);
      it.om += dOm;
      pushed = true;
    }
    if (pushed) start();
  }

  function onLeave() {
    pointer.x = pointer.y = -1e4;
    pointer.t = 0;
    pointer.speed = 0;
  }

  function step(dt) {
    var moving = false;
    var steadyNow = pointer.t && performance.now() - pointer.t < 250 && pointer.speed < BRUSH;
    for (var i = 0; i < items.length; i++) {
      var it = items[i];
      if (it.phi === 0 && it.om === 0) continue;
      var steady = steadyNow && inside(it, pointer.x, pointer.y) ? STEADY : 0;
      var n = Math.ceil(dt / (1 / 240));
      var h = dt / n;
      for (var s = 0; s < n; s++) {
        var acc = -it.w0 * it.w0 * Math.sin(it.phi) - (2 * ZETA * it.w0 + steady) * it.om;
        // pivot friction, smoothed near zero speed so it cannot chatter or hold a card off true
        acc -= FRICTION * Math.tanh(it.om / 0.04);
        it.om += acc * h;
        it.phi += it.om * h;
      }
      if (Math.abs(it.phi) > it.max) {
        it.phi = it.max * (it.phi > 0 ? 1 : -1);
        if ((it.om > 0) === (it.phi > 0)) it.om *= -0.25;
      }
      if (Math.abs(it.phi) < 0.0004 && Math.abs(it.om) < 0.004) {
        it.phi = 0;
        it.om = 0;
      } else {
        moving = true;
      }
      writeSwing(it);
    }
    return moving;
  }

  function frame(now) {
    var dt = Math.min(0.034, (now - last) / 1000 || 0.016);
    last = now;
    if (step(dt)) {
      requestAnimationFrame(frame);
    } else {
      running = false;
    }
  }

  function start() {
    if (running || reduce.matches) return;
    running = true;
    last = performance.now();
    requestAnimationFrame(frame);
  }

  function rest() {
    items.forEach(function (it) {
      it.phi = 0;
      it.om = 0;
      it.el.style.removeProperty('--swing');
    });
  }

  function enable() {
    measure();
    window.addEventListener('pointermove', onMove, { passive: true });
    document.addEventListener('pointerleave', onLeave);
    window.addEventListener('blur', onLeave);
  }
  function disable() {
    window.removeEventListener('pointermove', onMove);
    document.removeEventListener('pointerleave', onLeave);
    window.removeEventListener('blur', onLeave);
    rest();
  }

  var resizeTimer;
  window.addEventListener('resize', function () {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(measure, 150);
  });
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(measure);

  if (!reduce.matches) enable();
  var onPref = function () { if (reduce.matches) disable(); else enable(); };
  if (reduce.addEventListener) reduce.addEventListener('change', onPref);
  else if (reduce.addListener) reduce.addListener(onPref);
})();
