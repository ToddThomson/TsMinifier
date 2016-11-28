import * as ts from "typescript";

declare namespace TsMinifier {

    interface MinifierOptions {
        mangleIdentifiers?: boolean;
        removeWhitespace?: boolean;
        externalNamespace?: string;
    }

    export interface MinifierResult {
        emitSkipped: boolean;
        emitOutput?: CompilerOutput[];
        diagnostics: ts.Diagnostic[];
    }

    interface CompilerOutput {
        fileName: string;
        emitSkipped: boolean;
        text?: string;
        mapText?: string;
        dtsText?: string;
        diagnostics: ts.Diagnostic[];
    }

    interface ProjectConfig {
        success: boolean;
        compilerOptions?: ts.CompilerOptions;
        fileNames?: string[];
        errors?: ts.Diagnostic[];
    }

    class Minifier {
        constructor(program: ts.Program, compilerOptions: ts.CompilerOptions, minifierOptions: MinifierOptions);
        transform(sourceFile: ts.SourceFile): ts.SourceFile;
        removeWhitespace(jsContents: string): string;
    }

    function minify(fileNames: string[], compilerOptions: ts.CompilerOptions, minifierOptions: MinifierOptions): MinifierResult;

    function minifyModule(input: string, compilerOptions: ts.CompilerOptions, minifierOptions: MinifierOptions): MinifierResult;

    function minifyProject(configFilePath: string, minifierOptions: MinifierOptions): MinifierResult;

    function prettify( input: string ): string;
    
    namespace ProjectHelper {
        function getProjectConfig(configFilePath: string): ProjectConfig;
    }
}

export = TsMinifier;
