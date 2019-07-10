import * as ts from "typescript"
import { IdentifierInfo } from "./IdentifierInfo"
import { Utils } from "../../../TsToolsCommon/src/Utils/Utilities"

export class IdentifierCollection {
    private identifiers: ts.MapLike<IdentifierInfo> = {};

    public add( id: string, identifier: IdentifierInfo ): boolean {
        if ( this.contains( id ) ) {
            return false;
        }

        this.identifiers[id] = identifier;

        return true;
    }

    public contains( id: string ): boolean {
        if ( Utils.hasProperty( this.identifiers, id ) ) {
            return true
        }

        return false;

    }

    public getIdentifier( id: string ): IdentifierInfo {
        return this.identifiers[id];
    }
}