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

        const fileName = this.minifierOptions.moduleFileName || ( this.compilerOptions.jsx ? "module.tsx" : "module.ts");
        const sourceFile = ts.createSourceFile( fileName, input, this.compilerOptions.target);
        
        return {
            fileName: fileName
        }
    }

    public compile( fileNames: string[] ): CompileOutput[] {
        var output: CompileOutput[] = [];
        var jsText: string = "";
        var mapText: string = "";
        var dtsText: string = "";

        const program = ts.createProgram( fileNames, this.compilerOptions, this.compilerHost );

        // Check for preEmit diagnostics
        var preEmitDiagnostics = ts.getPreEmitDiagnostics( program );

        const minifier = new Minifier( program, this.compilerOptions, { mangleIdentifiers: true, removeWhitespace: true } );

        for ( const fileNameIndex in fileNames ) {
            var sourceFile = program.getSourceFile( fileNames[ fileNameIndex ] );
            const minSourceFile = minifier.transform( sourceFile );

            const emitResult = program.emit( sourceFile, (fileName: string, content: string) => {
                console.log( fileName );

                if ( TsCore.fileExtensionIs( fileName, ".js" ) ) {
                    jsText = content;
                } else {
                }
		    });

            // Whitespace removal cannot be performed in the AST minification transform, so we do it here for now
            jsText = minifier.removeWhitespace( jsText );

            const minifyOutput: CompileOutput = {
                fileName: fileNames[ fileNameIndex ],
                output: jsText,
                mapText: mapText,
                dtsText: dtsText,
                diagnostics: preEmitDiagnostics
            };

            output.push( minifyOutput )
        }

        return output;
    }
}