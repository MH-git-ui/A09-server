import { Router } from "express";
import multer from "multer";
import { parse, profileSchema, publicUser, fail } from "../validation.js";
export function profileRoutes({ db, guards, config }) {
  const router = Router();
  router.use(guards.verifyToken);
  router.get("/me", (req, res) => res.json(publicUser(req.user)));
  router.patch("/profile", async (req, res) => {
    const fields = parse(profileSchema, req.body);
    const user = await db
      .collection("users")
      .findOneAndUpdate(
        { _id: req.user._id },
        { $set: { ...fields, updatedAt: new Date() } },
        { returnDocument: "after" },
      );
    await db
      .collection("tuitions")
      .updateMany(
        { tutorEmail: req.user.email },
        { $set: { tutorName: fields.name } },
      );
    res.json(publicUser(user));
  });
  const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 5 * 1024 * 1024, files: 1 },
    fileFilter: (_req, file, cb) =>
      cb(
        null,
        ["image/jpeg", "image/png", "image/webp"].includes(file.mimetype),
      ),
  });
  router.post("/images", upload.single("image"), async (req, res) => {
    if (!req.file) fail(400, "Choose a JPG, PNG, or WebP image under 5 MB.");
    if (!config.IMGBB_API_KEY)
      fail(503, "Image uploads are not configured yet.");
    const b = req.file.buffer;
    const valid =
      (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) ||
      b.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])) ||
      (b.toString("ascii", 0, 4) === "RIFF" &&
        b.toString("ascii", 8, 12) === "WEBP");
    if (!valid) fail(400, "The file is not a supported image.");
    const form = new FormData();
    form.set("key", config.IMGBB_API_KEY);
    form.set("image", b.toString("base64"));
    const response = await fetch("https://api.imgbb.com/1/upload", {
      method: "POST",
      body: form,
      signal: AbortSignal.timeout(30000),
    });
    const result = await response.json();
    if (!response.ok || !result.success)
      fail(502, "Image upload failed. Please try again.");
    res.json({ url: result.data.url });
  });
  return router;
}
