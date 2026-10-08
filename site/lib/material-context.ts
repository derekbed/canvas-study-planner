export type Passage={label:string;text:string;materialId:string;score:number};
export function relevantPassages(materials:{id:string;name:string;extracted_text:string}[],question:string):Passage[] {
  const words=[...new Set(question.toLowerCase().match(/[a-z]{3,}/g)||[])];
  const chunks=materials.flatMap(m=>{
    const pages=m.extracted_text.split(/\[Page (\d+)\]\n/);
    const sections: {text:string;label:string}[]=[];
    if(pages.length>1){for(let i=1;i<pages.length;i+=2)sections.push({text:pages[i+1],label:`page ${pages[i]}`});}
    else {m.extracted_text.split(/\n\s*\n/).filter(Boolean).forEach((text,i)=>sections.push({text,label:`section ${i+1}`}));}
    return sections.flatMap(section=>(section.text.match(/[\s\S]{1,1200}/g)||[]).map((text,i)=>({materialId:m.id,label:`${m.name}, ${section.label}${i?`, passage ${i+1}`:""}`,text,score:words.reduce((n,w)=>n+(text.toLowerCase().includes(w)?1:0),0)})));
  });
  return chunks.sort((a,b)=>b.score-a.score).slice(0,6);
}
export function syllabusCandidates(material:{id:string;name:string;extracted_text:string}) {
  const pages=material.extracted_text.split(/\[Page (\d+)\]\n/), sections:{label:string;text:string}[]=[];
  if(pages.length>1){for(let i=1;i<pages.length;i+=2)sections.push({label:`${material.name}, page ${pages[i]}`,text:pages[i+1]});}
  else material.extracted_text.split(/\n\s*\n/).filter(Boolean).forEach((text,i)=>sections.push({label:`${material.name}, section ${i+1}`,text}));
  return sections.flatMap(section=>section.text.split(/\n|(?<=[.!?])\s+/).flatMap(line=>{
    const text=line.trim();if(!text)return [];
    const isDate=/\b(?:\d{4}-\d{2}-\d{2}|\d{1,2}\/\d{1,2}(?:\/\d{2,4})?|(?:Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:tember)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\s+\d{1,2})\b/i.test(text);
    const kind=isDate?"date":/\d+(?:\.\d+)?\s*%/.test(text)?"grading":/exam|test|late|attendance|must|required|integrity|make.up/i.test(text)?"requirement":"";
    if(!kind)return [];
    const date=text.match(/\b\d{4}-\d{2}-\d{2}\b/)?.[0] || "";
    return [{kind,text:text.slice(0,1500),source:section.label,date}];
  })).slice(0,50);
}
