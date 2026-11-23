const assert = require("node:assert/strict");
const fs = require("node:fs/promises"), os = require("node:os"), path = require("node:path");
const { _electron } = require(process.env.PLAYWRIGHT_MODULE || "playwright");
(async()=>{
 const exe = path.resolve(process.argv[2] || "dist/AgentWhisker-win32-x64/AgentWhisker.exe");
 const temp = await fs.mkdtemp(path.join(os.tmpdir(),"agentwhisker-smoke-"));
 const profile = path.join(temp,"profile"), library=path.join(temp,"library");
 const env={...process.env,AGENTWHISKER_LIBRARY:library};delete env.ELECTRON_RUN_AS_NODE;delete env.AGENT_CONSOLE_PET_PYTHON;
 const packDir=process.argv[3];
 async function launch(){
   const app=await _electron.launch({executablePath:exe,env,args:["--user-data-dir="+profile]});
   try {
     const page=await app.firstWindow();page.setDefaultTimeout(10000);
     await page.waitForFunction(()=>typeof shape !== "undefined" && shape && selectedPetId && document.querySelector("#liveStatus").textContent);
     return {app,page};
   } catch(e){await app.close();throw e}
 }
 let {app,page}=await launch();
 try {
   assert.deepEqual(await page.evaluate(()=>pets.map(p=>p.id)),["kitsu"]);
   assert.equal(await page.evaluate(()=>provider),"desktop");
   assert.equal(await page.locator("#limitsButton").isVisible(),false);
   await page.evaluate(()=>setSettingsOpen(true)); await page.click("#motionOptions summary");
   for(const state of ["running","waiting","failed","idle"]){
     await page.click('[data-preview="'+state+'"]');
     await page.waitForFunction(s=>currentState===s,state);
     await page.waitForFunction(()=>!previewState && currentState==="idle",null,{timeout:20000});
   }
   console.log("Standalone: clean profile, Kitsu only, four complete animation previews");
   if(packDir){
     for(const id of ["nyx","rune","mori","nova"]){
       // Replace only the native file picker. Exercise the real import button, IPC and disk writes.
       await app.evaluate(({dialog},f)=>{dialog.showOpenDialog=async()=>({canceled:false,filePaths:[f]})},path.resolve(packDir,id+".whiskerpack"));
       await page.click("#importPet");await page.waitForFunction(id=>selectedPetId===id,id);
       await page.waitForFunction(()=>!document.querySelector("#importPet").disabled);
     }
     assert.equal(await page.locator(".skin-card").count(),5);
     await app.close();({app,page}=await launch());assert.equal(await page.evaluate(()=>selectedPetId),"nova");
     assert.equal(await page.locator(".skin-card").count(),5);
     console.log("Four external packs installed and switched live; library and selected character survived restart");
   }
 }finally{await app.close()}
})().catch(e=>{console.error(e);process.exitCode=1});
