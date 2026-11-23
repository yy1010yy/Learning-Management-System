import express from "express";
import { db } from "../db/index.js";
import { classes, subjects, user } from "../db/schema/index.js";
import { and, eq, getTableColumns, ilike, or, sql } from "drizzle-orm";
import { filter } from "@arcjet/node";

const router = express.Router();

router.get('/', async(req, res) => {
    try {
        const { search, subject, teacher, page=1, limit=10 } = req.query;

        const currentPage = Math.max(1, parseInt(String(page), 1) || 1);
        const limitPerPage = Math.min(Math.max(1, parseInt(String(limit), 10) || 10), 100);

        const offset = (currentPage - 1) * limitPerPage;

        const filterConditions = [];

        // if search query exist, filter by class name or invite code
        if (search) {
            // sanitize SQL inputs
            const searchTerm = `%${String(search).replace(/[%_]/g, '\\$&')}%`;

            filterConditions.push(
                or(
                    ilike(classes.name, searchTerm),
                    ilike(classes.inviteCode, searchTerm)
                )
            );
        }

        // if subject filter exists, match subject name
        if (subject) {
            // sanitize SQL inputs
            const subPattern = `%${String(subject).replace(/[%_]/g, '\\$&')}%`;
            filterConditions.push(
                ilike(subjects.name, subPattern)
            );
        }

        // if teacher filter exists, match teacher name
        if (teacher) {
            // sanitize SQL inputs
            const teachPattern = `%${String(teacher).replace(/[%_]/g, '\\$&')}%`;
            filterConditions.push(
                ilike(user.name, teachPattern)
            );
        }

        const whereClause = filterConditions.length > 0 ? and(...filterConditions) : undefined;

        const countResult = await db
          .select({ count: sql<number>`count(*)` })
          .from(classes)
          .leftJoin(subjects, eq(classes.subjectId, subjects.id))
          .leftJoin(user, eq(classes.teacherId, user.id))
          .where(whereClause);

        const totalCount = countResult[0]?.count ?? 0;

        const classList = await db
          .select({
            ...getTableColumns(classes),
            subject: { ...getTableColumns(subjects) },
            teacher: { ...getTableColumns(user) },
          })
          .from(classes)
          .leftJoin(subjects, eq(classes.subjectId, subjects.id))
          .leftJoin(user, eq(classes.teacherId, user.id))
          .where(whereClause)
          .limit(limitPerPage)
          .offset(offset);

          res.status(200).json({
            data: classList,
            pagination: {
                page: currentPage,
                limit: limitPerPage,
                total: totalCount,
                totalPages: Math.ceil(totalCount / limitPerPage),
            }
          });

    } catch (e) {
        console.error(`GET /classes error ${e}`)
        res.status(500).json({ error: e })
    }
})


router.post('/', async (req, res) => {
    try {

        const [createdClass] = await db
            .insert(classes)
            .values({ ...req.body, inviteCode: Math.random().toString(36).substring(2, 9), schedules: [] })
            .returning({ id: classes.id });
        
        if(!createdClass) throw Error;

        res.status(201).json({ data: createdClass });
        
    } catch (e) {
        console.error(`POST /classes error ${e}`);
        res.status(500).json({ error: e })
    }
})

export default router;