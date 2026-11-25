import type {Pool} from "pg";
import {PostgresMethodAuthoring} from "../adapters/postgres/method-authoring.js";
import {createMethodAuthoringApi} from "../application/method-authoring-api.js";
export function methodAuthoringBoundary(pool:Pool){return createMethodAuthoringApi(new PostgresMethodAuthoring(pool));}
