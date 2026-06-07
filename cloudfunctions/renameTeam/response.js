function ok(data, msg) {
  return { success: true, msg: msg || 'ok', data: data || {} }
}

function fail(msg, data) {
  return { success: false, msg: msg || 'fail', data: data || {} }
}

module.exports = { ok, fail }
