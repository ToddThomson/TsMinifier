"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
var ts = require("typescript");
var fs = require("fs");
var path = require("path");
var chalk_1 = require("chalk");
var prettify = require("prettier");
var tsc = require("ts2js");
var IdentifierInfo = (function () {
    function IdentifierInfo(node, symbol) {
        this.containers = {};
        this.identifiers = [];
        this.shortenedName = undefined;
        this.isMinified = false;
        this.identifier = node;
        this.symbol = symbol;
        this.identifiers = [this.identifier];
    }
    IdentifierInfo.prototype.getSymbol = function () {
        return this.symbol;
    };
    IdentifierInfo.prototype.getName = function () {
        return this.symbol.name;
    };
    IdentifierInfo.prototype.getId = function () {
        var id = this.symbol.id;
        if (id === undefined && this.symbol.valueDeclaration) {
            id = this.symbol.valueDeclaration.symbol.id;
        }
        return id ? id.toString() : undefined;
    };
    IdentifierInfo.prototype.getContainers = function () {
        return this.containers;
    };
    IdentifierInfo.prototype.getIdentifiers = function () {
        return this.identifiers;
    };
    IdentifierInfo.prototype.addNodeReference = function (identifier) {
        this.identifiers.push(identifier);
    };
    IdentifierInfo.prototype.addContainerReference = function (container) {
        // We only need to keep track of a single reference in a container
        if (!Utils.hasProperty(this.containers, container.getId().toString())) {
            this.containers[container.getId().toString()] = container;
        }
    };
    IdentifierInfo.prototype.isNamespaceImportAlias = function () {
        if ((this.symbol.flags & ts.SymbolFlags.Alias) > 0) {
            if (this.symbol.declarations[0].kind === ts.SyntaxKind.NamespaceImport) {
                return true;
            }
        }
        return false;
    };
    IdentifierInfo.prototype.isFunctionScopedVariable = function () {
        if ((this.symbol.flags & ts.SymbolFlags.FunctionScopedVariable) > 0) {
            var variableDeclaration = this.getVariableDeclaration();
            if (variableDeclaration) {
                return true;
            }
        }
        return false;
    };
    IdentifierInfo.prototype.isBlockScopedVariable = function () {
        if ((this.symbol.flags & ts.SymbolFlags.BlockScopedVariable) > 0) {
            var variableDeclaration = this.getVariableDeclaration();
            if (variableDeclaration) {
                return ((variableDeclaration.parent.flags & ts.NodeFlags.Let) !== 0) ||
                    ((variableDeclaration.parent.flags & ts.NodeFlags.Const) !== 0);
            }
        }
        return false;
    };
    IdentifierInfo.prototype.isParameter = function () {
        // Note: FunctionScopedVariable also indicates a parameter
        if ((this.symbol.flags & ts.SymbolFlags.FunctionScopedVariable) > 0) {
            // A parameter has a value declaration
            if (this.symbol.valueDeclaration.kind === ts.SyntaxKind.Parameter) {
                return true;
            }
        }
        return false;
    };
    IdentifierInfo.prototype.hasNoMangleAnnotation = function () {
        // Scan through the symbol documentation for our @nomangle annotation
        // Call getDocumentationComment() to generate the JsDocTags for the symbol( the node ).
        // For some reason a ts.getDocumentationTags() is not exposed.
        this.symbol.getDocumentationComment(undefined);
        if (this.symbol.declarations) {
            var jsDocs = this.symbol.declarations[0].jsDocCache;
            return Utils.forEach(jsDocs, function (tag) {
                return tag.getFullText().indexOf("@nomangle") >= 0;
            });
        }
        return false;
    };
    IdentifierInfo.prototype.isInternalClass = function () {
        // TJT: Review - should use the same export "override" logic as in isInternalFunction
        return Ast.isClassInternal(this.symbol);
    };
    IdentifierInfo.prototype.isInternalInterface = function () {
        return Ast.isInterfaceInternal(this.symbol);
    };
    IdentifierInfo.prototype.isInternalFunction = function (minifierOptions) {
        if (this.symbol.flags & ts.SymbolFlags.Function) {
            // A function has a value declaration
            if (this.symbol.valueDeclaration.kind === ts.SyntaxKind.FunctionDeclaration) {
                var flags = Ast.getModifierFlagsNoCache(this.symbol.valueDeclaration);
                // If The function is from an extern API or ambient then it cannot be considered internal.
                if (Ast.isExportContext(this.symbol) || Ast.isAmbientContext(this.symbol)) {
                    return false;
                }
                if (!(flags & ts.ModifierFlags.Export)) {
                    return true;
                }
                // Override export flag if function is not in our special package namespace.
                if (minifierOptions.externalNamespace) {
                    var node = this.symbol.valueDeclaration;
                    while (node) {
                        if (node.flags & ts.NodeFlags.Namespace) {
                            var nodeNamespaceName = node.name.text;
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
    };
    IdentifierInfo.prototype.isPrivateMethod = function () {
        if ((this.symbol.flags & ts.SymbolFlags.Method) > 0) {
            // We explicitly check that a method has a value declaration.
            if (this.symbol.valueDeclaration === undefined) {
                return false;
            }
            var flags = Ast.getModifierFlagsNoCache(this.symbol.valueDeclaration);
            if ((flags & ts.ModifierFlags.Private) > 0) {
                return true;
            }
            // Check if the method parent class or interface is "internal" ( non-private methods may be shortened too )
            var parent_1 = this.symbol.parent;
            if (parent_1 && Ast.isClassInternal(parent_1)) {
                // TJT: Review - public methods of abstact classes are not shortened.
                if (!Ast.isClassAbstract(parent_1)) {
                    return true;
                }
            }
            if (parent_1 && Ast.isInterfaceInternal(parent_1)) {
                // TODO: Interfaces methods are always external for now.
                return false;
            }
        }
        return false;
    };
    IdentifierInfo.prototype.isPrivateProperty = function () {
        if ((this.symbol.flags & ts.SymbolFlags.Property) > 0) {
            // A property has a value declaration except when it is the "prototype" property.
            if (this.symbol.valueDeclaration === undefined) {
                return false;
            }
            var flags = Ast.getModifierFlagsNoCache(this.symbol.valueDeclaration);
            if ((flags & ts.ModifierFlags.Private) > 0) {
                return true;
            }
            // Check if the property parent class is "internal" ( non-private properties may be shortened too )
            var parent_2 = this.symbol.parent;
            if (parent_2 && Ast.isClassInternal(parent_2)) {
                // TJT: Review - public properties of abstact classes are not shortened.
                if (!Ast.isClassAbstract(parent_2)) {
                    return true;
                }
            }
        }
        return false;
    };
    IdentifierInfo.prototype.getVariableDeclaration = function () {
        switch (this.identifier.parent.kind) {
            case ts.SyntaxKind.VariableDeclaration:
                return this.identifier.parent;
            case ts.SyntaxKind.VariableDeclarationList:
                Logger.warn("VariableDeclaratioList in getVariableDeclaration() - returning null");
                break;
            case ts.SyntaxKind.VariableStatement:
                Logger.warn("VariableStatement in getVariableDeclaration() - returning null");
                break;
        }
        return null;
    };
    return IdentifierInfo;
}());
var IdentifierCollection = (function () {
    function IdentifierCollection() {
        this.identifiers = {};
    }
    IdentifierCollection.prototype.add = function (id, identifier) {
        if (this.contains(id)) {
            return false;
        }
        this.identifiers[id] = identifier;
        return true;
    };
    IdentifierCollection.prototype.contains = function (id) {
        if (Utils.hasProperty(this.identifiers, id)) {
            return true;
        }
        return false;
    };
    IdentifierCollection.prototype.getIdentifier = function (id) {
        return this.identifiers[id];
    };
    return IdentifierCollection;
}());
var Ast;
(function (Ast) {
    function getModifierFlagsNoCache(node) {
        var flags = ts.ModifierFlags.None;
        if (node.modifiers) {
            for (var _i = 0, _a = node.modifiers; _i < _a.length; _i++) {
                var modifier = _a[_i];
                flags |= modifierToFlag(modifier.kind);
            }
        }
        if (node.flags & ts.NodeFlags.NestedNamespace || (node.kind === ts.SyntaxKind.Identifier && node.isInJSDocNamespace)) {
            flags |= ts.ModifierFlags.Export;
        }
        return flags;
    }
    Ast.getModifierFlagsNoCache = getModifierFlagsNoCache;
    function modifierToFlag(token) {
        switch (token) {
            case ts.SyntaxKind.StaticKeyword: return ts.ModifierFlags.Static;
            case ts.SyntaxKind.PublicKeyword: return ts.ModifierFlags.Public;
            case ts.SyntaxKind.ProtectedKeyword: return ts.ModifierFlags.Protected;
            case ts.SyntaxKind.PrivateKeyword: return ts.ModifierFlags.Private;
            case ts.SyntaxKind.AbstractKeyword: return ts.ModifierFlags.Abstract;
            case ts.SyntaxKind.ExportKeyword: return ts.ModifierFlags.Export;
            case ts.SyntaxKind.DeclareKeyword: return ts.ModifierFlags.Ambient;
            case ts.SyntaxKind.ConstKeyword: return ts.ModifierFlags.Const;
            case ts.SyntaxKind.DefaultKeyword: return ts.ModifierFlags.Default;
            case ts.SyntaxKind.AsyncKeyword: return ts.ModifierFlags.Async;
            case ts.SyntaxKind.ReadonlyKeyword: return ts.ModifierFlags.Readonly;
        }
        return ts.ModifierFlags.None;
    }
    Ast.modifierToFlag = modifierToFlag;
    var ContainerFlags;
    (function (ContainerFlags) {
        // The current node is not a container, and no container manipulation should happen before
        // recursing into it.
        ContainerFlags[ContainerFlags["None"] = 0] = "None";
        // The current node is a container.  It should be set as the current container (and block-
        // container) before recursing into it.  The current node does not have locals.  Examples:
        //
        //      Classes, ObjectLiterals, TypeLiterals, Interfaces...
        ContainerFlags[ContainerFlags["IsContainer"] = 1] = "IsContainer";
        // The current node is a block-scoped-container.  It should be set as the current block-
        // container before recursing into it.  Examples:
        //
        //      Blocks (when not parented by functions), Catch clauses, For/For-in/For-of statements...
        ContainerFlags[ContainerFlags["IsBlockScopedContainer"] = 2] = "IsBlockScopedContainer";
        // The current node is the container of a control flow path. The current control flow should
        // be saved and restored, and a new control flow initialized within the container.
        ContainerFlags[ContainerFlags["IsControlFlowContainer"] = 4] = "IsControlFlowContainer";
        ContainerFlags[ContainerFlags["IsFunctionLike"] = 8] = "IsFunctionLike";
        ContainerFlags[ContainerFlags["IsFunctionExpression"] = 16] = "IsFunctionExpression";
        ContainerFlags[ContainerFlags["HasLocals"] = 32] = "HasLocals";
        ContainerFlags[ContainerFlags["IsInterface"] = 64] = "IsInterface";
        ContainerFlags[ContainerFlags["IsObjectLiteralOrClassExpressionMethod"] = 128] = "IsObjectLiteralOrClassExpressionMethod";
    })(ContainerFlags = Ast.ContainerFlags || (Ast.ContainerFlags = {}));
    function isPrototypeAccessAssignment(expression) {
        if (expression.kind !== ts.SyntaxKind.BinaryExpression) {
            return false;
        }
        var expr = expression;
        if (expr.operatorToken.kind !== ts.SyntaxKind.EqualsToken || expr.left.kind !== ts.SyntaxKind.PropertyAccessExpression) {
            return false;
        }
        var lhs = expr.left;
        if (lhs.expression.kind === ts.SyntaxKind.PropertyAccessExpression) {
            // chained dot, e.g. x.y.z = expr; this var is the 'x.y' part
            var innerPropertyAccess = lhs.expression;
            if (innerPropertyAccess.expression.kind === ts.SyntaxKind.Identifier && innerPropertyAccess.name.text === "prototype") {
                return true;
            }
        }
        return false;
    }
    Ast.isPrototypeAccessAssignment = isPrototypeAccessAssignment;
    function isFunctionLike(node) {
        return node && isFunctionLikeKind(node.kind);
    }
    Ast.isFunctionLike = isFunctionLike;
    function isFunctionLikeDeclarationKind(kind) {
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
    Ast.isFunctionLikeDeclarationKind = isFunctionLikeDeclarationKind;
    function isFunctionLikeKind(kind) {
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
    Ast.isFunctionLikeKind = isFunctionLikeKind;
    function isObjectLiteralOrClassExpressionMethod(node) {
        return node.kind === ts.SyntaxKind.MethodDeclaration &&
            (node.parent.kind === ts.SyntaxKind.ObjectLiteralExpression ||
                node.parent.kind === ts.SyntaxKind.ClassExpression);
    }
    Ast.isObjectLiteralOrClassExpressionMethod = isObjectLiteralOrClassExpressionMethod;
    function isInterfaceInternal(symbol) {
        if (symbol && (symbol.flags & ts.SymbolFlags.Interface)) {
            if (symbol.valueDeclaration) {
                var flags = getModifierFlagsNoCache(symbol.valueDeclaration);
                //if ( !( flags & ts.ModifierFlags.Export ) ) {
                //    return true;
                //}
                // FUTURE: How to make interfaces internal by convention?
                return false;
            }
        }
        return false;
    }
    Ast.isInterfaceInternal = isInterfaceInternal;
    function isClassInternal(symbol) {
        if (symbol && (symbol.flags & ts.SymbolFlags.Class)) {
            // If the class is from an extern API or ambient then it cannot be considered internal.
            if (Ast.isExportContext(symbol) || Ast.isAmbientContext(symbol)) {
                return false;
            }
            // A class always has a value declaration
            var flags = getModifierFlagsNoCache(symbol.valueDeclaration);
            // By convention, "Internal" classes are ones that are not exported.
            if (!(flags & ts.ModifierFlags.Export)) {
                return true;
            }
        }
        return false;
    }
    Ast.isClassInternal = isClassInternal;
    function isClassAbstract(classSymbol) {
        if (classSymbol && classSymbol.valueDeclaration) {
            if (getModifierFlagsNoCache(classSymbol.valueDeclaration) & ts.ModifierFlags.Abstract) {
                return true;
            }
        }
        return false;
    }
    Ast.isClassAbstract = isClassAbstract;
    function getClassHeritageProperties(classNodeU, checker) {
        var classExportProperties = [];
        function getHeritageExportProperties(heritageClause, checker) {
            var inheritedTypeNodes = heritageClause.types;
            if (inheritedTypeNodes) {
                for (var _i = 0, inheritedTypeNodes_1 = inheritedTypeNodes; _i < inheritedTypeNodes_1.length; _i++) {
                    var typeRefNode = inheritedTypeNodes_1[_i];
                    // The "properties" of inheritedType includes all the base class/interface properties
                    var inheritedType = checker.getTypeAtLocation(typeRefNode);
                    var inheritedTypeDeclaration = inheritedType.symbol.valueDeclaration;
                    if (inheritedTypeDeclaration) {
                        var inheritedTypeHeritageClauses = inheritedTypeDeclaration.heritageClauses;
                        if (inheritedTypeHeritageClauses) {
                            for (var _a = 0, inheritedTypeHeritageClauses_1 = inheritedTypeHeritageClauses; _a < inheritedTypeHeritageClauses_1.length; _a++) {
                                var inheritedTypeHeritageClause = inheritedTypeHeritageClauses_1[_a];
                                getHeritageExportProperties(inheritedTypeHeritageClause, checker);
                            }
                        }
                    }
                    var inheritedTypeProperties = inheritedType.getProperties();
                    for (var _b = 0, inheritedTypeProperties_1 = inheritedTypeProperties; _b < inheritedTypeProperties_1.length; _b++) {
                        var propertySymbol = inheritedTypeProperties_1[_b];
                        if (Ast.isExportContext(propertySymbol)) {
                            classExportProperties.push(propertySymbol);
                        }
                    }
                }
            }
        }
        var heritageClauses = classNodeU.heritageClauses;
        if (heritageClauses) {
            for (var _i = 0, heritageClauses_1 = heritageClauses; _i < heritageClauses_1.length; _i++) {
                var heritageClause = heritageClauses_1[_i];
                getHeritageExportProperties(heritageClause, checker);
            }
        }
        return classExportProperties;
    }
    Ast.getClassHeritageProperties = getClassHeritageProperties;
    function getClassAbstractProperties(extendsClause, checker) {
        var abstractProperties = [];
        var abstractTypeNodes = extendsClause.types;
        for (var _i = 0, abstractTypeNodes_1 = abstractTypeNodes; _i < abstractTypeNodes_1.length; _i++) {
            var abstractTypeNode = abstractTypeNodes_1[_i];
            var abstractType = checker.getTypeAtLocation(abstractTypeNode);
            var abstractTypeSymbol = abstractType.getSymbol();
            if (abstractTypeSymbol.valueDeclaration) {
                if (getModifierFlagsNoCache(abstractTypeSymbol.valueDeclaration) & ts.ModifierFlags.Abstract) {
                    var props = abstractType.getProperties();
                    for (var _a = 0, props_1 = props; _a < props_1.length; _a++) {
                        var prop = props_1[_a];
                        abstractProperties.push(prop);
                    }
                }
            }
        }
        return abstractProperties;
    }
    Ast.getClassAbstractProperties = getClassAbstractProperties;
    function getImplementsProperties(implementsClause, checker) {
        var implementsProperties = [];
        var typeNodes = implementsClause.types;
        for (var _i = 0, typeNodes_1 = typeNodes; _i < typeNodes_1.length; _i++) {
            var typeNode = typeNodes_1[_i];
            var type = checker.getTypeAtLocation(typeNode);
            var props = type.getProperties();
            for (var _a = 0, props_2 = props; _a < props_2.length; _a++) {
                var prop = props_2[_a];
                implementsProperties.push(prop);
            }
        }
        return implementsProperties;
    }
    Ast.getImplementsProperties = getImplementsProperties;
    function getIdentifierUID(symbol) {
        if (!symbol) {
            return undefined;
        }
        var id = symbol.id;
        // Try to get the symbol id from the identifier value declaration
        if (id === undefined && symbol.valueDeclaration) {
            id = symbol.valueDeclaration.symbol.id;
        }
        return id ? id.toString() : undefined;
    }
    Ast.getIdentifierUID = getIdentifierUID;
    function getContainerFlags(node) {
        switch (node.kind) {
            case ts.SyntaxKind.ClassExpression:
            case ts.SyntaxKind.ClassDeclaration:
            case ts.SyntaxKind.EnumDeclaration:
            case ts.SyntaxKind.ObjectLiteralExpression:
            case ts.SyntaxKind.TypeLiteral:
            case ts.SyntaxKind.JSDocTypeLiteral:
            case ts.SyntaxKind.JsxAttributes:
                return 1 /* IsContainer */;
            case ts.SyntaxKind.InterfaceDeclaration:
                return 1 /* IsContainer */ | 64 /* IsInterface */;
            case ts.SyntaxKind.ModuleDeclaration:
            case ts.SyntaxKind.TypeAliasDeclaration:
            case ts.SyntaxKind.MappedType:
                return 1 /* IsContainer */ | 32 /* HasLocals */;
            case ts.SyntaxKind.SourceFile:
                return 1 /* IsContainer */ | 4 /* IsControlFlowContainer */ | 32 /* HasLocals */;
            case ts.SyntaxKind.MethodDeclaration:
                if (isObjectLiteralOrClassExpressionMethod(node)) {
                    return 1 /* IsContainer */ | 4 /* IsControlFlowContainer */ | 32 /* HasLocals */ | 8 /* IsFunctionLike */ | 128 /* IsObjectLiteralOrClassExpressionMethod */;
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
                return 1 /* IsContainer */ | 4 /* IsControlFlowContainer */ | 32 /* HasLocals */ | 8 /* IsFunctionLike */;
            case ts.SyntaxKind.FunctionExpression:
            case ts.SyntaxKind.ArrowFunction:
                return 1 /* IsContainer */ | 4 /* IsControlFlowContainer */ | 32 /* HasLocals */ | 8 /* IsFunctionLike */ | 16 /* IsFunctionExpression */;
            case ts.SyntaxKind.ModuleBlock:
                return 4 /* IsControlFlowContainer */;
            case ts.SyntaxKind.PropertyDeclaration:
                return node.initializer ? 4 /* IsControlFlowContainer */ : 0;
            case ts.SyntaxKind.CatchClause:
            case ts.SyntaxKind.ForStatement:
            case ts.SyntaxKind.ForInStatement:
            case ts.SyntaxKind.ForOfStatement:
            case ts.SyntaxKind.CaseBlock:
                return 2 /* IsBlockScopedContainer */;
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
                return isFunctionLike(node.parent) ? 0 /* None */ : 2 /* IsBlockScopedContainer */;
        }
        return 0 /* None */;
    }
    Ast.getContainerFlags = getContainerFlags;
    function getImplementsClause(node) {
        if (node) {
            var heritageClauses = node.heritageClauses;
            if (heritageClauses) {
                for (var _i = 0, heritageClauses_2 = heritageClauses; _i < heritageClauses_2.length; _i++) {
                    var clause = heritageClauses_2[_i];
                    if (clause.token === ts.SyntaxKind.ImplementsKeyword) {
                        return clause;
                    }
                }
            }
        }
        return undefined;
    }
    Ast.getImplementsClause = getImplementsClause;
    function getExtendsClause(node) {
        if (node) {
            var heritageClauses = node.heritageClauses;
            if (heritageClauses) {
                for (var _i = 0, heritageClauses_3 = heritageClauses; _i < heritageClauses_3.length; _i++) {
                    var clause = heritageClauses_3[_i];
                    if (clause.token === ts.SyntaxKind.ExtendsKeyword) {
                        return clause;
                    }
                }
            }
        }
        return undefined;
    }
    Ast.getExtendsClause = getExtendsClause;
    function isKeyword(token) {
        return ts.SyntaxKind.FirstKeyword <= token && token <= ts.SyntaxKind.LastKeyword;
    }
    Ast.isKeyword = isKeyword;
    function isPuncuation(token) {
        return ts.SyntaxKind.FirstPunctuation <= token && token <= ts.SyntaxKind.LastPunctuation;
    }
    Ast.isPuncuation = isPuncuation;
    function isTrivia(token) {
        return ts.SyntaxKind.FirstTriviaToken <= token && token <= ts.SyntaxKind.LastTriviaToken;
    }
    Ast.isTrivia = isTrivia;
    function isExportProperty(propertySymbol) {
        var node = propertySymbol.valueDeclaration;
        while (node) {
            if (getModifierFlagsNoCache(node) & ts.ModifierFlags.Export) {
                return true;
            }
            node = node.parent;
        }
        return false;
    }
    Ast.isExportProperty = isExportProperty;
    function isExportContext(propertySymbol) {
        var node = propertySymbol.valueDeclaration;
        while (node) {
            if (node.flags & ts.NodeFlags.ExportContext) {
                return true;
            }
            node = node.parent;
        }
        return false;
    }
    Ast.isExportContext = isExportContext;
    function isAmbientContext(propertySymbol) {
        var node = propertySymbol.valueDeclaration;
        while (node) {
            if (getModifierFlagsNoCache(node) & ts.ModifierFlags.Ambient) {
                return true;
            }
            node = node.parent;
        }
        return false;
    }
    Ast.isAmbientContext = isAmbientContext;
    function isAmbientModule(symbol) {
        var declarations = symbol.getDeclarations();
        if (declarations && declarations.length > 0) {
            var declaration = symbol.getDeclarations()[0];
            if (declaration.kind === ts.SyntaxKind.ModuleDeclaration) {
                if (declaration.modifiers) {
                    for (var _i = 0, _a = declaration.modifiers; _i < _a.length; _i++) {
                        var modifier = _a[_i];
                        if (modifier.kind === ts.SyntaxKind.DeclareKeyword) {
                            return true;
                        }
                    }
                }
            }
        }
        return false;
    }
    Ast.isAmbientModule = isAmbientModule;
    function isSourceCodeFile(file) {
        return (file.kind === ts.SyntaxKind.SourceFile && !file.isDeclarationFile);
    }
    Ast.isSourceCodeFile = isSourceCodeFile;
    function isSourceCodeModule(symbol) {
        var declarations = symbol.getDeclarations();
        if (declarations && declarations.length > 0) {
            var declaration = symbol.getDeclarations()[0];
            return ((declaration.kind === ts.SyntaxKind.SourceFile) && !(declaration.isDeclarationFile));
        }
        return false;
    }
    Ast.isSourceCodeModule = isSourceCodeModule;
})(Ast || (Ast = {}));
var level = {
    none: 0,
    error: 1,
    warn: 2,
    trace: 3,
    info: 4
};
var Logger = (function () {
    function Logger() {
    }
    Logger.setLevel = function (level) {
        this.logLevel = level;
    };
    Logger.setName = function (name) {
        this.logName = name;
    };
    Logger.log = function () {
        var args = [];
        for (var _i = 0; _i < arguments.length; _i++) {
            args[_i] = arguments[_i];
        }
        console.log.apply(console, [chalk_1.default.gray("[" + this.logName + "]")].concat(args));
    };
    Logger.info = function () {
        var args = [];
        for (var _i = 0; _i < arguments.length; _i++) {
            args[_i] = arguments[_i];
        }
        if (this.logLevel < level.info) {
            return;
        }
        console.log.apply(console, [chalk_1.default.gray("[" + this.logName + "]" + chalk_1.default.blue(" INFO: "))].concat(args));
    };
    Logger.warn = function () {
        var args = [];
        for (var _i = 0; _i < arguments.length; _i++) {
            args[_i] = arguments[_i];
        }
        if (this.logLevel < level.warn) {
            return;
        }
        console.log.apply(console, ["[" + this.logName + "]" + chalk_1.default.yellow(" WARNING: ")].concat(args));
    };
    Logger.error = function () {
        var args = [];
        for (var _i = 0; _i < arguments.length; _i++) {
            args[_i] = arguments[_i];
        }
        if (this.logLevel < level.error) {
            return;
        }
        console.log.apply(console, ["[" + this.logName + "]" + chalk_1.default.red(" ERROR: ")].concat(args));
    };
    Logger.trace = function () {
        var args = [];
        for (var _i = 0; _i < arguments.length; _i++) {
            args[_i] = arguments[_i];
        }
        if (this.logLevel < level.error) {
            return;
        }
        console.log.apply(console, ["[" + this.logName + "]" + chalk_1.default.gray(" TRACE: ")].concat(args));
    };
    return Logger;
}());
Logger.logLevel = level.none;
Logger.logName = "logger";
var Utils;
(function (Utils) {
    function forEach(array, callback) {
        if (array) {
            for (var i = 0, len = array.length; i < len; i++) {
                var result = callback(array[i], i);
                if (result) {
                    return result;
                }
            }
        }
        return undefined;
    }
    Utils.forEach = forEach;
    function contains(array, value) {
        if (array) {
            for (var _i = 0, array_1 = array; _i < array_1.length; _i++) {
                var v = array_1[_i];
                if (v === value) {
                    return true;
                }
            }
        }
        return false;
    }
    Utils.contains = contains;
    var hasOwnProperty = Object.prototype.hasOwnProperty;
    function hasProperty(map, key) {
        return hasOwnProperty.call(map, key);
    }
    Utils.hasProperty = hasProperty;
    function clone(object) {
        var result = {};
        for (var id in object) {
            result[id] = object[id];
        }
        return result;
    }
    Utils.clone = clone;
    function map(array, f) {
        var result;
        if (array) {
            result = [];
            for (var _i = 0, array_2 = array; _i < array_2.length; _i++) {
                var v = array_2[_i];
                result.push(f(v));
            }
        }
        return result;
    }
    Utils.map = map;
    function extend(first, second) {
        var sentinal = 1;
        var result = {};
        for (var id in first) {
            result[id] = first[id];
        }
        for (var id in second) {
            if (!hasProperty(result, id)) {
                result[id] = second[id];
            }
        }
        return result;
    }
    Utils.extend = extend;
    function replaceAt(str, index, character) {
        return str.substr(0, index) + character + str.substr(index + character.length);
    }
    Utils.replaceAt = replaceAt;
})(Utils || (Utils = {}));
var TsCore;
(function (TsCore) {
    function fileExtensionIs(path, extension) {
        var pathLen = path.length;
        var extLen = extension.length;
        return pathLen > extLen && path.substr(pathLen - extLen, extLen) === extension;
    }
    TsCore.fileExtensionIs = fileExtensionIs;
    TsCore.supportedExtensions = [".ts", ".tsx", ".d.ts"];
    TsCore.moduleFileExtensions = TsCore.supportedExtensions;
    function getIdentifierFromSymbol(symbol) {
        var decls = symbol.getDeclarations();
        for (var _i = 0, decls_1 = decls; _i < decls_1.length; _i++) {
            var decl = decls_1[_i];
            var identifier = decl.name;
            if (identifier) {
                return identifier;
            }
        }
        return undefined;
    }
    TsCore.getIdentifierFromSymbol = getIdentifierFromSymbol;
    function isIdentifier(node) {
        return (node.kind === ts.SyntaxKind.Identifier);
    }
    TsCore.isIdentifier = isIdentifier;
    function isSupportedSourceFileName(fileName) {
        if (!fileName) {
            return false;
        }
        for (var _i = 0, supportedExtensions_1 = TsCore.supportedExtensions; _i < supportedExtensions_1.length; _i++) {
            var extension = supportedExtensions_1[_i];
            if (fileExtensionIs(fileName, extension)) {
                return true;
            }
        }
        return false;
    }
    TsCore.isSupportedSourceFileName = isSupportedSourceFileName;
    function getSourceFileOfNode(node) {
        while (node && node.kind !== ts.SyntaxKind.SourceFile) {
            node = node.parent;
        }
        return node;
    }
    TsCore.getSourceFileOfNode = getSourceFileOfNode;
    function getSourceFileFromSymbol(symbol) {
        var declarations = symbol.getDeclarations();
        if (declarations && declarations.length > 0) {
            if (declarations[0].kind === ts.SyntaxKind.SourceFile) {
                return declarations[0].getSourceFile();
            }
        }
        return undefined;
    }
    TsCore.getSourceFileFromSymbol = getSourceFileFromSymbol;
    function getExternalModuleName(node) {
        if (node.kind === ts.SyntaxKind.ImportDeclaration) {
            return node.moduleSpecifier;
        }
        if (node.kind === ts.SyntaxKind.ImportEqualsDeclaration) {
            var reference = node.moduleReference;
            if (reference.kind === ts.SyntaxKind.ExternalModuleReference) {
                return reference.expression;
            }
        }
        if (node.kind === ts.SyntaxKind.ExportDeclaration) {
            return node.moduleSpecifier;
        }
        return undefined;
    }
    TsCore.getExternalModuleName = getExternalModuleName;
    function createDiagnostic(message) {
        var args = [];
        for (var _i = 1; _i < arguments.length; _i++) {
            args[_i - 1] = arguments[_i];
        }
        // FUTURE: Typescript 1.8.x supports localized diagnostic messages.
        var textUnique123 = message.message;
        if (arguments.length > 1) {
            textUnique123 = formatStringFromArgs(textUnique123, arguments, 1);
        }
        return {
            file: undefined,
            start: undefined,
            length: undefined,
            messageText: textUnique123,
            category: message.category,
            code: message.code
        };
    }
    TsCore.createDiagnostic = createDiagnostic;
    function formatStringFromArgs(text, args, baseIndex) {
        baseIndex = baseIndex || 0;
        return text.replace(/{(\d+)}/g, function (match, index) {
            return args[+index + baseIndex];
        });
    }
    // An alias symbol is created by one of the following declarations:
    // import <symbol> = ...
    // import <symbol> from ...
    // import * as <symbol> from ...
    // import { x as <symbol> } from ...
    // export { x as <symbol> } from ...
    // export = ...
    // export default ...
    function isAliasSymbolDeclaration(node) {
        return node.kind === ts.SyntaxKind.ImportEqualsDeclaration ||
            node.kind === ts.SyntaxKind.ImportClause && !!node.name ||
            node.kind === ts.SyntaxKind.NamespaceImport ||
            node.kind === ts.SyntaxKind.ImportSpecifier ||
            node.kind === ts.SyntaxKind.ExportSpecifier ||
            node.kind === ts.SyntaxKind.ExportAssignment && node.expression.kind === ts.SyntaxKind.Identifier;
    }
    TsCore.isAliasSymbolDeclaration = isAliasSymbolDeclaration;
    function normalizeSlashes(path) {
        return path.replace(/\\/g, "/");
    }
    TsCore.normalizeSlashes = normalizeSlashes;
    function outputExtension(path) {
        return path.replace(/\.ts/, ".js");
    }
    TsCore.outputExtension = outputExtension;
    /**
     * Parse standard project configuration objects: compilerOptions, files.
     * @param configFilePath
     */
    function getProjectConfig(configFilePath) {
        var configFileDir;
        var configFileName;
        try {
            var isConfigDirectory = fs.lstatSync(configFilePath).isDirectory();
        }
        catch (e) {
            var diagnostic = TsCore.createDiagnostic({ code: 6064, category: ts.DiagnosticCategory.Error, key: "Cannot_read_project_path_0_6064", message: "Cannot read project path '{0}'." }, configFilePath);
            return {
                options: undefined,
                fileNames: [],
                errors: [diagnostic]
            };
        }
        if (isConfigDirectory) {
            configFileDir = configFilePath;
            configFileName = path.join(configFilePath, "tsconfig.json");
        }
        else {
            configFileDir = path.dirname(configFilePath);
            configFileName = configFilePath;
        }
        var readConfigResult = ts.readConfigFile(configFileName, function (fileName) {
            return ts.sys.readFile(fileName);
        });
        if (readConfigResult.error) {
            return {
                options: undefined,
                fileNames: [],
                errors: [readConfigResult.error]
            };
        }
        var configObject = readConfigResult.config;
        return ts.parseJsonConfigFileContent(configObject, ts.sys, configFileDir);
    }
    TsCore.getProjectConfig = getProjectConfig;
})(TsCore || (TsCore = {}));
var ContainerIdGenerator = (function () {
    function ContainerIdGenerator() {
    }
    ContainerIdGenerator.getNextId = function () {
        return this.nextId++;
    };
    return ContainerIdGenerator;
}());
ContainerIdGenerator.nextId = 1;
var Container = (function () {
    function Container(node, checker) {
        this.childContainers = [];
        // The base class cannot be determined by the checker if the base class name has been shortened
        // so we use get and set for the baseClass property
        this.baseClass = undefined;
        this.namesExcluded = {};
        this.localIdentifiers = {};
        this.classifiableSymbols = {};
        this.excludedIdentifiers = {};
        this.excludedProperties = [];
        this.identifierCount = 0;
        this.shortenedIdentifierCount = 0;
        this.containerNode = node;
        this.checker = checker;
        this.id = ContainerIdGenerator.getNextId();
        this.containerFlags = Ast.getContainerFlags(node);
        if (this.containerFlags & 2 /* IsBlockScopedContainer */) {
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
    Container.prototype.getId = function () {
        return this.id;
    };
    Container.prototype.getParent = function () {
        return this.parent;
    };
    Container.prototype.getNameIndex = function () {
        // TJT: This logic needs to be reviewed for applicability to ES6 block scopes
        if (this.isBlockScoped) {
            // The name generator index for block scoped containers is obtained from the parent container
            return this.parent.getNameIndex();
        }
        return this.nameIndex++;
    };
    Container.prototype.getNode = function () {
        return this.containerNode;
    };
    Container.prototype.getMembers = function () {
        if (this.containerNode) {
            switch (this.containerNode.kind) {
                // TJT: LiteralTypes ???
                case ts.SyntaxKind.ClassDeclaration:
                case ts.SyntaxKind.ClassExpression:
                    return this.containerNode.members;
                case ts.SyntaxKind.InterfaceDeclaration:
                    return this.containerNode.members;
                case ts.SyntaxKind.EnumDeclaration:
                    return this.containerNode.members;
                default:
                    Logger.trace("Container::getMembers() unprocessed container kind: ", this.containerNode.kind, this.getId());
            }
        }
        return undefined;
    };
    Container.prototype.getLocals = function () {
        if (this.containerNode && this.containerFlags & 32 /* HasLocals */) {
            return this.containerNode.locals;
        }
        return undefined;
    };
    Container.prototype.getIsBlockScoped = function () {
        return this.isBlockScoped;
    };
    /**
     * Check if the container is classifiable.
     *
     * @returns True if the container is Classifiable
     */
    Container.prototype.isClassifiable = function () {
        var containerSymbol = this.containerNode.symbol;
        var classifiableSymbolFlags = ts.SymbolFlags.Class | ts.SymbolFlags.Enum |
            ts.SymbolFlags.TypeAlias | ts.SymbolFlags.Interface | ts.SymbolFlags.TypeParameter |
            ts.SymbolFlags.Module | ts.SymbolFlags.Alias;
        if (containerSymbol && (containerSymbol.flags & classifiableSymbolFlags)) {
            return true;
        }
        return false;
    };
    Container.prototype.isFunctionScoped = function () {
        if (this.containerFlags & (1 /* IsContainer */ | 32 /* HasLocals */)) {
            return true;
        }
        return false;
    };
    Container.prototype.setBaseClass = function (baseClass) {
        if (baseClass.flags & ts.SymbolFlags.Class) {
            this.baseClass = baseClass;
        }
    };
    Container.prototype.getBaseClass = function () {
        return this.baseClass;
    };
    Container.prototype.hasChild = function (container) {
        for (var i = 0; i < this.childContainers.length; i++) {
            if (container.getId() === this.childContainers[i].getId())
                return true;
        }
        return false;
    };
    Container.prototype.addIdentifiers = function (identifiers) {
        this.addLocals(identifiers);
        this.addMembers(identifiers);
    };
    Container.prototype.addMembers = function (identifiers) {
        var members = this.getMembers();
        if (members) {
            members.forEach(function (declaration) {
                var identifier = declaration.name;
                if (identifier) {
                    var t = identifier.flags;
                }
            });
        }
    };
    Container.prototype.forEachReference = function (node, checker, onReference) {
        node.forEachChild(function cb(node) {
            if (TsCore.isIdentifier(node)) {
                var sym = checker.getSymbolAtLocation(node);
                if (sym)
                    onReference(sym);
            }
            else {
                node.forEachChild(cb);
            }
        });
    };
    Container.prototype.addLocals = function (identifiers) {
        var _this = this;
        var locals = this.getLocals();
        if (locals) {
            locals.forEach(function (identifierSymbol) {
                var identifierId = Ast.getIdentifierUID(identifierSymbol);
                var identifier = identifiers.getIdentifier(identifierId);
                // Add the identifier to the container context
                identifier.addContainerReference(_this);
                // Add the new identifier info to both the container and the all list
                _this.localIdentifiers[identifierId] = identifier;
                // If the previously added identifier is not in the current container's local identifier table then
                // it must be excluded so that it's shortened name will not be used in this container.
                //if ( !Utils.hasProperty( this.localIdentifiers, identifierUID ) ) {
                //    this.excludedIdentifiers[identifierUID] = prevAddedIdentifier;
                //}
                _this.identifierCount++;
            });
        }
    };
    Container.prototype.initialize = function () {
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
    };
    return Container;
}());
var NameGenerator = (function () {
    function NameGenerator() {
        // Base64 char set: 26 lowercase letters + 26 uppercase letters + '$' + '_' + 10 digits                                          
        this.base64Chars = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ$_0123456789";
    }
    NameGenerator.prototype.getName = function (index) {
        // 2 and 3 letter reserved words that cannot be used in identifier names
        var RESERVED_KEYWORDS = ["do", "if", "in", "for", "int", "let", "new", "try", "var"];
        var name;
        while (true) {
            name = this.generateName(index++);
            if (RESERVED_KEYWORDS.indexOf(name) > 0) {
                continue;
            }
            else {
                return name;
            }
        }
    };
    NameGenerator.prototype.generateName = function (index) {
        var id = index;
        // The first 54 chars of the base64 char set are used for the first char of the identifier
        var name = this.base64Chars[id % 54];
        id = Math.floor(id / 54);
        while (id > 0) {
            // The full base64 char set is used after the first char of the identifier
            name += this.base64Chars[id % 64];
            id = Math.floor(id / 64);
        }
        return name;
    };
    return NameGenerator;
}());
var StatisticsReporter = (function () {
    function StatisticsReporter() {
    }
    StatisticsReporter.prototype.reportTitle = function (name) {
        Logger.log(name);
    };
    StatisticsReporter.prototype.reportValue = function (name, value) {
        Logger.log(this.padRight(name + ":", 25) + chalk_1.default.magenta(this.padLeft(value.toString(), 10)));
    };
    StatisticsReporter.prototype.reportCount = function (name, count) {
        this.reportValue(name, "" + count);
    };
    StatisticsReporter.prototype.reportTime = function (name, time) {
        this.reportValue(name, (time / 1000).toFixed(2) + "s");
    };
    StatisticsReporter.prototype.reportPercentage = function (name, percentage) {
        this.reportValue(name, percentage.toFixed(2) + "%");
    };
    StatisticsReporter.prototype.padLeft = function (s, length) {
        while (s.length < length) {
            s = " " + s;
        }
        return s;
    };
    StatisticsReporter.prototype.padRight = function (s, length) {
        while (s.length < length) {
            s = s + " ";
        }
        return s;
    };
    return StatisticsReporter;
}());
var Debug;
(function (Debug) {
    function assert(condition, message) {
        if (!condition) {
            message = message || "Assertion failed";
            if (typeof Error !== "undefined") {
                throw new Error(message);
            }
            throw message;
        }
    }
    Debug.assert = assert;
})(Debug || (Debug = {}));
var Minifier = (function () {
    function Minifier(program, compilerOptions, minifierOptions) {
        this.classifiableContainers = {};
        this.identifierCount = 0;
        this.shortenedIdentifierCount = 0;
        this.checker = program.getTypeChecker();
        this.compilerOptions = compilerOptions;
        this.minifierOptions = minifierOptions;
        this.nameGenerator = new NameGenerator();
        this.identifiers = new IdentifierCollection();
    }
    Minifier.prototype.transform = function (sourceFile) {
        Logger.setLevel(4);
        this.sourceFile = sourceFile;
        return this.minify(sourceFile);
    };
    Minifier.prototype.addToContainerChain = function (container) {
        if (!this.sourceFileContainer) {
            this.sourceFileContainer = container;
        }
        if (this.lastContainer) {
            this.lastContainer.nextContainer = container;
        }
        this.lastContainer = container;
    };
    Minifier.prototype.buildContainerChain = function (sourceFileNode) {
        var currentContainerNode = sourceFileNode;
        while (currentContainerNode) {
            var container = new Container(currentContainerNode, this.checker);
            this.addToContainerChain(container);
            container.addIdentifiers(this.identifiers);
            currentContainerNode = currentContainerNode.nextContainer;
        }
    };
    Minifier.prototype.replaceIdentifiersNamedOldNameWithNewName2 = function (context) {
        var visitor = function (node) {
            if (TsCore.isIdentifier(node)) {
                return ts.createIdentifier("newName");
            }
            return ts.visitEachChild(node, visitor, context);
        };
        return function (node) { return ts.visitNode(node, visitor); };
    };
    Minifier.prototype.getIdentifiers = function (sourceFile) {
        var identifierNodes = [];
        function visitSourceFileNodes(node) {
            if (node.kind === ts.SyntaxKind.Identifier) {
                identifierNodes.push(node);
            }
            return ts.forEachChild(node, visitSourceFileNodes);
        }
        visitSourceFileNodes(sourceFile);
        return identifierNodes;
    };
    Minifier.prototype.minify = function (sourceFile) {
        this.transformTime = new Date().getTime();
        var identifierNodes = this.getIdentifiers(sourceFile);
        for (var _i = 0, identifierNodes_1 = identifierNodes; _i < identifierNodes_1.length; _i++) {
            var identifierNode = identifierNodes_1[_i];
            var symbol = this.checker.getSymbolAtLocation(identifierNode);
            var symbolId = Ast.getIdentifierUID(symbol);
            if (!this.identifiers.contains(symbolId)) {
                var identifier = new IdentifierInfo(identifierNode, symbol);
                Logger.info("Adding new identifier: ", identifier.getName(), identifier.getId());
                // Add the new identifier info to both the container and the all list
                this.identifiers.add(symbolId, identifier);
            }
            else {
                var identifier = this.identifiers.getIdentifier(symbolId);
                Logger.info("Adding identifier node reference: ", identifier.getName(), identifier.getId());
                identifier.addNodeReference(identifierNode);
            }
        }
        // Walk the sourceFile to build containers and the identifiers within. 
        this.buildContainerChain(sourceFile);
        this.shortenIdentifiers();
        this.transformTime = new Date().getTime() - this.transformTime;
        if (this.compilerOptions.diagnostics)
            this.reportMinifyStatistics();
        return sourceFile;
    };
    Minifier.prototype.shortenIdentifiers = function () {
        // NOTE: Once identifier names are shortened, the typescript checker cannot be used. 
        // We first need to process all the class containers to determine which properties cannot be shortened 
        // ( public, abstract, implements, extends ).
        for (var classContainerKey in this.classifiableContainers) {
            var classContainer = this.classifiableContainers[classContainerKey];
            var abstractProperties = [];
            var heritageProperties = [];
            var implementsProperties = [];
            var extendsClause = Ast.getExtendsClause(classContainer.getNode());
            if (extendsClause) {
                // Check for abstract properties...
                // TODO: Abstract properties are currently not shortened, but they could possibly be.
                //       The child class that implements a parent class property would need to have the same shortened name.
                abstractProperties = Ast.getClassAbstractProperties(extendsClause, this.checker);
            }
            var implementsClause = Ast.getImplementsClause(classContainer.getNode());
            if (implementsClause) {
                implementsProperties = Ast.getImplementsProperties(implementsClause, this.checker);
            }
            heritageProperties = Ast.getClassHeritageProperties(classContainer.getNode(), this.checker);
            // Join the abstract and implements properties
            var excludedProperties = heritageProperties.concat(abstractProperties, implementsProperties);
            Logger.trace("Class excluded properties for: ", classContainer.getNode().name.text, excludedProperties.length, classContainer.getId());
            classContainer.excludedProperties = excludedProperties;
        }
        // Walk through the container identifiers starting at the source file container...
        var container = this.sourceFileContainer;
        while (container) {
            this.shortenContainerIdentifiers(container);
            container = container.nextContainer;
        }
    };
    Minifier.prototype.shortenContainerIdentifiers = function (container) {
        // If this container extends a base/parent class then we must make sure we have processed the base/parent class members
        var baseClass = container.getBaseClass();
        if (baseClass) {
            // We need to get the container for the parent/base class
            var baseClassContainer = this.classifiableContainers[baseClass.name];
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
        for (var identifierTableKey in container.localIdentifiers) {
            var identifierInfo = container.localIdentifiers[identifierTableKey];
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
    };
    Minifier.prototype.processIdentifierInfo = function (identifierInfo, container) {
        var _this = this;
        if (identifierInfo.isMinified) {
            Logger.trace("Identifier already has shortened name: ", identifierInfo.getName(), identifierInfo.shortenedName);
            return;
        }
        if (this.canShortenIdentifier(identifierInfo)) {
            var shortenedName_1 = this.getShortenedIdentifierName(container, identifierInfo);
            Logger.trace("Identifier shortened: ", identifierInfo.getName(), shortenedName_1);
            // Add the shortened name to the excluded names in each container that this identifier was found in.
            var containerRefs = identifierInfo.getContainers();
            for (var containerKey in containerRefs) {
                var containerRef = containerRefs[containerKey];
                containerRef.namesExcluded[shortenedName_1] = true;
            }
            //if ( !identifierInfo.isMinified ) {
            // Change all referenced identifier nodes to the shortened name
            Utils.forEach(identifierInfo.getIdentifiers(), function (identifier) {
                _this.setIdentifierText(identifier, shortenedName_1);
            });
            identifierInfo.isMinified = true;
            //}
            return;
        }
    };
    Minifier.prototype.canShortenIdentifier = function (identifierInfo) {
        if (identifierInfo.isBlockScopedVariable() ||
            identifierInfo.isFunctionScopedVariable() ||
            identifierInfo.isInternalClass() ||
            identifierInfo.isInternalInterface() ||
            identifierInfo.isPrivateMethod() ||
            identifierInfo.isPrivateProperty() ||
            identifierInfo.isInternalFunction(this.minifierOptions) ||
            identifierInfo.isParameter() ||
            identifierInfo.isNamespaceImportAlias()) {
            Logger.trace("Identifier CAN be shortened: ", identifierInfo.getName());
            return true;
        }
        Logger.trace("Identifier CANNOT be shortened: ", identifierInfo.getName());
        return false;
    };
    Minifier.prototype.getShortenedIdentifierName = function (container, identifierInfo) {
        // Identifier names are shortened in place. They must be the same length or smaller than the original name.
        if (!identifierInfo.shortenedName) {
            var identifierName = identifierInfo.getName();
            if (identifierName.length === 1) {
                // Just reuse the original name for 1 char names
                identifierInfo.shortenedName = identifierName;
            }
            else {
                // Loop until we have a valid shortened name
                // The shortened name MUST be the same length or less
                while (!identifierInfo.shortenedName) {
                    var shortenedName = this.nameGenerator.getName(container.getNameIndex());
                    Debug.assert(shortenedName.length <= identifierName.length);
                    var containerRefs = identifierInfo.getContainers();
                    var isShortenedNameAlreadyUsed = false;
                    for (var containerKey in containerRefs) {
                        var containerRef = containerRefs[containerKey];
                        if (Utils.hasProperty(containerRef.namesExcluded, shortenedName)) {
                            isShortenedNameAlreadyUsed = true;
                            Logger.trace("Generated name was excluded: ", shortenedName, identifierName);
                            break;
                        }
                    }
                    if (!isShortenedNameAlreadyUsed) {
                        identifierInfo.shortenedName = shortenedName;
                    }
                }
                this.shortenedIdentifierCount++;
            }
        }
        else {
            Logger.trace("Identifier already has shortened name: ", identifierInfo.getName(), identifierInfo.shortenedName);
        }
        Logger.info("Identifier shortened name: ", identifierInfo.getName(), identifierInfo.shortenedName);
        return identifierInfo.shortenedName;
    };
    Minifier.prototype.setIdentifierText = function (identifier, text) {
        var identifierLength = identifier.text.length;
        var bufferLength = (identifier.end - identifier.pos);
        // Check to see if there is leading trivia
        var triviaOffset = identifier.getLeadingTriviaWidth();
        // Find the start of the identifier text within the identifier character array
        for (var identifierStart = identifier.pos + triviaOffset; identifierStart < identifier.pos + bufferLength; identifierStart++) {
            if (this.sourceFile.text[identifierStart] === identifier.text[0])
                break;
        }
        // Replace the identifier text within the bundle source file
        identifier.end = identifierStart + text.length;
        for (var i = 0; i < identifierLength; i++) {
            var replaceChar = " ";
            if (i < text.length) {
                replaceChar = text[i];
            }
            this.sourceFile.text = Utils.replaceAt(this.sourceFile.text, identifierStart + i, replaceChar);
        }
    };
    Minifier.prototype.processClassMembers = function (members, container) {
        for (var memberKey in members) {
            var member = members[memberKey];
            var memberSymbol = member.symbol;
            if (memberSymbol) {
                var memberSymbolUId = Ast.getIdentifierUID(memberSymbol);
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
                Logger.warn("Container member does not have a symbol.");
            }
        }
    };
    Minifier.prototype.excludeNames = function (container) {
        // Determine identifier names which cannot be used in this container.
        // If this container extends a base/parent class then we exclude the base class member names.
        var baseClass = container.getBaseClass();
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
        for (var identifierInfoKey in container.localIdentifiers) {
            var identifierInfo = container.localIdentifiers[identifierInfoKey];
            this.excludeNamesForIdentifier(identifierInfo, container);
        }
        //for ( let classifiableKey in container.classifiableSymbols ) {
        //    let classSymbol = container.classifiableSymbols[classifiableKey];
        //    let classSymbolUId: string = Ast.getIdentifierUID( classSymbol );
        //    let classIdentifierInfo = this.identifiers[classSymbolUId];
        //    Debug.assert( classIdentifierInfo !== undefined, "Container classifiable identifier symbol not found." );
        //    this.excludeNamesForIdentifier( classIdentifierInfo, container );
        //}
    };
    Minifier.prototype.getContainerExcludedIdentifiers = function (container) {
        // Recursively walk the container chain to find shortened identifier names that we cannot use in this container.
        var target = this.compilerOptions.target;
        var excludes = {};
        function getContainerExcludes(container) {
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
            for (var excludedIdentifierKey in container.excludedIdentifiers) {
                var excludedIdentifier = container.excludedIdentifiers[excludedIdentifierKey];
                // For function scoped identifiers we must exclude the identifier from the current container parent.
                // Note that for ES5, which doesn't have block scoped variables, we must also exclude the identifier.
                if ((!excludedIdentifier.isBlockScopedVariable) || (target === ts.ScriptTarget.ES5)) {
                    if (!Utils.hasProperty(excludes, excludedIdentifier.getId())) {
                        excludes[excludedIdentifier.getId()] = excludedIdentifier;
                    }
                }
            }
        }
        // Start the search for excluded identifiers from the container's parent - the parent function scope container.
        getContainerExcludes(container.getParent());
        return excludes;
    };
    Minifier.prototype.excludeNamesForIdentifier = function (identifierInfo, container) {
        // Exclude all shortened names that have already been used in child containers that this identifer is contained in.
        var identifierContainers = identifierInfo.getContainers();
        // For each container that the identifier is contained in..
        for (var containerKey in identifierContainers) {
            var identifierContainer = identifierContainers[containerKey];
            var containerExcludes = this.getContainerExcludedIdentifiers(identifierContainer);
            // We can't use any names that have already been used in this referenced container
            for (var excludedIdentifierKey in containerExcludes) {
                var excludedIdentifier = containerExcludes[excludedIdentifierKey];
                if (excludedIdentifier.shortenedName) {
                    container.namesExcluded[excludedIdentifier.shortenedName] = true;
                }
            }
        }
    };
    Minifier.prototype.reportMinifyStatistics = function () {
        var statisticsReporter = new StatisticsReporter();
        statisticsReporter.reportTime("Minify time", this.transformTime);
        statisticsReporter.reportCount("Total identifiers", this.identifierCount);
        statisticsReporter.reportCount("Identifiers shortened", this.shortenedIdentifierCount);
    };
    Minifier.prototype.gerb = function () {
        // We can't shorten identifier names that are 1 character in length AND
        // we can't risk the chance that an identifier name will be replaced with a 2 char
        // shortened name due to the constraint that the names are changed in place
        //    let identifierName = identifierSymbol.getName();
        //    if ( identifierName.length === 1 ) {
        //        identifierInfo.shortenedName = identifierName;
        //        this.excludedIdentifiers[identifierUID] = identifierInfo;
        //    }
    };
    return Minifier;
}());
;
function getWhitespaceTransform() {
    return function (context) { return whitespaceTransform(context); };
}
function whitespaceTransform(context) {
    var compilerOptions = context.getCompilerOptions();
    var currentSourceFile;
    return transformSourceFile;
    /**
     * Minify the provided SourceFile.
     *
     * @param node A SourceFile node.
     */
    function transformSourceFile(node) {
        if (node.isDeclarationFile) {
            return node;
        }
        currentSourceFile = node;
        var visited = ts.visitEachChild(node, visitor, context);
        return visited;
    }
    function visitor(node) {
        switch (node.kind) {
            case ts.SyntaxKind.Identifier:
                return visitIdentifier(node);
        }
        return node;
    }
    function visitIdentifier(node) {
        return node;
    }
}
var WhitespaceMinifier = (function () {
    function WhitespaceMinifier() {
        this.transformSourceFile = function (sourceFile) {
            //this.minifier = new Minifier( this.program, this.compilerOptions, this.options );
            //sourceFile = this.minifier.transform( sourceFile );
            return sourceFile;
        };
        //private reportWhitespaceStatistics() {
        //    let statisticsReporter = new StatisticsReporter();
        //    statisticsReporter.reportTime( "Whitespace time", this.whiteSpaceTime );
        //    statisticsReporter.reportPercentage( "Whitespace reduction", ( ( this.whiteSpaceBefore - this.whiteSpaceAfter ) / this.whiteSpaceBefore ) * 100.00 );
        //}
    }
    WhitespaceMinifier.prototype.transform = function (program, context) {
        //this.compilerOptions = context.getCompilerOptions();
        //this.program = program;
        return this.transformSourceFile;
    };
    WhitespaceMinifier.prototype.removeWhitespace = function (jsContents) {
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
        var output = "";
        var lastNonTriviaToken = ts.SyntaxKind.Unknown;
        var isTrivia = false;
        var token;
        var scanner = ts.createScanner(ts.ScriptTarget.ES5, /* skipTrivia */ false, ts.LanguageVariant.Standard, jsContents);
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
                        if ((lastNonTriviaToken === ts.SyntaxKind.PlusToken) ||
                            (lastNonTriviaToken === ts.SyntaxKind.PlusPlusToken)) {
                            output += " ";
                        }
                        output += scanner.getTokenText();
                        break;
                    case ts.SyntaxKind.MinusToken:
                    case ts.SyntaxKind.MinusMinusToken:
                        if ((lastNonTriviaToken === ts.SyntaxKind.MinusToken) ||
                            (lastNonTriviaToken === ts.SyntaxKind.MinusMinusToken)) {
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
    };
    return WhitespaceMinifier;
}());
var MinifierTransform = (function () {
    function MinifierTransform(options) {
        var _this = this;
        this.transformSourceFile = function (sourceFile) {
            _this.minifier = new Minifier(_this.program, _this.compilerOptions, _this.options);
            if (_this.options.mangleIdentifiers) {
                sourceFile = _this.minifier.transform(sourceFile);
            }
            return sourceFile;
        };
        this.options = options || { mangleIdentifiers: true, removeWhitespace: true };
    }
    MinifierTransform.prototype.transform = function (program, context) {
        this.compilerOptions = context.getCompilerOptions();
        this.program = program;
        return this.transformSourceFile;
    };
    return MinifierTransform;
}());
function format(input) {
    //var settings = getDefaultFormatCodeSettings();
    var sourceFile = ts.createSourceFile("file.js", input, ts.ScriptTarget.Latest);
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
var TsMinifier;
(function (TsMinifier) {
    function getMinifierTransform(program, options) {
        var minifierTransform = new MinifierTransform(options);
        return function (context) { return minifierTransform.transform(program, context); };
    }
    TsMinifier.getMinifierTransform = getMinifierTransform;
    function getWhitespaceTransform(program, options) {
        var whitespaceTransform = new WhitespaceMinifier();
        return function (context) { return whitespaceTransform.transform(program, context); };
    }
    TsMinifier.getWhitespaceTransform = getWhitespaceTransform;
    function minify(fileNames, compilerOptions, minifierOptions) {
        var minifierPlugin = new MinifierTransform(minifierOptions);
        var compiler = new tsc.Compiler(compilerOptions);
        var compileResult = compiler.compile(fileNames);
        return {
            emitSkipped: true,
            diagnostics: compileResult.getErrors()
        };
    }
    TsMinifier.minify = minify;
    function minifyModule(input, moduleFileName, compilerOptions, minifierOptions) {
        var minifierPlugin = new MinifierTransform(minifierOptions);
        var compiler = new tsc.Compiler(compilerOptions); //, minifierPlugin );
        var compileResult = compiler.compileModule(input, moduleFileName);
        return {
            emitSkipped: true,
            diagnostics: compileResult.getErrors()
        };
    }
    TsMinifier.minifyModule = minifyModule;
    function minifyProject(configFilePath, minifierOptions) {
        var config = TsCore.getProjectConfig(configFilePath);
        if (config.errors.length > 0) {
            return {
                emitSkipped: true,
                diagnostics: config.errors
            };
        }
        return minify(config.fileNames, config.options, minifierOptions);
    }
    TsMinifier.minifyProject = minifyProject;
    function prettify(input) {
        return format(input);
    }
    TsMinifier.prettify = prettify;
})(TsMinifier = exports.TsMinifier || (exports.TsMinifier = {}));
//# sourceMappingURL=tsminifier.js.map