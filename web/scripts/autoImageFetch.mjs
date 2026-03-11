
import fs from "fs"
import path from "path"
import fetch from "node-fetch"

const dataPath = "./web/public/data/representatives.json"

async function searchWikipedia(name){
  const url = `https://ja.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(name)}`
  try{
    const res = await fetch(url)
    const j = await res.json()
    if(j.thumbnail && j.thumbnail.source){
      return j.thumbnail.source
    }
  }catch(e){}
  return null
}

async function main(){

  const raw = fs.readFileSync(dataPath,"utf8")
  const members = JSON.parse(raw)

  for(const m of members){

    if(!m.image || m.image===""){
      const img = await searchWikipedia(m.name)

      if(img){
        m.image = img
        m.imageSource = "wikipedia"
        m.aiGuess = true
        console.log("image found",m.name)
      }else{
        console.log("missing",m.name)
      }
    }

  }

  fs.writeFileSync(dataPath,JSON.stringify(members,null,2))
}

main()
