import * as ts from "typescript"
import { CompilerOutput } from "ts2js"

export interface MinifierResult {
    emitSkipped: boolean;
    diagnostics: ReadonlyArray<ts.Diagnostic>;
    emitOutput?: CompilerOutput[];
};
