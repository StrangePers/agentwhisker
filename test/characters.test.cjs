const test = require("node:test"), assert = require("node:assert/strict");
const fs = require("node:fs/promises"), path = require("node:path"), os = require("node:os"), crypto = require("node:crypto");
const {listCharacters,importCharacter} = require("../src/main/character-library.cjs");
test("free characters and atomic data-only pack installation", async()=>{
  const root = await fs.mkdtemp(path.join(os.tmpdir(),"agentwhisker-library-"));
  try {
    assert.deepEqual((await listCharacters(root)).map(p=>p.id),["kitsu"]);
    const image = await fs.readFile(path.join(__dirname,"../characters/pets/kitsu/spritesheet.webp"));
    const data={format:"agentwhisker-character/1",id:"demo",displayName:"Demo",license:"Test only",description:"",image:image.toString("base64"),sha256:crypto.createHash("sha256").update(image).digest("hex")};
    const file=path.join(root,"demo.whiskerpack"), write=patch=>fs.writeFile(file,JSON.stringify({...data,...patch}));
    await write({});await Promise.all([importCharacter(file,root),importCharacter(file,root)]);
    assert.deepEqual((await listCharacters(root)).map(p=>p.id),["kitsu","demo"]);
    for(const patch of [{id:"../outside"},{id:"kitsu"},{sha256:"wrong"},{displayName:"Changed"}]){
      await write(patch);await assert.rejects(importCharacter(file,root));
    }
    assert.equal((await listCharacters(root))[1].displayName,"Demo");
  }finally{await fs.rm(root,{recursive:true,force:true})}
});
