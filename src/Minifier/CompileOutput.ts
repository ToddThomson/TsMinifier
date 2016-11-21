import * as ts from "typescript";

export interface CompileOutput {
    fileName: string;
    output?: string;
    dtsText?: string;
    mapText?: string;
    diagnostics?: ts.Diagnostic[];
}