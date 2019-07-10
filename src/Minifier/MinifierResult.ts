import * as ts from "typescript"
import { CompileOutput } from "ts2js"

export interface MinifierResult {
    emitSkipped: boolean;
    diagnostics: ReadonlyArray<ts.Diagnostic>;
    emitOutput?: CompileOutput[];
};
