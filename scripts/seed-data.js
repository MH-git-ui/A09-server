export const demoAccounts = [
  {
    name: "Demo Administrator",
    email: "admin@mentorlagbe.demo",
    role: "admin",
  },
  { name: "Nusrat Rahman", email: "tutor@mentorlagbe.demo", role: "tutor" },
  { name: "Arif Hasan", email: "arif@mentorlagbe.demo", role: "tutor" },
  { name: "Sadia Islam", email: "sadia@mentorlagbe.demo", role: "tutor" },
  { name: "Farhan Ahmed", email: "student@mentorlagbe.demo", role: "student" },
];
const topics = [
  ["Mathematics", "HSC", "HSC Mathematics: build a confident foundation", 2500],
  ["Physics", "Class 9–10", "Physics made practical for SSC students", 2000],
  [
    "English",
    "Class 9–10",
    "English grammar and writing with confidence",
    1800,
  ],
  [
    "Programming",
    "Professional",
    "Your first web application with JavaScript",
    3500,
  ],
  ["IELTS", "Professional", "IELTS speaking and writing preparation", 4000],
  ["Chemistry", "HSC", "HSC Chemistry: concepts to exam practice", 2400],
  ["Biology", "HSC", "Explore Biology with diagrams and discussion", 2200],
  [
    "Accounting",
    "University",
    "Accounting essentials for university students",
    3000,
  ],
  [
    "Mathematics",
    "Class 6–8",
    "Maths discovery: strengthen your fundamentals",
    1500,
  ],
  [
    "Programming",
    "University",
    "Python problem solving and data structures",
    3200,
  ],
  ["Physics", "HSC", "HSC Physics exam preparation batch", 2600],
  ["English", "Professional", "Everyday English for study and work", 2100],
];
const pictures = [
  "photo-1509228468518-180dd4864904",
  "photo-1636466497217-26a8cbeaf0aa",
  "photo-1455390582262-044cdead277a",
  "photo-1516321318423-f06f85e504b3",
];
export async function seedDatabase({ db, auth, password }) {
  if (!password || password.length < 12)
    throw new Error("Set SEED_PASSWORD with at least 12 characters.");
  for (const account of demoAccounts) {
    let user = await db.collection("users").findOne({ email: account.email });
    if (!user) {
      await auth.api.signUpEmail({
        body: {
          ...account,
          role: account.role === "admin" ? "student" : account.role,
          password,
        },
      });
      await db
        .collection("users")
        .updateOne(
          { email: account.email },
          {
            $set: {
              role: account.role,
              plan: account.role === "tutor" ? "pro" : "free",
              bio: "Demonstration profile: patient, practical teaching with regular practice and thoughtful feedback.",
              phone: "+8801700000000",
            },
          },
        );
    }
  }
  const tutors = demoAccounts.filter((a) => a.role === "tutor");
  for (const [
    index,
    [subject, classLevel, title, monthlyFee],
  ] of topics.entries()) {
    const tutor = tutors[index % tutors.length];
    await db
      .collection("tuitions")
      .updateOne(
        { seedKey: `demo-${index}` },
        {
          $setOnInsert: {
            seedKey: `demo-${index}`,
            title,
            subject,
            classLevel,
            monthlyFee,
            mode: index % 3 === 0 ? "Offline" : "Online",
            location: index % 3 === 0 ? "Dhanmondi, Dhaka" : "Google Meet",
            daysPerWeek: 3,
            schedule: "Sunday, Tuesday & Thursday · 7:00–8:00 PM",
            description: `Build a clear understanding of ${subject.toLowerCase()} through guided lessons, weekly practice and individual feedback. We start with your current level and work towards your goals. This small-group batch includes structured explanations, problem-solving sessions, and time for your questions. Bring a notebook and your curiosity. This is realistic sample content for the assignment demonstration.`,
            bannerImage: `https://images.unsplash.com/${pictures[index % pictures.length]}?auto=format&fit=crop&w=900&q=80`,
            tutorName: tutor.name,
            tutorEmail: tutor.email,
            approvalStatus: "approved",
            isActive: true,
            createdAt: new Date(Date.now() - index * 86400000),
          },
        },
        { upsert: true },
      );
  }
  for (const tutor of tutors)
    await db
      .collection("users")
      .updateOne(
        { email: tutor.email },
        {
          $set: {
            tuitionCount: await db
              .collection("tuitions")
              .countDocuments({ tutorEmail: tutor.email }),
          },
        },
      );
  const examples = await db
    .collection("tuitions")
    .find({ seedKey: { $in: ["demo-0", "demo-1", "demo-2"] } })
    .sort({ seedKey: 1 })
    .toArray();
  for (const [index, tuition] of examples.entries())
    await db
      .collection("applications")
      .updateOne(
        {
          tuitionId: String(tuition._id),
          studentEmail: "student@mentorlagbe.demo",
        },
        {
          $setOnInsert: {
            tuitionId: String(tuition._id),
            tuitionTitle: tuition.title,
            subject: tuition.subject,
            monthlyFee: tuition.monthlyFee,
            tutorEmail: tuition.tutorEmail,
            tutorName: tuition.tutorName,
            studentName: "Farhan Ahmed",
            studentEmail: "student@mentorlagbe.demo",
            studentPhone: "+8801700000000",
            preferredSchedule: "Evenings after 6 PM",
            studentNote:
              "I would like more practice with foundational concepts.",
            status: ["pending", "accepted", "rejected"][index],
            priority: false,
            appliedAt: new Date(),
          },
        },
        { upsert: true },
      );
}
