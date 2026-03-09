
import fs from "fs";

const file="public/data/ministers.json";

const data=JSON.parse(fs.readFileSync(file,"utf8"));

let missing=0;

for(const m of data){
  if(!m.images || m.images.length===0){
    missing++;
  }
}

console.log("total:",data.length);
console.log("missing images:",missing);
