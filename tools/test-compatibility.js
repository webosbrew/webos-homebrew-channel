const assert = require('assert');

const { decideCompatibility, evaluateCompatibility, evaluateWebosRelease } = require('../frontend/packageCompatibility');

function findCheck(report, id) {
  return report.checks.find((item) => item.id === id);
}

assert.strictEqual(evaluateWebosRelease('>=7.0', '7.0.0').status, 'pass');
assert.strictEqual(evaluateWebosRelease('>=7.0', '6.9.9').status, 'fail');
assert.strictEqual(evaluateWebosRelease('>=4.0, <8.0', '7.3.1').status, 'pass');
assert.strictEqual(evaluateWebosRelease('4.0', '4.9.0').status, 'pass');
assert.strictEqual(evaluateWebosRelease('4.0', '5.0.0').status, 'fail');
assert.strictEqual(evaluateWebosRelease('>=4.0 || >=7.0', '7.0.0').status, 'unsupported');
assert.strictEqual(evaluateWebosRelease('4.0 - 7.0', '5.0.0').status, 'unsupported');
assert.strictEqual(evaluateWebosRelease('', '7.0.0').status, 'unsupported');
assert.strictEqual(evaluateWebosRelease('>=4.0', null).status, 'unknown');
assert.strictEqual(evaluateWebosRelease('>=4.0', 'not-a-version').status, 'unknown');
assert.strictEqual(evaluateWebosRelease('>' + '1'.repeat(256), '7.0.0').status, 'unsupported');

let report = evaluateCompatibility({ requirements: { deviceSoC: ['!k5lp'] } }, { deviceSoC: 'k5lp' });
assert.strictEqual(findCheck(report, 'deviceSoC').status, 'fail');
assert.strictEqual(report.status, 'incompatible');

report = evaluateCompatibility({ requirements: { deviceSoC: ['o22', 'o24'] } }, { deviceSoC: 'o24' });
assert.strictEqual(findCheck(report, 'deviceSoC').status, 'pass');

report = evaluateCompatibility({ requirements: { deviceSoC: ['!k5lp'] } }, { deviceSoC: 'o22' });
assert.strictEqual(findCheck(report, 'deviceSoC').status, 'pass');

report = evaluateCompatibility({ requirements: { deviceSoC: ['k5lp', '!k5lp'] } }, { deviceSoC: 'k5lp' });
assert.strictEqual(findCheck(report, 'deviceSoC').status, 'fail');

report = evaluateCompatibility({ requirements: { deviceSoC: ['o22'] } }, { deviceSoC: 'k5lp' });
assert.strictEqual(findCheck(report, 'deviceSoC').status, 'fail');

report = evaluateCompatibility({ requirements: { deviceSoC: ['o22'] } }, { deviceSoC: null });
assert.strictEqual(findCheck(report, 'deviceSoC').status, 'unknown');
assert.strictEqual(report.status, 'indeterminate');

report = evaluateCompatibility({ requirements: { deviceSoC: ['!'] } }, { deviceSoC: 'o22' });
assert.strictEqual(findCheck(report, 'deviceSoC').status, 'unsupported');

report = evaluateCompatibility({ rootRequired: true }, { root: false });
assert.strictEqual(findCheck(report, 'rootRequired').status, 'fail');
assert.strictEqual(decideCompatibility(report).disposition, 'confirm');

report = evaluateCompatibility({ rootRequired: true }, { root: true });
assert.strictEqual(findCheck(report, 'rootRequired').status, 'pass');

report = evaluateCompatibility({ rootRequired: 'optional' }, { root: false });
assert.strictEqual(report.checks.length, 0);

report = evaluateCompatibility({ rootRequired: 'yes' }, { root: true });
assert.strictEqual(findCheck(report, 'rootRequired').status, 'unsupported');

report = evaluateCompatibility(
  { rootRequired: true, requirements: { webosRelease: '>=7.0', deviceSoC: ['o22'] } },
  { root: false, webosRelease: null, deviceSoC: null },
);
assert.strictEqual(report.status, 'incompatible');
assert.strictEqual(decideCompatibility(report).disposition, 'confirm');
assert.strictEqual(decideCompatibility(report).reasons.length, 1);

report = evaluateCompatibility({ requirements: { webosRelease: '>=7.0' } }, { webosRelease: null });
assert.strictEqual(decideCompatibility(report).disposition, 'allow');

report = evaluateCompatibility({}, {});
assert.strictEqual(report.status, 'compatible');
assert.strictEqual(report.checks.length, 0);
assert.strictEqual(decideCompatibility(report).disposition, 'allow');

['compatible', 'incompatible', 'indeterminate'].forEach((status) => {
  const sample = { status, checks: status === 'incompatible' ? [{ status: 'fail', message: 'failure' }] : [] };
  assert.notStrictEqual(decideCompatibility(sample).disposition, 'block');
});

console.info('Compatibility tests passed.');
