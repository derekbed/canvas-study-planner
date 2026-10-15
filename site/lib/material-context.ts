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
