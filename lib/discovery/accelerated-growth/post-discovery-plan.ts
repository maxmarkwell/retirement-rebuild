/** Pure selection/reconciliation from frozen Discovery evidence. */
import type {AgDiscoveryCandidate} from "./discovery";
import type {AgDiscoveryHandoff} from "./research-stage-handoff";
import type {AgQuantitativeWatchResolution,AgCommitteeWatchResolution} from "./deep-research-pipeline";

export function deriveAgPostDiscoveryPlan(h:AgDiscoveryHandoff,maxCandidates=5):{
 selected:AgDiscoveryCandidate[];
 quantitativeWatchResolutions:AgQuantitativeWatchResolution[];
 committeeWatchResolutions:AgCommitteeWatchResolution[];
}{
 const prior=h.watchContext.research,committee=h.watchContext.committee;
 const reassess=new Set([...Object.keys(prior),...Object.keys(committee)]);
 const quantitativeWatchResolutions=h.discovery.candidates
  .filter(c=>prior[c.symbol]&&c.score.status!=="ADVANCE")
  .map(c=>({symbol:c.symbol,sourceWatchId:prior[c.symbol].rowId,
   resolution:c.score.status as AgQuantitativeWatchResolution["resolution"]}));
 const committeeWatchResolutions=h.discovery.candidates
  .filter(c=>committee[c.symbol]&&c.score.status!=="ADVANCE")
  .map(c=>({symbol:c.symbol,sourceDecisionId:committee[c.symbol],
   resolution:c.score.status as AgCommitteeWatchResolution["resolution"]}));
 const advance=h.discovery.candidates.filter(c=>c.score.status==="ADVANCE");
 const watched=advance.filter(c=>reassess.has(c.symbol)).sort((a,b)=>{
  const aw=prior[a.symbol],bw=prior[b.symbol];
  if(aw&&bw)return Date.parse(aw.lastSeenAt)-Date.parse(bw.lastSeenAt);
  if(aw)return -1;if(bw)return 1;return b.score.total-a.score.total;
 });
 const fresh=advance.filter(c=>!reassess.has(c.symbol)).sort((a,b)=>b.score.total-a.score.total);
 const limit=Math.max(1,Math.min(maxCandidates,5));
 // Reassessments remain first-class, but reserve at least one slot for a fresh
 // ADVANCE when both groups exist so an old WATCH backlog cannot starve new ideas.
 let selected:AgDiscoveryCandidate[];
 if(watched.length&&fresh.length&&limit>1){
  const watchedSlots=Math.min(watched.length,limit-1);
  selected=[...watched.slice(0,watchedSlots),...fresh.slice(0,limit-watchedSlots)];
 }else selected=[...watched,...fresh].slice(0,limit);
 return {selected,
  quantitativeWatchResolutions,committeeWatchResolutions};
}
