export interface MinifierOptions {
    outputToDisk? : boolean;
    moduleFileName?: string;
    mangleIdentifiers?: boolean;
    removeWhitespace?: boolean;
    externalNamespace?: string;
}