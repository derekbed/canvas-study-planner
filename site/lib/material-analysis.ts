import { bucket, database, now, type Course, type Material } from "@/lib/server";
import { extractFactsWithAI, knowledgeFor, parseFacts, passagesFromMaterial, saveKnowledge } from "@/lib/course-knowledge";
import { extractMaterialText } from "@/lib/material-text";

export async function analyzeMaterial(user: string, course: Course, material: Material) {
  if ((!material.extracted_text.trim() || material.mime_type === "application/pdf" || /\.pdf$/i.test(material.name)) && material.r2_key) {
    const original = await bucket().get(material.r2_key);
    if (!original) throw new Error("FILE_MISSING");
    const file = new File([await original.arrayBuffer()], material.name, { type: material.mime_type });
    const text = await extractMaterialText(file);
    if (text !== material.extracted_text) {
      await database().prepare("UPDATE materials SET extracted_text=? WHERE id=? AND course_id=? AND user_id=?")
        .bind(text, material.id, course.id, user).run();
      material = { ...material, extracted_text: text };
    }
  }
  if (!material.extracted_text.trim()) throw new Error("NO_TEXT");
  const passages = passagesFromMaterial(material);
  if (!passages.length) throw new Error("NO_TEXT");
  const extracted = await extractFactsWithAI(course, material, passages);
  if (!extracted.length) throw new Error("NO_FACTS");
  const db = database();
  const existing = await knowledgeFor(user, course.id);
  const studentFacts = parseFacts(existing?.facts_json || "[]").filter(fact => fact.origin === "student");
  const retainedFacts = parseFacts(existing?.facts_json || "[]").filter(fact => fact.origin !== "student" && fact.sourceMaterialId !== material.id);
  const facts = [...retainedFacts, ...extracted.filter(fact => !studentFacts.some(student => student.key === fact.key)), ...studentFacts];
  for (let offset = 0; offset < passages.length; offset += 60) {
    const statements = passages.slice(offset, offset + 60).map(passage => db.prepare(
      "INSERT INTO course_passages (id,user_id,course_id,material_id,source_label,text,created_at) VALUES (?,?,?,?,?,?,?)")
      .bind(passage.id, user, course.id, material.id, passage.source_label, passage.text, now()));
    if (offset === 0) statements.unshift(db.prepare("DELETE FROM course_passages WHERE user_id=? AND material_id=?").bind(user, material.id));
    await db.batch(statements);
  }
  const saved = await saveKnowledge(user, course, facts, material.id, "indexed");
  return { ...saved, passageCount: passages.length };
}
