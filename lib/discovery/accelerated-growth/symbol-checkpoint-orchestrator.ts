export type AgSymbolParentStage="catalyst_deep_research"|"committee";
export type AgSymbolCheckpointRow={symbol:string;status:"pending"|"running"|"completed"|"failed"|"needs_manual_review";output:unknown|null};
export type AgSymbolCheckpointIo={
 read(cycleId:string,parentStage:AgSymbolParentStage):Promise<AgSymbolCheckpointRow[]>;
 claim(cycleId:string,parentStage:AgSymbolParentStage,symbol:string):Promise<{checkpointId:string;claimToken:string}>;
 complete(checkpointId:string,claimToken:string,output:unknown):Promise<boolean>;
};
const SYMBOL=/^[A-Z][A-Z0-9.-]{0,14}$/;
export function inspectAgSymbolManifest(expected:readonly string[],rows:readonly AgSymbolCheckpointRow[]){
 if(new Set(expected).size!==expected.length||expected.some(s=>!SYMBOL.test(s))) throw new Error("Invalid AG symbol manifest.");
 const allowed=new Set(expected),seen=new Set<string>(),completed=new Map<string,unknown>();
 for(const row of rows){
  if(!allowed.has(row.symbol)||seen.has(row.symbol)) return {action:"MANUAL_RECONCILIATION" as const,reason:"UNEXPECTED_SYMBOL_CHECKPOINT"};
  seen.add(row.symbol);
  if(row.status==="completed"){
   if(row.output===null||typeof row.output!=="object"||(row.output as {symbol?:unknown}).symbol!==row.symbol)
    return {action:"MANUAL_RECONCILIATION" as const,reason:"INVALID_COMPLETED_SYMBOL_OUTPUT"};
   completed.set(row.symbol,row.output);
  } else if(row.status!=="pending")
   return {action:"MANUAL_RECONCILIATION" as const,reason:"NON_RECLAIMABLE_SYMBOL_STATE"};
 }
 const missing=expected.filter(s=>!completed.has(s)&&!seen.has(s));
 const pending=rows.filter(r=>r.status==="pending").map(r=>r.symbol);
 if(completed.size===expected.length) return {action:"AGGREGATE" as const,outputs:expected.map(s=>completed.get(s)!)};
 return {action:"RUN_ONE" as const,symbol:[...pending,...missing][0]!,completedCount:completed.size};
}
export async function runNextAgSymbolWork(input:{cycleId:string;parentStage:AgSymbolParentStage;expectedSymbols:readonly string[];io:AgSymbolCheckpointIo;work:(symbol:string)=>Promise<unknown>}){
 const before=inspectAgSymbolManifest(input.expectedSymbols,await input.io.read(input.cycleId,input.parentStage));
 if(before.action!=="RUN_ONE") return before;
 const claim=await input.io.claim(input.cycleId,input.parentStage,before.symbol);
 if(!claim.checkpointId||!claim.claimToken) throw new Error("Invalid AG symbol claim.");
 const output=await input.work(before.symbol);
 if(output===null||typeof output!=="object"||(output as {symbol?:unknown}).symbol!==before.symbol) throw new Error("AG symbol work output identity mismatch.");
 if(!await input.io.complete(claim.checkpointId,claim.claimToken,output)) throw new Error("AG symbol completion rejected; reconcile durable state.");
 return {action:"SYMBOL_COMPLETED" as const,symbol:before.symbol};
}