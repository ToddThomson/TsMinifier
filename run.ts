import * as TsMinifier from "./src/tsminifier";

var projectSettings = TsMinifier.getProjectConfig( "./src/tsconfig.json" );

var minFile = TsMinifier.minify( "./run.ts", projectSettings.compilerOptions );

console.log( "Minified file text: ", minFile.outputText );