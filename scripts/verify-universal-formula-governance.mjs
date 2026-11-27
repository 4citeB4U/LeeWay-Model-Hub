import fs from 'node:fs';
import crypto from 'node:crypto';
import {execFileSync} from 'node:child_process';

const expectedMemory = 'f4910b2bdfedad7be0a3e4bcdac7b3fb468f419368e4a4fa3a11fa25049f0e9a';

const begin =
  '<!-- LEEWAY UNIVERSAL FORMULA GOVERNANCE BEGIN -->';

const end =
  '<!-- LEEWAY UNIVERSAL FORMULA GOVERNANCE END -->';

const rootRequired = [
  'README.md',
  'AGENTS.md',
  'AGENT.md',
  'ACTIONS.md',
  'CONTRACTS.md',
  'CONTRIBUTING.md',
  'MEMORY.md'
];

const names = new Set(
  [
    ...rootRequired,
    'CONTRACT.md',
    'SKILL.md'
  ].map(x => x.toLowerCase())
);

const tracked = execFileSync(
  'git',
  ['ls-files','-z'],
  {encoding:'utf8'}
).split('\0').filter(Boolean);

const required = new Set(rootRequired);

for(const file of tracked){

  const name = file.split('/').at(-1).toLowerCase();

  if(
    names.has(name) ||
    /(^|\/)contracts?\/.*\.md$/i.test(file) ||
    /engineering-laws.*\.md$/i.test(file) ||
    /permanent-engineering-rules.*\.md$/i.test(file)
  ){
    required.add(file);
  }
}

const sha256 = bytes => crypto
  .createHash('sha256')
  .update(bytes)
  .digest('hex');

let failures = 0;

for(const file of required){

  if(!fs.existsSync(file)){
    console.error('MISSING:',file);
    failures++;
    continue;
  }

  const bytes = fs.readFileSync(file);
  const text = bytes.toString('utf8');

  if(
    text.split(begin).length!==2 ||
    text.split(end).length!==2 ||
    text.indexOf(begin)>=text.indexOf(end) ||
    !text.includes('LEEWAY-FORMULA-v1.0')
  ){
    console.error('INVALID_GOVERNANCE:',file);
    failures++;
  }

  if(
    file.split('/').at(-1).toLowerCase()==='memory.md'
  ){

    if(sha256(bytes)!==expectedMemory){
      console.error('CANONICAL_MEMORY_MISMATCH:',file);
      failures++;
    }
  }
}

console.log(JSON.stringify({
  documentsChecked:required.size,
  failures,
  expectedMemory,
  documentationGate:failures===0?'PASS':'FAIL',
  executableConsumption:'SEPARATE_GATE_REQUIRED'
},null,2));

if(failures>0) process.exitCode=1;