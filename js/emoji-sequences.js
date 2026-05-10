const { BALLOON_TYPES } = require('./balloons');

const _byLevel = {};
BALLOON_TYPES.forEach(b => {
  if (!b.isPaid && b.level >= 1 && b.level <= 4) {
    if (!_byLevel[b.level]) _byLevel[b.level] = [];
    _byLevel[b.level].push(b);
  }
});

const EMOJI_SEQUENCES = {};
for (let lv = 1; lv <= 4; lv++) {
  const list = (_byLevel[lv] || []).slice(0, 10);
  EMOJI_SEQUENCES[lv] = list.map((b, i) => ({
    index: i,
    emoji: b.emoji,
    shape: b.shape,
    color: b.color,
    glowColor: b.glowColor,
    name: b.name,
    isLegendSlot: i === 9,
    balloonId: b.id
  }));
}

function getSequence(levelNum) {
  return EMOJI_SEQUENCES[levelNum] || EMOJI_SEQUENCES[1];
}

function getBalloonAt(levelNum, index) {
  const seq = getSequence(levelNum);
  return seq[index] || seq[seq.length - 1];
}

module.exports = { EMOJI_SEQUENCES, getSequence, getBalloonAt };
