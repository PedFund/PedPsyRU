"use strict";
const {test}=require("node:test"),assert=require("node:assert/strict"),net=require("node:net");
const {SmtpTransport,SmtpError}=require("../dist/src/adapters/smtp/transport.js");
async function fakeServer({failAuth=false}={}){
  const messages=[];
  const server=net.createServer(socket=>{
    socket.setEncoding("utf8");socket.on("error",()=>{});let buffer="",authStep=0,inData=false,data="";
    socket.write("220 fake ESMTP\r\n");
    socket.on("data",chunk=>{
      buffer+=chunk;let index;
      while((index=buffer.indexOf("\r\n"))>=0){
        const line=buffer.slice(0,index);buffer=buffer.slice(index+2);
        if(inData){if(line==="."){inData=false;messages.push(data);data="";socket.write("250 2.0.0 queued\r\n");}else data+=line+"\r\n";continue;}
        if(line.startsWith("EHLO ")){socket.write("250-fake\r\n250-AUTH LOGIN\r\n250 OK\r\n");continue;}
        if(line==="AUTH LOGIN"){authStep=1;socket.write("334 VXNlcm5hbWU6\r\n");continue;}
        if(authStep===1){authStep=2;socket.write("334 UGFzc3dvcmQ6\r\n");continue;}
        if(authStep===2){authStep=3;if(failAuth)socket.write("535 5.7.8 Authentication failed\r\n");else socket.write("235 2.7.0 Authentication successful\r\n");continue;}
        if(line.startsWith("MAIL FROM:")){socket.write("250 2.1.0 OK\r\n");continue;}
        if(line.startsWith("RCPT TO:")){socket.write("250 2.1.5 OK\r\n");continue;}
        if(line==="DATA"){inData=true;data="";socket.write("354 End data\r\n");continue;}
        if(line==="QUIT"){socket.write("221 Bye\r\n");socket.end();continue;}
      }
    });
  });
  await new Promise(resolve=>server.listen(0,"127.0.0.1",resolve));
  return {port:server.address().port,messages,close:()=>new Promise(resolve=>server.close(resolve))};
}
const options=port=>({host:"127.0.0.1",port,tls:"none",user:"smtp-user",password:"smtp-password",from:"noreply@example.org",fromName:"МетодТест",timeoutMs:2000});
test("SMTP LOGIN sends a base64 UTF-8 message without exposing credentials",async()=>{
  const server=await fakeServer();
  try{
    const transport=new SmtpTransport(options(server.port));
    await transport.send({to:"participant@example.org",subject:"Подтверждение участия",text:"Код: abc\nВторая строка"});
    assert.equal(server.messages.length,1);const raw=server.messages[0];
    assert.match(raw,/^From: =\?UTF-8\?B\?/m);assert.match(raw,/^Subject: =\?UTF-8\?B\?/m);
    assert.match(raw,/^To: <participant@example\.org>$/m);assert.match(raw,/Content-Transfer-Encoding: base64/);
    const body=raw.split("\r\n\r\n").slice(1).join("\r\n\r\n").replace(/\r\n/g,"");
    assert.equal(Buffer.from(body,"base64").toString("utf8"),"Код: abc\nВторая строка");
    assert.ok(!raw.includes("smtp-password"));
  }finally{await server.close();}
});
test("SMTP authentication failure is a typed error without the password",async()=>{
  const server=await fakeServer({failAuth:true});
  try{
    const transport=new SmtpTransport(options(server.port));let failure;
    try{await transport.send({to:"participant@example.org",subject:"Test",text:"test"});}catch(error){failure=error;}
    assert.ok(failure instanceof SmtpError);assert.equal(failure.stage,"AUTH");assert.equal(failure.smtpCode,535);
    assert.ok(!failure.message.includes("smtp-password"));assert.ok(!JSON.stringify(failure).includes("smtp-password"));
  }finally{await server.close();}
});
test("SMTP rejects malformed or header-injecting addresses and subjects before connecting",async()=>{
  const transport=new SmtpTransport(options(9));
  for(const message of [
    {to:"not-an-address",subject:"Test",text:"test"},
    {to:"participant@example.org",subject:"Test\r\nBcc: attacker@example.org",text:"test"}
  ]){
    await assert.rejects(transport.send(message),error=>error instanceof SmtpError&&error.stage==="VALIDATION");
  }
  assert.throws(()=>new SmtpTransport({...options(9),replyTo:"bad"}),error=>error instanceof SmtpError&&error.stage==="VALIDATION");
  assert.throws(()=>new SmtpTransport({...options(9),fromName:"bad\nname"}),error=>error instanceof SmtpError&&error.stage==="VALIDATION");
});
test("SMTP connection errors are typed and contain no credentials",async()=>{
  const server=await fakeServer();const port=server.port;await server.close();
  const transport=new SmtpTransport(options(port));let failure;
  try{await transport.send({to:"participant@example.org",subject:"Test",text:"test"});}catch(error){failure=error;}
  assert.ok(failure instanceof SmtpError);assert.equal(failure.stage,"CONNECT");
  assert.ok(!failure.message.includes("smtp-password"));
});
