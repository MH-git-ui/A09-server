import { Router } from "express";
import { objectId } from "../db.js";
import { tuitionSchema, parse, fail } from "../validation.js";
export function tutorRoutes({ db, guards }) {
  const router = Router();
  router.use(guards.verifyToken, guards.verifyTutor);
  const owned = (req) => ({
    _id: objectId(req.params.id),
    tutorEmail: req.user.email,
  });
  router.get("/tuitions", async (req, res) =>
    res.json(
      await db
        .collection("tuitions")
        .find({ tutorEmail: req.user.email })
        .sort({ createdAt: -1 })
        .toArray(),
    ),
  );
  router.post("/tuitions", async (req, res) => {
    const data = parse(tuitionSchema, req.body);
    const filter = { _id: req.user._id };
    if (req.user.plan !== "pro")
      filter.$or = [
        { tuitionCount: { $lt: 2 } },
        { tuitionCount: { $exists: false } },
      ];
    const reserved = await db
      .collection("users")
      .findOneAndUpdate(filter, { $inc: { tuitionCount: 1 } });
    if (!reserved)
      fail(
        403,
        "Free tutors can have two tuition posts. Upgrade to Pro for unlimited posts.",
      );
    try {
      const tuition = {
        ...data,
        tutorName: req.user.name,
        tutorEmail: req.user.email,
        approvalStatus: "pending",
        isActive: true,
        createdAt: new Date(),
      };
      const result = await db.collection("tuitions").insertOne(tuition);
      res.status(201).json({ ...tuition, _id: result.insertedId });
    } catch (error) {
      await db
        .collection("users")
        .updateOne({ _id: req.user._id }, { $inc: { tuitionCount: -1 } });
      throw error;
    }
  });
  router.patch("/tuitions/:id", async (req, res) => {
    const data = parse(tuitionSchema, req.body);
    const item = await db
      .collection("tuitions")
      .findOneAndUpdate(
        owned(req),
        { $set: { ...data, approvalStatus: "pending", updatedAt: new Date() } },
        { returnDocument: "after" },
      );
    if (!item) fail(404, "Tuition not found.");
    res.json(item);
  });
  router.patch("/tuitions/:id/active", async (req, res) => {
    if (typeof req.body.isActive !== "boolean")
      fail(400, "Choose Active or Closed.");
    const item = await db
      .collection("tuitions")
      .findOneAndUpdate(
        owned(req),
        { $set: { isActive: req.body.isActive } },
        { returnDocument: "after" },
      );
    if (!item) fail(404, "Tuition not found.");
    res.json(item);
  });
  router.delete("/tuitions/:id", async (req, res) => {
    const result = await db.collection("tuitions").deleteOne(owned(req));
    if (!result.deletedCount) fail(404, "Tuition not found.");
    await db
      .collection("users")
      .updateOne(
        { _id: req.user._id, tuitionCount: { $gt: 0 } },
        { $inc: { tuitionCount: -1 } },
      );
    // Preserve application snapshots for students instead of deleting their history.
    await db
      .collection("applications")
      .updateMany(
        { tuitionId: req.params.id, status: "pending" },
        { $set: { status: "rejected", tuitionDeleted: true } },
      );
    res.json({ success: true });
  });
  return router;
}
