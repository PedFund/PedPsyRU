(function(root,factory){
  const api=factory();if(typeof module==="object" && module.exports)module.exports=api;else root.PedPsyDraft=api;
})(typeof globalThis!=="undefined"?globalThis:this,function(){
  "use strict";
  const copy=s=>({current_item_id:s.current_item_id,responses:s.responses.map(({item_id,value})=>({item_id,value}))});
  function createQueue({save,onChange=()=>{}}) {
    let revision=0,latest=null,generation=0,acknowledged=0,status="loading",running=null,blocked=true;
    const state=()=>({status,revision,dirty:generation!==acknowledged,busy:!!running,blocked,
      snapshot:latest && copy(latest)});
    const emit=()=>onChange(state());
    async function pump() {
      try {
        while(!blocked && generation!==acknowledged) {
          const sentGeneration=generation,sent=copy(latest),expected=revision;
          status="saving";emit();
          const result=await save({expected_revision:expected,...sent});
          if(!Number.isSafeInteger(result.revision) || result.revision!==expected+1)throw new Error("INVALID_SAVE_ACK");
          revision=result.revision;acknowledged=sentGeneration;
        }
        if(!blocked)status="saved";
      }catch(error) {
        blocked=true;status=error.status===401?"auth":error.code==="REVISION_CONFLICT"?"conflict":
          error.code==="ATTEMPT_COMPLETED"?"completed":"failed";
      }finally{running=null;emit();}
    }
    return {
      load(s) {
        if(running)throw new Error("SAVE_IN_PROGRESS");
        if(!Number.isSafeInteger(s.revision) || s.revision<0)throw new Error("INVALID_REVISION");
        revision=s.revision;latest=copy(s);generation=acknowledged=0;
        blocked=s.status!=="draft";status=blocked?"readonly":"saved";emit();
      },
      edit(s) {
        if(blocked)throw new Error("DRAFT_BLOCKED");
        latest=copy(s);generation++;status="saving";
        if(!running)running=Promise.resolve().then(pump);
        emit();
      },
      async flush(){if(running)await running;return state();},
      state
    };
  }
  return {createQueue};
});
