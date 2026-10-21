import {describe,it,after} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
const temp=fs.mkdtempSync(path.join(os.tmpdir(),'nuvio-tmdb-auth-'));
const prior=process.env.DATA_DIR;
const priorKey=process.env.TMDB_API_KEY;
process.env.DATA_DIR=temp;
process.env.TMDB_API_KEY='integration-test-api-key';
const {updateSourceAccounts,sourceAccountStatus,getSourceAccount}=
 await import('../src/config/hub-source-accounts.js?isolated=qa');
const {beginTMDBAuthorization,finishTMDBAuthorization}=
 await import('../src/aggregator/tmdb-connection.js?isolated=qa');
const mock=value=>({ok:true,status:200,json:async()=>value});
describe('Conexões pessoais protegidas + autorização TMDB',()=>{
 it('permite usuário Trakt, username Premium e protege os tokens',()=>{
  const r=updateSourceAccounts({
   traktUsername:'meu.usuario',tvmazeUsername:'tv_user',
   tvmazeKey:'super-private-premium-key'
  });
  assert.equal(r.trakt.username,'meu.usuario');
  assert.equal(r.tvmaze.configured,true);
  assert.ok(!JSON.stringify(r).includes('super-private-premium-key'));
  assert.equal(fs.statSync(path.join(temp,'hub-source-accounts.json')).mode&0o777,0o600);
 });
 it('recusa valores malformados sem alterar conta já salva',()=>{
  for(const input of [{bad:'x'}, {tvmazeUsername:'../private'}, {tmdbAccountId:'1e6'},
   {tvmazeKey:'abc'}, {tmdbSessionId:'secret with spaces'}])
   assert.throws(()=>updateSourceAccounts(input));
  assert.equal(getSourceAccount('traktUsername'),'meu.usuario');
 });
 it('inicia a autorização na URL oficial sem revelar a API key',async()=>{
  const fake='a'.repeat(40),calls=[];
  const result=await beginTMDBAuthorization({fetchImpl:async(url)=>{
   calls.push(url);return mock({success:true,request_token:fake});
  }});
  assert.equal(result.approvalUrl,'https://www.themoviedb.org/authenticate/'+fake);
  assert.equal(calls.length,1);
  assert.ok(!JSON.stringify(result).includes('tmdbApiKey'));
 });
 it('finaliza apenas após sessão válida e salva conta no local',async()=>{
  const key='b'.repeat(40),session='s'.repeat(40);
  const result=await finishTMDBAuthorization(key,{fetchImpl:async(url,opts)=>{
   if(url.includes('/authentication/session/new')){
    assert.equal(JSON.parse(opts.body).request_token,key);
    return mock({success:true,session_id:session});
   }
   if(url.includes('/account?')){
    assert.ok(url.includes('session_id='+session));
    return mock({id:27182,username:'user_tmdb'});
   }
   throw Error('Endpoint inesperado');
  }});
  assert.equal(result.success,true);
  assert.equal(result.accounts.tmdb.accountId,'27182');
  assert.equal(result.username,'user_tmdb');
  assert.ok(!JSON.stringify(result).includes(session));
  assert.equal(getSourceAccount('tmdbSessionId'),session);
 });
});
after(()=>{
 process.env.DATA_DIR=prior;
 if(priorKey===undefined)delete process.env.TMDB_API_KEY;
 else process.env.TMDB_API_KEY=priorKey;
 fs.rmSync(temp,{recursive:true,force:true});
});
