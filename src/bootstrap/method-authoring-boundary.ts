import type {Pool} from "pg";
import {PostgresMethodAuthoring} from "../adapters/postgres/method-authoring.js";
import {createMethodAuthoringApi} from "../application/method-authoring-api.js";
import {validateAuthoringDefinition} from "../adapters/authoring-method.js";
export function methodAuthoringBoundary(pool:Pool){return createMethodAuthoringApi(new PostgresMethodAuthoring(pool),{validate:validateAuthoringDefinition});}
