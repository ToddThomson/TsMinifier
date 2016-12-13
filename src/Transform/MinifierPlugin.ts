import * as ts from "typescript";
import * as tsc from "ts2js";

import { Minifier } from "../Minifier/Minifier";
import { MinifierOptions } from "../Minifier/MinifierOptions";

export class MinifierPlugin implements tsc.TransformPlugin {

    private minifierOptions: MinifierOptions;
    private program: ts.Program;
    private minifier: Minifier;

    constructor( minifierOptions: MinifierOptions ) {
        this.minifierOptions = minifierOptions;
    }

    public transform( context: tsc.TransformContext ) {
        const self = this;
        this.program = context.getProgram();

        this.minifier = new Minifier( this.program, this.minifierOptions );

        context.onPostEmit = this.onPostEmit;

        function transformImpl( sourceFile: ts.SourceFile) {
            if ( self.minifierOptions.mangleIdentifiers ) {
                sourceFile = self.minifier.transform( sourceFile );
            }
            
            return sourceFile;
        }

        return transformImpl;
    }

    public onPostEmit = ( emitResult: tsc.CompilerOutput ): void => {
        if ( !emitResult.emitSkipped && this.minifierOptions.removeWhitespace ) {
            // Whitespace removal cannot be performed in the AST minification transform, so we do it here for now
            emitResult.codeFile.data = this.minifier.removeWhitespace( emitResult.codeFile.data );
        }
    }
}