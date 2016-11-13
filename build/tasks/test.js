var gulp = require('gulp');
var runSequence = require('run-sequence');
var paths = require('../paths');
var tsproject = require('../../src/tsproject.js');

gulp.task('ts', function () {
    return tsproject.src( paths.testDir + "issues/no93/tsconfig.json", { logLevel: 0 })
        .pipe( gulp.dest( "./" ));
});

gulp.task( 'test', function( done ) {
    return runSequence(
        'clean',
        ['ts'],
        done
    );
});
