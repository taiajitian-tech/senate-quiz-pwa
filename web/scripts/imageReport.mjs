
import fs from "fs"

const dataPath="./web/public/data/representatives.json"

const data=JSON.parse(fs.readFileSync(dataPath,"utf8"))

const missing=data.filter(d=>!d.image)

fs.writeFileSync(
 "./web/public/data/missing-images.json",
 JSON.stringify(missing,null,2)
)

console.log("missing:",missing.length)
