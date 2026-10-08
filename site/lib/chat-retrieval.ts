import { database, setting, type Material } from "./server";
import { passagesFromMaterial, type IndexedPassage } from "./course-knowledge";
const MODEL = "text-embedding-3-small";
const VERSION = `${MODEL}:512`;
export function cosine(a: number[], b: number[]) {
  if (!a.length || a.length !== b.length) return 0;
  let dot=0,aa=0,bb=0;
  for(let i=0;i<a.length;i++){dot+=a[i]*b[i];aa+=a[i]*a[i];bb+=b[i]*b[i];}
  return aa && bb ? dot/Math.sqrt(aa*bb) : 0;
}
export function rankPassages(passages: IndexedPassage[], query: string, similarities: number[] = []) {
  const terms=[...new Set(query.toLowerCase().match(/[a-z0-9]{3,}/g)||[])].filter(x=>!['the','and','what','that','this','with','about','course'].includes(x));
  const ranked=passages.map((p,i)=>({...p,score: (similarities[i]||0)*0.7 + (terms.filter(t=>(p.source_label+' '+p.text).toLowerCase().includes(t)).length/Math.max(1,terms.length))*0.3})).sort((a,b)=>b.score-a.score);
  const seen=new Set<string>(); let chars=0;
  return ranked.filter(p=>{if(seen.has(p.text)||chars+p.text.length>6000)return false;seen.add(p.text);chars+=p.text.length;return true;}).slice(0,6);
}
async function embed(input:string[]) {
  const response=await fetch('https://api.openai.com/v1/embeddings',{method:'POST',signal:AbortSignal.timeout(25000),headers:{Authorization:`Bearer ${setting('OPENAI_API_KEY')}`,'Content-Type':'application/json'},body:JSON.stringify({model:MODEL,dimensions:512,input})});
  if(!response.ok)throw new Error('Embedding service unavailable');
  const result=await response.json() as {data:{index:number;embedding:number[]}[]};
  const vectors=result.data.sort((a,b)=>a.index-b.index).map(d=>d.embedding);
  if(vectors.length!==input.length||vectors.some(v=>v.length!==512||v.some(n=>!Number.isFinite(n))))throw new Error('Invalid embeddings');
  return vectors;
}
async function hash(text:string){return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(text)))).map(x=>x.toString(16).padStart(2,'0')).join('');}
// Index only selected files after the caller has checked AI consent. The content hash
// survives passage regeneration and invalidates vectors when source text changes.
export async function retrieve(user:string,materials:Material[],query:string) {
  const passages=materials.flatMap(passagesFromMaterial);
  if(!passages.length)return {passages:[],retrieval:'no-materials'};
  const db=database();
  const hashes=await Promise.all(passages.map(p=>hash(p.text)));
  const cached: {material_id:string;content_hash:string;embedding:string}[]=[];
  for(let offset=0;offset<materials.length;offset+=80){
    const ids=materials.slice(offset,offset+80).map(m=>m.id);
    cached.push(...(await db.prepare(`SELECT material_id,content_hash,embedding FROM material_vectors WHERE user_id=? AND model=? AND material_id IN (${ids.map(()=>'?').join(',')})`).bind(user,VERSION,...ids).all<{material_id:string;content_hash:string;embedding:string}>()).results);
  }
  const cache=new Map(cached.map(v=>[v.material_id+':'+v.content_hash,JSON.parse(v.embedding) as number[]]));
  try {
    // Limit initial indexing work per turn; large libraries fill progressively.
    const missing=passages.map((p,i)=>({p,i})).filter(({p,i})=>!cache.has(p.material_id+':'+hashes[i])).slice(0,192);
    for(let offset=0;offset<missing.length;offset+=64){
      const batch=missing.slice(offset,offset+64), vectors=await embed(batch.map(({p})=>p.text));
      await db.batch(batch.map(({p,i},j)=>{
        cache.set(p.material_id+':'+hashes[i],vectors[j]);
        const material=materials.find(m=>m.id===p.material_id)!;
        return db.prepare('INSERT OR IGNORE INTO material_vectors (id,user_id,course_id,material_id,content_hash,model,embedding) VALUES (?,?,?,?,?,?,?)').bind(`${user}:${p.material_id}:${hashes[i]}:${VERSION}`,user,material.course_id,p.material_id,hashes[i],VERSION,JSON.stringify(vectors[j]));
      }));
    }
    const [vector]=await embed([query.slice(0,4000)]);
    return {passages:rankPassages(passages,query,passages.map((p,i)=>cosine(vector,cache.get(p.material_id+':'+hashes[i])||[]))),retrieval:passages.every((p,i)=>cache.has(p.material_id+':'+hashes[i]))?'hybrid':'hybrid-partial'};
  } catch {
    return {passages:rankPassages(passages,query),retrieval:'keyword-fallback'};
  }
}
