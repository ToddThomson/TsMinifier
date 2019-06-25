import * as tsc from "ts2js";
import { TsMinifier } from "../src/tsminifier";


/** @nomangle */
var dontMangleMe: number = 6;
var projectSettings = tsc.ProjectHelper.getProjectConfig( "./src/tsconfig.json" );
var sourceText: string = 'import * as ts from "typescript"; import { TsMinifier } from "./src/tsminifier"; var projectSettings = TsMinifier.ProjectHelper.getProjectConfig( "./src/tsconfig.json" );';

//var minModuleResult = TsMinifier.minifyModule( sourceText, "module.ts", projectSettings.compilerOptions, { mangleIdentifiers: true, removeWhitespace: true } );
var minFilesResult = TsMinifier.minify( ["./run.ts" ], projectSettings.compilerOptions, { mangleIdentifiers: true, removeWhitespace: false } );

//console.log( "Minified module text: \n", minModuleResult.emitOutput[0].codeFile.data );
console.log( "Minified files text: \n ", minFilesResult.emitOutput[0].codeFile.data );