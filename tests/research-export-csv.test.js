"use strict";
const {test}=require("node:test");
const assert=require("node:assert/strict");
const {csvCell,csvRecord}=require("../dist/src/application/research-export-csv.js");

test("research CSV quotes separators, quotes and multiline raw responses without losing data",()=>{
  assert.equal(csvRecord(["item-1",'value, "quoted"\nsecond line',null,7,true]),
    '"item-1","value, ""quoted""\nsecond line","","7","true"\r\n');
  assert.equal(csvCell("Привет, мир"),'"Привет, мир"');
});
test("research CSV neutralizes formula prefixes including whitespace and control characters",()=>{
  for(const prefix of ["=","+","-","@","  =","\t+","\r\n@","\u0000-","\u007f="]){
    assert.equal(csvCell(prefix+"1"),'"\''+prefix+"1"+'"');
  }
  assert.equal(csvCell("ordinary - value"),'"ordinary - value"');
  assert.equal(csvCell(-12),'"-12"',"numeric negative values remain numeric data");
});
test("research CSV refuses non-finite and oversized values instead of truncating responses",()=>{
  assert.throws(()=>csvCell(NaN),TypeError);
  assert.throws(()=>csvCell(Infinity),TypeError);
  assert.throws(()=>csvCell("x".repeat(32768)),RangeError);
  assert.throws(()=>csvRecord(Array(257).fill("x")),RangeError);
});
