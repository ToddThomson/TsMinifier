import * as ts from "typescript";
import { Minifier } from "./Minifier";
import { MinifierOptions } from "./MinifierOptions";

export class MinifierTransform {
    private options: MinifierOptions;
    private compilerOptions: ts.CompilerOptions;
    private program: ts.Program;
    private host: ts.CompilerHost;
    private minifier: Minifier;

    constructor( options: MinifierOptions ) {
        this.options = options;
    }

    public transform( host: ts.CompilerHost, program: ts.Program, context: ts.TransformationContext ) {
        this.compilerOptions = context.getCompilerOptions();
        this.program = program;
        this.host = host;

        this.minifier = new Minifier( this.program, this.compilerOptions, this.options );

        function transformImpl( sourceFile: ts.SourceFile ) {
            if ( this.options.mangleIdentifiers ) {
                sourceFile = this.minifier.transform( sourceFile );
            }

            return sourceFile;
        }

        return transformImpl;
    }
}