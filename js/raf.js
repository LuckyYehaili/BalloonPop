function now() {
  return Date.now();
}

function createRaf() {
  let id = 0;
  const timers = new Map();
  // 用模块加载时刻作为时间原点，回调接收"自启动累计的毫秒数"，
  // 对齐浏览器 requestAnimationFrame(DOMHighResTimeStamp) 语义，
  // 这样基于 time 做相位计算的动画（首页粒子/装饰气球/Logo float、战队页粒子等）才会真正动起来。
  const origin = now();

  function requestAnimationFrame(cb) {
    id += 1;
    const handle = id;
    const timer = setTimeout(() => {
      timers.delete(handle);
      cb(now() - origin);
    }, 16);
    timers.set(handle, timer);
    return handle;
  }

  function cancelAnimationFrame(handle) {
    const timer = timers.get(handle);
    if (timer) clearTimeout(timer);
    timers.delete(handle);
  }

  return { requestAnimationFrame, cancelAnimationFrame };
}

module.exports = { createRaf };
