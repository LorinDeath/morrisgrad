// Арт VN → webp. Основные emo_*.png Историка (18:11, без белых щелей); для 3 эмоций с дефектом кадра — *_fixed_v3.png (правка Художника /workspace/vn_fix/refix_v3.py поверх новых файлов)
import sharp from 'sharp'; import fs from 'fs';
const ids=['warrior','spearman','rogue','mage','petr','kyut','alzi','leyr'];
const emos=['calm','joy','shock','anger','sad','fear','shy','smirk','think','determined'];
const fixed={warrior:'fear',spearman:'anger',rogue:'determined'};
for(const id of ids){const src=`/workspace/vn_art/${id}`,dst=`public/mc-vn/${id}`;fs.mkdirSync(dst,{recursive:true});
 for(const e of emos){let f=`${src}/emo_${e}.png`; if(fixed[id]===e) f=`${src}/emo_${e}_fixed_v3.png`;
  await sharp(f).resize(576,768).webp({quality:82,alphaQuality:90}).toFile(`${dst}/${e}.webp`);
  await sharp(f).resize(96,128).webp({quality:75}).toFile(`${dst}/${e}_t.webp`);}
 await sharp(`${src}/icon.png`).resize(128,128).webp({quality:85}).toFile(`${dst}/icon.webp`);
 if(fs.existsSync(`${src}/full.png`)) await sharp(`${src}/full.png`).resize(683,1024).webp({quality:82}).toFile(`${dst}/full.webp`);}
