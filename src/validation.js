import { z } from "zod";
export const subjects = [
  "Mathematics",
  "Physics",
  "Chemistry",
  "English",
  "Programming",
  "IELTS",
  "Biology",
  "Accounting",
];
export const levels = [
  "Class 6–8",
  "Class 9–10",
  "HSC",
  "University",
  "Professional",
];
export const imageUrl = z
  .url()
  .refine((value) => value.startsWith("https://"), "Use an HTTPS image URL.");
export const tuitionSchema = z
  .object({
    title: z.string().trim().min(5).max(120),
    subject: z.enum(subjects),
    classLevel: z.enum(levels),
    mode: z.enum(["Online", "Offline"]),
    location: z.string().trim().max(120),
    monthlyFee: z.coerce.number().positive().max(100000),
    daysPerWeek: z.coerce.number().int().min(1).max(7),
    schedule: z.string().trim().min(3).max(160),
    description: z.string().trim().min(30).max(5000),
    bannerImage: imageUrl,
  })
  .refine((data) => data.mode !== "Offline" || data.location.length >= 3, {
    message: "Location is required for offline tuition.",
    path: ["location"],
  });
export const applicationSchema = z.object({
  studentPhone: z
    .string()
    .trim()
    .regex(/^[+\d ()-]{7,25}$/),
  preferredSchedule: z.string().trim().min(3).max(160),
  studentNote: z.string().trim().max(1000).default(""),
});
export const profileSchema = z.object({
  name: z.string().trim().min(2).max(80),
  phone: z.string().trim().max(25),
  bio: z.string().trim().max(1000),
  image: z.union([imageUrl, z.literal("")]).default(""),
});
export function parse(schema, value) {
  const result = schema.safeParse(value);
  if (!result.success)
    throw Object.assign(
      new Error(
        result.error.issues
          .map((i) => `${i.path.join(".")}: ${i.message}`)
          .join("; "),
      ),
      { status: 400 },
    );
  return result.data;
}
export function fail(status, message) {
  throw Object.assign(new Error(message), { status });
}
export function publicUser(user) {
  return {
    id: String(user._id ?? user.id),
    name: user.name,
    email: user.email,
    role: user.role,
    plan: user.plan,
    image: user.image ?? "",
    phone: user.phone ?? "",
    bio: user.bio ?? "",
    createdAt: user.createdAt,
  };
}
