import * as ts from "typescript";
import { CompileOutput } from "ts2js";
interface MinifierOptions {
    mangleIdentifiers?: boolean;
    removeWhitespace?: boolean;
    externalNamespace?: string;
}
interface MinifierResult {
    emitSkipped: boolean;
    diagnostics: ReadonlyArray<ts.Diagnostic>;
    emitOutput?: CompileOutput[];
}
export { MinifierOptions };
export { MinifierResult };
export declare namespace TsMinifier {
    /**
    * Gets the TsMinifier identifier minification transformation callback function
    * used to minify a source file identifiers.
    *
    * @param program Optional
    * @param options Optional bundler options.
    * @returns The bundler transform factory callback function.
    */
    function getMinifierTransform(program: ts.Program, options?: MinifierOptions): ts.TransformerFactory<ts.SourceFile>;
    function getWhitespaceTransform(program: ts.Program, options?: MinifierOptions): ts.TransformerFactory<ts.SourceFile>;
    function minify(fileNames: string[], compilerOptions: ts.CompilerOptions, minifierOptions?: MinifierOptions): MinifierResult;
    function minifyModule(input: string, moduleFileName: string, compilerOptions: ts.CompilerOptions, minifierOptions?: MinifierOptions): MinifierResult;
    function minifyProject(configFilePath: string, minifierOptions?: MinifierOptions): MinifierResult;
    function prettify(input: string): string;
}
