import { ProjectConfig, Project } from "./Project/ProjectConfig";
import { Minifier } from "./Minifier/Minifier";
import { MinifierOptions } from "./Minifier/MinifierOptions";
import { MinifyingCompiler } from "./Compiler/MinifyingCompiler";
import { format } from "./Utils/formatter";

import * as ts from "typescript";
import * as tsc from "ts2js";

//export { Minifier }
export { MinifierOptions }
export { ProjectConfig }

export namespace TsMinifier {

    export interface MinifierResult {
        emitSkipped: boolean;
        diagnostics: ts.Diagnostic[];
        emitOutput?: tsc.CompilerOutput[];
    }

    export function minify( fileNames: string[], compilerOptions: ts.CompilerOptions, minifierOptions: MinifierOptions  ): MinifierResult {
        const compiler = new MinifyingCompiler( compilerOptions, minifierOptions );

        return compiler.compile( fileNames );
    }

    export function minifyModule( input: string, moduleFileName: string, compilerOptions: ts.CompilerOptions, minifierOptions: MinifierOptions  ): MinifierResult {
        const compiler = new MinifyingCompiler( compilerOptions, minifierOptions );

        return compiler.compileModule( input, moduleFileName );
    }

    export function minifyProject( configFilePath: string, minifierOptions: MinifierOptions ): MinifierResult {
        const config = Project.getProjectConfig( configFilePath );

        return minify( config.fileNames, config.compilerOptions, minifierOptions )
    }

    export function prettify( input: string ): string {
        return format( input );
    }

    export namespace ProjectHelper {
        export function getProjectConfig( configFilePath: string ): ProjectConfig {
            return Project.getProjectConfig( configFilePath );
        }
    }
}

module.exports = TsMinifier;