import { ProjectConfig } from "./Project/ProjectConfig";
import { Minifier } from "./Minifier/Minifier";
import { MinifierOptions } from "./Minifier/MinifierOptions";
import { MinifyingCompiler } from "./Minifier/MinifyingCompiler";
import { Logger } from "./Reporting/Logger";
import { TsCore } from "./Utils/TsCore";
import { Utils } from "./Utils/Utilities";

import * as ts from "typescript";
import * as fs from "fs";
import * as path from "path";

namespace TsMinifier {

    export interface MinifierOutput {
        fileName: string;
        output?: string;
        mapText?: string;
        dtsText?: string;
        diagnostics?: ts.Diagnostic[];
    }

    export function minify( fileNames: string[], compilerOptions: ts.CompilerOptions, minifierOptions: MinifierOptions  ): MinifierOutput[] {
        var output: string = "";

        const compiler = new MinifyingCompiler( compilerOptions, minifierOptions );

        return compiler.compile( fileNames );
    }

    export function minifyModule( input: string, compilerOptions: ts.CompilerOptions, minifierOptions: MinifierOptions  ): MinifierOutput {

        const compiler = new MinifyingCompiler( compilerOptions, minifierOptions );

        return compiler.compileModule( input );
    }

    export function minifyProject( configFilePath: string, minifierOptions: MinifierOptions ): MinifierOutput[] {
        let config = getProjectConfig( configFilePath );

        return minify( config.fileNames, config.compilerOptions, minifierOptions )
    }

    export function minifySourceFile( file: ts.SourceFile, program: ts.Program, compilerOptions: ts.CompilerOptions, minifierOptions: MinifierOptions ): ts.SourceFile {
        const minifier = new Minifier( program, compilerOptions, minifierOptions );

        return minifier.transform( file );
    }

    // TODO: Move this
    export function getProjectConfig( configFilePath: string ): ProjectConfig {
        var configFileDir: string;
        var configFileName: string;

        try {
            var isConfigDirectory = fs.lstatSync( configFilePath ).isDirectory();
        }
        catch ( e ) {
            let diagnostic = TsCore.createDiagnostic( { code: 6064, category: ts.DiagnosticCategory.Error, key: "Cannot_read_project_path_0_6064", message: "Cannot read project path '{0}'." }, configFilePath );
            return { success: false, errors: [diagnostic] };
        }

        if ( isConfigDirectory ) {
            configFileDir = configFilePath;
            configFileName = path.join( configFilePath, "tsconfig.json" );
        }
        else {
            configFileDir = path.dirname( configFilePath );
            configFileName = configFilePath;
        }

        let readConfigResult = ts.readConfigFile( configFileName, ( fileName ) => {
            return ts.sys.readFile( fileName );
        });

        if ( readConfigResult.error ) {
            return { success: false, errors: [readConfigResult.error] };
        }

        let configObject = readConfigResult.config;

        // Parse standard project configuration objects: compilerOptions, files.
        var configParseResult = ts.parseJsonConfigFileContent( configObject, ts.sys, configFileDir );

        if ( configParseResult.errors.length > 0 ) {
            return { success: false, errors: configParseResult.errors };
        }

        return {
            success: true,
            compilerOptions: configParseResult.options,
            fileNames: configParseResult.fileNames
        }
    }
}

export = TsMinifier;