import { CompileOutput } from "./CompileOutput";
import { Minifier } from "../Minifier/Minifier";
import { MinifierOptions } from "../Minifier/MinifierOptions";
import { format } from "../Utils/formatter";
import { TsCore } from "../Utils/TsCore";

import * as ts from "typescript";
import * as tscompiler from "ts2js";
import * as path from "path";

export class MinifyingCompiler extends tscompiler.Compiler {

    private minifierOptions: MinifierOptions;

    constructor( compilerOptions: ts.CompilerOptions, minifierOptions: MinifierOptions ) {
        super( compilerOptions );

        this.minifierOptions = minifierOptions;
    }
  
    protected compileImpl( fileNames: string[] ): CompileOutput[] {
        var output: CompileOutput[] = [];
        var outputText: string;
        var mapText: string;
        var dtsText: string;
        var formattedText: string;

        // Modify compiler options for the minifiers purposes
        const options = this.compilerOptions;

        options.noEmit = undefined;
        options.noEmitOnError = true;
        options.declaration = undefined;
        options.declarationDir = undefined;
        options.out = undefined;
        options.outFile = undefined;

        const program = ts.createProgram( fileNames, options, this.compilerHost );

        const minifier = new Minifier( program, this.compilerOptions, this.minifierOptions );

        for ( const fileNameIndex in fileNames ) {
            var sourceFile = program.getSourceFile( fileNames[ fileNameIndex ] );
            
            var preEmitDiagnostics = ts.getPreEmitDiagnostics( program, sourceFile );

            // We don't emit on errors - what's the point!?!
            if ( preEmitDiagnostics.length > 0 ) {
                output.push( { 
                    fileName: fileNames[ fileNameIndex ],
                    emitSkipped: true, 
                    diagnostics: preEmitDiagnostics } );
                
                continue;
            }

            if ( this.minifierOptions.mangleIdentifiers ) {
                const minSourceFile = minifier.transform( sourceFile );
                
                // Prettify the minified source file text
                formattedText = format( minSourceFile );
            }

            const emitResult = program.emit( sourceFile, (fileName: string, content: string) => {
                if ( TsCore.fileExtensionIs( fileName, ".js" ) || TsCore.fileExtensionIs( fileName, ".jsx" ) ) {
                    outputText = content;
                } else if ( TsCore.fileExtensionIs( fileName, "d.ts" ) ) {
                    dtsText = content;
                } else if ( TsCore.fileExtensionIs( fileName, ".map" ) ) {
                    mapText = content;
                }
		    });

            if ( !emitResult.emitSkipped && this.minifierOptions.removeWhitespace ) {
                // Whitespace removal cannot be performed in the AST minification transform, so we do it here for now
                outputText = minifier.removeWhitespace( outputText );
            }

            const minifyOutput: CompileOutput = {
                fileName: fileNames[ fileNameIndex ],
                emitSkipped: emitResult.emitSkipped,
                text: formattedText,
                output: outputText,
                mapText: mapText,
                dtsText: dtsText,
                diagnostics: emitResult.diagnostics
            };

            output.push( minifyOutput );
        }

        return output;
    }
}