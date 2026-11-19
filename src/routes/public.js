import { Router } from "express";
import { objectId } from "../db.js";
import { fail, subjects, levels } from "../validation.js";
export function publicRoutes({ db }) {
  const router = Router();
  router.get("/catalog", (_req, res) => res.json({ subjects, levels }));
  router.get("/tuitions", async (req, res) => {
    const filter = { approvalStatus: "approved", isActive: true };
    for (const key of ["subject", "classLevel", "mode"])
      if (typeof req.query[key] === "string" && req.query[key])
        filter[key] = req.query[key];
    if (typeof req.query.search === "string" && req.query.search.trim()) {
      const text = req.query.search
        .trim()
        .slice(0, 100)
        .replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      filter.$or = [
        { title: { $regex: text, $options: "i" } },
        { subject: { $regex: text, $options: "i" } },
      ];
    }
    const page = Math.max(
      1,
      Math.min(10000, Number.parseInt(req.query.page) || 1),
    );
    const limit = Math.max(
      1,
      Math.min(24, Number.parseInt(req.query.limit) || 9),
    );
    const [items, total] = await Promise.all([
      db
        .collection("tuitions")
        .find(filter)
        .sort({ createdAt: -1, _id: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .toArray(),
      db.collection("tuitions").countDocuments(filter),
    ]);
    res.json({
      items,
      total,
      page,
      pages: Math.max(1, Math.ceil(total / limit)),
    });
  });
  router.get("/tuitions/:id", async (req, res) => {
    const tuition = await db
      .collection("tuitions")
      .findOne({
        _id: objectId(req.params.id),
        approvalStatus: "approved",
        isActive: true,
      });
    if (!tuition) fail(404, "This tuition is not available.");
    const tutor = await db
      .collection("users")
      .findOne(
        { email: tuition.tutorEmail },
        { projection: { name: 1, image: 1, bio: 1, plan: 1 } },
      );
    res.json({ ...tuition, tutor });
  });
  router.get("/stats", async (_req, res) => {
    const [tuitions, tutors, students] = await Promise.all([
      db
        .collection("tuitions")
        .countDocuments({ approvalStatus: "approved", isActive: true }),
      db.collection("users").countDocuments({ role: "tutor" }),
      db.collection("users").countDocuments({ role: "student" }),
    ]);
    res.json({ tuitions, tutors, students });
  });
  return router;
}
