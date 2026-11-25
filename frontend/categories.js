// App categories, as webosbrew's apps repository defines them: each package's source YAML has a `category`
// (multimedia, game, amblight, screensaver, launcher, utility, system, internet).
//
// A repository entry's own `category` is used when it has one. The published API (apps.json) does not carry it yet,
// and third-party repositories have none, so known apps are looked up in a table copied from webosbrew's package
// files (plus the third-party apps in common repositories), and other apps are placed by keywords in their title,
// id and description. Root-only tools that match nothing go to System.

var CATEGORIES = [
  {
    id: 'multimedia',
    title: 'Multimedia',
    ids: [
      // webosbrew
      'com.amazoff.patcher', 'com.barisahmet.kicktv', 'com.beb.plxnative', 'com.biliwebos.app', 'com.breezyfin.app',
      'com.cheerchen.decotv', 'com.crunchyroll.stream.app', 'com.crunchyroll.webos', 'com.github.prijkes.tveroff',
      'com.immich.webos', 'com.lennylxx.iptv', 'com.ocenfin.app', 'com.qoder.iptv', 'com.seeky91.immichtv',
      'com.sendspin.cinema', 'com.subsonic.player', 'com.willinux.tvh.app', 'io.github.beatcracker.decoderbench',
      'me.mariotaku.gallery3d', 'org.jellyfin.webos', 'org.litefin.app', 'org.moonfin.webos', 'org.webosbrew.cccbib',
      'org.webosbrew.streamkatze', 'tv.stremioorigin.app', 'youtube.leanback.v4', 'org.xbmc.kodi',
      // Other repositories
      'org.csweb.tv', 'org.csweb.tv.legacy', 'com.sostk.nativejelly', 'torrserv.matrix.app', 'com.ottplay.app',
      'com.ssiptv.app', 'siptv', 'icva', 'vkvideo', 'yota.play', 'com.huawei.app.webos.mts.tv.production',
      'ru.rt.video.app.tv', 'com.685631.3411', 'lampa.tv', 'kinoflex.ru', 'lgsmarttv', 'spotify-beehive', 'com.tidal.tv',
    ],
    keywords: /\b(iptv|m3u|jellyfin|plex|emby|kodi|youtube|twitch|stream(ing)?|video|movies?|films?|series|anime|tvheadend|player|music|audio|radio|podcasts?|photos?|gallery)\b/i,
  },
  {
    id: 'game',
    title: 'Games',
    ids: [
      'com.gabrielecirulli.app2048.webos', 'com.github.k4zmu2a.space-cadet-pinball', 'com.halfbrick.fruitninja',
      'com.leondrolio.x.openttd', 'com.limelight.webos', 'com.retroarch.webos', 'io.unom.punktfunk.client-webos',
      'org.chocolate-doom.demo', 'org.scummvm.scummvm', 'org.mariotaku.ihsplay',
      'com.boosteroidtv.streaming', 'com.geforcenow.play',
    ],
    keywords: /\b(games?|gaming|emulat(or|ion)|arcade|puzzle|gamestream|steam link)\b/i,
  },
  {
    id: 'internet',
    title: 'Internet',
    ids: ['com.tbsniller.smarttwitchwebostv', 'io.github.sarahahzub.chromium', 'twitch.adamffdev.v1',
      'org.sostk.wpebrowser', 'wikipedia.app'],
    keywords: /\b(browser|web ?kit|chromium|wikipedia)\b/i,
  },
  {
    id: 'amblight',
    title: 'Ambient Light',
    ids: ['org.webosbrew.hyperhdr.loader', 'org.webosbrew.hyperion.ng.loader', 'org.webosbrew.piccap', 'ui30'],
    keywords: /\b(ambilight|ambient light|hyperion|hyperhdr|led strips?)\b/i,
  },
  {
    id: 'screensaver',
    title: 'Screensavers',
    ids: ['org.aabytt.webos.custom-screensaver-aerial', 'org.oted.idlegif', 'org.rchalaaa.webos.custom-screensaver',
      'org.webosbrew.custom-screensaver'],
    keywords: /\bscreensavers?\b/i,
  },
  {
    id: 'launcher',
    title: 'Launchers',
    ids: ['com.ecklf.luma', 'org.webosbrew.homechooser'],
    keywords: /\blaunchers?\b/i,
  },
  {
    id: 'utility',
    title: 'Utilities',
    ids: [
      'org.webosbrew.appupdateblocker', 'org.webosbrew.inputhook', 'com.github.cfernande1470.wireguard',
      'com.github.dangerouslaser.wolkeeper', 'com.github.gprot42.webosterminal', 'com.open.hidden.menu',
      'org.webosbrew.vncserver', 'pl.krzywro.webos-bluetooth-disabler',
      'webos.xray.cfg', 'webos.screen.off', 'webos.energy.saving',
    ],
    keywords: /\b(vpn|wireguard|proxy|terminal|vnc|remap(per)?|blocker|service menu|wake-on-lan)\b/i,
  },
  {
    id: 'system',
    title: 'System',
    ids: ['com.pirate.refresh', 'com.sk.app.lgtv-vpn', 'eu.depau.webos.soundmodefix', 'ooo.lew.lifesgoodwithoutspying',
      'org.webosbrew.bridge-64to32', 'org.webosbrew.hbchannel', 'org.webosbrew.safeupdate'],
    keywords: /\b(system|firmware|root)\b/i,
  },
];

var OTHER = {id: 'other', title: 'Other'};

// Other spellings of the same categories, as other repositories may write them.
var ALIASES = {
  games: 'game', gaming: 'game', ambilight: 'amblight', 'ambient-light': 'amblight', screensavers: 'screensaver',
  launchers: 'launcher', utilities: 'utility', tools: 'utility', media: 'multimedia', video: 'multimedia',
  web: 'internet', browser: 'internet',
};

var bySlug = {};
var byId = {};
CATEGORIES.forEach(function (category) {
  bySlug[category.id] = category;
  category.ids.forEach(function (id) { byId[id] = category; });
});

// Categories a repository names that are not in the list above, shown after it under their own name.
var extra = [];

function fromRepository(value) {
  if (typeof value !== 'string') return null;
  var slug = value.trim().toLowerCase();
  if (!slug) return null;
  slug = ALIASES[slug] || slug;
  if (slug === OTHER.id) return OTHER;
  if (!bySlug[slug]) {
    bySlug[slug] = {id: slug, title: slug.charAt(0).toUpperCase() + slug.slice(1)};
    extra.push(bySlug[slug]);
  }
  return bySlug[slug];
}

/**
 * The category of a repository package entry.
 */
function categoryOf(pkg) {
  if (!pkg) return OTHER;
  var category = fromRepository(pkg.category) || byId[pkg.id];
  if (category) return category;

  var manifest = pkg.manifest || {};
  var text = [pkg.title, pkg.id, pkg.shortDescription, manifest.appDescription].join(' ');
  for (var i = 0; i < CATEGORIES.length; i++) {
    if (CATEGORIES[i].keywords.test(text)) return CATEGORIES[i];
  }
  if (manifest.rootRequired === true) return bySlug.system;
  return OTHER;
}

/**
 * Every category in display order, Other last.
 */
function all() {
  return CATEGORIES.concat(extra, [OTHER]);
}

module.exports = {
  categoryOf: categoryOf,
  all: all,
  OTHER: OTHER,
};
