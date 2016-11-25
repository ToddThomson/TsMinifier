import * as ts from "typescript";

export interface CompileOutput {
    fileName: string;
    emitSkipped: boolean;
    diagnostics: ts.Diagnostic[];
    text?: string;
    output?: string;
    dtsText?: string;
    mapText?: string;
}