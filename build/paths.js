var path = require( 'path' );

var sourceRoot = 'src/';
var buildRoot = 'built/';
var releaseRoot = 'lib/';
var bundleRoot = 'bundle/'
var testRoot = './tests/spec/'

module.exports = {
    root: sourceRoot,
    tests: testRoot + '**/*.js',
    sourceTsConfig: sourceRoot + 'tsconfig.json',
    source: sourceRoot + '**/*.ts',
    output: buildRoot,
    main: buildRoot + sourceRoot + bundleRoot + 'TsMinifier.js',
    typings: buildRoot + sourceRoot + bundleRoot + 'TsMinifier.d.ts',
    release: releaseRoot
};

