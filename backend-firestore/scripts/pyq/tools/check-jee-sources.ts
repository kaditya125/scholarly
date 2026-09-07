import { buildJEEMainCorpus } from '../corpus/jee-main-corpus';
import { buildAuthenticJEEMainCorpus } from '../corpus/authentic-jee-main-corpus';

const legacy = buildJEEMainCorpus();
console.log('jee-main-corpus.ts output count:', legacy.length);

const authentic = buildAuthenticJEEMainCorpus();
console.log('authentic-jee-main-corpus.ts output count:', authentic.length);

console.log('Total combined:', legacy.length + authentic.length);
