import { TsMinifier } from "./src/tsminifier";

var projectSettings = TsMinifier.ProjectHelper.getProjectConfig( "./src/tsconfig.json" );

var sourceText: string = 'import * as ts from "typescript"; import * as TsMinifier from "./src/tsminifier"; var projectSettings = TsMinifier.ProjectHelper.getProjectConfig( "./src/tsconfig.json" );';

var minModuleResult = TsMinifier.minifyModule( sourceText, "module.ts", projectSettings.compilerOptions, { mangleIdentifiers: true, removeWhitespace: true } );
var minFilesResult = TsMinifier.minify( ["./run.ts", "./src/TsMinifier.ts"], projectSettings.compilerOptions, { mangleIdentifiers: true, removeWhitespace: true } );

console.log( "Minified module text: \n", minModuleResult.emitOutput[0].text );
console.log( "Minified files text: \n ", minFilesResult.emitOutput[1].text );