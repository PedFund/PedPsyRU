"use strict";
(() => {
  const scaleApi = typeof module === "object" && module.exports
    ? require("./scale-presenter.js")
    : (typeof window !== "undefined" ? window.PedPsyScale : undefined);
  function createMethodPresenters(modules){
    const entries=new Map();
    for(const m of modules){if(!m||typeof m.id!=="string"||typeof m.version!=="string"||typeof m.mount!=="function")throw Error("INVALID_METHOD_PRESENTER");const key=JSON.stringify([m.id,m.version]);if(entries.has(key))throw Error("DUPLICATE_METHOD_PRESENTER");entries.set(key,Object.freeze({mount:m.mount}));}
    return Object.freeze({mount(identity,context){const m=entries.get(JSON.stringify([identity.id,identity.version]));if(!m)throw Error("Для этой методики ещё не подключён экран прохождения.");return m.mount(context);}});
  }
  // Display profiles are keyed by the pinned form identity, not by a title or a
  // heuristic. They only describe how the same options are shown; the release,
  // item order, option values, key and scoring remain untouched.
  const methodProfiles=new Map([
    ["maia_r_32_shared@1.0.0",Object.freeze({
      presenter:Object.freeze({id:"pedpsy/horizontal-scale",version:"1.0.0"}),
      scale:Object.freeze({
        type:"numeric",
        // The pinned key accepts 1..6 and maps them to the authored 0..5 scale.
        // The participant sees 0..5; the stored protocol code stays 1..6.
        values:["1","2","3","4","5","6"],
        labels:["0","1","2","3","4","5"],
        minLabel:"Никогда",
        maxLabel:"Всегда",
        layout:"auto",
        required:true,
        selectedStyle:"filled"
      })
    })]
  ]);
  function profileFor(form){if(!form||typeof form.id!=="string")return null;return methodProfiles.get(form.id+"@"+(form.version||""))||null;}
  const bipolarLabels=new Map([
    ["-3","-3 — абсолютно согласен с первым утверждением"],
    ["-2","-2 — согласен с первым утверждением"],
    ["-1","-1 — скорее согласен с первым утверждением"],
    ["0","0 — оба утверждения одинаково верны"],
    ["1","1 — скорее согласен со вторым утверждением"],
    ["2","2 — согласен со вторым утверждением"],
    ["3","3 — абсолютно согласен со вторым утверждением"]
  ]);
  const bipolarCaptions=new Map([["-3","абсолютно"],["-2","согласен"],["-1","скорее"],["0","оба верны"],["1","скорее"],["2","согласен"],["3","абсолютно"]]);
  function optionKey(option){return String(option.text).replace(/−/g,"-").trim();}
  function optionText(option,item){return isBipolar(item)?(bipolarLabels.get(optionKey(option))||option.text):option.text;}
  function isBipolar(item){return item.options.some(option=>optionKey(option)==="-3");}
  function radio(doc,option,selected,disabled,onChange){const input=doc.createElement("input");input.type="radio";input.name="response";input.value=option.value;input.checked=selected===option.value;input.disabled=disabled;input.onchange=()=>onChange(input.value);return input;}
  const singleChoice=Object.freeze({id:"pedpsy/single-choice",version:"1.0",mount({container,item,selected,disabled,onChange}){
    const doc=container.ownerDocument;
    if(isBipolar(item)){
      const scale=doc.createElement("div");scale.className="bipolar-scale";
      const poles=doc.createElement("div");poles.className="bipolar-poles";
      const first=doc.createElement("span");first.textContent="Абсолютно согласен с первым";
      const second=doc.createElement("span");second.textContent="Абсолютно согласен со вторым";
      poles.append(first,second);
      const track=doc.createElement("div");track.className="bipolar-track";
      for(const option of item.options){const label=doc.createElement("label");label.className="bipolar-point";label.title=optionText(option,item);
        const number=doc.createElement("span");number.className="bipolar-number";number.textContent=option.text;
        const caption=doc.createElement("small");caption.textContent=bipolarCaptions.get(optionKey(option))||"";
        label.append(radio(doc,option,selected,disabled,onChange),number,caption);track.append(label);}
      scale.append(poles,track);container.append(scale);return;
    }
    for(const option of item.options){const label=doc.createElement("label");label.className="question-option";
      label.append(radio(doc,option,selected,disabled,onChange),doc.createTextNode(optionText(option,item)));container.append(label);}
  }});
  // Universal horizontal scale: configured through the method profile, not by a
  // branch on a method id inside participant.js.
  const horizontalScale=Object.freeze({id:"pedpsy/horizontal-scale",version:"1.0.0",mount(context){
    if(!scaleApi)throw Error("SCALE_PRESENTER_UNAVAILABLE");
    return scaleApi.mount(context);
  }});
  const api={createMethodPresenters,singleChoice,horizontalScale,optionText,isBipolar,profileFor,methodProfiles};
  if(typeof module==="object"&&module.exports){module.exports=api;return;}
  // New renderers are first-party modules explicitly composed here; a form cannot
  // load JavaScript, an iframe or an external URL to install its own renderer.
  const registry=createMethodPresenters([singleChoice,horizontalScale]);
  window.PedPsyMethodPresenters=Object.freeze({mount:registry.mount,profileFor});
})();
