"use strict";
const {test}=require("node:test"),assert=require("node:assert/strict");
const {passportScalars,passportValues}=require("../dist/src/ports/passport-values.js");
const {createParticipantPassportApi}=require("../dist/src/application/participant-passport-api.js");
const fields=[{key:"sex",label:"Пол",kind:"single_choice",required:true,options:[{value:"female",label:"Женский"},{value:"male",label:"Мужской"}]},{key:"age",label:"Возраст",kind:"integer",required:true,min:0,max:130},{key:"city",label:"Город",kind:"text",required:false,max_length:100},{key:"extra_years",label:"Стаж",kind:"integer",required:false,min:-10,max:10}];
const invalid=fn=>assert.throws(fn,e=>e.status===400&&e.code==="INVALID_PASSPORT_VALUES");
test("own passport: partial draft, no zero/null imputation and independent normalized values",()=>{
  const values={city:"  Synthetic town  ",age:0},out=passportValues(fields,values);assert.deepEqual(out,{city:"Synthetic town",age:0});assert.equal(values.city,"  Synthetic town  ");assert.deepEqual(passportValues(fields,{}),{});out.city="Changed";assert.notEqual(out.city,values.city);
});
test("own passport: complete requires mandatory sex/age and configured city/custom, not optional values",()=>{
  for(const value of [{},{age:42},{sex:"female"}])assert.throws(()=>passportValues(fields,value,true),e=>e.code==="PASSPORT_INCOMPLETE"&&e.status===409);
  assert.deepEqual(passportValues(fields,{sex:"female",age:42},true),{sex:"female",age:42});
  const required=fields.map(f=>({...f,required:true}));assert.throws(()=>passportValues(required,{sex:"male",age:42,city:"Town"},true),e=>e.code==="PASSPORT_INCOMPLETE");
  assert.deepEqual(passportValues(required,{sex:"male",age:42,city:"Town",extra_years:0},true),{sex:"male",age:42,city:"Town",extra_years:0});
});
test("own passport: exact scalar/key whitelist, no scope/authority/nested values",()=>{
  for(const value of [null,[],"x",{age:null},{age:true},{age:[]},{age:{}},{email:"owner@example.test"},{study_id:"study"},{role:"participant"},{extra_a:"x",extra_b:"x",extra_c:"x",extra_d:"x",extra_e:"x",extra_f:"x",sex:"male",age:42,city:"Town"},JSON.parse('{"__proto__":"x"}')])invalid(()=>passportScalars(value));
  invalid(()=>passportValues(fields,{extra_unknown:"x"}));
});
test("own passport: no string-number/coercion/fraction/nonfinite/range substitution",()=>{
  for(const value of [{age:"42"},{age:42.5},{age:NaN},{age:Infinity},{age:-1},{age:131},{extra_years:11},{extra_years:-11},{age:1000001}])invalid(()=>passportValues(fields,value));
  assert.equal(passportValues(fields,{extra_years:-10}).extra_years,-10);
});
test("own passport: exact stable option value, not label or arbitrary text",()=>{
  for(const value of ["Женский","Female","other",1])invalid(()=>passportValues(fields,{sex:value}));assert.equal(passportValues(fields,{sex:"male"}).sex,"male");
});
test("own passport: Unicode code-point limits, no control/lone-surrogate/blank values",()=>{
  assert.equal(passportValues(fields,{city:"🙂".repeat(100)}).city.length,200);
  for(const text of ["🙂".repeat(101),"a\n","a\u0000","\uD800","\uDC00","\u00a0\u2003\ufeff",""])invalid(()=>passportValues(fields,{city:text}));
  assert.equal(passportValues(fields,{city:"\u00a0Town\u2003"}).city,"Town");invalid(()=>passportScalars({city:"x".repeat(501)}));
});
test("own passport API: CSRF before validation/write/completion",()=>{
  const api=createParticipantPassportApi({save:()=>assert.fail(),complete:()=>assert.fail(),read:()=>assert.fail()},{assert:()=>{throw Error("CSRF_DENIED");}});
  assert.throws(()=>api.save("own",null,"wrong"),/CSRF_DENIED/);assert.throws(()=>api.complete("own",null,"wrong"),/CSRF_DENIED/);
});
test("own passport API: strict CAS and no caller participant/study/group/role or inline complete values",()=>{
  let calls=0;const api=createParticipantPassportApi({save:async()=>{calls++;},complete:async()=>{calls++;},read:async()=>{calls++;}},{assert:()=>{}}),body={schema_version:1,expected_revision:0,values:{}};
  for(const value of [null,{...body,participant_id:"foreign"},{...body,study_id:"foreign"},{...body,group_id:"foreign"},{...body,role:"staff"},{...body,schema_version:0},{...body,schema_version:101},{...body,schema_version:"1"},{...body,expected_revision:-1},{...body,expected_revision:0.5},{...body,expected_revision:2147483647}])invalid(()=>api.save("own",value,"csrf"));
  invalid(()=>api.complete("own",body,"csrf"));assert.equal(calls,0);
});
test("own passport API: own session only, exact normalized DTO and saved-only completion",async()=>{
  const seen=[],state={study_id:"own",schema_version:1,status:"draft",revision:1,fields,values:{age:42}};
  const api=createParticipantPassportApi({read:async token=>{seen.push(["read",token]);return state;},save:async(token,input)=>{seen.push(["save",token,input]);return state;},complete:async(token,input)=>{seen.push(["complete",token,input]);return {...state,status:"completed",revision:2};}},{assert:(t,c)=>assert.equal(c,"csrf")});
  assert.equal(await api.read("own"),state);await api.save("own",{schema_version:1,expected_revision:0,values:{city:" Town ",age:42}},"csrf");await api.complete("own",{schema_version:1,expected_revision:1},"csrf");
  assert.deepEqual(seen,[["read","own"],["save","own",{schema_version:1,expected_revision:0,values:{city:"Town",age:42}}],["complete","own",{schema_version:1,expected_revision:1}]]);
});
