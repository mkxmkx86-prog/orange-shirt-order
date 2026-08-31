/* storage.js — localStorage 存取（草稿與設定） */
(function (global) {
  'use strict';

  var KEY_SCRIPT = 'tp.script';
  var KEY_SETTINGS = 'tp.settings';

  var DEFAULTS = {
    speed: 50,
    fontSize: 56,
    mirrorX: false,
    mirrorY: false
  };

  function available() {
    try {
      var k = '__tp_test__';
      localStorage.setItem(k, '1');
      localStorage.removeItem(k);
      return true;
    } catch (e) {
      return false;
    }
  }

  var ok = available();

  function loadScript() {
    if (!ok) return '';
    try { return localStorage.getItem(KEY_SCRIPT) || ''; } catch (e) { return ''; }
  }

  function saveScript(text) {
    if (!ok) return false;
    try { localStorage.setItem(KEY_SCRIPT, text); return true; } catch (e) { return false; }
  }

  function loadSettings() {
    var s = {};
    var key;
    for (key in DEFAULTS) { if (DEFAULTS.hasOwnProperty(key)) s[key] = DEFAULTS[key]; }
    if (!ok) return s;
    try {
      var raw = localStorage.getItem(KEY_SETTINGS);
      if (!raw) return s;
      var parsed = JSON.parse(raw);
      if (parsed && typeof parsed === 'object') {
        for (key in DEFAULTS) {
          if (DEFAULTS.hasOwnProperty(key) && typeof parsed[key] === typeof DEFAULTS[key]) {
            s[key] = parsed[key];
          }
        }
      }
    } catch (e) { /* 壞掉的設定就用預設值 */ }
    return s;
  }

  function saveSettings(settings) {
    if (!ok) return false;
    try { localStorage.setItem(KEY_SETTINGS, JSON.stringify(settings)); return true; } catch (e) { return false; }
  }

  global.TPStorage = {
    available: ok,
    defaults: DEFAULTS,
    loadScript: loadScript,
    saveScript: saveScript,
    loadSettings: loadSettings,
    saveSettings: saveSettings
  };
})(window);
