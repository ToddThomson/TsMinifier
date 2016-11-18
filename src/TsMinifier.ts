import { ProjectConfig } from "./Project/ProjectConfig";
import { Minifier } from "./Minifier/Minifier";
import { Logger } from "./Reporting/Logger";
import { TsCore } from "./Utils/TsCore";
import { Utils } from "./Utils/Utilities";

import * as ts from "typescript";
import * as fs from "fs";
import * as path from "path";

namespace TsMinifier {

    export interface MinifyOutput {
        outputText: string;
        diagnostics?: ts.Diagnostic[];
        sourceMapText?: string;
    }

    export function minify( fileName: string, options: ts.CompilerOptions ): MinifyOutput {

        const program = ts.createProgram( [fileName], options );

        const minifier = new Minifier( program, options, { mangleIdentifiers: true, removeWhitespace: true } ); 
        
        // Parse a file
        let sourceFile = ts.createSourceFile(fileName, fs.readFileSync(fileName).toString(), options.target, /*setParentNodes */ true);
        
        const minSourceFile = minifier.transform( sourceFile );

        return {
            outputText: undefined,
            diagnostics: undefined,
            sourceMapText: undefined
        };
    }

    export function minifyProject( configFilePath: string ): void {
        let config = getProjectConfig( configFilePath );
    }

    export function minifySourceFile( file: ts.SourceFile, program: ts.Program, options: ts.CompilerOptions ): ts.SourceFile {
        const minifier = new Minifier( program, options, {} );

        var minFile = minifier.transform( file );
        
        return minFile;
    }

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