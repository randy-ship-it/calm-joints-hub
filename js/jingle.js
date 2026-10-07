/**
 * Calm Joints jingle: "Calm-er joints with Calm Joints" (Randy's own recording).
 * Plays only when tapped (never autoplays). The Audio element is created inside the tap so iOS Safari allows it.
 * Markup: <button type="button" class="cj-jingle" data-jingle aria-pressed="false">…</button>
 */
(function () {
  'use strict';
  var SRC_MP3 = '/media/jingle-calmer-joints.mp3?v=1';
  var SRC_M4A = '/media/jingle-calmer-joints.m4a?v=1';
  var LABEL = 'Calm-er joints with Calm Joints';
  var audio = null;
  var buttons = [];
  function setState(playing) {
    buttons.forEach(function (b) {
      b.setAttribute('aria-pressed', playing ? 'true' : 'false');
      b.setAttribute('aria-label', (playing ? 'Pause jingle: ' : 'Play jingle: ') + LABEL);
    });
  }
  function get() {
    if (audio) return audio;
    audio = new Audio();
    audio.preload = 'auto';
    audio.src = audio.canPlayType('audio/mpeg') ? SRC_MP3 : SRC_M4A;
    audio.addEventListener('ended', function () { audio.currentTime = 0; setState(false); });
    audio.addEventListener('pause', function () { setState(false); });
    audio.addEventListener('play', function () { setState(true); });
    return audio;
  }
  function toggle() {
    var a = get();
    if (!a.paused) { a.pause(); return; }
    if (a.ended) a.currentTime = 0;
    var p = a.play();
    if (p && p.catch) p.catch(function () { setState(false); });
    try { if (window.gtag) window.gtag('event', 'cj_jingle_play'); } catch (e) { /* ignore */ }
  }
  function init() {
    buttons = Array.prototype.slice.call(document.querySelectorAll('[data-jingle]'));
    buttons.forEach(function (b) { b.addEventListener('click', toggle); });
    setState(false);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
  window.CJJingle = { toggle: toggle, label: LABEL };
})();
