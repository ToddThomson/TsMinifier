import { ProjectConfig, Project } from "./Project/ProjectConfig";
import { Minifier } from "./Minifier/Minifier";
import { MinifierOptions } from "./Minifier/MinifierOptions";
import { MinifyingCompiler } from "./Minifier/MinifyingCompiler";
import { Logger } from "./Reporting/Logger";
import { Utils } from "./Utils/Utilities";

import * as ts from "typescript";

namespace TsMinifier {

    export interface MinifierOutput {
        fileName: string;
        output?: string;
        mapText?: string;
        dtsText?: string;
        diagnostics?: ts.Diagnostic[];
    }

    export function minify( fileNames: string[], compilerOptions: ts.CompilerOptions, minifierOptions: MinifierOptions  ): MinifierOutput[] {
        const compiler = new MinifyingCompiler( compilerOptions, minifierOptions );

        return compiler.compile( fileNames );
    }

    export function minifyModule( input: string, compilerOptions: ts.CompilerOptions, minifierOptions: MinifierOptions  ): MinifierOutput {
        const compiler = new MinifyingCompiler( compilerOptions, minifierOptions );

        return compiler.compileModule( input );
    }

    export function minifyProject( configFilePath: string, minifierOptions: MinifierOptions ): MinifierOutput[] {
        const config = Project.getProjectConfig( configFilePath );

        return minify( config.fileNames, config.compilerOptions, minifierOptions )
    }

    export function minifySourceFile( file: ts.SourceFile, program: ts.Program, compilerOptions: ts.CompilerOptions, minifierOptions: MinifierOptions ): ts.SourceFile {
        const minifier = new Minifier( program, compilerOptions, minifierOptions );

        return minifier.transform( file );
    }

    export namespace ProjectHelper {
        export function getProjectConfig( configFilePath: string ): ProjectConfig {
            return Project.getProjectConfig( configFilePath );
        }
    }
}

export = TsMinifier;