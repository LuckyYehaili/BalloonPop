#!/usr/bin/env node
/**
 * 分享深链前端逻辑自测（Node 环境，不依赖 wx）
 * 运行：node scripts/share-flow-selftest.js
 */
const assert = require('assert');
const path = require('path');

const root = path.join(__dirname, '..');

function ok(cond, msg) {
  assert.ok(cond, msg);
}

// ─── 1. game.js 路由优先级（抽离逻辑镜像）───
function resolveLaunchScene(q) {
  if (q.teamId) return { scene: 'team', data: { autoJoinTeamId: String(q.teamId) } };
  const { parseBouquetShareFromQuery } = require(path.join(root, 'js/bouquet-share'));
  if (parseBouquetShareFromQuery(q)) return { scene: 'home', data: { bouquetShare: true } };
  if (q.giftId) return { scene: 'collection', data: { incomingGiftId: String(q.giftId) } };
  if (q.scene === 'collection') return { scene: 'collection', data: { activeTab: 'legend' } };
  return { scene: 'home', data: {} };
}

// ─── 2. gift-reason ───
const { giftReasonMessage, GIFT_REASON_COPY } = require(path.join(root, 'js/gift-reason'));

// ─── 3. bouquet-share roundtrip ───
const {
  buildBouquetShareQuery,
  parseBouquetShareFromQuery,
  normalizeBalloonList
} = require(path.join(root, 'js/bouquet-share'));

// ─── 4. invite-cache（mock wx）───
const storage = {};
global.wx = {
  getStorageSync(k) { return storage[k]; },
  setStorageSync(k, v) { storage[k] = v; }
};
const { isInviteJoinCached, markInviteJoinSuccess, CACHE_MS } = require(path.join(root, 'js/invite-cache'));

let passed = 0;
const _asyncTests = [];
function test(name, fn) {
  try {
    const ret = fn();
    if (ret && typeof ret.then === 'function') {
      _asyncTests.push(ret.then(() => {
        console.log('  ✓', name);
        passed++;
      }).catch((e) => {
        console.error('  ✗', name, '-', e.message);
        process.exitCode = 1;
      }));
      return;
    }
    console.log('  ✓', name);
    passed++;
  } catch (e) {
    console.error('  ✗', name, '-', e.message);
    process.exitCode = 1;
  }
}

console.log('\n[分享深链自测]\n');

test('路由：teamId 优先于 giftId', () => {
  const r = resolveLaunchScene({ teamId: 't1', giftId: 'g1' });
  ok(r.scene === 'team', '应为 team');
});

test('路由：bq=1 优先于 giftId', () => {
  const r = resolveLaunchScene({ bq: '1', giftId: 'g1', t: 'hi' });
  ok(r.scene === 'home' && r.data.bouquetShare, '应为 home 花束');
});

test('路由：giftId → collection incomingGiftId', () => {
  const r = resolveLaunchScene({ giftId: 'gift_abc' });
  ok(r.scene === 'collection' && r.data.incomingGiftId === 'gift_abc', '应为 collection 赠礼');
});

test('路由：scene=collection → legend Tab', () => {
  const r = resolveLaunchScene({ scene: 'collection' });
  ok(r.scene === 'collection' && r.data.activeTab === 'legend', '应默认传奇 Tab');
});

test('花束 query 编解码往返', () => {
  const balloons = normalizeBalloonList([
    { balloonId: 'legend_a', emoji: '🎈' },
    { balloonId: 'legend_b', emoji: '🔥' }
  ]);
  const qstr = buildBouquetShareQuery({
    balloons,
    shareTitle: '测试分享标题',
    posterTitle: '海报标题',
    subtitle: '副标题'
  });
  ok(qstr.indexOf('bq=1') >= 0, '应含 bq=1');
  ok(qstr.indexOf('scene=home') >= 0, '应含 scene=home');
  const params = {};
  qstr.split('&').forEach((pair) => {
    const i = pair.indexOf('=');
    params[pair.slice(0, i)] = decodeURIComponent(pair.slice(i + 1));
  });
  const parsed = parseBouquetShareFromQuery(params);
  ok(parsed && parsed.shareTitle === '测试分享标题', '标题解码');
  ok(parsed.balloons.length === 2, '气球数量');
  ok(parsed.balloons[0].balloonId === 'legend_a', '气球 id');
});

test('赠礼 reasonCode 映射', () => {
  ok(giftReasonMessage({ reasonCode: 'claimed_by_self' }) === GIFT_REASON_COPY.claimed_by_self, 'self');
  ok(giftReasonMessage({ reasonCode: 'expired' }) === GIFT_REASON_COPY.expired, 'expired');
  ok(giftReasonMessage({ reason: '赠送链接不存在' }) === GIFT_REASON_COPY.not_found, 'fallback 不存在');
});

test('邀请 token 仅成功缓存 5 分钟', () => {
  const k = '__bp_invite_ok_tok1';
  delete storage[k];
  ok(!isInviteJoinCached('team1', 'tok1'), '初始无缓存');
  markInviteJoinSuccess('team1', 'tok1');
  ok(isInviteJoinCached('team1', 'tok1'), '成功后应命中');
  ok(!isInviteJoinCached('team2', 'tok1'), 'teamId 不匹配');
  storage[k].ts = Date.now() - CACHE_MS - 1;
  ok(!isInviteJoinCached('team1', 'tok1'), '过期后失效');
});

test('分享图导出：优先 canvas.toTempFilePath', () => {
  const { _exportCanvasToTempFile } = require(path.join(root, 'js/bouquet-share'));
  let used = '';
  global.wx = Object.assign(global.wx || {}, {
    canvasToTempFilePath(opts) {
      opts.fail && opts.fail({ errMsg: 'should not reach wx api' });
    }
  });
  const canvas = {
    toTempFilePath(opts) {
      used = 'canvas';
      opts.success && opts.success({ tempFilePath: '/tmp/poster.png' });
    },
    toDataURL() { return 'data:image/png;base64,' + 'A'.repeat(80); }
  };
  return _exportCanvasToTempFile(canvas, 100, 80).then((p) => {
    ok(used === 'canvas', '应优先 canvas.toTempFilePath');
    ok(p === '/tmp/poster.png', '应返回 canvas 路径');
  });
});

test('分享图导出：wx API 失败时回退 toDataURL', () => {
  const { _exportCanvasToTempFile } = require(path.join(root, 'js/bouquet-share'));
  const written = [];
  global.wx = Object.assign(global.wx || {}, {
    env: { USER_DATA_PATH: '/tmp' },
    getFileSystemManager() {
      return {
        writeFile(opts) {
          written.push(opts.filePath);
          opts.success && opts.success();
        }
      };
    },
    canvasToTempFilePath(opts) {
      opts.fail && opts.fail({ errMsg: 'canvasToTempFilePath:fail invalid viewId' });
    }
  });
  const canvas = {
    toTempFilePath(opts) {
      opts.fail && opts.fail({ errMsg: 'canvas.toTempFilePath:fail' });
    },
    toDataURL() { return 'data:image/png;base64,' + 'A'.repeat(80); }
  };
  return _exportCanvasToTempFile(canvas, 100, 80).then((p) => {
    ok(p && p.indexOf('bouquet_share_') > -1, '应写入本地 png');
    ok(written.length === 1, 'writeFile 被调用');
  });
});

Promise.all(_asyncTests).then(() => {
  console.log('\n通过', passed, '项\n');
  if (process.exitCode) process.exit(1);
});
