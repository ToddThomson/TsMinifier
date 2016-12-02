[![npm version](https://badge.fury.io/js/tsminifier.svg)](http://badge.fury.io/js/tsminifier)
﻿[![Build Status](https://travis-ci.org/ToddThomson/TsMinifier.svg?branch=master)](https://travis-ci.org/ToddThomson/TsMinifier)
# TsMinifier
TsMinifier is a Typescript minifier providing identifier mangling and whitespace removal.

## Top Features

* Minifies Typescript files directly.

## Node API

TsMinifier exposes a Minifier class and several direct minify functions.

```
	interface ProjectConfig {
        success: boolean;
        compilerOptions?: ts.CompilerOptions;
        fileNames?: string[];
        errors?: ts.Diagnostic[];
    }

	interface MinifierOptions {
        mangleIdentifiers?: boolean;
        removeWhitespace?: boolean;
        externalNamespace?: string;
    }

	interface MinifierResult {
        emitSkipped: boolean;
        emitOutput?: ts2js.CompilerOutput[];
        diagnostics: ts.Diagnostic[];
    }
	
	class Minifier {
        constructor(program: ts.Program, compilerOptions: ts.CompilerOptions, minifierOptions: MinifierOptions);
    
		// Public Methods
	    transform(sourceFile: ts.SourceFile): ts.SourceFile;
        removeWhitespace(jsContents: string): string;
    }

	function minify( fileNames: string[], compilerOptions: ts.CompilerOptions, minifierOptions: MinifierOptions): MinifierOutput[];

    function minifyModule( input: string, compilerOptions: ts.CompilerOptions, minifierOptions: MinifierOptions): MinifierOutput;

    function minifyProject( configFilePath: string, minifierOptions: MinifierOptions): MinifierOutput[];

	function prettify( input: string ): string;

    function ProjectHelper.getProjectConfig( configFilePath: string ): ts.ProjectConfig;

```

## How to install

```
npm install tsminifier
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
