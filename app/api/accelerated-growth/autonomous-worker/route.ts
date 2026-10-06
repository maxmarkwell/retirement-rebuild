import {NextResponse} from "next/server";
import {claimAgWorker,finishAgWorker,verifyAgWorkerSecret} from "@/lib/discovery/accelerated-growth/autonomous-worker-auth";
import {createWorkerAgExecutionContext} from "@/lib/discovery/accelerated-growth/autonomous-worker-context";
import {runNextAgResumableResearchStage} from "@/lib/discovery/accelerated-growth/resumable-daily-cycle-adapter";
export const runtime="nodejs";
export const maxDuration=300;
export async function POST(request:Request){
 if(process.env.AG_AUTONOMOUS_WORKER_ENABLED!=="true")return NextResponse.json({error:"AG autonomous worker is disabled."},{status:503});
 if(!verifyAgWorkerSecret(request.headers.get("x-ag-worker-secret")))return NextResponse.json({error:"Unauthorized."},{status:401});
 let body:{cycleId?:string;token?:string};try{body=await request.json();}catch{return NextResponse.json({error:"Invalid JSON."},{status:400});}
 if(!body.cycleId||!body.token)return NextResponse.json({error:"cycleId and token are required."},{status:400});
 const claim=await claimAgWorker(body.cycleId,body.token);
 if(!claim)return NextResponse.json({error:"Worker authorization unavailable."},{status:409});
 const context=createWorkerAgExecutionContext({cycleId:body.cycleId,userId:claim.userId,authorizationId:claim.authorizationId,token:body.token});
 try{
  const step=await runNextAgResumableResearchStage({cycleId:body.cycleId,maxCandidates:claim.maxCandidates,context});
  if(step.plan.action==="manual_review"){
   await finishAgWorker(body.cycleId,body.token,"revoked");
   return NextResponse.json({cycleId:body.cycleId,outcome:"needs_review",stage:step.plan.stage,action:"manual_review",invocationNumber:claim.invocationNumber,schedulingEnabled:false,transactionsWritten:false});
  }
  if(step.persistenceReady){
   return NextResponse.json({cycleId:body.cycleId,outcome:"continue",stage:"persistence",action:"persistence_ready",invocationNumber:claim.invocationNumber,schedulingEnabled:false,transactionsWritten:false});
  }
  return NextResponse.json({cycleId:body.cycleId,outcome:"continue",stage:step.plan.stage,action:step.plan.action==="wait"?"wait":"stage_step",invocationNumber:claim.invocationNumber,schedulingEnabled:false,transactionsWritten:false});
 }catch(error){
  try{await finishAgWorker(body.cycleId,body.token,"revoked");}catch{}
  return NextResponse.json({cycleId:body.cycleId,outcome:"needs_review",action:"worker_error",message:error instanceof Error?error.message:"Unknown worker error.",invocationNumber:claim.invocationNumber,schedulingEnabled:false,transactionsWritten:false},{status:500});
 }
}
