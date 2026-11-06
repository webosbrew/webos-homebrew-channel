#!/usr/bin/env node

'use strict';

var BundleSource = require('enyo-dev/lib/Packager/lib/pack-bundle-stream/lib/BundleSource'),
  terser = require('terser');

// enyo-dev's production packer uses UglifyJS 2, which cannot parse modern
// dependencies such as current DOMPurify releases. Keep the Enyo packaging
// flow intact while replacing only its final JavaScript minification step.
BundleSource.prototype.uglify = function () {
  var result;

  if (this.log()) this.log('minifying final output, %d characters', this.src.length);

  try {
    result = terser.minify_sync(this.src, {
      mangle: {
        reserved: ['require', 'request'],
      },
      format: {
        beautify: false,
        semicolons: false,
      },
    });
  } catch (err) {
    throw new Error('failed to minify code for bundle ' + this.bundle.name + ': ' + err.stack);
  }

  if (this.log()) {
    this.log('done minifying, reduced source to %d characters from %d', result.code.length, this.src.length);
  }
  this.src = result.code;
};

require('enyo-dev/bin/enyo');
