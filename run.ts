import * as tsc from "ts2js";
import { TsMinifier } from "./src/tsminifier";


var projectSettings = tsc.ProjectHelper.getProjectConfig( "./src/tsconfig.json" );

var sourceText: string = 'import * as ts from "typescript"; import { TsMinifier } from "./src/tsminifier"; var projectSettings = TsMinifier.ProjectHelper.getProjectConfig( "./src/tsconfig.json" );';

var minModuleResult = TsMinifier.minifyModule( sourceText, "module.ts", projectSettings.compilerOptions, { mangleIdentifiers: true, removeWhitespace: true } );
var minFilesResult = TsMinifier.minify( ["./run.ts", "./src/TsMinifier.ts"], projectSettings.compilerOptions, { mangleIdentifiers: true, removeWhitespace: true } );

console.log( "Minified module text: \n", minModuleResult.emitOutput[0].codeFile.data );
console.log( "Minified files text: \n ", minFilesResult.emitOutput[1].codeFile.data );