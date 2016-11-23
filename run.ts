import * as TsMinifier from "./src/tsminifier";

var projectSettings = TsMinifier.ProjectHelper.getProjectConfig( "./src/tsconfig.json" );

var minFiles = TsMinifier.minify( ["./run.ts", "./src/TsMinifier.ts"], projectSettings.compilerOptions, { removeWhitespace: false } );

console.log( "Minified file text: ", minFiles[0].output );
console.log( "Minified file text: ", minFiles[1].output );