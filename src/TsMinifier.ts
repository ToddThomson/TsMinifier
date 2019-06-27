import * as ts from "typescript";
import * as tsc from "ts2js";
import { Minifier } from "./Minifier/Minifier";
import { MinifierOptions } from "./Minifier/MinifierOptions";
import { MinifierResult } from "./Minifier/MinifierResult";
import { MinifierTransform } from "./Minifier/MinifierTransform";
import { format } from "@TsToolsCommon/Utils/formatter";

// TsMinifier API..
export { MinifierOptions };
export { MinifierResult };

export function getMinifierTransform( host: ts.CompilerHost, program: ts.Program, options: MinifierOptions ): ts.TransformerFactory<ts.SourceFile> {
    const minifierTransform = new MinifierTransform( options );
    return ( context: ts.TransformationContext ) => minifierTransform.transform( host, program, context );
}

export namespace TsMinifier {
    exports.TsMinifier.Minifier = Minifier;

    export function minify( fileNames: string[], compilerOptions: ts.CompilerOptions, minifierOptions: MinifierOptions  ): MinifierResult {
        const minifierPlugin = new MinifierTransform( minifierOptions );
        const compiler = new tsc.Compiler( compilerOptions );

        var compileResult = compiler.compile( fileNames );

        return {
            emitSkipped: true,
            diagnostics: compileResult.getErrors()
        }
    }

    export function minifyModule( input: string, moduleFileName: string, compilerOptions: ts.CompilerOptions, minifierOptions: MinifierOptions  ): MinifierResult {
        const minifierPlugin = new MinifierTransform( minifierOptions );
        const compiler = new tsc.Compiler( compilerOptions ); //, minifierPlugin );

        var compileResult = compiler.compileModule( input, moduleFileName );

        return {
            emitSkipped: true,
            diagnostics: compileResult.getErrors()
        }
    }

    export function minifyProject( configFilePath: string, minifierOptions: MinifierOptions ): MinifierResult {
        const config = tsc.TsCompiler.ProjectHelper.getProjectConfig( configFilePath );

        return minify( config.fileNames, config.compilerOptions, minifierOptions )
    }

    export function prettify( input: string ): string {
        return format( input );
    }
}