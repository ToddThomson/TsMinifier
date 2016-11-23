import * as ts from "typescript";

declare namespace TsMinifier {

    interface MinifierOptions {
        moduleFileName?: string;
        mangleIdentifiers?: boolean;
        removeWhitespace?: boolean;
        externalNamespace?: string;
    }

    interface MinifierOutput {
        fileName: string;
        output?: string;
        mapText?: string;
        dtsText?: string;
        diagnostics?: ts.Diagnostic[];
    }
 
    interface ProjectConfig {
        success: boolean;
        compilerOptions?: ts.CompilerOptions;
        fileNames?: string[];
        errors?: ts.Diagnostic[];
    }

    function minify(fileNames: string[], compilerOptions: ts.CompilerOptions, minifierOptions: MinifierOptions): MinifierOutput[];

    function minifyModule(input: string, compilerOptions: ts.CompilerOptions, minifierOptions: MinifierOptions): MinifierOutput;

    function minifyProject(configFilePath: string, minifierOptions: MinifierOptions): MinifierOutput[];

    function minifySourceFile(file: ts.SourceFile, program: ts.Program, compilerOptions: ts.CompilerOptions, minifierOptions: MinifierOptions): ts.SourceFile;

    namespace ProjectHelper {
        function getProjectConfig(configFilePath: string): ProjectConfig;
    }
}

export = TsMinifier;
