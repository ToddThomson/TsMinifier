import * as ts from "typescript";
import * as tsc from "ts2js";
import { TsCore } from "../../TsToolsCommon/src/typescript/Core"
import { Minifier } from "./Minifier/Minifier";
import { MinifierOptions } from "./Minifier/MinifierOptions";
import { MinifierResult } from "./Minifier/MinifierResult";
import { WhitespaceMinifier } from "./Minifier/WhitespaceTransform";
import { MinifierTransform } from "./Minifier/MinifierTransform";
import { format } from "../../TsToolsCommon/src/Utils/formatter";

// TsMinifier API..
export { MinifierOptions };
export { MinifierResult };

export namespace TsMinifier {

    /**
    * Gets the TsMinifier identifier minification transformation callback function
    * used to minify a source file identifiers.
    *
    * @param program Optional
    * @param options Optional bundler options.
    * @returns The bundler transform factory callback function.
    */
    export function getMinifierTransform( program: ts.Program, options?: MinifierOptions ): ts.TransformerFactory<ts.SourceFile> {
        const minifierTransform = new MinifierTransform( options );
        return ( context: ts.TransformationContext ) => minifierTransform.transform( program, context );
    }

    export function getWhitespaceTransform( program: ts.Program, options?: MinifierOptions ): ts.TransformerFactory<ts.SourceFile> {
        const whitespaceTransform = new WhitespaceMinifier();
        return ( context: ts.TransformationContext ) => whitespaceTransform.transform( program, context );
    }

    export function minify( fileNames: string[], compilerOptions: ts.CompilerOptions, minifierOptions?: MinifierOptions  ): MinifierResult {
        const minifierPlugin = new MinifierTransform( minifierOptions );
        const compiler = new tsc.Compiler( compilerOptions );

        var compileResult = compiler.compile( fileNames );

        return {
            emitSkipped: true,
            diagnostics: compileResult.getErrors()
        }
    }

    export function minifyModule( input: string, moduleFileName: string, compilerOptions: ts.CompilerOptions, minifierOptions?: MinifierOptions  ): MinifierResult {
        const minifierPlugin = new MinifierTransform( minifierOptions );
        const compiler = new tsc.Compiler( compilerOptions ); //, minifierPlugin );

        var compileResult = compiler.compileModule( input, moduleFileName );

        return {
            emitSkipped: true,
            diagnostics: compileResult.getErrors()
        }
    }

    export function minifyProject( configFilePath: string, minifierOptions?: MinifierOptions ): MinifierResult {
        const config = TsCore.getProjectConfig( configFilePath );

        if ( config.errors.length > 0 ) {
            return {
                emitSkipped: true,
                diagnostics: config.errors
            }
        }

        return minify( config.fileNames, config.options, minifierOptions )
    }

    export function prettify( input: string ): string {
        return format( input );
    }
}