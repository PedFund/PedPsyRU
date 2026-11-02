"use strict";
(() => {
  function createMethodPresenters(modules){
    const entries=new Map();
    for(const m of modules){if(!m||typeof m.id!=="string"||typeof m.version!=="string"||typeof m.mount!=="function")throw Error("INVALID_METHOD_PRESENTER");const key=JSON.stringify([m.id,m.version]);if(entries.has(key))throw Error("DUPLICATE_METHOD_PRESENTER");entries.set(key,Object.freeze({mount:m.mount}));}
    return Object.freeze({mount(identity,context){const m=entries.get(JSON.stringify([identity.id,identity.version]));if(!m)throw Error("Для этой методики ещё не подключён экран прохождения.");return m.mount(context);}});
  }
  const singleChoice=Object.freeze({id:"pedpsy/single-choice",version:"1.0",mount({container,item,selected,disabled,onChange}){
    const doc=container.ownerDocument;
    for(const option of item.options){const label=doc.createElement("label");label.className="question-option";const input=doc.createElement("input");input.type="radio";input.name="response";input.value=option.value;input.checked=selected===option.value;input.disabled=disabled;
      label.append(input,doc.createTextNode(option.text));input.onchange=()=>onChange(input.value);container.append(label);}
  }});
  const api={createMethodPresenters,singleChoice};
  if(typeof module==="object"&&module.exports){module.exports=api;return;}
  // New renderers are first-party modules explicitly composed here; a form cannot
  // load JavaScript, an iframe or an external URL to install its own renderer.
  window.PedPsyMethodPresenters=createMethodPresenters([singleChoice]);
})();
