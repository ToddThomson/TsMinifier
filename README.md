[![npm version](https://badge.fury.io/js/tsminifier.svg)](http://badge.fury.io/js/tsminifier)
﻿[![Build Status](https://travis-ci.org/ToddThomson/tsminifier.svg?branch=master)](https://travis-ci.org/ToddThomson/tsminifier)
# TsMinifier
TsMinifier is a Typescript minifier.

## Top Features

* Typescript minifier with identifier mangling and whitespace removal.

## How to install

```
npm install tsminifier
```

## API

	tsminifier.minify( fileName: string, settings: any )

	tsminifier.minifySourceFile( file: ts.SourceFile, program: ts.Program, options: ts.CompilerOptions )

    tsminifier.minifyProject( projectConfigPath: string, settings: any )

Where:

**projectConfigPath** is a relative directory path to the default Typescript project file named "tsconfig.json".
Or,
**projectConfigPath** is a relative path to a named Typescript project file.   

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

