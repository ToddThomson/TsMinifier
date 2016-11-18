import * as ts from "typescript";
import * as path from "path";

export class Compiler {

    private compilerHost: ts.CompilerHost;
    private program: ts.Program;
    private compilerOptions: ts.CompilerOptions;

    constructor( compilerHost: ts.CompilerHost, program: ts.Program ) {
        this.compilerHost = compilerHost
        this.program = program;
        this.compilerOptions = this.program.getCompilerOptions();
    }
  
    public transpile( input: string, transpileOptions: ts.TranspileOptions ): ts.TranspileOutput {
        return ts.transpileModule( input, transpileOptions );
    }
}