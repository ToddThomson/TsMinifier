import * as ts from "typescript";
import * as tsc from "ts2js"

declare namespace TsMinifier {

    export interface MinifierOptions {
        mangleIdentifiers?: boolean;
        removeWhitespace?: boolean;
        externalNamespace?: string;
    }

    export interface MinifierResult {
        emitSkipped: boolean;
        emitOutput?: tsc.CompilerOutput[];
        diagnostics: ts.Diagnostic[];
    }

    export interface ProjectConfig {
        success: boolean;
        compilerOptions?: ts.CompilerOptions;
        fileNames?: string[];
        errors?: ts.Diagnostic[];
    }

    export class Minifier {
        constructor(program: ts.Program, compilerOptions: ts.CompilerOptions, minifierOptions: MinifierOptions);
        transform(sourceFile: ts.SourceFile): ts.SourceFile;
        removeWhitespace(jsContents: string): string;
    }

    export function minify(fileNames: string[], compilerOptions: ts.CompilerOptions, minifierOptions: MinifierOptions): MinifierResult;

    export function minifyModule( input: string, fileName: string, compilerOptions: ts.CompilerOptions, minifierOptions: MinifierOptions): MinifierResult;

    export function minifyProject(configFilePath: string, minifierOptions: MinifierOptions): MinifierResult;

    export function prettify( input: string ): string;
    
    export namespace ProjectHelper {
        export function getProjectConfig(configFilePath: string): ProjectConfig;
    }
}

export = TsMinifier;

