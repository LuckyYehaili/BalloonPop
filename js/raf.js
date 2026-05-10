function now() {
  return Date.now();
}

function createRaf() {
  let id = 0;
  const timers = new Map();

  function requestAnimationFrame(cb) {
    id += 1;
    const handle = id;
    const start = now();
    const timer = setTimeout(() => {
      timers.delete(handle);
      cb(now() - start);
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
