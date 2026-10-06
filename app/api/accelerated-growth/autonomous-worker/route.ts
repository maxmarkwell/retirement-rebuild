import {NextResponse} from "next/server";
import {claimAgWorker,finishAgWorker,verifyAgWorkerSecret} from "@/lib/discovery/accelerated-growth/autonomous-worker-auth";

export const runtime="nodejs";
export const maxDuration=300;

export async function POST(request:Request){
 if(process.env.AG_AUTONOMOUS_WORKER_ENABLED!=="true")
  return NextResponse.json({error:"AG autonomous worker is disabled."},{status:503});

 const workerSecret=request.headers.get("x-ag-worker-secret");
 if(!verifyAgWorkerSecret(workerSecret))
  return NextResponse.json({error:"Unauthorized."},{status:401});

 let body:{cycleId?:string;token?:string};
 try{body=await request.json();}catch{return NextResponse.json({error:"Invalid JSON."},{status:400});}
 if(!body.cycleId||!body.token)return NextResponse.json({error:"cycleId and token are required."},{status:400});

 const claim=await claimAgWorker(body.cycleId,body.token);
 if(!claim)return NextResponse.json({error:"Worker authorization unavailable."},{status:409});

 // Transport boundary only. Coordinator execution is intentionally not wired
 // until service-scoped cycle execution can preserve the existing user-bound
 // checkpoint contracts without impersonating a browser session.
 return NextResponse.json({
  cycleId:body.cycleId,
  authorizationId:claim.authorizationId,
  invocationNumber:claim.invocationNumber,
  action:"authorized_noop",
  schedulingEnabled:false,
  transactionsWritten:false,
 });
}
