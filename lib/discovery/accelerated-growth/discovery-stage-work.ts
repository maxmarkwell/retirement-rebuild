import "server-only";
/** Isolated Discovery stage. Not imported by the active daily-cycle runner. */
import {createClient} from "@/lib/supabase/server";
import {runAcceleratedGrowthDiscovery} from "./discovery";
import type {AgPriorResearchWatch} from "./deep-research";
import {freezeAgDiscoveryHandoff,type AgDiscoveryHandoff} from "./research-stage-handoff";

export async function runAgDiscoveryStageWork(input?:{workerContext?:any}):Promise<AgDiscoveryHandoff>{
 if(input?.workerContext){
  const ctx=await input.workerContext.readDiscoveryContext();
  const research:Record<string,AgPriorResearchWatch>={},committee:Record<string,string>={};
  for(const w of ctx.researchWatches??[]) research[String(w.ticker).toUpperCase()]={rowId:w.id,confidence:Number(w.confidence),thesis:w.thesis,unresolvedQuestions:w.unresolved_questions??[],thesisClock:w.thesis_clock,firstSeenAt:w.first_seen_at,lastSeenAt:w.last_seen_at};
  for(const w of ctx.committeeWatches??[]) committee[String(w.ticker).toUpperCase()]=w.id;
  const reassessSymbols=Array.from(new Set([...Object.keys(research),...Object.keys(committee)]));
  const discovery=await runAcceleratedGrowthDiscovery({reassessSymbols});
  return freezeAgDiscoveryHandoff({discovery,watchContext:{research,committee}});
 }
 const supabase=await createClient();
 const {data:{user}}=await supabase.auth.getUser();
 if(!user) throw new Error("You must be signed in.");
 const research:Record<string,AgPriorResearchWatch>={};
 const committee:Record<string,string>={};
 const {data:portfolio,error:portfolioError}=await supabase.from("portfolios")
  .select("id").eq("user_id",user.id).eq("type","paper_active").single();
 if(portfolioError||!portfolio) throw new Error("Paper AG portfolio required.");
 const {data:era,error:eraError}=await supabase.from("portfolio_strategy_eras")
  .select("id, inception_at").eq("portfolio_id",portfolio.id).eq("user_id",user.id)
  .eq("strategy_key","accelerated_growth").eq("execution_mode","paper").is("ended_at",null).single();
 if(eraError||!era) throw new Error("Open paper Accelerated Growth era required.");
 const [{data:watches,error:we},{data:committeeWatches,error:ce}]=await Promise.all([
  supabase.from("ag_research_watchlist")
   .select("id,ticker,confidence,thesis,unresolved_questions,thesis_clock,first_seen_at,last_seen_at")
   .eq("portfolio_id",portfolio.id).eq("strategy_era_id",era.id).is("resolved_at",null)
   .order("last_seen_at",{ascending:true}).limit(5),
  supabase.from("investment_decisions").select("id,ticker")
   .eq("portfolio_id",portfolio.id).eq("user_id",user.id).eq("source","ai_committee")
   .eq("decision_type","watch").eq("status","active").gte("created_at",era.inception_at),
 ]);
 if(we) throw new Error(`Unable to load AG research watches: ${we.message}`);
 if(ce) throw new Error(`Unable to load AG Committee watches: ${ce.message}`);
 for(const w of watches??[]) research[w.ticker.toUpperCase()]={
  rowId:w.id,confidence:Number(w.confidence),thesis:w.thesis,
  unresolvedQuestions:w.unresolved_questions??[],thesisClock:w.thesis_clock,
  firstSeenAt:w.first_seen_at,lastSeenAt:w.last_seen_at,
 };
 for(const w of committeeWatches??[]) committee[w.ticker.toUpperCase()]=w.id;
 const reassessSymbols=Array.from(new Set([...Object.keys(research),...Object.keys(committee)]));
 const discovery=await runAcceleratedGrowthDiscovery({reassessSymbols});
 return freezeAgDiscoveryHandoff({discovery,watchContext:{research,committee}});
}
