import { and, desc, eq, getTableColumns, ilike, or, sql } from "drizzle-orm";
import express from "express";
import { user } from "../db/schema/index.js";
import { db } from "../db/index.js";

const router = express.Router();

// Get all users with optional search, filtering and pagination
router.get("/", async (req, res) => {
    try {
        console.log("REQUEST RECEIVED:", req.originalUrl);

        const { search, role, page = 1, limit = 10 } = req.query;

        const currentPage = Math.max(1, parseInt(String(page), 10) || 1);
        const limitPerPage = Math.min(Math.max(1, parseInt(String(limit), 10) || 10), 100); // max 100 records

        const offset = (currentPage - 1) * limitPerPage;

        const filterConditions = [];

        // if search query exists, filter by user name OR user email
        if (search) {
            // sanitize SQL inputs
            const searchTerm = `%${String(search).replace(/[%_]/g, '\\$&')}%`;

            filterConditions.push(
                or(
                    ilike(user.name, searchTerm),
                    ilike(user.email, searchTerm)
                )
            );
        }

        // if role filter exists, match the exact role
        if (role) {
            filterConditions.push(eq(user.role, String(role) as typeof user.$inferSelect.role));
        }

        // Combine all filters using AND if any exist
        const whereClause = filterConditions.length > 0 ? and(...filterConditions) : undefined;

        const countResult = await db
            .select({ count: sql<number>`count(*)` })
            .from(user)
            .where(whereClause);

        const totalCount = countResult[0]?.count ?? 0;

        const usersList = await db
            .select({ ...getTableColumns(user) })
            .from(user)
            .where(whereClause)
            .orderBy(desc(user.createdAt))
            .limit(limitPerPage)
            .offset(offset);

        res.status(200).json({
            data: usersList,
            pagination: {
                page: currentPage,
                limit: limitPerPage,
                total: totalCount,
                totalPages: Math.ceil(totalCount / limitPerPage),
            }
        });

    } catch (e) {
        console.error(`GET /users error: ${e}`);
        res.status(500).json({ error: 'Failed to get users' });
    }
});

export default router;
