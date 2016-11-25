import * as ts from "typescript";

export interface CompileOutput {
    fileName: string;
    text?: string;
    output?: string;
    dtsText?: string;
    mapText?: string;
    diagnostics: ts.Diagnostic[];
}