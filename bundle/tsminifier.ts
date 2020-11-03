import * as ts from "typescript";
import * as fs from "fs";
import * as path from "path";
import * as chalk from "chalk";
import { CompileOutput } from "ts2js";
import * as prettify from "prettier";
import * as tsc from "ts2js";
class IdentifierInfo {
  private identifier: ts.Identifier;
  private symbol: ts.Symbol;
  private containers: ts.MapLike<Container> = {};
  private identifiers: ts.Identifier[] = [];

  public shortenedName: string = undefined;
  public isMinified: boolean = false;

  constructor(node: ts.Node, symbol: ts.Symbol) {
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
    let id = (<any>this.symbol).id;

    if (id === undefined && this.symbol.valueDeclaration) {
      id = (<any>this.symbol.valueDeclaration).symbol.id;
    }

    return id ? id.toString() : undefined;
  }

  public getContainers(): ts.MapLike<Container> {
    return this.containers;
  }

  public getIdentifiers(): ts.Identifier[] {
    return this.identifiers;
  }

  public addNodeReference(identifier: ts.Identifier) {
    this.identifiers.push(identifier);
  }

  public addContainerReference(container: Container): void {
    // We only need to keep track of a single reference in a container
    if (!Utils.hasProperty(this.containers, container.getId().toString())) {
      this.containers[container.getId().toString()] = container;
    }
  }

  public isNamespaceImportAlias(): boolean {
    if ((this.symbol.flags & ts.SymbolFlags.Alias) > 0) {
      if (this.symbol.declarations[0].kind === ts.SyntaxKind.NamespaceImport) {
        return true;
      }
    }

    return false;
  }

  public isFunctionScopedVariable(): boolean {
    if ((this.symbol.flags & ts.SymbolFlags.FunctionScopedVariable) > 0) {
      let variableDeclaration = this.getVariableDeclaration();

      if (variableDeclaration) {
        return true;
      }
    }

    return false;
  }

  public isBlockScopedVariable(): boolean {
    if ((this.symbol.flags & ts.SymbolFlags.BlockScopedVariable) > 0) {
      let variableDeclaration = this.getVariableDeclaration();

      if (variableDeclaration) {
        return (
          (variableDeclaration.parent.flags & ts.NodeFlags.Let) !== 0 ||
          (variableDeclaration.parent.flags & ts.NodeFlags.Const) !== 0
        );
      }
    }

    return false;
  }

  public isParameter(): boolean {
    // Note: FunctionScopedVariable also indicates a parameter
    if ((this.symbol.flags & ts.SymbolFlags.FunctionScopedVariable) > 0) {
      // A parameter has a value declaration
      if (this.symbol.valueDeclaration.kind === ts.SyntaxKind.Parameter) {
        return true;
      }
    }

    return false;
  }

  public hasNoMangleAnnotation() {
    // Scan through the symbol documentation for our @nomangle annotation

    // Call getDocumentationComment() to generate the JsDocTags for the symbol( the node ).
    // For some reason a ts.getDocumentationTags() is not exposed.
    this.symbol.getDocumentationComment(undefined);

    if (this.symbol.declarations) {
      const jsDocs: ts.JSDocTag[] = (<any>this.symbol.declarations[0])
        .jsDocCache;

      return Utils.forEach(jsDocs, (tag) => {
        return tag.getFullText().indexOf("@nomangle") >= 0;
      });
    }

    return false;
  }

  public isInternalClass(): boolean {
    // TJT: Review - should use the same export "override" logic as in isInternalFunction

    return Ast.isClassInternal(this.symbol);
  }

  public isInternalInterface(): boolean {
    return Ast.isInterfaceInternal(this.symbol);
  }

  public isInternalFunction(minifierOptions: MinifierOptions): boolean {
    if (this.symbol.flags & ts.SymbolFlags.Function) {
      // A function has a value declaration
      if (
        this.symbol.valueDeclaration.kind === ts.SyntaxKind.FunctionDeclaration
      ) {
        let flags = Ast.getModifierFlagsNoCache(this.symbol.valueDeclaration);

        // If The function is from an extern API or ambient then it cannot be considered internal.
        if (
          Ast.isExportContext(this.symbol) ||
          Ast.isAmbientContext(this.symbol)
        ) {
          return false;
        }

        if (!(flags & ts.ModifierFlags.Export)) {
          return true;
        }

        // Override export flag if function is not in our special package namespace.
        if (minifierOptions.externalNamespace) {
          let node: ts.Node = this.symbol.valueDeclaration;
          while (node) {
            if (node.flags & ts.NodeFlags.Namespace) {
              let nodeNamespaceName: string = (<any>node).name.text;

              if (nodeNamespaceName !== minifierOptions.externalNamespace) {
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
    if ((this.symbol.flags & ts.SymbolFlags.Method) > 0) {
      // We explicitly check that a method has a value declaration.
      if (this.symbol.valueDeclaration === undefined) {
        return false;
      }

      let flags = Ast.getModifierFlagsNoCache(this.symbol.valueDeclaration);

      if ((flags & ts.ModifierFlags.Private) > 0) {
        return true;
      }

      // Check if the method parent class or interface is "internal" ( non-private methods may be shortened too )
      let parent: ts.Symbol = (<any>this.symbol).parent;

      if (parent && Ast.isClassInternal(parent)) {
        // TJT: Review - public methods of abstact classes are not shortened.
        if (!Ast.isClassAbstract(parent)) {
          return true;
        }
      }

      if (parent && Ast.isInterfaceInternal(parent)) {
        // TODO: Interfaces methods are always external for now.
        return false;
      }
    }

    return false;
  }

  public isPrivateProperty(): boolean {
    if ((this.symbol.flags & ts.SymbolFlags.Property) > 0) {
      // A property has a value declaration except when it is the "prototype" property.
      if (this.symbol.valueDeclaration === undefined) {
        return false;
      }

      let flags = Ast.getModifierFlagsNoCache(this.symbol.valueDeclaration);

      if ((flags & ts.ModifierFlags.Private) > 0) {
        return true;
      }

      // Check if the property parent class is "internal" ( non-private properties may be shortened too )
      let parent: ts.Symbol = (<any>this.symbol).parent;

      if (parent && Ast.isClassInternal(parent)) {
        // TJT: Review - public properties of abstact classes are not shortened.
        if (!Ast.isClassAbstract(parent)) {
          return true;
        }
      }
    }

    return false;
  }

  private getVariableDeclaration(): ts.VariableDeclaration {
    switch ((<ts.Node>this.identifier).parent.kind) {
      case ts.SyntaxKind.VariableDeclaration:
        return <ts.VariableDeclaration>this.identifier.parent;

      case ts.SyntaxKind.VariableDeclarationList:
        Logger.warn(
          "VariableDeclaratioList in getVariableDeclaration() - returning null"
        );
        break;

      case ts.SyntaxKind.VariableStatement:
        Logger.warn(
          "VariableStatement in getVariableDeclaration() - returning null"
        );
        break;
    }

    return null;
  }
}
class IdentifierCollection {
  private identifiers: ts.MapLike<IdentifierInfo> = {};

  public add(id: string, identifier: IdentifierInfo): boolean {
    if (this.contains(id)) {
      return false;
    }

    this.identifiers[id] = identifier;

    return true;
  }

  public contains(id: string): boolean {
    if (Utils.hasProperty(this.identifiers, id)) {
      return true;
    }

    return false;
  }

  public getIdentifier(id: string): IdentifierInfo {
    return this.identifiers[id];
  }
}
namespace Ast {
  export type AnyImportOrExport =
    | ts.ImportDeclaration
    | ts.ImportEqualsDeclaration
    | ts.ExportDeclaration;

  export interface ContainerNode extends ts.Node {
    nextContainer?: ContainerNode;
  }

  export const enum ContainerFlags {
    // The current node is not a container, and no container manipulation should happen before
    // recursing into it.
    None = 0,

    // The current node is a container.  It should be set as the current container (and block-
    // container) before recursing into it.  The current node does not have locals.  Examples:
    //
    //      Classes, ObjectLiterals, TypeLiterals, Interfaces...
    IsContainer = 1 << 0,

    // The current node is a block-scoped-container.  It should be set as the current block-
    // container before recursing into it.  Examples:
    //
    //      Blocks (when not parented by functions), Catch clauses, For/For-in/For-of statements...
    IsBlockScopedContainer = 1 << 1,

    // The current node is the container of a control flow path. The current control flow should
    // be saved and restored, and a new control flow initialized within the container.
    IsControlFlowContainer = 1 << 2,

    IsFunctionLike = 1 << 3,
    IsFunctionExpression = 1 << 4,
    HasLocals = 1 << 5,
    IsInterface = 1 << 6,
    IsObjectLiteralOrClassExpressionMethod = 1 << 7,
  }

  export function modifierToFlag(token: ts.SyntaxKind): ts.ModifierFlags {
    switch (token) {
      case ts.SyntaxKind.StaticKeyword:
        return ts.ModifierFlags.Static;
      case ts.SyntaxKind.PublicKeyword:
        return ts.ModifierFlags.Public;
      case ts.SyntaxKind.ProtectedKeyword:
        return ts.ModifierFlags.Protected;
      case ts.SyntaxKind.PrivateKeyword:
        return ts.ModifierFlags.Private;
      case ts.SyntaxKind.AbstractKeyword:
        return ts.ModifierFlags.Abstract;
      case ts.SyntaxKind.ExportKeyword:
        return ts.ModifierFlags.Export;
      case ts.SyntaxKind.DeclareKeyword:
        return ts.ModifierFlags.Ambient;
      case ts.SyntaxKind.ConstKeyword:
        return ts.ModifierFlags.Const;
      case ts.SyntaxKind.DefaultKeyword:
        return ts.ModifierFlags.Default;
      case ts.SyntaxKind.AsyncKeyword:
        return ts.ModifierFlags.Async;
      case ts.SyntaxKind.ReadonlyKeyword:
        return ts.ModifierFlags.Readonly;
    }

    return ts.ModifierFlags.None;
  }

  export function getExternalModuleName(
    node: AnyImportOrExport
  ): ts.Expression | undefined {
    switch (node.kind) {
      case ts.SyntaxKind.ImportDeclaration:
      case ts.SyntaxKind.ExportDeclaration:
        return node.moduleSpecifier;
      case ts.SyntaxKind.ImportEqualsDeclaration:
        return node.moduleReference.kind ===
          ts.SyntaxKind.ExternalModuleReference
          ? node.moduleReference.expression
          : undefined;
      default:
        return undefined;
    }
  }
  export function getModifierFlagsNoCache(node: ts.Node): ts.ModifierFlags {
    let flags = ts.ModifierFlags.None;

    if (node.modifiers) {
      for (const modifier of node.modifiers) {
        flags |= modifierToFlag(modifier.kind);
      }
    }

    if (
      node.flags & ts.NodeFlags.NestedNamespace ||
      (node.kind === ts.SyntaxKind.Identifier &&
        (<ts.Identifier>node).isInJSDocNamespace)
    ) {
      flags |= ts.ModifierFlags.Export;
    }

    return flags;
  }

  export function getIdentifierFromSymbol(
    symbol: ts.Symbol
  ): ts.Identifier | undefined {
    let decls = symbol.getDeclarations();

    for (let decl of decls) {
      let identifier = (decl as ts.NamedDeclaration).name as ts.Identifier;

      if (identifier) {
        return identifier;
      }
    }

    return undefined;
  }

  export function getSourceFileFromAnyImportExportNode(
    node: AnyImportOrExport,
    checker: ts.TypeChecker
  ): ts.SourceFile | undefined {
    let moduleName = Ast.getExternalModuleName(node as Ast.AnyImportOrExport);

    if (moduleName && moduleName.kind === ts.SyntaxKind.StringLiteral) {
      let symbol = checker.getSymbolAtLocation(moduleName);

      if (symbol && symbol.declarations && symbol.declarations[0]) {
        return symbol.declarations[0].getSourceFile();
      }
    }

    return undefined;
  }

  export function getSourceFileOfNode(node: ts.Node): ts.SourceFile {
    while (node && node.kind !== ts.SyntaxKind.SourceFile) {
      node = node.parent;
    }
    return <ts.SourceFile>node;
  }

  export function getSourceFileFromSymbol(symbol: ts.Symbol): ts.SourceFile {
    const declarations = symbol.getDeclarations();

    if (declarations && declarations.length > 0) {
      if (declarations[0].kind === ts.SyntaxKind.SourceFile) {
        return declarations[0].getSourceFile();
      }
    }

    return undefined;
  }

  export function getClassHeritageProperties(
    classNodeU: ts.Node,
    checker: ts.TypeChecker
  ): ts.Symbol[] {
    let classExportProperties: ts.Symbol[] = [];

    function getHeritageExportProperties(
      heritageClause: ts.HeritageClause,
      checker: ts.TypeChecker
    ): void {
      const inheritedTypeNodes = heritageClause.types;

      if (inheritedTypeNodes) {
        for (const typeRefNode of inheritedTypeNodes) {
          // The "properties" of inheritedType includes all the base class/interface properties
          const inheritedType: ts.Type = checker.getTypeAtLocation(typeRefNode);

          let inheritedTypeDeclaration = inheritedType.symbol.valueDeclaration;

          if (inheritedTypeDeclaration) {
            let inheritedTypeHeritageClauses = (<ts.ClassLikeDeclaration>(
              inheritedTypeDeclaration
            )).heritageClauses;

            if (inheritedTypeHeritageClauses) {
              for (const inheritedTypeHeritageClause of inheritedTypeHeritageClauses) {
                getHeritageExportProperties(
                  inheritedTypeHeritageClause,
                  checker
                );
              }
            }
          }

          const inheritedTypeProperties: ts.Symbol[] = inheritedType.getProperties();

          for (const propertySymbol of inheritedTypeProperties) {
            if (Ast.isExportContext(propertySymbol)) {
              classExportProperties.push(propertySymbol);
            }
          }
        }
      }
    }

    let heritageClauses = (<ts.ClassLikeDeclaration>classNodeU).heritageClauses;

    if (heritageClauses) {
      for (const heritageClause of heritageClauses) {
        getHeritageExportProperties(heritageClause, checker);
      }
    }

    return classExportProperties;
  }

  export function getClassAbstractProperties(
    extendsClause: ts.HeritageClause,
    checker: ts.TypeChecker
  ): ts.Symbol[] {
    let abstractProperties: ts.Symbol[] = [];

    const abstractTypeNodes = extendsClause.types;

    for (const abstractTypeNode of abstractTypeNodes) {
      const abstractType: ts.Type = checker.getTypeAtLocation(abstractTypeNode);
      let abstractTypeSymbol = abstractType.getSymbol();

      if (abstractTypeSymbol.valueDeclaration) {
        if (
          getModifierFlagsNoCache(abstractTypeSymbol.valueDeclaration) &
          ts.ModifierFlags.Abstract
        ) {
          const props: ts.Symbol[] = abstractType.getProperties();

          for (const prop of props) {
            abstractProperties.push(prop);
          }
        }
      }
    }

    return abstractProperties;
  }

  export function getImplementsProperties(
    implementsClause: ts.HeritageClause,
    checker: ts.TypeChecker
  ): ts.Symbol[] {
    let implementsProperties: ts.Symbol[] = [];

    const typeNodes = implementsClause.types;

    for (const typeNode of typeNodes) {
      const type: ts.Type = checker.getTypeAtLocation(typeNode);
      const props: ts.Symbol[] = type.getProperties();

      for (const prop of props) {
        implementsProperties.push(prop);
      }
    }

    return implementsProperties;
  }

  export function getIdentifierUID(symbol: ts.Symbol): string {
    if (!symbol) {
      return undefined;
    }

    let id = (<any>symbol).id;

    // Try to get the symbol id from the identifier value declaration
    if (id === undefined && symbol.valueDeclaration) {
      id = (<any>symbol.valueDeclaration).symbol.id;
    }

    return id ? id.toString() : undefined;
  }

  export function getContainerFlags(node: ts.Node): ContainerFlags {
    switch (node.kind) {
      case ts.SyntaxKind.ClassExpression:
      case ts.SyntaxKind.ClassDeclaration:
      case ts.SyntaxKind.EnumDeclaration:
      case ts.SyntaxKind.ObjectLiteralExpression:
      case ts.SyntaxKind.TypeLiteral:
      case ts.SyntaxKind.JSDocTypeLiteral:
      case ts.SyntaxKind.JsxAttributes:
        return ContainerFlags.IsContainer;

      case ts.SyntaxKind.InterfaceDeclaration:
        return ContainerFlags.IsContainer | ContainerFlags.IsInterface;

      case ts.SyntaxKind.ModuleDeclaration:
      case ts.SyntaxKind.TypeAliasDeclaration:
      case ts.SyntaxKind.MappedType:
        return ContainerFlags.IsContainer | ContainerFlags.HasLocals;

      case ts.SyntaxKind.SourceFile:
        return (
          ContainerFlags.IsContainer |
          ContainerFlags.IsControlFlowContainer |
          ContainerFlags.HasLocals
        );

      case ts.SyntaxKind.MethodDeclaration:
        if (isObjectLiteralOrClassExpressionMethod(node)) {
          return (
            ContainerFlags.IsContainer |
            ContainerFlags.IsControlFlowContainer |
            ContainerFlags.HasLocals |
            ContainerFlags.IsFunctionLike |
            ContainerFlags.IsObjectLiteralOrClassExpressionMethod
          );
        }
      // falls through
      case ts.SyntaxKind.Constructor:
      case ts.SyntaxKind.FunctionDeclaration:
      case ts.SyntaxKind.MethodSignature:
      case ts.SyntaxKind.GetAccessor:
      case ts.SyntaxKind.SetAccessor:
      case ts.SyntaxKind.CallSignature:
      case ts.SyntaxKind.JSDocFunctionType:
      case ts.SyntaxKind.FunctionType:
      case ts.SyntaxKind.ConstructSignature:
      case ts.SyntaxKind.IndexSignature:
      case ts.SyntaxKind.ConstructorType:
        return (
          ContainerFlags.IsContainer |
          ContainerFlags.IsControlFlowContainer |
          ContainerFlags.HasLocals |
          ContainerFlags.IsFunctionLike
        );

      case ts.SyntaxKind.FunctionExpression:
      case ts.SyntaxKind.ArrowFunction:
        return (
          ContainerFlags.IsContainer |
          ContainerFlags.IsControlFlowContainer |
          ContainerFlags.HasLocals |
          ContainerFlags.IsFunctionLike |
          ContainerFlags.IsFunctionExpression
        );

      case ts.SyntaxKind.ModuleBlock:
        return ContainerFlags.IsControlFlowContainer;
      case ts.SyntaxKind.PropertyDeclaration:
        return (<ts.PropertyDeclaration>node).initializer
          ? ContainerFlags.IsControlFlowContainer
          : 0;

      case ts.SyntaxKind.CatchClause:
      case ts.SyntaxKind.ForStatement:
      case ts.SyntaxKind.ForInStatement:
      case ts.SyntaxKind.ForOfStatement:
      case ts.SyntaxKind.CaseBlock:
        return ContainerFlags.IsBlockScopedContainer;

      case ts.SyntaxKind.Block:
        // do not treat blocks directly inside a function as a block-scoped-container.
        // Locals that reside in this block should go to the function locals. Otherwise 'x'
        // would not appear to be a redeclaration of a block scoped local in the following
        // example:
        //
        //      function foo() {
        //          var x;
        //          let x;
        //      }
        //
        // If we placed 'var x' into the function locals and 'let x' into the locals of
        // the block, then there would be no collision.
        //
        // By not creating a new block-scoped-container here, we ensure that both 'var x'
        // and 'let x' go into the Function-container's locals, and we do get a collision
        // conflict.
        return isFunctionLike(node.parent)
          ? ContainerFlags.None
          : ContainerFlags.IsBlockScopedContainer;
    }

    return ContainerFlags.None;
  }

  export function getImplementsClause(node: ts.Node): ts.HeritageClause {
    if (node) {
      let heritageClauses = (<ts.ClassLikeDeclaration>node).heritageClauses;

      if (heritageClauses) {
        for (const clause of heritageClauses) {
          if (clause.token === ts.SyntaxKind.ImplementsKeyword) {
            return clause;
          }
        }
      }
    }

    return undefined;
  }

  export function getExtendsClause(node: ts.Node): ts.HeritageClause {
    if (node) {
      let heritageClauses = (<ts.ClassLikeDeclaration>node).heritageClauses;

      if (heritageClauses) {
        for (const clause of heritageClauses) {
          if (clause.token === ts.SyntaxKind.ExtendsKeyword) {
            return clause;
          }
        }
      }
    }

    return undefined;
  }

  // An alias symbol is created by one of the following declarations:
  // import <symbol> = ...
  // import <symbol> from ...
  // import * as <symbol> from ...
  // import { x as <symbol> } from ...
  // export { x as <symbol> } from ...
  // export = ...
  // export default ...
  export function isAliasSymbolDeclaration(node: ts.Node): boolean {
    return (
      node.kind === ts.SyntaxKind.ImportEqualsDeclaration ||
      (node.kind === ts.SyntaxKind.ImportClause &&
        !!(<ts.ImportClause>node).name) ||
      node.kind === ts.SyntaxKind.NamespaceImport ||
      node.kind === ts.SyntaxKind.ImportSpecifier ||
      node.kind === ts.SyntaxKind.ExportSpecifier ||
      (node.kind === ts.SyntaxKind.ExportAssignment &&
        (<ts.ExportAssignment>node).expression.kind ===
          ts.SyntaxKind.Identifier)
    );
  }

  export function isIdentifier(node: ts.Node): boolean {
    return node.kind === ts.SyntaxKind.Identifier;
  }

  export function isPrototypeAccessAssignment(expression: ts.Node): boolean {
    if (expression.kind !== ts.SyntaxKind.BinaryExpression) {
      return false;
    }

    const expr = <ts.BinaryExpression>expression;

    if (
      expr.operatorToken.kind !== ts.SyntaxKind.EqualsToken ||
      expr.left.kind !== ts.SyntaxKind.PropertyAccessExpression
    ) {
      return false;
    }

    const lhs = <ts.PropertyAccessExpression>expr.left;

    if (lhs.expression.kind === ts.SyntaxKind.PropertyAccessExpression) {
      // chained dot, e.g. x.y.z = expr; this var is the 'x.y' part
      const innerPropertyAccess = <ts.PropertyAccessExpression>lhs.expression;

      if (
        innerPropertyAccess.expression.kind === ts.SyntaxKind.Identifier &&
        innerPropertyAccess.name.text === "prototype"
      ) {
        return true;
      }
    }

    return false;
  }

  export function isFunctionLike(node: ts.Node): node is ts.FunctionLike {
    return node && isFunctionLikeKind(node.kind);
  }

  export function isFunctionLikeDeclarationKind(kind: ts.SyntaxKind): boolean {
    switch (kind) {
      case ts.SyntaxKind.FunctionDeclaration:
      case ts.SyntaxKind.MethodDeclaration:
      case ts.SyntaxKind.Constructor:
      case ts.SyntaxKind.GetAccessor:
      case ts.SyntaxKind.SetAccessor:
      case ts.SyntaxKind.FunctionExpression:
      case ts.SyntaxKind.ArrowFunction:
        return true;
      default:
        return false;
    }
  }

  export function isFunctionLikeKind(kind: ts.SyntaxKind): boolean {
    switch (kind) {
      case ts.SyntaxKind.MethodSignature:
      case ts.SyntaxKind.CallSignature:
      case ts.SyntaxKind.ConstructSignature:
      case ts.SyntaxKind.IndexSignature:
      case ts.SyntaxKind.FunctionType:
      case ts.SyntaxKind.JSDocFunctionType:
      case ts.SyntaxKind.ConstructorType:
        return true;
      default:
        return isFunctionLikeDeclarationKind(kind);
    }
  }

  export function isObjectLiteralOrClassExpressionMethod(
    node: ts.Node
  ): node is ts.MethodDeclaration {
    return (
      node.kind === ts.SyntaxKind.MethodDeclaration &&
      (node.parent.kind === ts.SyntaxKind.ObjectLiteralExpression ||
        node.parent.kind === ts.SyntaxKind.ClassExpression)
    );
  }

  export function isInterfaceInternal(symbol: ts.Symbol): boolean {
    if (symbol && symbol.flags & ts.SymbolFlags.Interface) {
      if (symbol.valueDeclaration) {
        let flags = getModifierFlagsNoCache(symbol.valueDeclaration);

        //if ( !( flags & ts.ModifierFlags.Export ) ) {
        //    return true;
        //}

        // FUTURE: How to make interfaces internal by convention?
        return false;
      }
    }

    return false;
  }

  export function isClassInternal(symbol: ts.Symbol): boolean {
    if (symbol && symbol.flags & ts.SymbolFlags.Class) {
      // If the class is from an extern API or ambient then it cannot be considered internal.
      if (Ast.isExportContext(symbol) || Ast.isAmbientContext(symbol)) {
        return false;
      }

      // A class always has a value declaration
      let flags = getModifierFlagsNoCache(symbol.valueDeclaration);

      // By convention, "Internal" classes are ones that are not exported.
      if (!(flags & ts.ModifierFlags.Export)) {
        return true;
      }
    }

    return false;
  }

  export function isClassAbstract(classSymbol: ts.Symbol): boolean {
    if (classSymbol && classSymbol.valueDeclaration) {
      if (
        getModifierFlagsNoCache(classSymbol.valueDeclaration) &
        ts.ModifierFlags.Abstract
      ) {
        return true;
      }
    }

    return false;
  }

  export function isKeyword(token: ts.SyntaxKind): boolean {
    return (
      ts.SyntaxKind.FirstKeyword <= token && token <= ts.SyntaxKind.LastKeyword
    );
  }

  export function isNamespaceImport(node: ts.Node): boolean {
    return node.kind === ts.SyntaxKind.NamespaceImport;
  }

  export function isPuncuation(token: ts.SyntaxKind): boolean {
    return (
      ts.SyntaxKind.FirstPunctuation <= token &&
      token <= ts.SyntaxKind.LastPunctuation
    );
  }

  export function isTrivia(token: ts.SyntaxKind) {
    return (
      ts.SyntaxKind.FirstTriviaToken <= token &&
      token <= ts.SyntaxKind.LastTriviaToken
    );
  }

  export function isExportProperty(propertySymbol: ts.Symbol): boolean {
    let node: ts.Node = propertySymbol.valueDeclaration;
    while (node) {
      if (getModifierFlagsNoCache(node) & ts.ModifierFlags.Export) {
        return true;
      }
      node = node.parent;
    }

    return false;
  }

  export function isExportContext(propertySymbol: ts.Symbol): boolean {
    let node: ts.Node = propertySymbol.valueDeclaration;

    while (node) {
      if (node.flags & ts.NodeFlags.ExportContext) {
        return true;
      }

      node = node.parent;
    }

    return false;
  }

  export function isAmbientContext(propertySymbol: ts.Symbol): boolean {
    let node: ts.Node = propertySymbol.valueDeclaration;

    while (node) {
      if (getModifierFlagsNoCache(node) & ts.ModifierFlags.Ambient) {
        return true;
      }

      node = node.parent;
    }

    return false;
  }

  export function isAmbientModule(symbol: ts.Symbol): boolean {
    const declarations = symbol.getDeclarations();

    if (declarations && declarations.length > 0) {
      const declaration = symbol.getDeclarations()[0];

      if (declaration.kind === ts.SyntaxKind.ModuleDeclaration) {
        if (declaration.modifiers) {
          for (const modifier of declaration.modifiers) {
            if (modifier.kind === ts.SyntaxKind.DeclareKeyword) {
              return true;
            }
          }
        }
      }
    }

    return false;
  }

  export function isSourceCodeFile(file: ts.SourceFile): boolean {
    return file.kind === ts.SyntaxKind.SourceFile && !file.isDeclarationFile;
  }

  export function isSourceCodeModule(symbol: ts.Symbol): boolean {
    const declarations = symbol.getDeclarations();

    if (declarations && declarations.length > 0) {
      const declaration = symbol.getDeclarations()[0];

      return (
        declaration.kind === ts.SyntaxKind.SourceFile &&
        !(<ts.SourceFile>declaration).isDeclarationFile
      );
    }

    return false;
  }

  export function isAnyImportOrExport(
    node: ts.Node
  ): node is AnyImportOrExport {
    switch (node.kind) {
      case ts.SyntaxKind.ImportDeclaration:
      case ts.SyntaxKind.ImportEqualsDeclaration:
        return true;
      case ts.SyntaxKind.ExportDeclaration:
        return true;
      default:
        return false;
    }
  }
}
namespace TsCore {
  export interface TsConfigFile {
    errors: ts.Diagnostic[];
    config?: any;
    fileName?: string;
    basePath?: string;
  }

  /** Does nothing. */
  export function noop(_?: {} | null | undefined): void {} // tslint:disable-line no-empty

  /** Do nothing and return false */
  export function returnFalse(): false {
    return false;
  }

  /** Do nothing and return true */
  export function returnTrue(): true {
    return true;
  }

  /** Do nothing and return undefined */
  export function returnUndefined(): undefined {
    return undefined;
  }

  /** Returns its argument. */
  export function identity<T>(x: T) {
    return x;
  }

  /** Returns lower case string */
  export function toLowerCase(x: string) {
    return x.toLowerCase();
  }

  /** Throws an error because a function is not implemented. */
  export function notImplemented(): never {
    throw new Error("Not implemented");
  }

  export function fileExtensionIs(path: string, extension: string): boolean {
    let pathLen = path.length;
    let extLen = extension.length;
    return (
      pathLen > extLen && path.substr(pathLen - extLen, extLen) === extension
    );
  }

  export function fileExtensionIsOneOf(
    path: string,
    extensions: ReadonlyArray<string>
  ): boolean {
    for (const extension of extensions) {
      if (fileExtensionIs(path, extension)) {
        return true;
      }
    }

    return false;
  }

  export const supportedExtensions = [".ts", ".tsx", ".d.ts"];

  export const moduleFileExtensions = supportedExtensions;

  export function isSupportedSourceFileName(fileName: string) {
    if (!fileName) {
      return false;
    }

    for (let extension of supportedExtensions) {
      if (fileExtensionIs(fileName, extension)) {
        return true;
      }
    }

    return false;
  }

  export function createDiagnostic(
    message: ts.DiagnosticMessage,
    ...args: any[]
  ): ts.Diagnostic {
    let text = message.message;

    if (arguments.length > 1) {
      text = formatStringFromArgs(text, arguments, 1);
    }

    return {
      file: undefined,
      start: undefined,
      length: undefined,
      messageText: text,
      category: message.category,
      code: message.code,
    };
  }

  function formatStringFromArgs(text: string, args: any, baseIndex: number) {
    baseIndex = baseIndex || 0;
    return text.replace(/{(\d+)}/g, function (match: any, index: any) {
      return args[+index + baseIndex];
    });
  }

  export function normalizeSlashes(path: string): string {
    return path.replace(/\\/g, "/");
  }

  export function outputExtension(path: string): string {
    return path.replace(/\.ts/, ".js");
  }

  export function getConfigFileName(
    configFilePath: string
  ): string | undefined {
    try {
      var isConfigDirectory = fs.lstatSync(configFilePath).isDirectory();
    } catch (e) {
      return undefined;
    }

    if (isConfigDirectory) {
      return path.join(configFilePath, "tsconfig.json");
    } else {
      return configFilePath;
    }
  }

  /**
   * Parse standard project configuration objects: compilerOptions, files.
   * @param configFilePath
   */
  export function readConfigFile(configFilePath: string): TsCore.TsConfigFile {
    let configFileName = TsCore.getConfigFileName(configFilePath);

    if (!configFileName) {
      let diagnostic = TsCore.createDiagnostic(
        {
          code: 6064,
          category: ts.DiagnosticCategory.Error,
          key: "Cannot_read_project_path_0_6064",
          message: "Cannot read project path '{0}'.",
        },
        configFilePath
      );

      return {
        errors: [diagnostic],
      };
    }

    let readConfigResult = ts.readConfigFile(configFileName, (fileName) => {
      return ts.sys.readFile(fileName);
    });

    if (readConfigResult.error) {
      return {
        errors: [readConfigResult.error],
      };
    }

    let fullFileName = path.resolve(configFileName);

    return {
      fileName: fullFileName,
      basePath: path.dirname(fullFileName),
      config: readConfigResult.config,
      errors: [],
    };
  }

  export function getProjectConfig(
    configFilePath: string
  ): ts.ParsedCommandLine {
    let configFile = readConfigFile(configFilePath);

    if (configFile.errors.length > 0) {
      return {
        options: undefined,
        fileNames: [],
        errors: configFile.errors,
      };
    }

    return ts.parseJsonConfigFileContent(
      configFile.config,
      ts.sys,
      configFile.basePath,
      undefined,
      configFile.fileName
    );
  }
}
var level = {
  none: 0,
  error: 1,
  warn: 2,
  trace: 3,
  info: 4,
};
class Logger {
  private static logLevel: number = level.none;
  private static logName: string = "logger";

  public static setLevel(level: number) {
    this.logLevel = level;
  }

  public static setName(name: string) {
    this.logName = name;
  }

  public static log(...args: any[]) {
    console.log(chalk.gray(`[${this.logName}]`), ...args);
  }

  public static info(...args: any[]) {
    if (this.logLevel < level.info) {
      return;
    }

    console.log(
      chalk.gray(`[${this.logName}]` + chalk.blue(" INFO: ")),
      ...args
    );
  }

  public static warn(...args: any[]) {
    if (this.logLevel < level.warn) {
      return;
    }

    console.log(`[${this.logName}]` + chalk.yellow(" WARNING: "), ...args);
  }

  public static error(...args: any[]) {
    if (this.logLevel < level.error) {
      return;
    }

    console.log(`[${this.logName}]` + chalk.red(" ERROR: "), ...args);
  }

  public static trace(...args: any[]) {
    if (this.logLevel < level.error) {
      return;
    }

    console.log(`[${this.logName}]` + chalk.gray(" TRACE: "), ...args);
  }
}
namespace Utils {
  export function forEach<T, U>(
    array: ReadonlyArray<T> | undefined,
    callback: (element: T, index: number) => U | undefined
  ): U | undefined {
    if (array) {
      for (let i = 0, len = array.length; i < len; i++) {
        let result = callback(array[i], i);
        if (result) {
          return result;
        }
      }
    }

    return undefined;
  }

  export function contains<T>(array: T[], value: T): boolean {
    if (array) {
      for (let v of array) {
        if (v === value) {
          return true;
        }
      }
    }

    return false;
  }

  let hasOwnProperty = Object.prototype.hasOwnProperty;

  export function hasProperty<T>(map: ts.MapLike<T>, key: string): boolean {
    return hasOwnProperty.call(map, key);
  }

  export function map<T, U>(array: T[], f: (x: T) => U): U[] {
    let result: U[];
    if (array) {
      result = [];
      for (let v of array) {
        result.push(f(v));
      }
    }

    return result;
  }

  export function extend(first: any, second: any): any {
    let result: any = {};

    for (let id in first) {
      (result as any)[id] = first[id];
    }
    for (let id in second) {
      if (!hasProperty(result, id)) {
        (result as any)[id] = second[id];
      }
    }
    return result;
  }

  export function replaceAt(str: string, index: number, character: string) {
    return (
      str.substr(0, index) + character + str.substr(index + character.length)
    );
  }
}

class ContainerIdGenerator {
  static nextId = 1;

  static getNextId(): number {
    return this.nextId++;
  }
}
class Container {
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

  constructor(node: ts.Node, checker: ts.TypeChecker) {
    this.containerNode = node;
    this.checker = checker;
    this.id = ContainerIdGenerator.getNextId();
    this.containerFlags = Ast.getContainerFlags(node);

    if (this.containerFlags & Ast.ContainerFlags.IsBlockScopedContainer) {
      this.isBlockScoped = true;

      // A block scoped container's parent is the parent function scope container.
      // this.parent = parentContainer.getParent();
    } else {
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
    if (this.isBlockScoped) {
      // The name generator index for block scoped containers is obtained from the parent container
      return this.parent.getNameIndex();
    }

    return this.nameIndex++;
  }

  public getNode(): ts.Node {
    return this.containerNode;
  }

  private getMembers(): ts.NodeArray<ts.Declaration> {
    if (this.containerNode) {
      switch (this.containerNode.kind) {
        // TJT: LiteralTypes ???
        case ts.SyntaxKind.ClassDeclaration:
        case ts.SyntaxKind.ClassExpression:
          return (<ts.ClassDeclaration>this.containerNode).members;

        case ts.SyntaxKind.InterfaceDeclaration:
          return (<ts.ClassDeclaration>this.containerNode).members;

        case ts.SyntaxKind.EnumDeclaration:
          return (<ts.EnumDeclaration>this.containerNode).members;

        default:
          Logger.trace(
            "Container::getMembers() unprocessed container kind: ",
            this.containerNode.kind,
            this.getId()
          );
      }
    }

    return undefined;
  }

  private getLocals(): ts.SymbolTable {
    if (
      this.containerNode &&
      this.containerFlags & Ast.ContainerFlags.HasLocals
    ) {
      return (<any>this.containerNode).locals;
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
    let containerSymbol: ts.Symbol = (<any>this.containerNode).symbol;

    const classifiableSymbolFlags =
      ts.SymbolFlags.Class |
      ts.SymbolFlags.Enum |
      ts.SymbolFlags.TypeAlias |
      ts.SymbolFlags.Interface |
      ts.SymbolFlags.TypeParameter |
      ts.SymbolFlags.Module |
      ts.SymbolFlags.Alias;

    if (containerSymbol && containerSymbol.flags & classifiableSymbolFlags) {
      return true;
    }

    return false;
  }

  public isFunctionScoped(): boolean {
    if (
      this.containerFlags &
      (Ast.ContainerFlags.IsContainer | Ast.ContainerFlags.HasLocals)
    ) {
      return true;
    }

    return false;
  }

  public setBaseClass(baseClass: ts.Symbol): void {
    if (baseClass.flags & ts.SymbolFlags.Class) {
      this.baseClass = baseClass;
    }
  }

  public getBaseClass(): ts.Symbol {
    return this.baseClass;
  }

  public hasChild(container: Container): boolean {
    for (let i = 0; i < this.childContainers.length; i++) {
      if (container.getId() === this.childContainers[i].getId()) return true;
    }

    return false;
  }

  public addIdentifiers(identifiers: IdentifierCollection): void {
    this.addLocals(identifiers);
    this.addMembers(identifiers);
  }

  private addMembers(identifiers: IdentifierCollection) {
    let members = this.getMembers();

    if (members) {
      members.forEach((declaration: ts.Declaration) => {
        let identifier = (declaration as ts.NamedDeclaration)
          .name as ts.Identifier;
        if (identifier) {
          let t = identifier.flags;
        }
      });
    }
  }

  private forEachReference(
    node: ts.Node,
    checker: ts.TypeChecker,
    onReference: (s: ts.Symbol) => void
  ) {
    node.forEachChild(function cb(node) {
      if (Ast.isIdentifier(node)) {
        const sym = checker.getSymbolAtLocation(node);
        if (sym) onReference(sym);
      } else {
        node.forEachChild(cb);
      }
    });
  }

  private addLocals(identifiers: IdentifierCollection) {
    let locals = this.getLocals();

    if (locals) {
      locals.forEach((identifierSymbol: ts.Symbol) => {
        let identifierId = Ast.getIdentifierUID(identifierSymbol);
        let identifier = identifiers.getIdentifier(identifierId);

        // Add the identifier to the container context
        identifier.addContainerReference(this);
        // Add the new identifier info to both the container and the all list
        this.localIdentifiers[identifierId] = identifier;

        // If the previously added identifier is not in the current container's local identifier table then
        // it must be excluded so that it's shortened name will not be used in this container.
        //if ( !Utils.hasProperty( this.localIdentifiers, identifierUID ) ) {
        //    this.excludedIdentifiers[identifierUID] = prevAddedIdentifier;
        //}

        this.identifierCount++;
      });
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
interface MinifierOptions {
  mangleIdentifiers?: boolean;
  removeWhitespace?: boolean;
  externalNamespace?: string;
}
class NameGenerator {
  // Base64 char set: 26 lowercase letters + 26 uppercase letters + '$' + '_' + 10 digits
  private base64Chars =
    "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ$_0123456789";

  public getName(index: number): string {
    // 2 and 3 letter reserved words that cannot be used in identifier names
    const RESERVED_KEYWORDS: string[] = [
      "do",
      "if",
      "in",
      "for",
      "int",
      "let",
      "new",
      "try",
      "var",
    ];
    let name: any;

    while (true) {
      name = this.generateName(index++);

      if (RESERVED_KEYWORDS.indexOf(name) > 0) {
        continue;
      } else {
        return name;
      }
    }
  }

  private generateName(index: number): string {
    let id = index;
    // The first 54 chars of the base64 char set are used for the first char of the identifier
    let name: string = this.base64Chars[id % 54];
    id = Math.floor(id / 54);

    while (id > 0) {
      // The full base64 char set is used after the first char of the identifier
      name += this.base64Chars[id % 64];
      id = Math.floor(id / 64);
    }

    return name;
  }
}

interface MinifierStatistics {
  whiteSpaceBefore: number;
  whiteSpaceAfter: number;
  whiteSpaceTime: number;

  identifierCount: number;
  mangledIdentifierCount: number;
  transformTime: number;
}
class StatisticsReporter {
  public reportTitle(name: string) {
    Logger.log(name);
  }

  public reportValue(name: string, value: string) {
    Logger.log(
      this.padRight(name + ":", 25) +
        chalk.magenta(this.padLeft(value.toString(), 10))
    );
  }

  public reportCount(name: string, count: number) {
    this.reportValue(name, "" + count);
  }

  public reportTime(name: string, time: number) {
    this.reportValue(name, (time / 1000).toFixed(2) + "s");
  }

  public reportPercentage(name: string, percentage: number) {
    this.reportValue(name, percentage.toFixed(2) + "%");
  }

  private padLeft(s: string, length: number) {
    while (s.length < length) {
      s = " " + s;
    }
    return s;
  }

  private padRight(s: string, length: number) {
    while (s.length < length) {
      s = s + " ";
    }

    return s;
  }
}

namespace Debug {
  export function assert(condition: boolean, message?: string) {
    if (!condition) {
      message = message || "Assertion failed";

      if (typeof Error !== "undefined") {
        throw new Error(message);
      }

      throw message;
    }
  }
}
class Minifier {
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

  constructor(
    program: ts.Program,
    compilerOptions: ts.CompilerOptions,
    minifierOptions: MinifierOptions
  ) {
    this.checker = program.getTypeChecker();
    this.compilerOptions = compilerOptions;
    this.minifierOptions = minifierOptions;

    this.nameGenerator = new NameGenerator();
    this.identifiers = new IdentifierCollection();
  }

  public transform(sourceFile: ts.SourceFile): ts.SourceFile {
    Logger.setLevel(4);
    this.sourceFile = sourceFile;

    return this.minify(sourceFile);
  }

  private addToContainerChain(container: Container) {
    if (!this.sourceFileContainer) {
      this.sourceFileContainer = container;
    }

    if (this.lastContainer) {
      this.lastContainer.nextContainer = container;
    }

    this.lastContainer = container;
  }

  private buildContainerChain(sourceFileNode: Ast.ContainerNode) {
    var currentContainerNode = sourceFileNode;

    while (currentContainerNode) {
      var container = new Container(currentContainerNode, this.checker);

      this.addToContainerChain(container);

      container.addIdentifiers(this.identifiers);

      currentContainerNode = currentContainerNode.nextContainer;
    }
  }

  private replaceIdentifiersNamedOldNameWithNewName2(
    context: ts.TransformationContext
  ) {
    const visitor: ts.Visitor = (node: ts.Node) => {
      if (Ast.isIdentifier(node)) {
        return ts.createIdentifier("newName");
      }
      return ts.visitEachChild(node, visitor, context);
    };

    return (node: ts.SourceFile) => ts.visitNode(node, visitor);
  }

  private getIdentifiers(sourceFile: ts.SourceFile): ts.Identifier[] {
    var identifierNodes: ts.Identifier[] = [];

    function visitSourceFileNodes(node: ts.Node): any {
      if (node.kind === ts.SyntaxKind.Identifier) {
        identifierNodes.push(node as ts.Identifier);
      }

      return ts.forEachChild(node, visitSourceFileNodes);
    }

    visitSourceFileNodes(sourceFile);

    return identifierNodes;
  }

  private minify(sourceFile: ts.SourceFile): ts.SourceFile {
    this.transformTime = new Date().getTime();

    let identifierNodes = this.getIdentifiers(sourceFile);

    for (let identifierNode of identifierNodes) {
      let symbol = this.checker.getSymbolAtLocation(identifierNode);
      let symbolId = Ast.getIdentifierUID(symbol);

      if (!this.identifiers.contains(symbolId)) {
        let identifier = new IdentifierInfo(identifierNode, symbol);

        Logger.info(
          "Adding new identifier: ",
          identifier.getName(),
          identifier.getId()
        );

        // Add the new identifier info to both the container and the all list
        this.identifiers.add(symbolId, identifier);
      } else {
        let identifier = this.identifiers.getIdentifier(symbolId);

        Logger.info(
          "Adding identifier node reference: ",
          identifier.getName(),
          identifier.getId()
        );
        identifier.addNodeReference(identifierNode);
      }
    }

    // Walk the sourceFile to build containers and the identifiers within.
    this.buildContainerChain(sourceFile);

    this.shortenIdentifiers();

    this.transformTime = new Date().getTime() - this.transformTime;

    if (this.compilerOptions.diagnostics) this.reportMinifyStatistics();

    return sourceFile;
  }

  private shortenIdentifiers(): void {
    // NOTE: Once identifier names are shortened, the typescript checker cannot be used.

    // We first need to process all the class containers to determine which properties cannot be shortened
    // ( public, abstract, implements, extends ).

    for (let classContainerKey in this.classifiableContainers) {
      let classContainer = this.classifiableContainers[classContainerKey];

      let abstractProperties: ts.Symbol[] = [];
      let heritageProperties: ts.Symbol[] = [];
      let implementsProperties: ts.Symbol[] = [];

      let extendsClause = Ast.getExtendsClause(classContainer.getNode());

      if (extendsClause) {
        // Check for abstract properties...

        // TODO: Abstract properties are currently not shortened, but they could possibly be.
        //       The child class that implements a parent class property would need to have the same shortened name.

        abstractProperties = Ast.getClassAbstractProperties(
          extendsClause,
          this.checker
        );
      }

      let implementsClause = Ast.getImplementsClause(classContainer.getNode());

      if (implementsClause) {
        implementsProperties = Ast.getImplementsProperties(
          implementsClause,
          this.checker
        );
      }

      heritageProperties = Ast.getClassHeritageProperties(
        classContainer.getNode(),
        this.checker
      );

      // Join the abstract and implements properties
      let excludedProperties = heritageProperties.concat(
        abstractProperties,
        implementsProperties
      );

      Logger.trace(
        "Class excluded properties for: ",
        (<any>classContainer.getNode()).name.text,
        excludedProperties.length,
        classContainer.getId()
      );

      classContainer.excludedProperties = excludedProperties;
    }

    // Walk through the container identifiers starting at the source file container...
    let container = this.sourceFileContainer;
    while (container) {
      this.shortenContainerIdentifiers(container);

      container = container.nextContainer;
    }
  }

  private shortenContainerIdentifiers(container: Container): void {
    // If this container extends a base/parent class then we must make sure we have processed the base/parent class members
    let baseClass = container.getBaseClass();

    if (baseClass) {
      // We need to get the container for the parent/base class
      let baseClassContainer = this.classifiableContainers[baseClass.name];

      if (baseClassContainer) {
        //let baseClassMembers = baseClassContainer.getMembers();
        //if ( baseClassMembers ) {
        //    this.processClassMembers( baseClassMembers, baseClassContainer );
        //    // The base class container excludedProperties array must also be excluded in the current derived class
        //    container.excludedProperties = container.excludedProperties.concat( baseClassContainer.excludedProperties );
        //}
      }
    }

    // Determine the names which cannot be used as shortened names in this container.
    this.excludeNames(container);

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
    for (let identifierTableKey in container.localIdentifiers) {
      let identifierInfo = container.localIdentifiers[identifierTableKey];

      this.processIdentifierInfo(identifierInfo, container);
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

  private processIdentifierInfo(
    identifierInfo: IdentifierInfo,
    container: Container
  ): void {
    if (identifierInfo.isMinified) {
      Logger.trace(
        "Identifier already has shortened name: ",
        identifierInfo.getName(),
        identifierInfo.shortenedName
      );
      return;
    }

    if (this.canShortenIdentifier(identifierInfo)) {
      let shortenedName = this.getShortenedIdentifierName(
        container,
        identifierInfo
      );

      Logger.trace(
        "Identifier shortened: ",
        identifierInfo.getName(),
        shortenedName
      );

      // Add the shortened name to the excluded names in each container that this identifier was found in.
      let containerRefs = identifierInfo.getContainers();

      for (let containerKey in containerRefs) {
        let containerRef = containerRefs[containerKey];
        containerRef.namesExcluded[shortenedName] = true;
      }

      //if ( !identifierInfo.isMinified ) {
      // Change all referenced identifier nodes to the shortened name
      Utils.forEach(identifierInfo.getIdentifiers(), (identifier) => {
        this.setIdentifierText(identifier, shortenedName);
      });

      identifierInfo.isMinified = true;
      //}

      return;
    }
  }

  private canShortenIdentifier(identifierInfo: IdentifierInfo): boolean {
    if (
      identifierInfo.isBlockScopedVariable() ||
      identifierInfo.isFunctionScopedVariable() ||
      identifierInfo.isInternalClass() ||
      identifierInfo.isInternalInterface() ||
      identifierInfo.isPrivateMethod() ||
      identifierInfo.isPrivateProperty() ||
      identifierInfo.isInternalFunction(this.minifierOptions) ||
      identifierInfo.isParameter() ||
      identifierInfo.isNamespaceImportAlias()
    ) {
      Logger.trace("Identifier CAN be shortened: ", identifierInfo.getName());
      return true;
    }

    Logger.trace("Identifier CANNOT be shortened: ", identifierInfo.getName());
    return false;
  }

  private getShortenedIdentifierName(
    container: Container,
    identifierInfo: IdentifierInfo
  ): string {
    // Identifier names are shortened in place. They must be the same length or smaller than the original name.
    if (!identifierInfo.shortenedName) {
      let identifierName = identifierInfo.getName();

      if (identifierName.length === 1) {
        // Just reuse the original name for 1 char names
        identifierInfo.shortenedName = identifierName;
      } else {
        // Loop until we have a valid shortened name
        // The shortened name MUST be the same length or less
        while (!identifierInfo.shortenedName) {
          let shortenedName = this.nameGenerator.getName(
            container.getNameIndex()
          );

          Debug.assert(shortenedName.length <= identifierName.length);

          let containerRefs = identifierInfo.getContainers();
          let isShortenedNameAlreadyUsed = false;

          for (let containerKey in containerRefs) {
            let containerRef = containerRefs[containerKey];

            if (Utils.hasProperty(containerRef.namesExcluded, shortenedName)) {
              isShortenedNameAlreadyUsed = true;
              Logger.trace(
                "Generated name was excluded: ",
                shortenedName,
                identifierName
              );
              break;
            }
          }

          if (!isShortenedNameAlreadyUsed) {
            identifierInfo.shortenedName = shortenedName;
          }
        }

        this.shortenedIdentifierCount++;
      }
    } else {
      Logger.trace(
        "Identifier already has shortened name: ",
        identifierInfo.getName(),
        identifierInfo.shortenedName
      );
    }

    Logger.info(
      "Identifier shortened name: ",
      identifierInfo.getName(),
      identifierInfo.shortenedName
    );

    return identifierInfo.shortenedName;
  }

  private setIdentifierText(identifier: ts.Identifier, text: string): void {
    let identifierLength = identifier.text.length;
    let bufferLength = identifier.end - identifier.pos;

    // Check to see if there is leading trivia
    var triviaOffset = identifier.getLeadingTriviaWidth();

    // Find the start of the identifier text within the identifier character array
    for (
      var identifierStart = identifier.pos + triviaOffset;
      identifierStart < identifier.pos + bufferLength;
      identifierStart++
    ) {
      if (this.sourceFile.text[identifierStart] === identifier.text[0]) break;
    }

    // Replace the identifier text within the bundle source file

    // FIXME:
    //identifier.end = identifierStart + text.length;

    for (var i = 0; i < identifierLength; i++) {
      let replaceChar = " ";

      if (i < text.length) {
        replaceChar = text[i];
      }

      this.sourceFile.text = Utils.replaceAt(
        this.sourceFile.text,
        identifierStart + i,
        replaceChar
      );
    }
  }

  private processClassMembers(
    members: ts.NodeArray<ts.Declaration>,
    container: Container
  ): void {
    for (let memberKey in members) {
      let member = members[memberKey];
      let memberSymbol: ts.Symbol = (<any>member).symbol;

      if (memberSymbol) {
        let memberSymbolUId: string = Ast.getIdentifierUID(memberSymbol);

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
      } else {
        Logger.warn("Container member does not have a symbol.");
      }
    }
  }

  public excludeNames(container: Container): void {
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

    for (let identifierInfoKey in container.localIdentifiers) {
      let identifierInfo = container.localIdentifiers[identifierInfoKey];

      this.excludeNamesForIdentifier(identifierInfo, container);
    }

    //for ( let classifiableKey in container.classifiableSymbols ) {
    //    let classSymbol = container.classifiableSymbols[classifiableKey];

    //    let classSymbolUId: string = Ast.getIdentifierUID( classSymbol );
    //    let classIdentifierInfo = this.identifiers[classSymbolUId];

    //    Debug.assert( classIdentifierInfo !== undefined, "Container classifiable identifier symbol not found." );

    //    this.excludeNamesForIdentifier( classIdentifierInfo, container );
    //}
  }

  private getContainerExcludedIdentifiers(
    container: Container
  ): ts.MapLike<IdentifierInfo> {
    // Recursively walk the container chain to find shortened identifier names that we cannot use in this container.
    let target = this.compilerOptions.target;
    let excludes: ts.MapLike<IdentifierInfo> = {};

    function getContainerExcludes(container: Container) {
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

      for (let excludedIdentifierKey in container.excludedIdentifiers) {
        let excludedIdentifier =
          container.excludedIdentifiers[excludedIdentifierKey];

        // For function scoped identifiers we must exclude the identifier from the current container parent.
        // Note that for ES5, which doesn't have block scoped variables, we must also exclude the identifier.
        if (
          !excludedIdentifier.isBlockScopedVariable ||
          target === ts.ScriptTarget.ES5
        ) {
          if (!Utils.hasProperty(excludes, excludedIdentifier.getId())) {
            excludes[excludedIdentifier.getId()] = excludedIdentifier;
          }
        }
      }
    }

    // Start the search for excluded identifiers from the container's parent - the parent function scope container.
    getContainerExcludes(container.getParent());

    return excludes;
  }

  private excludeNamesForIdentifier(
    identifierInfo: IdentifierInfo,
    container: Container
  ): void {
    // Exclude all shortened names that have already been used in child containers that this identifer is contained in.
    let identifierContainers = identifierInfo.getContainers();

    // For each container that the identifier is contained in..
    for (let containerKey in identifierContainers) {
      let identifierContainer = identifierContainers[containerKey];

      let containerExcludes = this.getContainerExcludedIdentifiers(
        identifierContainer
      );

      // We can't use any names that have already been used in this referenced container
      for (let excludedIdentifierKey in containerExcludes) {
        let excludedIdentifier = containerExcludes[excludedIdentifierKey];

        if (excludedIdentifier.shortenedName) {
          container.namesExcluded[excludedIdentifier.shortenedName] = true;
        }
      }
    }
  }

  private reportMinifyStatistics() {
    let statisticsReporter = new StatisticsReporter();

    statisticsReporter.reportTime("Minify time", this.transformTime);
    statisticsReporter.reportCount("Total identifiers", this.identifierCount);
    statisticsReporter.reportCount(
      "Identifiers shortened",
      this.shortenedIdentifierCount
    );
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
interface MinifierResult {
  emitSkipped: boolean;
  diagnostics: ReadonlyArray<ts.Diagnostic>;
  emitOutput?: CompileOutput[];
}

function getWhitespaceTransform(): ts.TransformerFactory<ts.SourceFile> {
  return (context: ts.TransformationContext) => whitespaceTransform(context);
}

function whitespaceTransform(
  context: ts.TransformationContext
): ts.Transformer<ts.SourceFile> {
  const compilerOptions = context.getCompilerOptions();
  let currentSourceFile: ts.SourceFile;

  return transformSourceFile;

  /**
   * Minify the provided SourceFile.
   *
   * @param node A SourceFile node.
   */
  function transformSourceFile(node: ts.SourceFile) {
    if (node.isDeclarationFile) {
      return node;
    }

    currentSourceFile = node;

    const visited = ts.visitEachChild(node, visitor, context);

    return visited;
  }

  function visitor(node: ts.Node): ts.VisitResult<ts.Node> {
    switch (node.kind) {
      case ts.SyntaxKind.Identifier:
        return visitIdentifier(<ts.Identifier>node);
    }

    return node;
  }

  function visitIdentifier(node: ts.Identifier) {
    return node;
  }
}
class WhitespaceMinifier {
  private whiteSpaceBefore: number;
  private whiteSpaceAfter: number;
  private whiteSpaceTime: number;

  public transform(program: ts.Program, context: ts.TransformationContext) {
    //this.compilerOptions = context.getCompilerOptions();
    //this.program = program;

    return this.transformSourceFile;
  }

  private transformSourceFile = (sourceFile: ts.SourceFile) => {
    //this.minifier = new Minifier( this.program, this.compilerOptions, this.options );

    //sourceFile = this.minifier.transform( sourceFile );

    return sourceFile;
  };

  public removeWhitespace(jsContents: string): string {
    // ES6 whitespace rules..

    // Special Cases..
    // break, continue, function: space right if next token is [Expression]
    // return, yield: space if next token is not a semicolon
    // else:

    // Space to left and right of keyword..
    // extends, in, instanceof : space left and right

    // Space to the right of the keyword..
    // case, class, const, delete, do, export, get, import, let, new, set, static, throw, typeof, var, void

    // Space not required..
    // catch, debugger, default, finally, for, if, super, switch, this, try, while, with

    // Notes..
    // export: Not supported yet? For now add space
    // default: When used with export?

    this.whiteSpaceTime = new Date().getTime();
    this.whiteSpaceBefore = jsContents.length;

    let output = "";
    let lastNonTriviaToken = ts.SyntaxKind.Unknown;
    let isTrivia = false;
    let token: ts.SyntaxKind;

    const scanner = ts.createScanner(
      ts.ScriptTarget.ES5,
      /* skipTrivia */ false,
      ts.LanguageVariant.Standard,
      jsContents
    );

    while ((token = scanner.scan()) !== ts.SyntaxKind.EndOfFileToken) {
      isTrivia = false;

      if (Ast.isTrivia(token)) {
        // TJT: Uncomment to add new line trivia to output for testing purposes
        //if ( token === ts.SyntaxKind.NewLineTrivia ) {
        //    output += scanner.getTokenText();
        //}
        isTrivia = true;
      }

      if (!isTrivia) {
        // Process the last non trivia token
        switch (lastNonTriviaToken) {
          case ts.SyntaxKind.FunctionKeyword:
            // Space required after function keyword if next token is an identifier
            if (token === ts.SyntaxKind.Identifier) {
              output += " ";
            }
            break;

          case ts.SyntaxKind.BreakKeyword:
          case ts.SyntaxKind.ContinueKeyword:
          case ts.SyntaxKind.ReturnKeyword:
          case ts.SyntaxKind.YieldKeyword:
            // Space not required after return keyword if the current token is a semicolon
            if (token !== ts.SyntaxKind.SemicolonToken) {
              output += " ";
            }
            break;

          case ts.SyntaxKind.ElseKeyword:
            // Space not required after return keyword if the current token is a punctuation
            if (token !== ts.SyntaxKind.OpenBraceToken) {
              output += " ";
            }
            break;
        }

        // Process the current token..
        switch (token) {
          // Keywords that require a right space
          case ts.SyntaxKind.CaseKeyword:
          case ts.SyntaxKind.ClassKeyword:
          case ts.SyntaxKind.ConstKeyword:
          case ts.SyntaxKind.DeleteKeyword:
          case ts.SyntaxKind.DoKeyword:
          case ts.SyntaxKind.ExportKeyword: // TJT: Add a space just to be sure right now
          case ts.SyntaxKind.GetKeyword:
          case ts.SyntaxKind.ImportKeyword:
          case ts.SyntaxKind.LetKeyword:
          case ts.SyntaxKind.NewKeyword:
          case ts.SyntaxKind.SetKeyword:
          case ts.SyntaxKind.StaticKeyword:
          case ts.SyntaxKind.ThrowKeyword:
          case ts.SyntaxKind.TypeOfKeyword:
          case ts.SyntaxKind.VarKeyword:
          case ts.SyntaxKind.VoidKeyword:
            output += scanner.getTokenText() + " ";
            break;

          // Keywords that require space left and right..
          case ts.SyntaxKind.ExtendsKeyword:
          case ts.SyntaxKind.InKeyword:
          case ts.SyntaxKind.InstanceOfKeyword:
            output += " " + scanner.getTokenText() + " ";
            break;

          // Avoid concatenations of ++, + and --, - operators
          case ts.SyntaxKind.PlusToken:
          case ts.SyntaxKind.PlusPlusToken:
            if (
              lastNonTriviaToken === ts.SyntaxKind.PlusToken ||
              lastNonTriviaToken === ts.SyntaxKind.PlusPlusToken
            ) {
              output += " ";
            }
            output += scanner.getTokenText();
            break;

          case ts.SyntaxKind.MinusToken:
          case ts.SyntaxKind.MinusMinusToken:
            if (
              lastNonTriviaToken === ts.SyntaxKind.MinusToken ||
              lastNonTriviaToken === ts.SyntaxKind.MinusMinusToken
            ) {
              output += " ";
            }

            output += scanner.getTokenText();
            break;

          default:
            // All other tokens can be output. Keywords that do not require whitespace.
            output += scanner.getTokenText();
            break;
        }
      }

      if (!isTrivia) {
        lastNonTriviaToken = token;
      }
    }

    this.whiteSpaceAfter = output.length;
    this.whiteSpaceTime = new Date().getTime() - this.whiteSpaceTime;

    // FIXME:
    //if ( this.compilerOptions.diagnostics )
    //    this.reportWhitespaceStatistics();

    return jsContents; // output;
  }

  //private reportWhitespaceStatistics() {
  //    let statisticsReporter = new StatisticsReporter();

  //    statisticsReporter.reportTime( "Whitespace time", this.whiteSpaceTime );
  //    statisticsReporter.reportPercentage( "Whitespace reduction", ( ( this.whiteSpaceBefore - this.whiteSpaceAfter ) / this.whiteSpaceBefore ) * 100.00 );
  //}
}
class MinifierTransform {
  private options: MinifierOptions;
  private compilerOptions: ts.CompilerOptions;
  private program: ts.Program;
  private minifier: Minifier;

  constructor(options?: MinifierOptions) {
    this.options = options || {
      mangleIdentifiers: true,
      removeWhitespace: true,
    };
  }

  public transform(program: ts.Program, context: ts.TransformationContext) {
    this.compilerOptions = context.getCompilerOptions();
    this.program = program;

    return this.transformSourceFile;
  }

  private transformSourceFile = (sourceFile: ts.SourceFile) => {
    this.minifier = new Minifier(
      this.program,
      this.compilerOptions,
      this.options
    );

    if (this.options.mangleIdentifiers) {
      sourceFile = this.minifier.transform(sourceFile);
    }

    return sourceFile;
  };
}
function format(input: string): string {
  //var settings = getDefaultFormatCodeSettings();

  const sourceFile = ts.createSourceFile(
    "file.js",
    input,
    ts.ScriptTarget.Latest
  );

  // Get the formatting edits on the input sources
  //var edits = ( ts as any ).formatting.formatDocument( sourceFile, getRuleProvider( settings ), settings );

  return prettify.format(sourceFile.getText(), { parser: "typescript" });

  //function getRuleProvider( settings: ts.FormatCodeSettings ) {
  //    var ruleProvider = new ( <any>ts ).formatting.RulesProvider();
  //    ruleProvider.ensureUpToDate( settings );

  //    return ruleProvider;
  //}

  //function applyEdits( text: string, edits: ts.TextChange[] ): string {
  //    let result = text;

  //    for ( let i = edits.length - 1; i >= 0; i-- ) {
  //        let change = edits[i];
  //        let head = result.slice( 0, change.span.start );
  //        let tail = result.slice( change.span.start + change.span.length );

  //        result = head + change.newText + tail;
  //    }

  //    return result;
  //}

  //function getDefaultFormatCodeSettings(): ts.FormatCodeSettings {
  //    return {
  //        baseIndentSize: 4,
  //        indentSize: 4,
  //        tabSize: 4,
  //        newLineCharacter: "\r\n",
  //        convertTabsToSpaces: true,
  //        indentStyle: ts.IndentStyle.Smart,

  //        insertSpaceAfterCommaDelimiter: true,
  //        insertSpaceAfterSemicolonInForStatements: true,
  //        insertSpaceBeforeAndAfterBinaryOperators: true,
  //        insertSpaceAfterConstructor: true,
  //        insertSpaceAfterKeywordsInControlFlowStatements: true,
  //        insertSpaceAfterFunctionKeywordForAnonymousFunctions: false,
  //        insertSpaceAfterOpeningAndBeforeClosingNonemptyParenthesis: false,
  //        insertSpaceAfterOpeningAndBeforeClosingNonemptyBrackets: false,
  //        insertSpaceAfterOpeningAndBeforeClosingNonemptyBraces: false,
  //        insertSpaceAfterOpeningAndBeforeClosingTemplateStringBraces: false,
  //        insertSpaceAfterOpeningAndBeforeClosingJsxExpressionBraces: false,
  //        insertSpaceAfterTypeAssertion: false,
  //        insertSpaceBeforeFunctionParenthesis: false,
  //        placeOpenBraceOnNewLineForFunctions: false,
  //        placeOpenBraceOnNewLineForControlBlocks: false,
  //    };
  //}
}

// TsMinifier API..
export { MinifierOptions };
export { MinifierResult };

export namespace TsMinifier {
  /**
   * Gets the TsMinifier identifier minification transformation callback function
   * used to minify a source file identifiers.
   *
   * @param program Optional
   * @param options Optional bundler options.
   * @returns The bundler transform factory callback function.
   */
  export function getMinifierTransform(
    program: ts.Program,
    options?: MinifierOptions
  ): ts.TransformerFactory<ts.SourceFile> {
    const minifierTransform = new MinifierTransform(options);
    return (context: ts.TransformationContext) =>
      minifierTransform.transform(program, context);
  }

  export function getWhitespaceTransform(
    program: ts.Program,
    options?: MinifierOptions
  ): ts.TransformerFactory<ts.SourceFile> {
    const whitespaceTransform = new WhitespaceMinifier();
    return (context: ts.TransformationContext) =>
      whitespaceTransform.transform(program, context);
  }

  export function minify(
    fileNames: string[],
    compilerOptions: ts.CompilerOptions,
    minifierOptions?: MinifierOptions
  ): MinifierResult {
    const minifierPlugin = new MinifierTransform(minifierOptions);
    const compiler = new tsc.Compiler(compilerOptions);

    var compileResult = compiler.compile(fileNames);

    return {
      emitSkipped: true,
      diagnostics: compileResult.getErrors(),
    };
  }

  export function minifyModule(
    input: string,
    moduleFileName: string,
    compilerOptions: ts.CompilerOptions,
    minifierOptions?: MinifierOptions
  ): MinifierResult {
    const minifierPlugin = new MinifierTransform(minifierOptions);
    const compiler = new tsc.Compiler(compilerOptions); //, minifierPlugin );

    var compileResult = compiler.compileModule(input, moduleFileName);

    return {
      emitSkipped: true,
      diagnostics: compileResult.getErrors(),
    };
  }

  export function minifyProject(
    configFilePath: string,
    minifierOptions?: MinifierOptions
  ): MinifierResult {
    const config = TsCore.getProjectConfig(configFilePath);

    if (config.errors.length > 0) {
      return {
        emitSkipped: true,
        diagnostics: config.errors,
      };
    }

    return minify(config.fileNames, config.options, minifierOptions);
  }

  export function prettify(input: string): string {
    return format(input);
  }
}
