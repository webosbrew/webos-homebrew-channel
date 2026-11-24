var semver = require('semver');

var MAX_WEBOS_RANGE_LENGTH = 256;
var RANGE_CLAUSE = /^(?:(?:>=|<=|>|<|=|~|\^)\s*)?\d+(?:\.\d+){0,2}$/;
var BARE_VERSION = /^\d+(?:\.\d+){0,2}$/;

function check(id, status, requirement, actual, message) {
  return {
    id: id,
    status: status,
    requirement: requirement,
    actual: actual,
    message: message
  };
}

function normalizeWebosRange(requirement) {
  if (typeof requirement !== 'string') return null;

  var range = requirement.trim();
  if (!range || range.length > MAX_WEBOS_RANGE_LENGTH) return null;

  var clauses = range.split(',');
  var normalized = [];

  for (var i = 0; i < clauses.length; i++) {
    var clause = clauses[i].trim();
    if (!RANGE_CLAUSE.test(clause)) return null;

    // Cargo treats a bare version as a caret requirement; npm treats it as an x-range.
    normalized.push(BARE_VERSION.test(clause) ? '^' + clause : clause);
  }

  range = normalized.join(' ');
  return semver.validRange(range) ? range : null;
}

function evaluateWebosRelease(requirement, actual) {
  var normalized = normalizeWebosRange(requirement);
  if (!normalized) {
    return check(
      'webosRelease',
      'unsupported',
      requirement,
      actual,
      'HBC could not interpret this app\'s webOS requirement.'
    );
  }

  if (typeof actual !== 'string' || !semver.valid(actual)) {
    return check(
      'webosRelease',
      'unknown',
      requirement,
      actual,
      'This app requires webOS ' + requirement + '. HBC could not determine the TV\'s version.'
    );
  }

  if (!semver.satisfies(actual, normalized)) {
    return check(
      'webosRelease',
      'fail',
      requirement,
      actual,
      'This app requires webOS ' + requirement + '. This TV runs webOS ' + actual + '.'
    );
  }

  return check('webosRelease', 'pass', requirement, actual, 'webOS requirement is satisfied.');
}

function evaluateDeviceSoC(requirement, actual) {
  if (!Array.isArray(requirement) || requirement.some(function (entry) {
    return typeof entry !== 'string' || !entry.trim() || entry.trim() === '!';
  })) {
    return check('deviceSoC', 'unsupported', requirement, actual, 'HBC could not interpret this app\'s SoC requirement.');
  }

  if (typeof actual !== 'string' || !actual.trim()) {
    return check('deviceSoC', 'unknown', requirement, actual, 'This app has a SoC requirement. HBC could not determine the TV\'s SoC.');
  }

  var allowed = [];
  var excluded = [];
  requirement.forEach(function (entry) {
    entry = entry.trim();
    if (entry.charAt(0) === '!') excluded.push(entry.slice(1));
    else allowed.push(entry);
  });

  if (excluded.indexOf(actual) !== -1) {
    return check('deviceSoC', 'fail', requirement, actual, 'This app does not support the ' + actual + ' SoC.');
  }

  if (allowed.length && allowed.indexOf(actual) === -1) {
    return check(
      'deviceSoC',
      'fail',
      requirement,
      actual,
      'This app does not support the ' + actual + ' SoC.'
    );
  }

  return check('deviceSoC', 'pass', requirement, actual, 'Device SoC requirement is satisfied.');
}

function evaluateRootRequired(requirement, actual) {
  if (requirement !== true) {
    return check('rootRequired', 'unsupported', requirement, actual, 'HBC could not interpret this app\'s root requirement.');
  }

  if (typeof actual !== 'boolean') {
    return check('rootRequired', 'unknown', requirement, actual, 'This app requires root. HBC could not determine whether it is running as root.');
  }

  if (!actual) {
    return check(
      'rootRequired',
      'fail',
      requirement,
      actual,
      'This app requires root. HBC is unelevated.'
    );
  }

  return check('rootRequired', 'pass', requirement, actual, 'Root requirement is satisfied.');
}

function evaluateCompatibility(packageInfo, context) {
  packageInfo = packageInfo || {};
  context = context || {};

  var checks = [];
  var requirements = packageInfo.requirements;
  var hasRequirements = requirements && typeof requirements === 'object' && !Array.isArray(requirements);

  if (requirements !== undefined && !hasRequirements) {
    checks.push(check('webosRelease', 'unsupported', requirements, null, 'HBC could not interpret this app\'s compatibility requirements.'));
  } else if (hasRequirements) {
    if (Object.prototype.hasOwnProperty.call(requirements, 'webosRelease')) {
      checks.push(evaluateWebosRelease(requirements.webosRelease, context.webosRelease));
    }
    if (Object.prototype.hasOwnProperty.call(requirements, 'deviceSoC')) {
      checks.push(evaluateDeviceSoC(requirements.deviceSoC, context.deviceSoC));
    }
  }

  if (packageInfo.rootRequired === true) {
    checks.push(evaluateRootRequired(true, context.root));
  } else if (
    packageInfo.rootRequired !== undefined &&
    packageInfo.rootRequired !== null &&
    packageInfo.rootRequired !== false &&
    packageInfo.rootRequired !== 'optional'
  ) {
    checks.push(evaluateRootRequired(packageInfo.rootRequired, context.root));
  }

  var hasFailure = checks.some(function (item) { return item.status === 'fail'; });
  var hasUncertainty = checks.some(function (item) {
    return item.status === 'unknown' || item.status === 'unsupported';
  });

  return {
    status: hasFailure ? 'incompatible' : hasUncertainty ? 'indeterminate' : 'compatible',
    checks: checks
  };
}

function decideCompatibility(report) {
  var reasons = report.checks.filter(function (item) {
    return item.status === 'fail';
  }).map(function (item) {
    return item.message;
  });

  return {
    disposition: reasons.length ? 'confirm' : 'allow',
    reasons: reasons
  };
}

module.exports = {
  decideCompatibility: decideCompatibility,
  evaluateCompatibility: evaluateCompatibility,
  evaluateWebosRelease: evaluateWebosRelease
};
