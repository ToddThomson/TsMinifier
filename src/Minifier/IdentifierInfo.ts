import * as ts from "typescript";
import { Container } from "./ContainerContext";
import { MinifierOptions } from "./MinifierOptions";
import { Ast } from "../../../TsToolsCommon/src/typescript/AstHelpers";
import { Utils } from "../../../TsToolsCommon/src/Utils/Utilities";
import { TsCore } from "../../../TsToolsCommon/src/Typescript/Core";
import { Logger } from "../../../TsToolsCommon/src/Reporting/Logger";

export class IdentifierInfo {
    private identifier: ts.Identifier;
    private symbol: ts.Symbol;
    private containers: ts.MapLike<Container> = {};
    private identifiers: ts.Identifier[] = [];

    public shortenedName: string = undefined;
    public isMinified: boolean = false;

    constructor( node: ts.Node, symbol: ts.Symbol ) {
        this.identifier = node as ts.Identifier;
        this.symbol = symbol;
        this.identifiers = [this.identifier];
    }

    public getSymbol(): ts.Symbol {
        return this.symbol;
    }

    public getName(): string {
        return this.symbol.name;
    }

    public getId(): string {
        let id = ( <any>this.symbol ).id;

        if ( id === undefined && this.symbol.valueDeclaration ) {
            id = ( <any>this.symbol.valueDeclaration ).symbol.id;
        }

        return id ? id.toString() : undefined;
    }

    public getContainers(): ts.MapLike<Container> {
        return this.containers;
    }

    public getIdentifiers(): ts.Identifier[] {
        return this.identifiers;
    }

    public addNodeReference( identifier: ts.Identifier ) {
        this.identifiers.push( identifier );
    }

    public addContainerReference( container: Container ): void {
        // We only need to keep track of a single reference in a container
        if ( !Utils.hasProperty( this.containers, container.getId().toString() ) ) {
            this.containers[ container.getId().toString() ] = container;
        }
    }

    public isNamespaceImportAlias(): boolean {
        if ( ( this.symbol.flags & ts.SymbolFlags.Alias ) > 0 ) {
            if ( this.symbol.declarations[0].kind === ts.SyntaxKind.NamespaceImport ) {
                return true;
            }
        }

        return false;
    }

    public isFunctionScopedVariable(): boolean {
        if ( ( this.symbol.flags & ts.SymbolFlags.FunctionScopedVariable ) > 0 ) {
            let variableDeclaration = this.getVariableDeclaration();

            if ( variableDeclaration ) {
                return true;
            }
        }

        return false;        
    }

    public isBlockScopedVariable(): boolean {
        if ( ( this.symbol.flags & ts.SymbolFlags.BlockScopedVariable ) > 0 ) {
            let variableDeclaration = this.getVariableDeclaration();

            if ( variableDeclaration ) {
                return ( ( variableDeclaration.parent.flags & ts.NodeFlags.Let ) !== 0 ) ||
                    ( ( variableDeclaration.parent.flags & ts.NodeFlags.Const ) !== 0 );
            }
        }

        return false;
    }

    public isParameter(): boolean {
        // Note: FunctionScopedVariable also indicates a parameter
        if ( ( this.symbol.flags & ts.SymbolFlags.FunctionScopedVariable ) > 0 ) {

            // A parameter has a value declaration
            if ( this.symbol.valueDeclaration.kind === ts.SyntaxKind.Parameter ) {
                return true;
            }
        }

        return false;
    }

    public hasNoMangleAnnotation() {
        // Scan through the symbol documentation for our @nomangle annotation

        // Call getDocumentationComment() to generate the JsDocTags for the symbol( the node ).
        // For some reason a ts.getDocumentationTags() is not exposed.
        this.symbol.getDocumentationComment( undefined );

        if ( this.symbol.declarations ) {
            const jsDocs: ts.JSDocTag[] = (<any>this.symbol.declarations[0]).jsDocCache;

            return Utils.forEach( jsDocs, ( tag ) => {
                return tag.getFullText().indexOf("@nomangle") >= 0;
            });
        }

        return false;
    }

    public isInternalClass(): boolean {
        
        // TJT: Review - should use the same export "override" logic as in isInternalFunction

        return Ast.isClassInternal( this.symbol );
    }

    public isInternalInterface(): boolean {
        return Ast.isInterfaceInternal( this.symbol );
    }

    public isInternalFunction( minifierOptions: MinifierOptions ): boolean {
        if ( this.symbol.flags & ts.SymbolFlags.Function ) {

            // A function has a value declaration
            if ( this.symbol.valueDeclaration.kind === ts.SyntaxKind.FunctionDeclaration ) {
                let flags = Ast.getSyntacticModifierFlagsNoCache( this.symbol.valueDeclaration );

                // If The function is from an extern API or ambient then it cannot be considered internal.
                if ( Ast.isExportContext( this.symbol ) || Ast.isAmbientContext( this.symbol ) ) {
                    return false;
                }

                if ( !( flags & ts.ModifierFlags.Export ) ) {
                    return true;
                }

                // Override export flag if function is not in our special package namespace.
                if ( minifierOptions.externalNamespace ) {
                    let node: ts.Node = this.symbol.valueDeclaration;
                    while ( node ) {
                        if ( node.flags & ts.NodeFlags.Namespace ) {
                            let nodeNamespaceName: string = (<any>node).name.text;

                            if ( nodeNamespaceName !== minifierOptions.externalNamespace ) {
                                return true;
                            }
                        }
                        node = node.parent;
                    }
                }
            }
        }

        return false;
    }

    public isPrivateMethod(): boolean {
        if ( ( this.symbol.flags & ts.SymbolFlags.Method ) > 0 ) {
            
            // We explicitly check that a method has a value declaration.
            if ( this.symbol.valueDeclaration === undefined ) {
                return false;
            }

            let flags = Ast.getSyntacticModifierFlagsNoCache( this.symbol.valueDeclaration );

            if ( ( flags & ts.ModifierFlags.Private ) > 0 ) {
                return true;
            }

            // Check if the method parent class or interface is "internal" ( non-private methods may be shortened too )
            let parent: ts.Symbol = ( <any>this.symbol ).parent;

            if ( parent && Ast.isClassInternal( parent ) ) {
                
                // TJT: Review - public methods of abstact classes are not shortened.
                if ( !Ast.isClassAbstract( parent ) ) {
                    return true;
                }
            }

            if ( parent && Ast.isInterfaceInternal( parent ) ) {
                // TODO: Interfaces methods are always external for now.
                return false;
            }
        }

        return false;
    }

    public isPrivateProperty(): boolean {
        if ( ( this.symbol.flags & ts.SymbolFlags.Property ) > 0 ) {
            
            // A property has a value declaration except when it is the "prototype" property.
            if ( this.symbol.valueDeclaration === undefined ) {
                return false;
            }

            let flags = Ast.getSyntacticModifierFlagsNoCache( this.symbol.valueDeclaration );

            if ( ( flags & ts.ModifierFlags.Private ) > 0 ) {
                return true;
            }

            // Check if the property parent class is "internal" ( non-private properties may be shortened too )
            let parent: ts.Symbol = ( <any>this.symbol ).parent;

            if ( parent && Ast.isClassInternal( parent ) ) {
                
                // TJT: Review - public properties of abstact classes are not shortened.
                if ( !Ast.isClassAbstract( parent ) ) {
                    return true;
                }
            }
        }

        return false;
    }

    private getVariableDeclaration(): ts.VariableDeclaration {
        switch ( ( <ts.Node>this.identifier ).parent.kind ) {
            case ts.SyntaxKind.VariableDeclaration:
                return <ts.VariableDeclaration>this.identifier.parent;

            case ts.SyntaxKind.VariableDeclarationList:
                Logger.warn( "VariableDeclaratioList in getVariableDeclaration() - returning null" );
                break;

            case ts.SyntaxKind.VariableStatement:
                Logger.warn( "VariableStatement in getVariableDeclaration() - returning null" );
                break;
        }

        return null;
    }
}