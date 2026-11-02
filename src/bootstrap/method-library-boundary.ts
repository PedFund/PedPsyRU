import type {Pool} from "pg";
import {PostgresMethodLibrary} from "../adapters/postgres/method-library.js";
import {createMethodLibraryApi} from "../application/method-library.js";
export function methodLibraryBoundary(pool:Pool){return createMethodLibraryApi(new PostgresMethodLibrary(pool));}
