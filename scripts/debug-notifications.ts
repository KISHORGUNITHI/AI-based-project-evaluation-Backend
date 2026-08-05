/**
 * Debug script: checks notification userId vs actual student userIds
 * Run: npx tsx scripts/debug-notifications.ts
 */
import "dotenv/config";
import prisma from "../src/db/prisma.js";

async function main() {
    console.log("\n=== Notification Debug ===\n");

    // 1. Show all notifications in DB
    const notifications = await prisma.notification.findMany({
        orderBy: { createdAt: "desc" },
        take: 20,
    });

    console.log(`Total notifications in DB: ${notifications.length}`);
    if (notifications.length === 0) {
        console.log("❌ NO notifications in DB at all — worker may not be inserting");
    } else {
        console.log("\nRecent notifications:");
        for (const n of notifications) {
            console.log(`  id=${n.id} userId=${n.userId} type=${n.type} read=${n.read}`);
            console.log(`    message: ${n.message}`);
        }
    }

    // 2. Show all students and their userIds
    console.log("\n=== Student → User mapping ===");
    const students = await prisma.student.findMany({
        include: { user: true },
    });

    for (const s of students) {
        console.log(`  student.id=${s.id} → user.id=${s.userId} (${s.user.name} / ${s.user.email})`);
    }

    // 3. Cross-reference: do any notification userIds match student userIds?
    const notifUserIds = new Set(notifications.map(n => n.userId));
    const studentUserIds = new Set(students.map(s => s.userId));

    console.log("\n=== Cross-reference ===");
    const matched = [...notifUserIds].filter(id => studentUserIds.has(id));
    const mismatched = [...notifUserIds].filter(id => !studentUserIds.has(id));

    if (matched.length > 0) {
        console.log(`✅ ${matched.length} notification(s) have matching student userIds`);
    }
    if (mismatched.length > 0) {
        console.log(`❌ ${mismatched.length} notification(s) have UNKNOWN userIds (not in student table):`);
        for (const id of mismatched) {
            // Check if it's a judge or admin
            const judge = await prisma.judge.findUnique({ where: { userId: id }, include: { user: true } });
            const admin = await prisma.admin?.findUnique?.({ where: { userId: id }, include: { user: true } }).catch(() => null);
            if (judge) console.log(`    ${id} → JUDGE: ${judge.user.name}`);
            else if (admin) console.log(`    ${id} → ADMIN: ${(admin as any).user?.name}`);
            else console.log(`    ${id} → UNKNOWN user`);
        }
    }

    // 4. Show evaluations that completed recently
    console.log("\n=== Recent AI_COMPLETED evaluations ===");
    const evals = await prisma.evaluation.findMany({
        where: { status: { in: ["AI_COMPLETED", "COMPLETED"] } },
        orderBy: { updatedAt: "desc" },
        take: 5,
        include: {
            project: {
                include: {
                    team: {
                        include: {
                            members: {
                                include: { student: { include: { user: true } } },
                            },
                        },
                    },
                },
            },
        },
    });

    for (const ev of evals) {
        const memberUserIds = ev.project.team.members.map((m: any) => m.student.userId);
        const hasNotif = memberUserIds.some(uid => notifUserIds.has(uid));
        console.log(`  eval=${ev.id} project="${ev.project.title}" status=${ev.status}`);
        console.log(`    team members userIds: [${memberUserIds.join(", ")}]`);
        console.log(`    has notification: ${hasNotif ? "✅ YES" : "❌ NO"}`);
    }
}

main()
    .catch(console.error)
    .finally(() => prisma.$disconnect());
