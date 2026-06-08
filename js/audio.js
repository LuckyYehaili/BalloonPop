/**
 * 音效路径与开关（资源在 audio/ 下，扩展名统一小写 .mp3，真机 Android 区分大小写）
 */
const store = require('./store');

const MUSIC_PATH = 'audio/music.mp3';

const FILES = {
  pump: 'daqisheng',
  explode: 'baozha',
  louqi: 'louqi',
  mofa: 'mofa',
  chenggong: 'chenggong'
};

let _bgm = null;
let _bgmWantPlay = false;

/** 返回音效路径（真机 Android 区分大小写，统一用小写 .mp3） */
function pathsFor(kind) {
  const base = FILES[kind];
  if (!base) return [];
  return ['audio/' + base + '.mp3'];
}

function isSoundOn() {
  try {
    const s = store.getSettings && store.getSettings();
    return !s || s.soundOn !== false;
  } catch (_) {
    return true;
  }
}

function isVibrationOn() {
  try {
    const s = store.getSettings && store.getSettings();
    return !s || s.vibrationOn !== false;
  } catch (_) {
    return true;
  }
}

function isMusicOn() {
  try {
    const s = store.getSettings && store.getSettings();
    return !s || s.musicOn !== false;
  } catch (_) {
    return true;
  }
}

function _ensureBgm() {
  if (_bgm) return _bgm;
  if (typeof wx === 'undefined' || typeof wx.createInnerAudioContext !== 'function') return null;
  try {
    const audio = wx.createInnerAudioContext();
    audio.src = MUSIC_PATH;
    audio.loop = true;
    audio.obeyMuteSwitch = false;
    audio.volume = 0.55;
    if (audio.onError) {
      audio.onError((err) => {
        console.warn('[audio] bgm onError:', MUSIC_PATH, err && (err.errMsg || err));
      });
    }
    _bgm = audio;
    return audio;
  } catch (e) {
    console.warn('[audio] bgm init failed:', e && e.message);
    return null;
  }
}

function startBgm() {
  _bgmWantPlay = true;
  if (!isMusicOn()) return;
  const audio = _ensureBgm();
  if (!audio) return;
  try {
    if (typeof audio.play === 'function') audio.play();
  } catch (e) {
    console.warn('[audio] bgm play failed:', e && e.message);
  }
}

function stopBgm() {
  _bgmWantPlay = false;
  const audio = _bgm;
  if (!audio) return;
  try {
    if (typeof audio.stop === 'function') audio.stop();
    else if (typeof audio.pause === 'function') audio.pause();
  } catch (_) { /* ignore */ }
}

function pauseBgm() {
  const audio = _bgm;
  if (!audio) return;
  try {
    if (typeof audio.pause === 'function') audio.pause();
  } catch (_) { /* ignore */ }
}

function resumeBgm() {
  if (!isMusicOn() || !_bgmWantPlay) return;
  const audio = _ensureBgm();
  if (!audio) return;
  try {
    if (typeof audio.play === 'function') audio.play();
  } catch (e) {
    console.warn('[audio] bgm resume failed:', e && e.message);
  }
}

function syncBgmFromSettings() {
  if (isMusicOn()) startBgm();
  else stopBgm();
}

/** 与 FILES 键一致：pump / explode / louqi / mofa / chenggong */
const VIBRATION_FOR = {
  pump: 'light',
  explode: 'heavy',
  louqi: 'medium',
  mofa: 'medium',
  chenggong: 'light'
};

function _callVibrateLong() {
  if (typeof wx === 'undefined' || typeof wx.vibrateLong !== 'function') return false;
  try {
    wx.vibrateLong({});
    return true;
  } catch (e) {
    console.warn('[audio] vibrateLong failed:', e && e.message);
    return false;
  }
}

/**
 * iOS 的 wx.vibrateShort 必须带合法 type（heavy/medium/light），否则异步 fail 不震；
 * 失败时用 fail 回调兜底到 vibrateLong（安卓多数机型支持）。
 */
function _callVibrateShort(type) {
  if (typeof wx === 'undefined' || typeof wx.vibrateShort !== 'function') return false;
  try {
    wx.vibrateShort({
      type: type || 'medium',
      fail: (e) => {
        console.warn('[audio] vibrateShort fail:', e && (e.errMsg || e.message || e));
        _callVibrateLong();
      }
    });
    return true;
  } catch (e) {
    console.warn('[audio] vibrateShort throw:', type || 'default', e && e.message);
    return false;
  }
}

/** 须在用户手势回调内同步调用（勿包 setTimeout），否则真机可能不震 */
function vibrateFor(kind) {
  if (!isVibrationOn()) return;
  if (typeof wx === 'undefined') return;
  const type = VIBRATION_FOR[kind] || 'medium';
  if (!_callVibrateShort(type)) {
    _callVibrateLong();
  }
}

function applyInnerAudioOption() {
  if (typeof wx === 'undefined' || typeof wx.setInnerAudioOption !== 'function') return;
  try {
    wx.setInnerAudioOption({ obeyMuteSwitch: false, mixWithOther: false });
  } catch (e) {
    console.warn('[audio] setInnerAudioOption failed:', e && e.message);
  }
}

module.exports = {
  pathsFor,
  isSoundOn,
  isMusicOn,
  isVibrationOn,
  vibrateFor,
  applyInnerAudioOption,
  startBgm,
  stopBgm,
  pauseBgm,
  resumeBgm,
  syncBgmFromSettings,
  MUSIC_PATH,
  FILES
};
