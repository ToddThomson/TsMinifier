import { CompilerOutput, CompilerResult, CompilerFile } from "ts2js";
import { Minifier } from  "../Minifier/Minifier";
import { MinifierOptions } from "../Minifier/MinifierOptions";
import { TsCore } from "../Utils/TsCore";

import * as ts from "typescript";
import * as tscompiler from "ts2js";
import * as path from "path";

export class MinifyingCompiler extends tscompiler.Compiler {

    private minifierOptions: MinifierOptions;

    constructor( compilerOptions: ts.CompilerOptions, minifierOptions: MinifierOptions, host?: ts.CompilerHost ) {
        super( compilerOptions, host );

        this.minifierOptions = minifierOptions;
    }
  
    protected emit(): CompilerResult {
        var output: CompilerOutput[] = [];
        
        var codeFile: CompilerFile;
        var mapFile: CompilerFile;
        var dtsFile: CompilerFile;

        // Modify compiler options for the minifiers purposes
        const options = this.options;

        options.noEmit = undefined;
        options.declaration = undefined;
        options.declarationDir = undefined;
        options.out = undefined;
        options.outFile = undefined;

        var allDiagnostics = ts.getPreEmitDiagnostics( this.program );
                    
        if ( this.options.noEmitOnError && ( preEmitDiagnostics.length > 0 ) ) {
            return { 
                diagnostics: allDiagnostics,
                emitSkipped: true 
            }; 
        }

        const fileNames = this.program.getRootFileNames();

        const minifier = new Minifier( this.program, this.options, this.minifierOptions );

        for ( const fileNameIndex in fileNames ) {
            var sourceFile = this.program.getSourceFile( fileNames[ fileNameIndex ] );
            
            var preEmitDiagnostics = ts.getPreEmitDiagnostics( this.program, sourceFile );

            // We don't emit on errors - what's the point!?!
            if ( preEmitDiagnostics.length > 0 ) {
                output.push( { 
                    fileName: fileNames[ fileNameIndex ],
                    emitSkipped: true, 
                    diagnostics: preEmitDiagnostics } );
                
                continue;
            }

            if ( this.minifierOptions.mangleIdentifiers ) {
                sourceFile = minifier.transform( sourceFile );
            }

            const emitResult = this.program.emit( sourceFile, (fileName: string, data: string, writeByteOrderMark: boolean ) => {
                var file: CompilerFile = { fileName: fileName, data: data, writeByteOrderMark: writeByteOrderMark };

                if ( TsCore.fileExtensionIs( fileName, ".js" ) || TsCore.fileExtensionIs( fileName, ".jsx" ) ) {
                    codeFile = file;
                } else if ( TsCore.fileExtensionIs( fileName, "d.ts" ) ) {
                    dtsFile = file;
                } else if ( TsCore.fileExtensionIs( fileName, ".map" ) ) {
                    mapFile = file;
                }
		    });

            if ( !emitResult.emitSkipped && this.minifierOptions.removeWhitespace ) {
                // Whitespace removal cannot be performed in the AST minification transform, so we do it here for now
                codeFile.data = minifier.removeWhitespace( codeFile.data );
            }

            const minifyOutput: CompilerOutput = {
                fileName: fileNames[ fileNameIndex ],
                emitSkipped: emitResult.emitSkipped,
                codeFile: codeFile,
                mapFile: mapFile,
                dtsFile: dtsFile,
                diagnostics: emitResult.diagnostics
            };

            output.push( minifyOutput );
        }

        return {
            emitSkipped: false,
            emitOutput: output,
            diagnostics: allDiagnostics
        }
    }
}