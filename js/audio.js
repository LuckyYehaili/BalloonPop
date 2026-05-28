/**
 * 音效路径与开关（资源在 audio/ 下，扩展名统一小写 .mp3，真机 Android 区分大小写）
 */
const store = require('./store');

const FILES = {
  pump: 'daqisheng',
  explode: 'baozha',
  louqi: 'louqi',
  mofa: 'mofa',
  chenggong: 'chenggong'
};

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
  applyInnerAudioOption,
  FILES
};
