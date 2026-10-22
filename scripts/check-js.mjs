/* Validate all project JavaScript/ESM syntax without loading private config. */
import {readdirSync} from 'node:fs';
import {join,extname} from 'node:path';
import {spawnSync} from 'node:child_process';
const files=[];
function walk(dir){for(const entry of readdirSync(dir,{withFileTypes:true})){
 const pathname=join(dir,entry.name);
 if(entry.isDirectory())walk(pathname);
 else if(['.js','.mjs'].includes(extname(entry.name)))files.push(pathname);
}}
for(const folder of ['src','public','scripts','test'])walk(folder);
for(const file of files){const run=spawnSync(process.execPath,['--check',file],{encoding:'utf8'});
 if(run.status!==0){process.stderr.write(`Syntax error in ${file}\n${run.stderr}`);process.exit(1);}
}
console.log(`Validacao de sintaxe: ${files.length} arquivos JavaScript/ESM verificados.`);
