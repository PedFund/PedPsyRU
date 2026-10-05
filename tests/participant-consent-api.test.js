"use strict";
const {test}=require("node:test"),assert=require("node:assert/strict");
const {createParticipantConsentApi,consentAcceptance}=require("../dist/src/application/participant-consent-api.js");
const {ParticipationError}=require("../dist/src/ports/errors.js");
const valid={expected_policy_revision:0,purpose:"study_participation",document_version:"demo-participation-1",accept:true};
const invalid=fn=>assert.throws(fn,e=>e.status===400&&e.code==="INVALID_CONSENT_INPUT");
test("consent DTO: exact own explicit purpose/version/policy, copied without inferring other consent",()=>{
  assert.deepEqual(consentAcceptance(valid),valid);assert.notEqual(consentAcceptance(valid),valid);
  const secondary={...valid,purpose:"secondary_research",document_version:"demo-secondary-1"};assert.deepEqual(consentAcceptance(secondary),secondary);assert.deepEqual(valid,{expected_policy_revision:0,purpose:"study_participation",document_version:"demo-participation-1",accept:true});
});
test("consent DTO: false/missing approval, contact notice and caller identity are never acceptances",()=>{
  for(const input of [null,[],{},true,{...valid,accept:false},{...valid,accept:"true"},{...valid,accept:null},{...valid,purpose:"contact_processing"},{...valid,purpose:"unknown"},{...valid,purpose:{}},{...valid,purpose:["study_participation"]},{...valid,study_id:"foreign"},{...valid,participant_id:"foreign"},{...valid,role:"superadministrator"},{...valid,accepted_at_ms:0}])invalid(()=>consentAcceptance(input));
});
test("consent DTO: exact bounded integer policy revision, never coercion/unsafe clock",()=>{
  for(const v of [-1,0.5,2147483647,Number.MAX_SAFE_INTEGER,NaN,Infinity,"0",null,undefined])invalid(()=>consentAcceptance({...valid,expected_policy_revision:v}));
  assert.equal(consentAcceptance({...valid,expected_policy_revision:2147483646}).expected_policy_revision,2147483646);
});
test("consent DTO: server document version syntax, no text/key/formula injection or blank alias",()=>{
  for(const v of [""," Demo ","demo\n1","v"+"x".repeat(64),"версия","<script>","VERSION",{},null,undefined])invalid(()=>consentAcceptance({...valid,document_version:v}));
  assert.equal(consentAcceptance({...valid,document_version:"v"+"x".repeat(63)}).document_version.length,64);
});
test("consent API: read own token only, acceptance has no scope and delegates one exact purpose",async()=>{
  const calls=[],snapshot={study_id:"synthetic",policy_revision:0,documents:[],required_consents_accepted:false};
  const api=createParticipantConsentApi({read:async token=>{calls.push(["read",token]);return snapshot;},accept:async(token,input)=>{calls.push(["accept",token,input]);return snapshot;}},{assert:(t,c)=>assert.equal(c,t+"-csrf")});
  assert.equal(await api.read("own"),snapshot);assert.equal(await api.accept("own",valid,"own-csrf"),snapshot);assert.deepEqual(calls,[["read","own"],["accept","own",valid]]);
});
test("consent API: CSRF before malformed input or persistence, no automatic acceptance or withdrawal",()=>{
  const calls=[],api=createParticipantConsentApi({read:async()=>{calls.push("read");},accept:async()=>{calls.push("accept");}},{assert:()=>{throw new ParticipationError(403,"CSRF_REJECTED");}});
  assert.throws(()=>api.accept("own",{accept:false},"wrong"),e=>e.status===403);assert.deepEqual(calls,[]);assert.equal(Object.hasOwn(api,"withdraw"),false);assert.equal(Object.hasOwn(api,"return"),false);
});
test("consent API: application never grants participation or secondary acceptance from contact/password",async()=>{
  const calls=[],snapshot={study_id:"synthetic",policy_revision:0,documents:[],required_consents_accepted:false};
  const api=createParticipantConsentApi({read:async()=>snapshot,accept:async(t,v)=>{calls.push(v);return snapshot;}},{assert:()=>{}});
  await api.read("own");assert.deepEqual(calls,[]);await api.accept("own",{...valid,purpose:"secondary_research",document_version:"demo-secondary-1"},"proof");assert.equal(calls.length,1);assert.equal(calls[0].purpose,"secondary_research");assert.equal(snapshot.required_consents_accepted,false);
});
