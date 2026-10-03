import {createWorkspacePreviewApp} from "../http/workspace-app.js";
import {workspaceAssets} from "./workspace-assets.js";
async function main(){const app=createWorkspacePreviewApp(workspaceAssets());
  const close=()=>{void app.close();};process.once("SIGINT",close);process.once("SIGTERM",close);
  try{await app.listen({host:"127.0.0.1",port:4175});console.log("Workspace UI preview only: http://127.0.0.1:4175/workspace; database/auth disabled.");}
  catch{await app.close();process.exitCode=1;}
}
void main();
