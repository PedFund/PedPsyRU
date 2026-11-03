(function(root){
  "use strict";
  const groups=[["тревог","тревож","anxiety"],["выгоран","выгорание","burnout"],["рефлекс","reflex"],["осознан","mindful"],["конфликт","conflict"]];
  const normalize=value=>String(value??"").toLocaleLowerCase("ru-RU").replace(/ё/g,"е");
  function matches(method,query){const authors=Array.isArray(method.authors)?method.authors:[method.authors||""];
    const hay=normalize([method.title,...authors,method.summary,...method.indicators,...method.subscales,...method.outputs.map(x=>x.label),...method.search_terms].join(" "));
    return normalize(query).trim().split(/\s+/).filter(Boolean).every(term=>{const group=groups.find(g=>g.some(stem=>term.includes(stem)));return group?group.some(stem=>hay.includes(stem)):hay.includes(term);});
  }
  const api={matches};if(typeof module==="object"&&module.exports)module.exports=api;else root.PedPsyMethodSearch=api;
})(typeof globalThis!=="undefined"?globalThis:this);
