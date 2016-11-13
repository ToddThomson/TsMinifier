[![npm version](https://badge.fury.io/js/tsproject.svg)](http://badge.fury.io/js/tsproject)
﻿[![Build Status](https://travis-ci.org/ToddThomson/tsproject.svg?branch=master)](https://travis-ci.org/ToddThomson/tsproject)
# TsMinify
TsMinify is a Typescript minifier.

## Top Features

* Typescript source file minification with identifier shortening and whitespace removal.

## How to install

```
npm install tsminify
```

## API

    tsminify.src( projectConfigPath: string, settings: any )

Where:

**projectConfigPath** is a relative directory path to the default Typescript project file named "tsconfig.json".
Or,
**projectConfigPath** is a relative path to a named Typescript project file.   

## Building TsMinifyProject

TsMinify depends on [NPM](https://docs.npmjs.com/) as a package manager and 
[Gulp](https://github.com/gulpjs/gulp/blob/master/docs/getting-started.md) as a build tool. 
If you haven't already, you'll need to install both these tools in order to 
build TsMinify.

Once Gulp is installed, you can build it with the following commands:

```
npm install
gulp build
```  

