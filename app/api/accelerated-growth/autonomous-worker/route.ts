import {NextResponse} from "next/server";
import {verifyAgWorkerSecret} from "@/lib/discovery/accelerated-growth/autonomous-worker-auth";
import {runAuthorizedAgWorkerStep} from "@/lib/discovery/accelerated-growth/autonomous-worker-step";
export const runtime="nodejs";
export const maxDuration=300;
export async function POST(request:Request){
 if(process.env.AG_AUTONOMOUS_WORKER_ENABLED!=="true")return NextResponse.json({error:"AG autonomous worker is disabled."},{status:503});
 if(!verifyAgWorkerSecret(request.headers.get("x-ag-worker-secret")))return NextResponse.json({error:"Unauthorized."},{status:401});
 let body:{cycleId?:string;token?:string};try{body=await request.json();}catch{return NextResponse.json({error:"Invalid JSON."},{status:400});}
 if(!body.cycleId||!body.token)return NextResponse.json({error:"cycleId and token are required."},{status:400});
 try{return NextResponse.json(await runAuthorizedAgWorkerStep({cycleId:body.cycleId,token:body.token}));}
 catch(error){return NextResponse.json({cycleId:body.cycleId,outcome:"needs_review",action:"worker_error",message:error instanceof Error?error.message:"Unknown worker error.",schedulingEnabled:false,transactionsWritten:false},{status:500});}
}
