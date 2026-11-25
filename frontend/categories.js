var DEFAULT_ORDER = [
  'Media',
  'Games',
  'Ambilight & Art',
  'System',
  'Utilities',
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

function classifyApp(pkg) {
  if (!pkg) {
    return 'Utilities';
  }
  var explicit = pkg.category || (pkg.manifest && pkg.manifest.category);
  if (typeof explicit === 'string' && explicit.trim().length > 0) {
    return normalizeCategory(explicit);
  }

  var text = [
    pkg.id || '',
    pkg.title || '',
    pkg.shortDescription || '',
    (pkg.manifest && pkg.manifest.appDescription) || '',
  ].join(' ').toLowerCase();

  if (/(hbchannel|homebrew|safeupdate|patcher|entware|inputhook|input\s*hook|input\s*mapper|homechooser|home\s*chooser|updateblocker|update\s*blocker|service\s*menu|bluetooth|sound\s*mode|tveroff|vnc|terminal|bridge-64to32|wolkeeper|wol\s*keeper|withoutspying|dev\s*token|decoder\s*bench|privacy\s*hardening)/.test(text)) {
    return 'System';
  }
  if (/(screensaver|idlegif|hyperion|hyperhdr|piccap|ambilight|luma)/.test(text)) {
    return 'Ambilight & Art';
  }
  if (/(game|pinball|doom|retroarch|scummvm|moonlight|aurora|ihsplay|openttd|2048|fruit\s*ninja|emulator|gamestream)/.test(text)) {
    return 'Games';
  }
  if (/(youtube|twitch|jellyfin|kodi|stremio|iptv|crunchyroll|bilitv|kick\s*tv|immich|moonfin|breezyfin|litefin|ocenfin|plxnative|plex|subsonic|tvheadend|cinema|decotv|punktfunk|streamkatze|cccbib|wink|vk\s*video|video|media\s*player|music|audio\s*player|radio)/.test(text)) {
    return 'Media';
  }
  if (pkg.manifest && pkg.manifest.rootRequired === true) {
    return 'System';
  }
  return 'Utilities';
}

function buildCategoryList(models) {
  var counts = {};
  var total = 0;
  for (var i = 0; i < models.length; i++) {
    var cat = models[i].get('category') || 'Utilities';
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
