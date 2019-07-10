import * as ts from "typescript";
import { IdentifierInfo } from "./IdentifierInfo"
import { IdentifierCollection } from "./IdentifierInfoCollection"
import { Ast } from "../../../TsToolsCommon/src/Ast/Ast"
import { Logger } from "../../../TsToolsCommon/src/Reporting/Logger";
import { Utils } from "../../../TsToolsCommon/src/Utils/Utilities";
import { TsCore } from "../../../TsToolsCommon/src/Utils/TsCore";

class ContainerIdGenerator {
    static nextId = 1;

    static getNextId(): number {
        return this.nextId++;
    }
}

export class Container {
    private checker: ts.TypeChecker;
    private id: number;
    private containerNode: ts.Node;
    public nextContainer: Container;
    private containerFlags: Ast.ContainerFlags;
    private parent: Container;
    private childContainers: Container[] = [];
    private isBlockScoped: boolean;
    // The base class cannot be determined by the checker if the base class name has been shortened
    // so we use get and set for the baseClass property
    private baseClass: ts.Symbol = undefined;

    private nameIndex: number;
    public namesExcluded: ts.MapLike<boolean> = {};

    public localIdentifiers: ts.MapLike<IdentifierInfo> = {};
    public classifiableSymbols: ts.MapLike<ts.Symbol> = {};

    public excludedIdentifiers: ts.MapLike<IdentifierInfo> = {};
    public excludedProperties: ts.Symbol[] = [];

    private identifierCount = 0;
    public shortenedIdentifierCount = 0;

    constructor( node: ts.Node, checker: ts.TypeChecker ) {
        this.containerNode = node;
        this.checker = checker;
        this.id = ContainerIdGenerator.getNextId();
        this.containerFlags = Ast.getContainerFlags( node );

        if ( this.containerFlags & Ast.ContainerFlags.IsBlockScopedContainer ) {
            this.isBlockScoped = true;

            // A block scoped container's parent is the parent function scope container.
            // this.parent = parentContainer.getParent();
        }
        else {
            this.isBlockScoped = false;

            // A function scoped container is it's own parent
            this.parent = this;
        }

        // The name generator index starts at 0 for containers 
        this.nameIndex = 0;

        //this.initializeIdentifiers();
    }

    public getId(): number {
        return this.id;
    }

    public getParent(): Container {
        return this.parent;
    }

    public getNameIndex(): number {
        // TJT: This logic needs to be reviewed for applicability to ES6 block scopes
        if ( this.isBlockScoped ) {
            // The name generator index for block scoped containers is obtained from the parent container
            return this.parent.getNameIndex();
        }

        return this.nameIndex++;
    }

    public getNode(): ts.Node {
        return this.containerNode;
    }

    private getMembers(): ts.NodeArray<ts.Declaration> {
        if ( this.containerNode ) {
            switch ( this.containerNode.kind ) {
                // TJT: LiteralTypes ???
                case ts.SyntaxKind.ClassDeclaration:
                case ts.SyntaxKind.ClassExpression:
                    return ( <ts.ClassDeclaration>this.containerNode ).members;

                case ts.SyntaxKind.InterfaceDeclaration:
                    return ( <ts.ClassDeclaration>this.containerNode ).members;

                case ts.SyntaxKind.EnumDeclaration:
                    return ( <ts.EnumDeclaration>this.containerNode ).members;

                default:
                    Logger.trace( "Container::getMembers() unprocessed container kind: ", this.containerNode.kind, this.getId() );
            }
        }

        return undefined;
    }

    private getLocals(): ts.SymbolTable {
        if ( this.containerNode && this.containerFlags & Ast.ContainerFlags.HasLocals ) {
            return ( <any>this.containerNode ).locals;
        }

        return undefined;
    }

    public getIsBlockScoped(): boolean {
        return this.isBlockScoped;
    }

    /**
     * Check if the container is classifiable.
     * 
     * @returns True if the container is Classifiable 
     */
    public isClassifiable(): boolean {
        let containerSymbol: ts.Symbol = ( <any>this.containerNode ).symbol;

        const classifiableSymbolFlags = ts.SymbolFlags.Class | ts.SymbolFlags.Enum |
            ts.SymbolFlags.TypeAlias | ts.SymbolFlags.Interface | ts.SymbolFlags.TypeParameter |
            ts.SymbolFlags.Module | ts.SymbolFlags.Alias;

        if ( containerSymbol && ( containerSymbol.flags & classifiableSymbolFlags ) ) {
            return true;
        }

        return false;
    }

    public isFunctionScoped(): boolean {
        if ( this.containerFlags & ( Ast.ContainerFlags.IsContainer | Ast.ContainerFlags.HasLocals ) ) {
            return true;
        }

        return false;
    }

    public setBaseClass( baseClass: ts.Symbol ): void {
        if ( baseClass.flags & ts.SymbolFlags.Class ) {
            this.baseClass = baseClass;
        }
    }

    public getBaseClass(): ts.Symbol {
        return this.baseClass;
    }

    public hasChild( container: Container ): boolean {
        for ( let i = 0; i < this.childContainers.length; i++ ) {
            if ( container.getId() === this.childContainers[i].getId() )
                return true;
        }

        return false;
    }

    public addIdentifiers( identifiers: IdentifierCollection ): void {

        this.addLocals( identifiers );
        this.addMembers( identifiers );
    }

    private addMembers( identifiers: IdentifierCollection ) {
        let members = this.getMembers();

        if ( members ) {
            members.forEach( ( declaration: ts.Declaration ) => {
                let identifier = (declaration as ts.NamedDeclaration).name as ts.Identifier;
                if ( identifier ) {
                    let t = identifier.flags;
                }
            } );
        }
    }


    private forEachReference( node: ts.Node, checker: ts.TypeChecker, onReference: ( s: ts.Symbol ) => void ) {
        node.forEachChild( function cb( node ) {
            if ( TsCore.isIdentifier( node ) ) {
                const sym = checker.getSymbolAtLocation( node );
                if ( sym ) onReference( sym );
            }
            else {
                node.forEachChild( cb );
            }
        } );
    }

    private addLocals( identifiers: IdentifierCollection ) {
        let locals = this.getLocals();

        if ( locals ) {
            locals.forEach( ( identifierSymbol: ts.Symbol ) => {
                let identifierId = Ast.getIdentifierUID( identifierSymbol );
                let identifier = identifiers.getIdentifier( identifierId );

                // Add the identifier to the container context
                identifier.addContainerReference( this );
                // Add the new identifier info to both the container and the all list
                this.localIdentifiers[identifierId] = identifier;

                // If the previously added identifier is not in the current container's local identifier table then
                // it must be excluded so that it's shortened name will not be used in this container.
                //if ( !Utils.hasProperty( this.localIdentifiers, identifierUID ) ) {
                //    this.excludedIdentifiers[identifierUID] = prevAddedIdentifier;
                //}

                this.identifierCount++;
            } );
        }
    }

    private initialize() {
        //if ( this.isClassifiable() ) {
        //    let containerSymbolUId: string = Ast.getIdentifierUID( containerSymbol );

        //    // Save the class symbol into the current container ( its parent )
        //    if ( !Utils.hasProperty( this.classifiableSymbols, containerSymbolUId ) ) {
        //        this.classifiableSymbols[containerSymbolUId] = containerSymbol;
        //    }

        //    // Save to the all classifiable containers table. See NOTE Inheritance below.
        //    if ( !Utils.hasProperty( this.classifiableContainers, containerSymbol.name ) ) {
        //        this.classifiableContainers[containerSymbol.name] = container; //nextContainer;
        //    }

        //    // Check for inheritance. We need to do this now because the checker cannot be used once names are shortened.
        //    let extendsClause = Ast.getExtendsClause( this.containerNode )

        //    if ( extendsClause ) {
        //        //let baseClassSymbol = this.checker.getSymbolAtLocation( <ts.Identifier>extendsClause.types[0].expression );

        //        // NOTE Inheritance:
        //        // If this child class is declared before the parent base class then the base class symbol will have symbolFlags.Merged.
        //        // When the base class is declared it will have a different symbol id from the symbol id determined here.
        //        // We should be able to use the symbol name for lookups in the classifiable containers table.
        //        // let baseClassAlias = this.checker.getAliasedSymbol(baseClassSymbol);

        //        //container.setBaseClass( baseClassSymbol );
        //        // TJT: was - nextContainer.setBaseClass( baseClassSymbol );
        //    }
        //}

    }
}