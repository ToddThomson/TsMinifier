import * as ts from "typescript";

export interface ProjectConfig {
    success: boolean;
    compilerOptions?: ts.CompilerOptions;
    fileNames?: string[];
    errors?: ts.Diagnostic[];
}

