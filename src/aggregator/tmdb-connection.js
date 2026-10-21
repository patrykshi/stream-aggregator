// Fluxo oficial de autorização TMDB v3. Tokens ficam apenas no servidor e TMDB.
import {getIntegrationKey} from '../config/hub-integrations.js';
import {updateSourceAccounts} from '../config/hub-source-accounts.js';
function endpoint(resource,apiKey){
 const u=new URL('https://api.themoviedb.org/3/'+resource);
 const headers={Accept:'application/json'};
 if(apiKey.startsWith('eyJ'))headers.Authorization='Bearer '+apiKey;
 else u.searchParams.set('api_key',apiKey);
 return {url:u,headers};
}
async function read(resource,{fetchImpl=globalThis.fetch,body,params={}}={}){
 const key=getIntegrationKey('tmdb');
 if(!key)throw Error('Configure a API TMDB em Configurações.');
 const {url,headers}=endpoint(resource,key);
 for(const [k,v] of Object.entries(params))url.searchParams.set(k,v);
 const response=await fetchImpl(url.toString(),{
  method:body?'POST':'GET',redirect:'error',signal:AbortSignal.timeout(15000),
  headers:body?{...headers,'Content-Type':'application/json'}:headers,
  ...(body?{body:JSON.stringify(body)}:{})
 });
 if(!response.ok)throw Error('TMDB não autorizou a operação (HTTP '+response.status+').');
 const json=await response.json();
 if(!json?.success&&resource!=='account')throw Error('TMDB não confirmou a operação.');
 return json;
}
export async function beginTMDBAuthorization(opts={}){
 const result=await read('authentication/token/new',opts);
 if(typeof result.request_token!=='string'||!/^[a-zA-Z0-9]{8,100}$/.test(result.request_token))
  throw Error('TMDB não retornou um token de solicitação válido.');
 return {requestToken:result.request_token,
  approvalUrl:'https://www.themoviedb.org/authenticate/'+result.request_token};
}
export async function finishTMDBAuthorization(token,{fetchImpl=globalThis.fetch}={}){
 if(typeof token!=='string'||!/^[a-zA-Z0-9]{8,100}$/.test(token))
  throw Error('Token de aprovação TMDB inválido.');
 const result=await read('authentication/session/new',{
  fetchImpl,body:{request_token:token}
 });
 const session=result.session_id;
 if(typeof session!=='string'||session.length<8||session.length>512)
  throw Error('TMDB não retornou uma sessão válida.');
 const account=await read('account',{fetchImpl,params:{session_id:session}});
 if(!Number.isSafeInteger(account.id)||account.id<=0)
  throw Error('TMDB não identificou a conta após a aprovação.');
 const statuses=updateSourceAccounts({tmdbAccountId:String(account.id),tmdbSessionId:session});
 return {success:true,accounts:statuses,username:String(account.username||'').slice(0,80)};
}
