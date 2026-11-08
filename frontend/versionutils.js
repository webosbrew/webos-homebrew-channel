function versionHigher(oldVer, newVer) {
  if (typeof oldVer !== 'string' || typeof newVer !== 'string') return false

  var oldParts = oldVer.split('.')
  var newParts = newVer.split('.')
  for (var i = 0; i < newParts.length; i++) {
    var a = ~~newParts[i] // parse int
    var b = ~~oldParts[i] // parse int
    if (a > b) return true
    if (a < b) return false
  }
  return false
}

module.exports = {
  versionHigher: versionHigher,
};
