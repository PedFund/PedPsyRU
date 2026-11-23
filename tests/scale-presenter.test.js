"use strict";
// The universal answer scale is presentation-only: these tests pin the authored
// 0..5 labels, the stored 1..6 codes, selection/restore behaviour and the mobile
// 3x2 fallback without touching any scoring key.
const {test} = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const scale = require("../web/workspace/scale-presenter.js");
const presenters = require("../web/workspace/method-presenters.js");

const maiaItem = {
  id: "q01",
  text: "Когда я испытываю напряжение, я замечаю, где в теле находится это напряжение.",
  options: [
    {value: "0", text: "Никогда"},
    {value: "1", text: "1"},
    {value: "2", text: "2"},
    {value: "3", text: "3"},
    {value: "4", text: "4"},
    {value: "5", text: "Всегда"}
  ]
};

function node(tag) {
  return {
    tagName: tag,
    children: [],
    attributes: {},
    listeners: {},
    className: "",
    textContent: "",
    append(...nodes) {
      for (const child of nodes) this.children.push(child);
    },
    setAttribute(name, value) {
      this.attributes[name] = String(value);
    },
    addEventListener(name, listener) {
      this.listeners[name] = listener;
    }
  };
}

function container() {
  const doc = {createElement: node};
  const fieldset = node("fieldset");
  fieldset.ownerDocument = doc;
  return fieldset;
}

function scaleInputs(fieldset) {
  const root = fieldset.children[0];
  const options = root.children[0];
  return options.children.map(label => label.children[0]);
}

test("MAIA-R profile uses the reconciled 0..5 answer codes directly", () => {
  const profile = presenters.profileFor({id: "maia_r_32_shared", version: "1.0.0"});
  assert.ok(profile);
  assert.deepEqual(profile.presenter, {id:"pedpsy/horizontal-scale", version:"1.0.0"});
  assert.deepEqual(profile.scale.values, ["0", "1", "2", "3", "4", "5"]);
  assert.deepEqual(profile.scale.labels, ["0", "1", "2", "3", "4", "5"]);
  assert.equal(profile.scale.minLabel, "Никогда");
  assert.equal(profile.scale.maxLabel, "Всегда");
  assert.equal(profile.scale.required, true);
  assert.equal(profile.scale.selectedStyle, "filled");
  assert.equal(presenters.profileFor({id: "unknown_shared", version: "1.0.0"}), null);
});

test("historical MAIA-R 1..6 form keeps the horizontal 1..6 scale", () => {
  const legacy = {
    id: "maia_r_32_shared",
    version: "1.0.0",
    items: [{id: "q01", options: [
      {value: "1", text: "Никогда"}, {value: "2", text: "1"}, {value: "3", text: "2"},
      {value: "4", text: "3"}, {value: "5", text: "4"}, {value: "6", text: "Всегда"}
    ]}]
  };
  const legacyProfile = presenters.profileFor(legacy);
  assert.ok(legacyProfile);
  assert.deepEqual(legacyProfile.presenter, {id:"pedpsy/horizontal-scale", version:"1.0.0"});
  assert.deepEqual(legacyProfile.scale.values, ["1", "2", "3", "4", "5", "6"]);
  assert.deepEqual(legacyProfile.scale.labels, ["1", "2", "3", "4", "5", "6"]);
  assert.equal(legacyProfile.scale.minLabel, "Никогда");
  assert.equal(legacyProfile.scale.maxLabel, "Всегда");
  const current = {
    id: "maia_r_32_shared",
    version: "1.0.0",
    items: [{id: "q01", options: [
      {value: "0", text: "Никогда"}, {value: "1", text: "1"}, {value: "2", text: "2"},
      {value: "3", text: "3"}, {value: "4", text: "4"}, {value: "5", text: "Всегда"}
    ]}]
  };
  assert.deepEqual(presenters.profileFor(current).scale.values, ["0", "1", "2", "3", "4", "5"]);
});

test("the component accepts zero as a complete stored answer", () => {
  const item = {options: Array.from({length: 6}, (_, index) => ({value: String(index), text: String(index)}))};
  const model = scale.resolveScale(item, {
    values: ["0", "1", "2", "3", "4", "5"],
    labels: ["0", "1", "2", "3", "4", "5"],
    minLabel: "Никогда",
    maxLabel: "Всегда"
  });
  assert.equal(model.cells[0].value, "0");
  assert.equal(model.cells[0].display, "0");
  const fieldset = container();
  scale.mount({container: fieldset, item, selected: "0", disabled: false, onChange: () => {}, scale: {
    values: ["0", "1", "2", "3", "4", "5"],
    labels: ["0", "1", "2", "3", "4", "5"],
    minLabel: "Никогда",
    maxLabel: "Всегда"
  }});
  const inputs = scaleInputs(fieldset);
  assert.equal(inputs[0].checked, true);
  assert.equal(inputs[1].checked, false);
});

test("the rendered MAIA-R scale has one radio group, six cells and readable edge captions", () => {
  const profile = presenters.profileFor({id: "maia_r_32_shared", version: "1.0.0"});
  const fieldset = container();
  let chosen = "";
  const model = scale.mount({
    container: fieldset,
    item: maiaItem,
    selected: "0",
    disabled: false,
    onChange: value => { chosen = value; },
    scale: profile.scale
  });
  assert.equal(model.count, 6);
  const root = fieldset.children[0];
  assert.match(root.className, /scale-numeric/);
  assert.equal(root.attributes.role, "radiogroup");
  assert.match(root.attributes["aria-label"], /от 0 до 5/);
  assert.match(root.attributes["aria-label"], /Никогда/);
  assert.match(root.attributes["aria-label"], /Всегда/);
  const options = root.children[0];
  assert.equal(options.children.length, 6);
  const inputs = scaleInputs(fieldset);
  assert.equal(inputs[0].checked, true);
  assert.equal(inputs[0].value, "0");
  assert.equal(inputs[0].attributes["aria-label"], "0, Никогда");
  assert.equal(inputs[5].attributes["aria-label"], "5, Всегда");
  assert.equal(inputs[3].attributes["aria-label"], "3");
  assert.equal(inputs[0].required, true);
  inputs[3].listeners.change();
  assert.equal(chosen, "3");
  assert.equal(options.children[3].children[1].children[0].textContent, "3");
  assert.equal(root.children[1].className, "scale-endpoints");
  assert.equal(root.children[1].children[0].textContent, "Никогда");
  assert.equal(root.children[1].children[1].textContent, "Всегда");
});

test("selected style, layout, required and text captions are configurable", () => {
  const item = {options: ["Совсем нет", "Скорее нет", "Нейтрально", "Скорее да", "Совсем да"].map((text, index) => ({value: String(index + 1), text}))};
  const fieldset = container();
  const config = {
    type: "text",
    captions: item.options.map(option => option.text),
    minLabel: "Совсем нет",
    maxLabel: "Совсем да",
    layout: "grid-3",
    required: false,
    selectedStyle: "outline"
  };
  scale.mount({container: fieldset, item, selected: "5", disabled: false, onChange: () => {}, scale: config});
  const root = fieldset.children[0];
  assert.match(root.className, /scale-text/);
  assert.match(root.className, /scale-layout-grid-3/);
  assert.match(root.className, /scale-selected-outline/);
  const inputs = scaleInputs(fieldset);
  assert.equal(inputs[4].checked, true);
  assert.equal(inputs[0].required, undefined);
  assert.equal(root.children[0].children[4].children[1].children[0].textContent, "Совсем да");
});

test("a mismatched method profile fails closed instead of showing foreign options", () => {
  assert.throws(() => scale.resolveScale(maiaItem, {values: ["1", "2"]}), /SCALE_VALUES_MISMATCH/);
  assert.throws(() => scale.resolveScale(maiaItem, {labels: ["0"]}), /SCALE_LABELS_MISMATCH/);
  assert.throws(() => scale.resolveScale(maiaItem, {captions: ["a", "b"]}), /SCALE_CAPTIONS_MISMATCH/);
});

test("the participant screen shows the instruction once, has no choice legend and uses the profile", () => {
  const js = fs.readFileSync(path.join(__dirname, "../web/workspace/participant.js"), "utf8");
  assert.match(js, /profileFor\(form\)/);
  assert.match(js, /const showInstruction=q\.index===0/);
  assert.match(js, /disabled:locked,scale,onChange/);
  assert.match(js, /required&&!hasAnswer/);
  assert.doesNotMatch(js, /<legend>Выберите один вариант<\/legend>/);
  assert.match(js, /<section class="card question-card">/);
});

test("mobile-first CSS keeps six cells then falls back to 3x2 with 44px-class targets", () => {
  const css = fs.readFileSync(path.join(__dirname, "../web/workspace/styles.css"), "utf8");
  assert.match(css, /\.scale-options\{display:grid;grid-template-columns:repeat\(6,minmax\(0,1fr\)\)/);
  assert.match(css, /@media \(max-width:374\.98px\)/);
  assert.match(css, /\.scale-numeric \.scale-options\{grid-template-columns:repeat\(3,minmax\(0,1fr\)\)\}/);
  assert.match(css, /min-height:48px/);
  assert.match(css, /input:focus-visible\+\.scale-cell/);
});

test("the owner correction replaces the MAIA-R instruction without changing the pinned form", () => {
  const {OWNER_CORRECTIONS} = require("../scripts/import-approved-v1-local.js");
  assert.equal(OWNER_CORRECTIONS.maia_r_32.reason, "owner_instruction_2026_11_23");
  assert.equal(
    OWNER_CORRECTIONS.maia_r_32.instruction,
    "В приведенном ниже списке утверждений укажите, насколько часто каждое из них соответствует вашему состоянию. Для ответа используйте шкалу от 0 до 5, где 0 – Никогда, 5 – Всегда , а значения 1, 2, 3 и 4 отражают промежуточные ответы между \"никогда\" и \"всегда\""
  );
});

test("the workspace participant bundle includes the scale component", () => {
  const {workspaceAssets} = require("../dist/src/bootstrap/workspace-assets.js");
  assert.match(workspaceAssets().participantJs, /PedPsyScale/);
  assert.match(workspaceAssets().participantJs, /maia_r_32_shared@1\.0\.0/);
});

test("single-choice 0..10 renders one horizontal numeric row",()=>{
  const item={id:"q01",text:"Утверждение",options:Array.from({length:11},(_,i)=>({value:String(i+1),text:String(i)}))};
  const fieldset=container();
  presenters.singleChoice.mount({container:fieldset,item,selected:null,disabled:false,onChange:()=>{}});
  const wrap=fieldset.children[0],options=wrap.children[0];
  assert.match(wrap.className,/scale-row/);
  assert.match(wrap.className,/scale-count-11/);
  assert.equal(options.children.length,11);
  assert.equal(options.children[0].children[1].textContent,"0");
  assert.equal(options.children[10].children[1].textContent,"10");
});
