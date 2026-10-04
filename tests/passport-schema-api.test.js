"use strict";
const {test}=require("node:test"),assert=require("node:assert/strict"),{randomUUID}=require("node:crypto");
const {createPassportSchemaApi,passportAdditionalFields}=require("../dist/src/application/passport-schema-api.js");
const text={key:"extra_context",label:"Контекст",required:false,kind:"text",max_length:200};
const number={key:"extra_years",label:"Стаж",required:false,kind:"integer",min:0,max:100};
const choice={key:"extra_setting",label:"Среда",required:false,kind:"single_choice",options:[{value:"school",label:"Школа"},{value:"other",label:"Иное"}]};
const invalid=f=>assert.throws(f,e=>e.status===400&&e.code==="INVALID_PASSPORT_SCHEMA");
test("passport schema: exact field union, researcher-required flag and independent projection",()=>{
  const input=[text,number,choice],output=passportAdditionalFields(input);assert.deepEqual(output,input);
  output[2].options[0].label="Changed";assert.equal(input[2].options[0].label,"Школа");assert.deepEqual(passportAdditionalFields([]),[]);
  assert.equal(passportAdditionalFields([{...text,required:true}])[0].required,true);
});
test("passport schema: names/required/scoring/code/contact authority rejected",()=>{
  for(const value of [{...text,key:"age"},{...text,key:"sex"},{...text,key:"email"},{...text,key:"__proto__"},{...text,key:"extra_A"},{...text,required:"false"},{...text,score:1},{...text,handler:"code"},{...text,kind:"method"},{...text,key:"extra_"}])invalid(()=>passportAdditionalFields([value]));
  for(const value of [null,{},[null],[[]],[text,text],Array.from({length:6},(_,i)=>({...text,key:"extra_a"+i}))])invalid(()=>passportAdditionalFields(value));
  assert.equal(passportAdditionalFields(Array.from({length:5},(_,i)=>({...text,key:"extra_a"+i}))).length,5);
});
test("passport schema: text and labels bounded/normalized without treating display text as code",()=>{
  for(const value of [{...text,max_length:0},{...text,max_length:501},{...text,max_length:"100"},{...text,label:" "},{...text,label:"a\n"},{...text,label:"x".repeat(121)}])invalid(()=>passportAdditionalFields([value]));
  assert.equal(passportAdditionalFields([{...text,label:"  Plain <b>text</b>  "}])[0].label,"Plain <b>text</b>");
  assert.equal(passportAdditionalFields([{...text,label:"🙂".repeat(120)}])[0].label.length,240);
});
test("passport schema: integer boundaries/no floating/string coercion",()=>{
  for(const value of [{...number,min:-1000001},{...number,max:1000001},{...number,min:2,max:1},{...number,min:0.5},{...number,max:NaN},{...number,max:"10"}])invalid(()=>passportAdditionalFields([value]));
  assert.equal(passportAdditionalFields([{...number,min:-1000000,max:1000000}])[0].min,-1000000);
});
test("passport schema: stable choice identifiers/labels/limits/strict union",()=>{
  for(const options of [[],[{value:"x",label:" "}],[{value:"X",label:"X"}],[{value:"x",label:"X",score:1}],[{value:"x",label:"X"},{value:"x",label:"Y"}],Array.from({length:21},(_,i)=>({value:"x"+i,label:"X"}))])invalid(()=>passportAdditionalFields([{...choice,options}]));
  invalid(()=>passportAdditionalFields([{...choice,max_length:20}]));invalid(()=>passportAdditionalFields([{...number,options:[]}]))
});
test("passport schema API: strict CAS/schema/scope DTO before port",async()=>{
  let calls=0;const api=createPassportSchemaApi({read:async()=>{calls++;},configure:async()=>{calls++;}},{assert:()=>{}}),id=randomUUID(),body={expected_version:0,expected_schema_version:1,basic_required:{city:false},additional_fields:[text]};
  for(const input of [{...body,participant_id:id},{...body,fields:[]},{...body,expected_schema_version:0},{...body,expected_schema_version:101},{...body,expected_schema_version:"1"},{...body,basic_required:{city:false,sex:false}},{...body,basic_required:{city:false,age:false}},{...body,basic_required:{city:"false"}},null])invalid(()=>api.configure("own",id,input,"csrf"));
  assert.throws(()=>api.read("own","foreign"),e=>e.status===404);assert.equal(calls,0);
  await api.configure("own",id,body,"csrf");await api.read("own",id);assert.equal(calls,2);
});
test("passport schema API: CSRF precedes all metadata writes",()=>{
  const api=createPassportSchemaApi({configure:()=>assert.fail("write before CSRF"),read:()=>assert.fail("unused")},{assert:()=>{throw Error("CSRF_DENIED");}});
  assert.throws(()=>api.configure("session",randomUUID(),null,"wrong"),/CSRF_DENIED/);
});
test("passport schema API: whitelist forwards exact normalized questions and CAS",async()=>{
  const id=randomUUID();let input;const expected={study_id:id,study_version:3,schema_version:2,frozen:false,fields:[]};
  const api=createPassportSchemaApi({read:async(t,s)=>{assert.equal(s,id);return expected;},configure:async(t,s,b)=>{assert.equal(t,"own");assert.equal(s,id);input=b;return expected;}},{assert:(t,c)=>assert.equal(c,"csrf")});
  assert.deepEqual(await api.configure("own",id,{expected_version:2,expected_schema_version:1,basic_required:{city:true},additional_fields:[{...text,label:" Контекст "}]} ,"csrf"),expected);
  assert.deepEqual(input,{expected_version:2,expected_schema_version:1,basic_required:{city:true},additional_fields:[text]});assert.deepEqual(await api.read("own",id),expected);
});
