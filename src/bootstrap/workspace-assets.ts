import {readFileSync} from "node:fs";
import path from "node:path";
export function workspaceAssets(){const root=path.resolve(__dirname,"../../..","web/workspace");return {html:readFileSync(path.join(root,"index.html"),"utf8"),js:readFileSync(path.join(root,"app.js"),"utf8"),css:readFileSync(path.join(root,"styles.css"),"utf8"),participantJs:readFileSync(path.join(root,"participant.js"),"utf8")};}
