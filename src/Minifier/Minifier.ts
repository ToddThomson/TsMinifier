import * as ts from "typescript";
import { NameGenerator } from "./NameGenerator";
import { Container } from "./ContainerContext";
import { IdentifierInfo } from "./IdentifierInfo";
import { IdentifierCollection } from "./IdentifierInfoCollection";
import { MinifierOptions } from "./MinifierOptions";
import { MinifierStatistics } from "./MinifierStatistics";
import { Ast } from "../../../TsToolsCommon/src/typescript/AstHelpers";
import { TsCore } from "../../../TsToolsCommon/src/typescript/Core";
import { StatisticsReporter } from "../../../TsToolsCommon/src/Reporting/StatisticsReporter";
import { Logger } from "../../../TsToolsCommon/src/Reporting/Logger";
import { Debug } from "../../../TsToolsCommon/src/Utils/Debug";
import { Utils } from "../../../TsToolsCommon/src/Utils/Utilities";


export class Minifier {
    private sourceFile: ts.SourceFile;
    private checker: ts.TypeChecker;
    private compilerOptions: ts.CompilerOptions;
    private minifierOptions: MinifierOptions;

    private lastContainer: Container;
    private classifiableContainers: ts.MapLike<Container> = {};
    private sourceFileContainer: Container;
    private nameGenerator: NameGenerator;
    private identifiers: IdentifierCollection;
    private identifierCount = 0;
    private shortenedIdentifierCount = 0;

    private transformTime: number;

    constructor( program: ts.Program, compilerOptions: ts.CompilerOptions, minifierOptions: MinifierOptions ) {
        this.checker = program.getTypeChecker();
        this.compilerOptions = compilerOptions;
        this.minifierOptions = minifierOptions;

        this.nameGenerator = new NameGenerator();
        this.identifiers = new IdentifierCollection();
    }

    public transform( sourceFile: ts.SourceFile ): ts.SourceFile {
        Logger.setLevel( 4 ); 
        this.sourceFile = sourceFile;

        return this.minify( sourceFile );
    }

    private addToContainerChain( container: Container ) {
        if ( !this.sourceFileContainer ) {
            this.sourceFileContainer = container;
        }
        
        if ( this.lastContainer ) {
            this.lastContainer.nextContainer = container;
        }

        this.lastContainer = container;
    }

    private buildContainerChain( sourceFileNode: Ast.ContainerNode ) {
        var currentContainerNode = sourceFileNode;

        while ( currentContainerNode ) {
            var container = new Container( currentContainerNode, this.checker );

            this.addToContainerChain( container );

            container.addIdentifiers( this.identifiers );

            currentContainerNode = currentContainerNode.nextContainer;
        }
    }

    private replaceIdentifiersNamedOldNameWithNewName2( context: ts.TransformationContext ) {
        const visitor: ts.Visitor = ( node: ts.Node ) => {
            if ( Ast.isIdentifier( node ) ) {
                
                return ts.createIdentifier( "newName" );
            }
            return ts.visitEachChild( node, visitor, context );
        };

        return ( node: ts.SourceFile ) => ts.visitNode( node, visitor );
    }

    private getIdentifiers( sourceFile: ts.SourceFile ): ts.Identifier[] {
        var identifierNodes: ts.Identifier[] = [];

        function visitSourceFileNodes( node: ts.Node ): any {
            if ( node.kind === ts.SyntaxKind.Identifier ) {
                identifierNodes.push( node as ts.Identifier );
            }

            return ts.forEachChild( node, visitSourceFileNodes );
        }

        visitSourceFileNodes( sourceFile );

        return identifierNodes;
    }

    private minify( sourceFile: ts.SourceFile ): ts.SourceFile {
        this.transformTime = new Date().getTime();

        let identifierNodes = this.getIdentifiers( sourceFile );

        for ( let identifierNode of identifierNodes ) {
            let symbol = this.checker.getSymbolAtLocation( identifierNode );
            let symbolId = Ast.getIdentifierUID( symbol );

            if ( !this.identifiers.contains( symbolId ) ) {
                let identifier = new IdentifierInfo( identifierNode, symbol );

                Logger.info( "Adding new identifier: ", identifier.getName(), identifier.getId() );

                // Add the new identifier info to both the container and the all list
                this.identifiers.add( symbolId, identifier );

            }
            else {
                let identifier = this.identifiers.getIdentifier( symbolId );

                Logger.info( "Adding identifier node reference: ", identifier.getName(), identifier.getId() );
                identifier.addNodeReference( identifierNode )
            }
        }

        // Walk the sourceFile to build containers and the identifiers within. 
        this.buildContainerChain( sourceFile );

        this.shortenIdentifiers();

        this.transformTime = new Date().getTime() - this.transformTime;

        if ( this.compilerOptions.diagnostics )
            this.reportMinifyStatistics();

        return sourceFile;
    }

    private shortenIdentifiers(): void {
        // NOTE: Once identifier names are shortened, the typescript checker cannot be used. 

        // We first need to process all the class containers to determine which properties cannot be shortened 
        // ( public, abstract, implements, extends ).

        for ( let classContainerKey in this.classifiableContainers ) {
            let classContainer = this.classifiableContainers[classContainerKey];

            let abstractProperties: ts.Symbol[] = [];
            let heritageProperties: ts.Symbol[] = [];
            let implementsProperties: ts.Symbol[] = [];

            let extendsClause = Ast.getExtendsClause( classContainer.getNode() );

            if ( extendsClause ) {
                // Check for abstract properties...

                // TODO: Abstract properties are currently not shortened, but they could possibly be.
                //       The child class that implements a parent class property would need to have the same shortened name.

                abstractProperties = Ast.getClassAbstractProperties( extendsClause, this.checker );
            }

            let implementsClause = Ast.getImplementsClause( classContainer.getNode() );

            if ( implementsClause ) {
                implementsProperties = Ast.getImplementsProperties( implementsClause, this.checker );
            }

            heritageProperties = Ast.getClassHeritageProperties( classContainer.getNode(), this.checker );

            // Join the abstract and implements properties
            let excludedProperties = heritageProperties.concat( abstractProperties, implementsProperties );

            Logger.trace( "Class excluded properties for: ", ( <any>classContainer.getNode() ).name.text, excludedProperties.length, classContainer.getId() );

            classContainer.excludedProperties = excludedProperties;
        }

        // Walk through the container identifiers starting at the source file container...
        let container = this.sourceFileContainer;
        while ( container ) {
            this.shortenContainerIdentifiers( container );

            container = container.nextContainer;
        }
    }

    private shortenContainerIdentifiers( container: Container ): void {
        // If this container extends a base/parent class then we must make sure we have processed the base/parent class members
        let baseClass = container.getBaseClass();

        if ( baseClass ) {
            // We need to get the container for the parent/base class
            let baseClassContainer = this.classifiableContainers[baseClass.name];

            if ( baseClassContainer ) {
                //let baseClassMembers = baseClassContainer.getMembers();

                //if ( baseClassMembers ) {
                //    this.processClassMembers( baseClassMembers, baseClassContainer );

                //    // The base class container excludedProperties array must also be excluded in the current derived class
                //    container.excludedProperties = container.excludedProperties.concat( baseClassContainer.excludedProperties );
                //}
            }
        }

        // Determine the names which cannot be used as shortened names in this container.
        this.excludeNames( container );

        // Process container members..
        //let containerClassMembers = container.getMembers();

        //if ( containerClassMembers ) {
        //    this.processClassMembers( containerClassMembers, container );
        //}

        //// Process container locals..
        //let containerLocals = container.getLocals();

        //if ( containerLocals ) {
        //    this.processContainerLocals( containerLocals, container );
        //}

        // Process the containers identifiers...
        for ( let identifierTableKey in container.localIdentifiers ) {
            let identifierInfo = container.localIdentifiers[identifierTableKey];

            this.processIdentifierInfo( identifierInfo, container );
        }

        // Process the containers classifiables...

        // TJT: Review..

        //for ( let classifiableKey in container.classifiableSymbols ) {
        //    let classSymbol = container.classifiableSymbols[classifiableKey];

        //    let classSymbolUId: string = Ast.getIdentifierUID( classSymbol );
        //    let classIdentifierInfo = this.identifiers[classSymbolUId];

        //    this.processIdentifierInfo( classIdentifierInfo, container );
        //}

        // Recursively go through container children in order added
        //let containerChildren = container.getChildren();

        //for ( let j = 0; j < containerChildren.length; j++ ) {
        //    this.shortenContainerIdentifiers( containerChildren[j] );
        //}
    }

    private processIdentifierInfo( identifierInfo: IdentifierInfo, container: Container ): void {
        if ( identifierInfo.isMinified ) {
            Logger.trace( "Identifier already has shortened name: ", identifierInfo.getName(), identifierInfo.shortenedName );
            return;
        }

        if ( this.canShortenIdentifier( identifierInfo ) ) {
            let shortenedName = this.getShortenedIdentifierName( container, identifierInfo );

            Logger.trace( "Identifier shortened: ", identifierInfo.getName(), shortenedName );

            // Add the shortened name to the excluded names in each container that this identifier was found in.
            let containerRefs = identifierInfo.getContainers();

            for ( let containerKey in containerRefs ) {
                let containerRef = containerRefs[containerKey];
                containerRef.namesExcluded[shortenedName] = true;
            }

            //if ( !identifierInfo.isMinified ) {
            // Change all referenced identifier nodes to the shortened name
            Utils.forEach( identifierInfo.getIdentifiers(), identifier => {
                this.setIdentifierText( identifier, shortenedName );
            } );

            identifierInfo.isMinified = true;
            //}

            return;
        }
    }

    private canShortenIdentifier( identifierInfo: IdentifierInfo ): boolean {

        if ( identifierInfo.isBlockScopedVariable() ||
            identifierInfo.isFunctionScopedVariable() ||
            identifierInfo.isInternalClass() ||
            identifierInfo.isInternalInterface() ||
            identifierInfo.isPrivateMethod() ||
            identifierInfo.isPrivateProperty() ||
            identifierInfo.isInternalFunction( this.minifierOptions ) ||
            identifierInfo.isParameter() ||
            identifierInfo.isNamespaceImportAlias() ) {

            Logger.trace( "Identifier CAN be shortened: ", identifierInfo.getName() );
            return true;
        }

        Logger.trace( "Identifier CANNOT be shortened: ", identifierInfo.getName() );
        return false;
    }

    private getShortenedIdentifierName( container: Container, identifierInfo: IdentifierInfo ): string {
        // Identifier names are shortened in place. They must be the same length or smaller than the original name.
        if ( !identifierInfo.shortenedName ) {
            let identifierName = identifierInfo.getName();

            if ( identifierName.length === 1 ) {
                // Just reuse the original name for 1 char names
                identifierInfo.shortenedName = identifierName;
            }
            else {
                // Loop until we have a valid shortened name
                // The shortened name MUST be the same length or less
                while ( !identifierInfo.shortenedName ) {
                    let shortenedName = this.nameGenerator.getName( container.getNameIndex() );

                    Debug.assert( shortenedName.length <= identifierName.length );

                    let containerRefs = identifierInfo.getContainers();
                    let isShortenedNameAlreadyUsed = false;

                    for ( let containerKey in containerRefs ) {
                        let containerRef = containerRefs[containerKey];

                        if ( Utils.hasProperty( containerRef.namesExcluded, shortenedName ) ) {
                            isShortenedNameAlreadyUsed = true;
                            Logger.trace( "Generated name was excluded: ", shortenedName, identifierName );
                            break;
                        }
                    }

                    if ( !isShortenedNameAlreadyUsed ) {
                        identifierInfo.shortenedName = shortenedName;
                    }
                }

                this.shortenedIdentifierCount++;
            }
        }
        else {
            Logger.trace( "Identifier already has shortened name: ", identifierInfo.getName(), identifierInfo.shortenedName );
        }

        Logger.info( "Identifier shortened name: ", identifierInfo.getName(), identifierInfo.shortenedName );

        return identifierInfo.shortenedName;
    }

    private setIdentifierText( identifier: ts.Identifier, text: string ): void {

        let identifierLength = identifier.text.length;
        let bufferLength = ( identifier.end - identifier.pos );

        // Check to see if there is leading trivia
        var triviaOffset = identifier.getLeadingTriviaWidth();

        // Find the start of the identifier text within the identifier character array
        for ( var identifierStart = identifier.pos + triviaOffset; identifierStart < identifier.pos + bufferLength; identifierStart++ ) {
            if ( this.sourceFile.text[identifierStart] === identifier.text[0] )
                break;
        }

        // Replace the identifier text within the bundle source file
        (identifier as ts.TextRange ).end = identifierStart + text.length;

        for ( var i = 0; i < identifierLength; i++ ) {
            let replaceChar = " ";

            if ( i < text.length ) {
                replaceChar = text[i];
            }

            this.sourceFile.text = Utils.replaceAt( this.sourceFile.text, identifierStart + i, replaceChar );
        }
    }

    private processClassMembers( members: ts.NodeArray<ts.Declaration>, container: Container ): void {
        for ( let memberKey in members ) {
            let member = members[memberKey];
            let memberSymbol: ts.Symbol = ( <any>member ).symbol;

            if ( memberSymbol ) {
                let memberSymbolUId: string = Ast.getIdentifierUID( memberSymbol );

                //if ( memberSymbolUId ) {
                //    let memberIdentifierInfo = this.identifiers[memberSymbolUId];
                //    let isExcludedProperty = false;

                //    for ( const excludedPropertyKey in container.excludedProperties ) {
                //        let memberIdentifierSymbol = memberIdentifierInfo.getSymbol();
                //        let excludedPropertySymbol = container.excludedProperties[excludedPropertyKey];

                //        // TJT: Review - How to determine equality here. For now just use name which seems pretty naive.
                //        if ( memberIdentifierSymbol.name === excludedPropertySymbol.name ) {
                //            isExcludedProperty = true;

                //            memberIdentifierInfo.shortenedName = memberIdentifierInfo.getName();
                //            break;
                //        }
                //    }

                //    if ( !isExcludedProperty ) {
                //        this.processIdentifierInfo( memberIdentifierInfo, container );
                //    }
                //}
                //else {
                //    Logger.warn( "Container member does not have a UId" );
                //}
            }
            else {
                Logger.warn( "Container member does not have a symbol." );
            }
        }
    }

    public excludeNames( container: Container ): void {
        // Determine identifier names which cannot be used in this container.

        // If this container extends a base/parent class then we exclude the base class member names.
        let baseClass = container.getBaseClass();

        //if ( baseClass ) {

        //    // We need to get the container for the parent/base class
        //    let baseClassContainer = this.classifiableContainers[baseClass.name];

        //    if ( baseClassContainer ) {
        //        let baseClassMembers = baseClassContainer.getMembers();

        //        if ( baseClassMembers ) {

        //            // The base class members shortened names must be excluded from this child class
        //            for ( let memberKey in baseClassMembers ) {
        //                let member = baseClassMembers[memberKey];
        //                let memberSymbol = ( <any>member ).symbol;
        //                let memberSymbolUId: string = Ast.getIdentifierUID( memberSymbol );

        //                let excludedIdentifier = this.identifiers[memberSymbolUId];

        //                if ( excludedIdentifier && excludedIdentifier.shortenedName ) {
        //                    container.namesExcluded[excludedIdentifier.shortenedName] = true;
        //                }
        //            }
        //        }
        //    }
        //}

        for ( let identifierInfoKey in container.localIdentifiers ) {
            let identifierInfo = container.localIdentifiers[identifierInfoKey];

            this.excludeNamesForIdentifier( identifierInfo, container );
        }

        //for ( let classifiableKey in container.classifiableSymbols ) {
        //    let classSymbol = container.classifiableSymbols[classifiableKey];

        //    let classSymbolUId: string = Ast.getIdentifierUID( classSymbol );
        //    let classIdentifierInfo = this.identifiers[classSymbolUId];

        //    Debug.assert( classIdentifierInfo !== undefined, "Container classifiable identifier symbol not found." );

        //    this.excludeNamesForIdentifier( classIdentifierInfo, container );
        //}
    }

    private getContainerExcludedIdentifiers( container: Container ): ts.MapLike<IdentifierInfo> {
        // Recursively walk the container chain to find shortened identifier names that we cannot use in this container.
        let target = this.compilerOptions.target;
        let excludes: ts.MapLike<IdentifierInfo> = {};

        function getContainerExcludes( container: Container ) {
            // Recursively process the container block scoped children..
            //let containerChildren = container.getChildren();

            //for ( let i = 0; i < containerChildren.length; i++ ) {
            //    let childContainer = containerChildren[i];

            //    // TJT: Review. Comments added in release 2.0
            //    //if ( childContainer.isBlockScoped() ) {
            //    getContainerExcludes( childContainer );
            //    //}
            //}

            // Get the excluded identifiers in this block scoped container..

            for ( let excludedIdentifierKey in container.excludedIdentifiers ) {
                let excludedIdentifier = container.excludedIdentifiers[excludedIdentifierKey];

                // For function scoped identifiers we must exclude the identifier from the current container parent.
                // Note that for ES5, which doesn't have block scoped variables, we must also exclude the identifier.
                if ( ( !excludedIdentifier.isBlockScopedVariable ) || ( target === ts.ScriptTarget.ES5 ) ) {
                    if ( !Utils.hasProperty( excludes, excludedIdentifier.getId() ) ) {
                        excludes[excludedIdentifier.getId()] = excludedIdentifier;
                    }
                }
            }
        }

        // Start the search for excluded identifiers from the container's parent - the parent function scope container.
        getContainerExcludes( container.getParent() );

        return excludes;
    }

    private excludeNamesForIdentifier( identifierInfo: IdentifierInfo, container: Container ): void {
        // Exclude all shortened names that have already been used in child containers that this identifer is contained in.
        let identifierContainers = identifierInfo.getContainers();

        // For each container that the identifier is contained in..
        for ( let containerKey in identifierContainers ) {
            let identifierContainer = identifierContainers[containerKey];

            let containerExcludes = this.getContainerExcludedIdentifiers( identifierContainer );

            // We can't use any names that have already been used in this referenced container
            for ( let excludedIdentifierKey in containerExcludes ) {
                let excludedIdentifier = containerExcludes[excludedIdentifierKey];

                if ( excludedIdentifier.shortenedName ) {
                    container.namesExcluded[excludedIdentifier.shortenedName] = true;
                }
            }
        }
    }

    private reportMinifyStatistics() {
        let statisticsReporter = new StatisticsReporter();

        statisticsReporter.reportTime( "Minify time", this.transformTime );
        statisticsReporter.reportCount( "Total identifiers", this.identifierCount );
        statisticsReporter.reportCount( "Identifiers shortened", this.shortenedIdentifierCount );
    }

    private gerb(): void {
        // We can't shorten identifier names that are 1 character in length AND
        // we can't risk the chance that an identifier name will be replaced with a 2 char
        // shortened name due to the constraint that the names are changed in place
        //    let identifierName = identifierSymbol.getName();

        //    if ( identifierName.length === 1 ) {
        //        identifierInfo.shortenedName = identifierName;
        //        this.excludedIdentifiers[identifierUID] = identifierInfo;
        //    }
    }
}