import type { Request, Response, NextFunction } from "express";
import aj from "../config/arcjet.js";
import { slidingWindow } from "@arcjet/node";
import type { ArcjetNodeRequest } from "@arcjet/node";

const rateLimitMessages: Record<RateLimitRole, string> = {
    admin: 'Admin request limit exceeded (20 per minute). Slow down.',
    teacher: 'User request limit exceeded (10 per minute). Please wait.',
    student: 'User request limit exceeded (10 per minute). Please wait.',
    guest: 'Guest request limit exceeded (5 per minute). Please wait.',
};

const clients = {
    admin: aj.withRule(
        slidingWindow({
            mode: "LIVE",
            interval: "1m",
            max: 20,
        })
    ),

    // for teachers and students
    standard: aj.withRule(
        slidingWindow({
            mode: "LIVE",
            interval: "1m",
            max: 10,
        })
    ),

    guest: aj.withRule(
        slidingWindow({
            mode: "LIVE",
            interval: "1m",
            max: 5,
        })
    ),
}


const securityMiddleware = async (req: Request, res: Response, next: NextFunction) => {
    // no security analysis on a test environment
    if (process.env.NODE_ENV === 'test') return next();

    try {
        const role: RateLimitRole = req.user?.role ?? 'guest';

        const client =
          role === "admin"
            ? clients.admin
            : role === "teacher" || role === "student"
              ? clients.standard
              : clients.guest;

        const arcjetRequest: ArcjetNodeRequest = {
            headers: req.headers,
            method: req.method,
            url: req.originalUrl ?? req.url,
            socket: { remoteAddress: req.socket.remoteAddress ?? req.ip ?? '0.0.0.0' },
        }

        const decision = await client.protect(arcjetRequest);

        if(decision.isDenied() && decision.reason.isBot()) {
            return res.status(403).json({ 
                error: 'Forbidden', 
                message: 'Automated requests are not allowed.' 
            });
        }

        if(decision.isDenied() && decision.reason.isShield()) {
            return res.status(403).json({ 
                error: 'Forbidden', 
                message: 'Request blocked by security policy.' 
            });
        }

        if(decision.isDenied() && decision.reason.isRateLimit()) {
            return res.status(429).json({ 
                error: 'Too Many Requests', 
                message: rateLimitMessages[role],
            });
        }

        next();
    } catch (e) {
        console.error('Arcjet middleware error: ', e);
        res.status(500).json({ 
            error: 'Internal error', 
            message: 'Something went wrong with security middleware' 
        });
    }
}

export default securityMiddleware;