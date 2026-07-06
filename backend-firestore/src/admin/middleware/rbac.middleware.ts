import { Request, Response, NextFunction } from 'express';
import { auth } from '../../config/firebase';

export type AdminRole = 'super_admin' | 'admin' | 'moderator' | 'content_manager' | 'support' | 'analytics_viewer';

export const requireRoles = (allowedRoles: AdminRole[]) => {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      const token = req.headers.authorization?.split('Bearer ')[1];
      if (!token) {
        return res.status(401).json({ error: 'Unauthorized: No token provided' });
      }

      const decodedToken = await auth.verifyIdToken(token);
      
      // Assuming roles are set as custom claims on the Firebase user token
      const userRole = decodedToken.role as AdminRole;

      if (!userRole) {
         return res.status(403).json({ error: 'Forbidden: No role assigned' });
      }

      if (!allowedRoles.includes(userRole)) {
        return res.status(403).json({ error: 'Forbidden: Insufficient permissions' });
      }

      req.user = decodedToken;
      next();
    } catch (error) {
      res.status(401).json({ error: 'Unauthorized: Invalid token' });
    }
  };
};

// Admin API access is granted to super_admin, admin, and moderator roles.
export const requireAdmin = requireRoles(['super_admin', 'admin', 'moderator']);
export const requireSuperAdmin = requireRoles(['super_admin']);
