var DEFAULT_ORDER = [
  'Media',
  'Games',
  'Ambilight & Art',
  'System',
  'Utilities',
  'Other',
];

function normalizeCategory(raw) {
  var s = raw.trim();
  var lower = s.toLowerCase();
  if (lower === 'system' || lower === 'system & root' || lower === 'root' || lower === 'tweaks') {
    return 'System';
  }
  if (lower === 'media' || lower === 'media & streaming' || lower === 'streaming' || lower === 'video' || lower === 'entertainment') {
    return 'Media';
  }
  if (lower === 'games' || lower === 'game' || lower === 'games & emulators' || lower === 'emulators') {
    return 'Games';
  }
  if (lower === 'screensavers' || lower === 'screensavers & ambilight' || lower === 'ambilight' || lower === 'ambilight & art') {
    return 'Ambilight & Art';
  }
  if (lower === 'utilities' || lower === 'utility' || lower === 'utilities & network' || lower === 'tools' || lower === 'network') {
    return 'Utilities';
  }
  return s;
}

// The category comes from the package metadata (repository entry or appinfo).
// Packages that declare none are listed under 'Other'.
function classifyApp(pkg) {
  var explicit = pkg && (pkg.category || (pkg.manifest && pkg.manifest.category));
  if (typeof explicit === 'string' && explicit.trim().length > 0) {
    return normalizeCategory(explicit);
  }
  return 'Other';
}

function buildCategoryList(models) {
  var counts = {};
  var total = 0;
  for (var i = 0; i < models.length; i++) {
    var cat = models[i].get('category') || 'Other';
    counts[cat] = (counts[cat] || 0) + 1;
    total++;
  }

  var result = [];
  for (var j = 0; j < DEFAULT_ORDER.length; j++) {
    var name = DEFAULT_ORDER[j];
    if (counts[name]) {
      result.push({id: name, label: name, count: counts[name]});
      delete counts[name];
    }
  }
  var extras = Object.keys(counts).sort();
  for (var k = 0; k < extras.length; k++) {
    result.push({id: extras[k], label: extras[k], count: counts[extras[k]]});
  }
  if (total > 0) {
    result.push({id: 'All', label: 'All', count: total});
  }
  return result;
}

module.exports = {
  classifyApp: classifyApp,
  buildCategoryList: buildCategoryList,
};
