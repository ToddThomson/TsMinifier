import * as TsMinifier from "./src/tsminifier";

var projectSettings = TsMinifier.ProjectHelper.getProjectConfig( "./src/tsconfig.json" );

var sourceText: string = 'import * as ts from "typescript"; import * as TsMinifier from "./src/tsminifier"; var projectSettings = TsMinifier.ProjectHelper.getProjectConfig( "./src/tsconfig.json" );';

var minModule = TsMinifier.minifyModule( sourceText, projectSettings.compilerOptions, { mangleIdentifiers: true, removeWhitespace: true } );
var minFiles = TsMinifier.minify( ["./run.ts", "./src/TsMinifier.ts"], projectSettings.compilerOptions, { mangleIdentifiers: true, removeWhitespace: true } );

console.log( "Minified module text: \n", minModule.text );
console.log( "Minified module output: \n", minModule.output );
console.log( "Minified run.ts text: \n", minFiles[0].text );
console.log( "Minified TsMinifier output: \n ", minFiles[1].output );