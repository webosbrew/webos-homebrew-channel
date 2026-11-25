// App categories, from the `category` a repository gives each app (webosbrew's package files have one of
// multimedia, game, amblight, screensaver, launcher, utility, internet, system). Known categories are listed in the
// order of the website's home page, then Internet and System; others a repository uses follow under their own name,
// and apps without a category go under Other.

var CATEGORIES = [
  {id: 'multimedia', title: 'Multimedia'},
  {id: 'game', title: 'Games'},
  {id: 'amblight', title: 'Ambient Light'},
  {id: 'screensaver', title: 'Screensavers'},
  {id: 'launcher', title: 'Launchers'},
  {id: 'utility', title: 'Utilities'},
  {id: 'internet', title: 'Internet'},
  {id: 'system', title: 'System'},
];

var OTHER = {id: 'other', title: 'Other'};

var bySlug = {};
CATEGORIES.forEach(function (category) {
  bySlug[category.id] = category;
});

// Categories a repository names that are not in the list above, shown after it.
var extra = [];

/**
 * The category of a repository package entry: its own `category`, or Other.
 */
function categoryOf(pkg) {
  var value = pkg && pkg.category;
  if (typeof value !== 'string' || !value.trim()) return OTHER;
  var slug = value.trim().toLowerCase();
  if (slug === OTHER.id) return OTHER;
  if (!bySlug[slug]) {
    bySlug[slug] = {id: slug, title: slug.charAt(0).toUpperCase() + slug.slice(1)};
    extra.push(bySlug[slug]);
  }
  return bySlug[slug];
}

/**
 * Whether any of the packages has a category; without any, there is nothing to group by.
 */
function anyCategorized(packages) {
  return (packages || []).some(function (pkg) { return categoryOf(pkg) !== OTHER; });
}

/**
 * Every category in display order, Other last.
 */
function all() {
  return CATEGORIES.concat(extra, [OTHER]);
}

module.exports = {
  categoryOf: categoryOf,
  anyCategorized: anyCategorized,
  all: all,
  OTHER: OTHER,
};
