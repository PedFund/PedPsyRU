"use strict";
(() => {
  // The pinned MIT encoder is served before this wrapper from the same origin.
  // No link, token, or matrix is sent to a QR service or browser storage.
  function matrix(link, origin, encoder) {
    if(typeof link!=="string"||link.length>512||/[^\x21-\x7e]/.test(link))throw Error("Invalid group link");
    const url=new URL(link),base=new URL(origin);
    if(!["http:","https:"].includes(base.protocol)||base.origin!==origin||url.origin!==origin||url.username||url.password||url.pathname!=="/workspace"||url.search||!/^#join=[A-Za-z0-9_-]{43}$/.test(url.hash)||url.href!==link)throw Error("Invalid group link");
    const qr=encoder(0,"M");qr.addData(link,"Byte");qr.make();
    const size=qr.getModuleCount();
    if(!Number.isInteger(size)||size<21||size>177)throw Error("Invalid QR size");
    return Array.from({length:size},(_,r)=>Array.from({length:size},(_,c)=>qr.isDark(r,c)));
  }
  function render(container,link,origin) {
    container.replaceChildren();const cells=matrix(link,origin,window.qrcode),size=cells.length,ns="http://www.w3.org/2000/svg";
    const svg=document.createElementNS(ns,"svg");svg.setAttribute("viewBox",`0 0 ${size+8} ${size+8}`);svg.setAttribute("role","img");svg.setAttribute("aria-label","QR-код группового приглашения");svg.setAttribute("width","256");svg.setAttribute("height","256");svg.setAttribute("shape-rendering","crispEdges");
    const background=document.createElementNS(ns,"rect");background.setAttribute("width",String(size+8));background.setAttribute("height",String(size+8));background.setAttribute("fill","white");svg.append(background);
    const path=document.createElementNS(ns,"path");path.setAttribute("fill","black");path.setAttribute("d",cells.flatMap((row,r)=>row.flatMap((dark,c)=>dark?[`M${c+4},${r+4}h1v1h-1z`]:[])).join(""));svg.append(path);container.append(svg);
  }
  if(typeof module!=="undefined"&&module.exports){module.exports={matrix};return;}
  window.PedPsyQR={render};
})();
