/* app.js — 讀稿機主邏輯：捲動、播放控制、快捷鍵、全螢幕 */
(function () {
  'use strict';

  var $ = function (id) { return document.getElementById(id); };

  var editor = $('editor');
  var player = $('player');
  var scriptInput = $('script');
  var scriptView = $('scriptView');
  var scroller = $('scroller');
  var viewport = $('viewport');
  var controls = $('controls');
  var playBtn = $('playBtn');
  var mirrorBtn = $('mirrorBtn');
  var statsEl = $('stats');
  var saveStateEl = $('saveState');

  var speedInputs = [$('speed'), $('speed2')];
  var fontInputs = [$('fontSize'), $('fontSize2')];

  var settings = TPStorage.loadSettings();

  var state = {
    playing: false,
    offset: 0,      // 已捲動距離（px）
    maxOffset: 0,
    lastTs: 0,
    rafId: 0
  };

  /* ---------- 編輯畫面 ---------- */

  function updateStats() {
    var len = scriptInput.value.replace(/\s/g, '').length;
    statsEl.textContent = len + ' 字';
  }

  var saveTimer = 0;
  function scheduleSave() {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(function () {
      var okSaved = TPStorage.saveScript(scriptInput.value);
      saveStateEl.textContent = okSaved ? '已自動儲存' : '無法儲存（瀏覽器封鎖本機儲存）';
      clearTimeout(saveTimer);
      saveTimer = setTimeout(function () { saveStateEl.textContent = ''; }, 2000);
    }, 400);
  }

  function persistSettings() { TPStorage.saveSettings(settings); }

  /* ---------- 設定同步 ---------- */

  function setSpeed(value) {
    settings.speed = clamp(Math.round(value), 1, 200);
    syncInputs(speedInputs, settings.speed);
    $('speedVal').textContent = settings.speed;
    persistSettings();
  }

  function setFontSize(value) {
    settings.fontSize = clamp(Math.round(value), 20, 160);
    syncInputs(fontInputs, settings.fontSize);
    $('fontVal').textContent = settings.fontSize;
    scriptView.style.fontSize = settings.fontSize + 'px';
    measure();
    persistSettings();
  }

  function setMirror(x, y) {
    settings.mirrorX = !!x;
    settings.mirrorY = !!y;
    $('mirrorX').checked = settings.mirrorX;
    $('mirrorY').checked = settings.mirrorY;
    player.classList.toggle('is-mirror-x', settings.mirrorX);
    player.classList.toggle('is-mirror-y', settings.mirrorY);
    mirrorBtn.setAttribute('aria-pressed', settings.mirrorX ? 'true' : 'false');
    persistSettings();
  }

  function syncInputs(inputs, value) {
    for (var i = 0; i < inputs.length; i++) {
      if (String(inputs[i].value) !== String(value)) inputs[i].value = value;
    }
  }

  function clamp(v, min, max) { return v < min ? min : (v > max ? max : v); }

  /* ---------- 捲動 ---------- */

  function measure() {
    // 文字上下各留 50vh 的 padding，捲到最後一行剛好停在畫面中央
    state.maxOffset = Math.max(0, scriptView.scrollHeight - viewport.clientHeight * 0.5);
    applyOffset();
  }

  function applyOffset() {
    state.offset = clamp(state.offset, 0, state.maxOffset);
    scroller.style.transform = 'translate3d(0,' + (-state.offset) + 'px,0)';
  }

  function tick(ts) {
    if (!state.playing) return;
    if (!state.lastTs) state.lastTs = ts;
    var dt = (ts - state.lastTs) / 1000;
    state.lastTs = ts;
    // 速度值即為每秒捲動的像素數
    state.offset += settings.speed * dt;
    if (state.offset >= state.maxOffset) {
      state.offset = state.maxOffset;
      applyOffset();
      pause();
      return;
    }
    applyOffset();
    state.rafId = requestAnimationFrame(tick);
  }

  function play() {
    if (state.playing) return;
    if (state.offset >= state.maxOffset) state.offset = 0;
    state.playing = true;
    state.lastTs = 0;
    playBtn.textContent = '⏸';
    state.rafId = requestAnimationFrame(tick);
  }

  function pause() {
    state.playing = false;
    playBtn.textContent = '▶';
    cancelAnimationFrame(state.rafId);
  }

  function toggle() { state.playing ? pause() : play(); }

  function restart() {
    state.offset = 0;
    applyOffset();
    play();
  }

  /* ---------- 播放畫面切換 ---------- */

  function openPlayer() {
    var text = scriptInput.value.trim();
    if (!text) {
      scriptInput.focus();
      saveStateEl.textContent = '請先輸入講稿內容';
      return;
    }
    scriptView.textContent = scriptInput.value;
    scriptView.style.fontSize = settings.fontSize + 'px';
    editor.hidden = true;
    player.hidden = false;
    state.offset = 0;
    requestFullscreen();
    // 等版面完成後再量測高度
    requestAnimationFrame(function () {
      measure();
      showControls();
      play();
    });
  }

  function closePlayer() {
    pause();
    exitFullscreen();
    player.hidden = true;
    editor.hidden = false;
    window.scrollTo(0, 0);
  }

  function requestFullscreen() {
    var el = document.documentElement;
    var fn = el.requestFullscreen || el.webkitRequestFullscreen;
    if (fn) { try { fn.call(el); } catch (e) { /* 使用者手勢限制時忽略 */ } }
  }

  function exitFullscreen() {
    if (!document.fullscreenElement && !document.webkitFullscreenElement) return;
    var fn = document.exitFullscreen || document.webkitExitFullscreen;
    if (fn) { try { fn.call(document); } catch (e) { /* 忽略 */ } }
  }

  /* ---------- 懸浮控制列自動淡出 ---------- */

  var hideTimer = 0;
  function showControls() {
    controls.classList.remove('is-hidden');
    clearTimeout(hideTimer);
    hideTimer = setTimeout(function () {
      if (state.playing) controls.classList.add('is-hidden');
    }, 2500);
  }

  /* ---------- 事件綁定 ---------- */

  scriptInput.addEventListener('input', function () {
    updateStats();
    scheduleSave();
  });

  $('startBtn').addEventListener('click', openPlayer);

  $('clearBtn').addEventListener('click', function () {
    if (!scriptInput.value || window.confirm('確定要清空講稿嗎？')) {
      scriptInput.value = '';
      updateStats();
      scheduleSave();
      scriptInput.focus();
    }
  });

  speedInputs.forEach(function (el) {
    el.addEventListener('input', function () { setSpeed(el.value); });
  });
  fontInputs.forEach(function (el) {
    el.addEventListener('input', function () { setFontSize(el.value); });
  });

  $('mirrorX').addEventListener('change', function () { setMirror(this.checked, settings.mirrorY); });
  $('mirrorY').addEventListener('change', function () { setMirror(settings.mirrorX, this.checked); });
  mirrorBtn.addEventListener('click', function () { setMirror(!settings.mirrorX, settings.mirrorY); });

  playBtn.addEventListener('click', toggle);
  $('restartBtn').addEventListener('click', restart);
  $('exitBtn').addEventListener('click', closePlayer);

  viewport.addEventListener('click', toggle);
  player.addEventListener('mousemove', showControls);
  player.addEventListener('touchstart', showControls, { passive: true });
  controls.addEventListener('mousemove', function (e) { e.stopPropagation(); showControls(); });

  // 播放中以滾輪/觸控微調位置
  viewport.addEventListener('wheel', function (e) {
    if (player.hidden) return;
    e.preventDefault();
    state.offset += e.deltaY;
    applyOffset();
    showControls();
  }, { passive: false });

  window.addEventListener('resize', function () {
    if (!player.hidden) measure();
  });

  document.addEventListener('keydown', function (e) {
    if (player.hidden) return;
    var tag = e.target && e.target.tagName;
    var onSlider = tag === 'INPUT' && e.target.type === 'range';

    switch (e.key) {
      case ' ':
      case 'Spacebar':
        e.preventDefault();
        toggle();
        showControls();
        break;
      case 'ArrowUp':
        if (onSlider) return;
        e.preventDefault();
        setSpeed(settings.speed + 5);
        showControls();
        break;
      case 'ArrowDown':
        if (onSlider) return;
        e.preventDefault();
        setSpeed(settings.speed - 5);
        showControls();
        break;
      case '+':
      case '=':
        setFontSize(settings.fontSize + 4);
        showControls();
        break;
      case '-':
      case '_':
        setFontSize(settings.fontSize - 4);
        showControls();
        break;
      case 'r':
      case 'R':
        restart();
        showControls();
        break;
      case 'm':
      case 'M':
        setMirror(!settings.mirrorX, settings.mirrorY);
        showControls();
        break;
      case 'Escape':
        closePlayer();
        break;
      default:
        break;
    }
  });

  // 使用者按瀏覽器的離開全螢幕（F11 / Esc）時，一併回到編輯畫面
  document.addEventListener('fullscreenchange', function () {
    if (!document.fullscreenElement && !player.hidden) closePlayer();
  });

  /* ---------- 初始化 ---------- */

  scriptInput.value = TPStorage.loadScript();
  updateStats();
  setSpeed(settings.speed);
  setFontSize(settings.fontSize);
  setMirror(settings.mirrorX, settings.mirrorY);

  if (!TPStorage.available) {
    $('offlineNote').textContent = '提示：此瀏覽器停用了本機儲存，草稿不會自動保留。';
  } else {
    $('offlineNote').textContent = '首次連網開啟後即可離線使用；手機可用瀏覽器選單「加到主畫面」。';
  }
})();
