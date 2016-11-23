import { CompileOutput } from "./CompileOutput";
import { CachingCompilerHost } from "./CachingCompilerHost";
import { Minifier } from "../Minifier/Minifier";
import { MinifierOptions } from "./MinifierOptions";
import { TsCore } from "../Utils/TsCore";

import * as ts from "typescript";
import * as path from "path";

export class MinifyingCompiler {

    private compilerHost: ts.CompilerHost;
    private compilerOptions: ts.CompilerOptions;
    private minifierOptions: MinifierOptions;

    constructor( compilerOptions: ts.CompilerOptions, minifierOptions: MinifierOptions ) {
        this.compilerOptions = compilerOptions;
        this.minifierOptions = minifierOptions;
        this.compilerHost = new CachingCompilerHost( compilerOptions );
    }
  
    public compileModule( input: string ): CompileOutput {

        function getSourceFile( fileName: string, languageVersion: ts.ScriptTarget, onError?: ( message: string ) => void ): ts.SourceFile {
            if ( fileName === moduleFileName ) {
                return moduleSourceFile;
            }

            // Use base class to get the all source files other than the module
            return defaultGetSourceFile( fileName, languageVersion, onError );
        }

        // Override the compileHost getSourceFile() function to get the bundle source file
        const defaultGetSourceFile = this.compilerHost.getSourceFile;
        this.compilerHost.getSourceFile = getSourceFile;

        const moduleFileName = this.minifierOptions.moduleFileName || ( this.compilerOptions.jsx ? "module.tsx" : "module.ts");
        const moduleSourceFile = ts.createSourceFile( moduleFileName, input, this.compilerOptions.target );

        return this.compileImpl( [moduleFileName] )[0];
    }

    public compile( fileNames: string[] ): CompileOutput[] {
        return this.compileImpl( fileNames );
    }

    private compileImpl( fileNames: string[] ): CompileOutput[] {
        var output: CompileOutput[] = [];
        var outputText: string = "";
        var mapText: string = "";
        var dtsText: string = "";

        const program = ts.createProgram( fileNames, this.compilerOptions, this.compilerHost );

        var preEmitDiagnostics = ts.getPreEmitDiagnostics( program );

        const minifier = new Minifier( program, this.compilerOptions, this.minifierOptions );

        for ( const fileNameIndex in fileNames ) {
            var sourceFile = program.getSourceFile( fileNames[ fileNameIndex ] );
            
            const minSourceFile = minifier.transform( sourceFile );

            const emitResult = program.emit( sourceFile, (fileName: string, content: string) => {
                if ( TsCore.fileExtensionIs( fileName, ".js" ) || TsCore.fileExtensionIs( fileName, ".jsx" ) ) {
                    outputText = content;
                } else if ( TsCore.fileExtensionIs( fileName, "d.ts" ) ) {
                    dtsText = content;
                } else if ( TsCore.fileExtensionIs( fileName, ".map" ) ) {
                    mapText = content;
                }
		    });

            if ( this.minifierOptions.removeWhitespace ) {
                // Whitespace removal cannot be performed in the AST minification transform, so we do it here for now
                outputText = minifier.removeWhitespace( outputText );
            }

            const minifyOutput: CompileOutput = {
                fileName: fileNames[ fileNameIndex ],
                output: outputText,
                mapText: mapText,
                dtsText: dtsText,
                diagnostics: preEmitDiagnostics
            };

            output.push( minifyOutput );
        }

        return output;
    }
}