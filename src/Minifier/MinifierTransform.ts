import * as ts from "typescript";
import { Minifier } from "./Minifier";
import { MinifierOptions } from "./MinifierOptions";

export class MinifierTransform {
    private options: MinifierOptions;
    private compilerOptions: ts.CompilerOptions;
    private program: ts.Program;
    private minifier: Minifier;

    constructor( options?: MinifierOptions ) {
        this.options = options || { mangleIdentifiers: true, removeWhitespace: true };
    }

    public transform( program: ts.Program, context: ts.TransformationContext ) {
        this.compilerOptions = context.getCompilerOptions();
        this.program = program;

        return this.transformSourceFile;
    }

    private transformSourceFile = ( sourceFile: ts.SourceFile ) => {
        this.minifier = new Minifier( this.program, this.compilerOptions, this.options );

        if ( this.options.mangleIdentifiers ) {
            sourceFile = this.minifier.transform( sourceFile );
        }

        return sourceFile;
    }
}