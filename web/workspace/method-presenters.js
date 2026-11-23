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
  const horizontalPresenter=Object.freeze({id:"pedpsy/horizontal-scale",version:"1.0.0"});
  const maiaScale=values=>Object.freeze({
    presenter:horizontalPresenter,
    scale:Object.freeze({
      type:"numeric",
      values,
      labels:values.slice(),
      minLabel:"Никогда",
      maxLabel:"Всегда",
      layout:"auto",
      required:true,
      selectedStyle:"filled"
    })
  });
  // MAIA-R 1.0.0 stores 1..6, the reconciled 1.0.1 stores 0..5. Both keep the
  // same horizontal scale; only the pinned values differ.
  const ecvValues=Array.from({length:11},(_,index)=>String(index+1));
  const ecvLabels=Array.from({length:11},(_,index)=>String(index));
  const ecvProfile=Object.freeze({
    presenter:horizontalPresenter,
    scale:Object.freeze({
      type:"numeric",
      values:Object.freeze(ecvValues),
      labels:Object.freeze(ecvLabels),
      minLabel:"категорически не согласен",
      maxLabel:"полностью согласен",
      layout:"row",
      required:true,
      selectedStyle:"filled"
    })
  });
  const methodProfiles=new Map([
    ["maia_r_32_shared@1.0.0",Object.freeze([
      maiaScale(["0","1","2","3","4","5"]),
      maiaScale(["1","2","3","4","5","6"])
    ])],
    ["ecv_15_shared@1.0.0",Object.freeze([ecvProfile])]
  ]);
  function profileFor(form){
    if(!form||typeof form.id!=="string")return null;
    const candidates=methodProfiles.get(form.id+"@"+(form.version||""))||null;
    const firstItem=Array.isArray(form.items)?form.items[0]:null;
    if(!candidates&&firstItem&&Array.isArray(firstItem.options)&&firstItem.options.length===11&&firstItem.options.every((option,index)=>String(option.value)===String(index+1)))return ecvProfile;
    if(!candidates)return null;
    const first=Array.isArray(form.items)?form.items[0]:null;
    if(!first||!Array.isArray(first.options))return candidates[0];
    const stored=first.options.map(option=>String(option.value));
    return candidates.find(profile=>{
      const values=profile.scale&&Array.isArray(profile.scale.values)?profile.scale.values:null;
      return Boolean(values)&&stored.length===values.length&&stored.every((value,index)=>value===values[index]);
    })||null;
  }
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
    const numeric=item.options.length>=8&&item.options.every(option=>/^-?\d{1,2}$/.test(String(option.text).trim()));
    if(numeric){
      const wrap=doc.createElement("div");wrap.className="scale scale-numeric scale-row scale-count-"+item.options.length;
      const options=doc.createElement("div");options.className="scale-options";
      for(const option of item.options){const label=doc.createElement("label");label.className="scale-option";const cell=doc.createElement("span");cell.className="scale-cell";cell.textContent=option.text;label.append(radio(doc,option,selected,disabled,onChange),cell);options.append(label);}
      wrap.append(options);container.append(wrap);return;
    }
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
