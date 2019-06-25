import * as ts from "typescript";
import { CompilerOutput } from "ts2js";
interface MinifierOptions {
    mangleIdentifiers?: boolean;
    removeWhitespace?: boolean;
    externalNamespace?: string;
}
interface MinifierResult {
    emitSkipped: boolean;
    diagnostics: ReadonlyArray<ts.Diagnostic>;
    emitOutput?: CompilerOutput[];
}
export { MinifierOptions };
export { MinifierResult };
export declare namespace TsMinifier {
    function minify(fileNames: string[], compilerOptions: ts.CompilerOptions, minifierOptions: MinifierOptions): MinifierResult;
    function minifyModule(input: string, moduleFileName: string, compilerOptions: ts.CompilerOptions, minifierOptions: MinifierOptions): MinifierResult;
    function minifyProject(configFilePath: string, minifierOptions: MinifierOptions): MinifierResult;
    function prettify(input: string): string;
}
