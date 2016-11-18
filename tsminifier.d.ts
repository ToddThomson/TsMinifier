import * as ts from "typescript";

declare namespace TsMinifier {

    interface MinifyOutput {
        outputText: string;
        diagnostics?: ts.Diagnostic[];
        sourceMapText?: string;
    }

    interface ProjectConfig {
        success: boolean;
        compilerOptions?: ts.CompilerOptions;
        fileNames?: string[];
        errors?: ts.Diagnostic[];
    }

    function minify(fileName: string, options: ts.CompilerOptions): MinifyOutput;

    function minifyProject(configFilePath: string): void;

    function minifySourceFile(file: ts.SourceFile, program: ts.Program, options: ts.CompilerOptions): ts.SourceFile;

    function getProjectConfig(configFilePath: string): ProjectConfig;
}

export = TsMinifier;
