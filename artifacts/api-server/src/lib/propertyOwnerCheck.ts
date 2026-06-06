import type { Request, Response } from "express";
import { db, propertiesTable } from "@workspace/db";
import { and, eq } from "drizzle-orm";

export async function requirePropertyOwner(
  req: Request,
  res: Response,
  propertyId: string,
): Promise<boolean> {
  if (!req.isAuthenticated()) {
    res.status(401).json({ error: "Unauthorized" });
    return false;
  }
  const [prop] = await db
    .select({ id: propertiesTable.id })
    .from(propertiesTable)
    .where(and(eq(propertiesTable.id, propertyId), eq(propertiesTable.ownerId, req.user.id)));
  if (!prop) {
    res.status(404).json({ error: "Property not found" });
    return false;
  }
  return true;
}
