export type GradeCourse = { id: string; target_grade: number; current_grade: number | null; grade_weights: string };
export type GradeEvent = { course_id: string | null; points_possible: number | null; points_earned: number | null; grade_group: string; status: string; title: string; due_at: string; estimated_minutes: number; id: string };
export type GradeProjection = { needed: number | null; possible: boolean | null; graded: number; remaining: number; projected: number | null; explanation: string };

export function projectGrade(course: GradeCourse, allEvents: GradeEvent[], overrides: Record<string, number> = {}): GradeProjection {
  const entries = allEvents.filter(e => e.course_id === course.id && e.points_possible != null && e.points_possible > 0);
  const graded = entries.filter(e => e.points_earned != null || overrides[e.id] != null).length;
  const remaining = entries.length - graded;
  if (!entries.length || !graded) return { needed: null, possible: null, graded, remaining, projected: null, explanation: !entries.length ? "Add assignments with point values to calculate a target." : "Scores are needed before this estimate is reliable." };
  let weights: Record<string, number> = {};
  try { weights = JSON.parse(course.grade_weights || "{}"); } catch {}
  const groups = Object.keys(weights).length ? weights : null;
  if(groups){
    const total=Object.values(groups).reduce((n,w)=>n+w,0);
    const missing=entries.some(e=>!(e.grade_group in groups)) || Object.entries(groups).some(([name,weight])=>weight>0&&!entries.some(e=>e.grade_group===name));
    if(missing || Math.abs(total-100)>0.01)return {needed:null,possible:null,graded,remaining,projected:null,explanation:"Weighted estimate unavailable: weights must total 100%, every assignment needs a matching category, and each weighted category needs listed work."};
  }
  const predict = (futurePercent: number) => {
    if (!groups) {
      const total = entries.reduce((sum, e) => sum + (e.points_possible || 0), 0);
      const earned = entries.reduce((sum, e) => sum + (overrides[e.id] ?? e.points_earned ?? ((e.points_possible || 0) * futurePercent / 100)), 0);
      return total ? earned / total * 100 : 0;
    }
    const available = Object.entries(groups).filter(([name, weight]) => weight > 0 && entries.some(e => e.grade_group === name));
    const weightTotal = available.reduce((sum, [, weight]) => sum + weight, 0);
    if (!weightTotal) return 0;
    return available.reduce((sum, [name, weight]) => {
      const list = entries.filter(e => e.grade_group === name);
      const points = list.reduce((n, e) => n + (e.points_possible || 0), 0);
      const earned = list.reduce((n, e) => n + (overrides[e.id] ?? e.points_earned ?? ((e.points_possible || 0) * futurePercent / 100)), 0);
      return sum + (points ? earned / points * 100 : 0) * weight / weightTotal;
    }, 0);
  };
  const max = predict(100), min = predict(0);
  if (!remaining) return { needed: null, possible: min >= course.target_grade, graded, remaining, projected: min, explanation: `With these scores, the listed work projects ${min.toFixed(1)}% overall.` };
  if (max < course.target_grade - 0.01) return { needed: null, possible: false, graded, remaining, projected: max, explanation: `Even 100% on listed remaining work projects ${max.toFixed(1)}%. More assignments or extra credit may change this.` };
  if (min >= course.target_grade) return { needed: 0, possible: true, graded, remaining, projected: min, explanation: "Your scored work already keeps you above the target across listed remaining work." };
  let low = 0, high = 100;
  for (let i = 0; i < 24; i++) { const mid = (low + high) / 2; if (predict(mid) >= course.target_grade) high = mid; else low = mid; }
  return { needed: Math.ceil(high * 10) / 10, possible: true, graded, remaining, projected: predict(high), explanation: `Average about ${(Math.ceil(high * 10) / 10).toFixed(1)}% on ${remaining} listed ungraded item${remaining === 1 ? "" : "s"} to reach ${course.target_grade}%.` };
}

export function priorityScore(event: GradeEvent, course: GradeCourse | undefined, currentTime = Date.now()) {
  if(event.status==="done")return -Infinity;
  const days = (Date.parse(event.due_at) - currentTime) / 86_400_000;
  const urgency = days < 0 ? 35 : days < 1 ? 40 : days < 3 ? 28 : days < 7 ? 15 : 4;
  let weights:Record<string,number>={};try{weights=JSON.parse(course?.grade_weights||"{}");}catch{}
  const impact = Math.min(35, weights[event.grade_group] || (event.points_possible || 0) / 5);
  const gap = course?.current_grade != null ? Math.max(0, course.target_grade - course.current_grade) * 1.6 : 0;
  const missing = event.status === "missing" ? 20 : 0;
  const effort = Math.min(12, event.estimated_minutes / 30);
  return urgency + impact + gap + missing - effort;
}

export function priorityReason(event:GradeEvent,course:GradeCourse|undefined,all:GradeEvent[],time=Date.now()) {
  const hours=(Date.parse(event.due_at)-time)/3600000;
  const due=hours<0?"Overdue":hours<24?"Due within 24 hours":`Due in ${Math.ceil(hours/24)} days`;
  let impact="Grade impact unknown: add points and a category.";
  const siblings=all.filter(e=>e.course_id===event.course_id && e.points_possible!=null && e.points_possible>0);
  let weights:Record<string,number>={};try{weights=JSON.parse(course?.grade_weights||"{}");}catch{}
  if(event.points_possible) {
    if(weights[event.grade_group]){const total=siblings.filter(e=>e.grade_group===event.grade_group).reduce((n,e)=>n+(e.points_possible||0),0);impact=`About ${(weights[event.grade_group]*event.points_possible/total).toFixed(1)}% of the grade using listed work in ${event.grade_group} (${weights[event.grade_group]}% category).`;}
    else {const total=siblings.reduce((n,e)=>n+(e.points_possible||0),0);impact=Object.keys(weights).length?"Category weight is missing.":`${event.points_possible} points; ${total?Math.round(event.points_possible/total*100):0}% of listed course points.`;}
  }
  return `${due} · estimated ${event.estimated_minutes} minutes. ${impact}`;
}
