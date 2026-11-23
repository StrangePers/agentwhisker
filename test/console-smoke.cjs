const {_electron} = require(process.env.PLAYWRIGHT_MODULE || "playwright");
const fs = require("node:fs/promises"),path=require("node:path"),os=require("node:os"),assert=require("node:assert/strict");
(async()=>{
  const runtime=JSON.parse(await fs.readFile(path.join(os.homedir(),".local/share/agent-console/runtime.json"),"utf8"));
  const tmp=await fs.mkdtemp(path.join(os.tmpdir(),"agentwhisker-console-")),status=path.join(tmp,"status.json");
  const env={...process.env,AGENT_CONSOLE_PET_PYTHON:runtime.python,PYTHONPATH:path.join(runtime.source_root,"src"),AGENTWHISKER_LIBRARY:path.join(tmp,"library")};
  delete env.ELECTRON_RUN_AS_NODE;
  const app=await _electron.launch({executablePath:path.resolve(process.argv[2]||"dist/AgentWhisker-win32-x64/AgentWhisker.exe"),env,args:[
    "--user-data-dir="+tmp,"--provider=json-status","--status-file="+status
  ]});
  try {
    const page=await app.firstWindow();page.setDefaultTimeout(40000);
    let first;
    const deadline=Date.now()+40000;
    while(Date.now()<deadline){
      try {
        const data=JSON.parse(await fs.readFile(status,"utf8"));
        if(Array.isArray(data.items)&&!data.offline){
          if(first && first!==data.updatedAt) break;
          first=data.updatedAt;
        }
      }catch{}
      await new Promise(r=>setTimeout(r,300));
    }
    const live=JSON.parse(await fs.readFile(status,"utf8"));
    assert(first && first!==live.updatedAt && !live.offline && Array.isArray(live.items));
    await page.evaluate(()=>refreshActivity());
    await page.waitForFunction(()=>managed && shape && selectedPetId==="kitsu" && document.querySelector("#liveStatus").dataset.offline==="false");
    assert.equal(await page.locator("#connectionName").textContent(),"Agent Console");
    assert(!(await page.locator("#limitsButton").evaluate(el=>el.hidden)));
    assert.equal(await page.locator(".skin-card").count(),1);
    const limits=JSON.parse(await fs.readFile(path.join(tmp,"limits.json"),"utf8"));assert(Array.isArray(limits.providers));
    console.log("Live Agent Console: two bridge updates, state="+live.state+", connected renderer, limits snapshot, Kitsu only");
  } finally {await app.close()}
})().catch(e=>{console.error(e);process.exitCode=1});
