[![npm version](https://badge.fury.io/js/tsminifier.svg)](http://badge.fury.io/js/tsminifier)
﻿[![Build Status](https://travis-ci.org/ToddThomson/TsMinifier.svg?branch=master)](https://travis-ci.org/ToddThomson/TsMinifier)
# TsMinifier
TsMinifier is a Typescript minifier providing identifier mangling and whitespace removal.

## PRERELEASE NOTICE

TsMinifier is a prerelease package. TsMinifier is the result of decoupling the minification code from TsProject and is currently a work in progress. Please continue to use TsProject for now.

## How to install

```
npm install tsminifier
```

## Node API
```
    interface MinifierOptions {
        moduleFileName?: string;
        mangleIdentifiers?: boolean;
        removeWhitespace?: boolean;
        externalNamespace?: string;
    }

    interface MinifierOutput {
        fileName: string;
		text: string;
        output?: string;
        mapText?: string;
        dtsText?: string;
        diagnostics?: ts.Diagnostic[];
    }
 
    interface ProjectConfig {
        success: boolean;
        compilerOptions?: ts.CompilerOptions;
        fileNames?: string[];
        errors?: ts.Diagnostic[];
    }
	
	function minify( fileNames: string[], compilerOptions: ts.CompilerOptions, minifierOptions: MinifierOptions): MinifierOutput[];

    function minifyModule( input: string, compilerOptions: ts.CompilerOptions, minifierOptions: MinifierOptions): MinifierOutput;

    function minifyProject( configFilePath: string, minifierOptions: MinifierOptions): MinifierOutput[];

    function minifySourceFile( file: ts.SourceFile, program: ts.Program, compilerOptions: ts.CompilerOptions, minifierOptions: MinifierOptions): ts.SourceFile;

    function ProjectHelper.getProjectConfig( configFilePath: string ): ProjectConfig;

```
## Building TsMinifier

TsMinifier depends on [NPM](https://docs.npmjs.com/) as a package manager and 
[Gulp](https://github.com/gulpjs/gulp/blob/master/docs/getting-started.md) as a build tool. 
If you haven't already, you'll need to install both these tools in order to 
build TsMinifier.

Once Gulp is installed, you can build it with the following commands:

```
npm install
gulp build
```  

