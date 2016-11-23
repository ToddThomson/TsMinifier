export interface MinifierStatistics {
    whiteSpaceBefore: number;
    whiteSpaceAfter: number;
    whiteSpaceTime: number;

    identifierCount: number;
    mangledIdentifierCount: number;
    transformTime: number;
}