import { eq as drizzleEq } from "drizzle-orm";
import { db } from "@/db/postgres";
import { consultations } from "@/db/postgres/schema";

export type ConsultationInsert = {
  name: string;
  email: string;
  phone: string;
  service: string;
  message: string;
};

export async function insertConsultation(c: ConsultationInsert): Promise<void> {
  await db.insert(consultations).values({
    name: c.name,
    email: c.email,
    phone: c.phone,
    service: c.service,
    message: c.message,
  });
}

export async function listRecentConsultations(limit: number): Promise<Array<{
  id: number;
  name: string;
  email: string;
  phone: string;
  service: string;
  message: string;
  created_at: string;
}>> {
  const rows = await db
    .select()
    .from(consultations)
    .orderBy(drizzleEq(consultations.id))
    .limit(limit);
  return rows
    .map((r) => ({
      id: r.id,
      name: r.name,
      email: r.email,
      phone: r.phone,
      service: r.service,
      message: r.message,
      created_at: r.createdAt.toISOString(),
    }))
    .reverse();
}
